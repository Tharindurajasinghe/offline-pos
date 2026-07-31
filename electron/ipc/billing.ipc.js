class BillingIPC {
  static register(ipcMain, db) {
    ipcMain.handle('billing:save', (_, data) => BillingIPC.save(db, data))
    ipcMain.handle('billing:getAll', (_, filters) => BillingIPC.getAll(db, filters))
    ipcMain.handle('billing:getById', (_, id) => BillingIPC.getById(db, id))
    ipcMain.handle('billing:delete', (_, id) => BillingIPC.delete(db, id))
    ipcMain.handle('billing:getTodaySales', () => BillingIPC.getTodaySales(db))
    ipcMain.handle('billing:getTodayTotal', () => BillingIPC.getTodayTotal(db))
    ipcMain.handle('billing:getCartDraft', (_, userId) => BillingIPC.getCartDraft(db, userId))
    ipcMain.handle('billing:saveCartDraft', (_, data) => BillingIPC.saveCartDraft(db, data))
    ipcMain.handle('billing:clearCartDraft', (_, userId) => BillingIPC.clearCartDraft(db, userId))
    // ── BILL DISCOUNT ── totals for the summary (additive, no effect on income/profit)
    ipcMain.handle('billing:getDiscountByDay',   (_, dayLabel)   => BillingIPC.getDiscountByDay(db, dayLabel))
    ipcMain.handle('billing:getDiscountByMonth', (_, monthLabel) => BillingIPC.getDiscountByMonth(db, monthLabel))
    ipcMain.handle('billing:getBillDetails', (_, billId) => BillingIPC.getBillDetails(db, billId))
  }

  static getSriLankaDate() {
    const now = new Date()
    const slTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000))
    return slTime.toISOString().split('T')[0]
  }

  static getSriLankaDateTime() {
    const now = new Date()
    const slTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000))
    return slTime.toISOString().replace('T', ' ').substring(0, 19)
  }

  static generateBillNumber(db) {
    const counterRow = db.prepare(
      "SELECT value FROM settings WHERE key = 'bill_counter'"
    ).get()
    const counter = parseInt(counterRow ? counterRow.value : '10000') + 1
    db.prepare(
      "UPDATE settings SET value = ? WHERE key = 'bill_counter'"
    ).run(String(counter))
    return `#${counter}`
  }

  static getBillDetails(db, billId) {
  try {
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId)
    if (!bill) return { success: false, message: 'Bill not found' }

    const items = db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(billId)
    return { success: true, data: { ...bill, items } }
  } catch (err) {
    return { success: false, message: err.message }
  }
}

  static save(db, { items, customerName, cashPaid, billedBy, userId, isWholesale, billDiscountPercent }) {
    try {
      // Validate items
      if (!items || items.length === 0) {
        return { success: false, message: 'Cart is empty' }
      }

      // ── H5 FIX ── Snapshot the buying price at sale time.
      // Read from the DB (not the renderer's cart) so it can't be tampered with.
      const costMap = {}

      // Validate each item stock & price
      for (const item of items) {
        const variant = db.prepare(
          'SELECT stock, buying_price, selling_price FROM variants WHERE id = ?'
        ).get(item.variantId)

        if (!variant) {
          return { success: false, message: `Variant not found: ${item.variantName}` }
        }
        if (variant.stock < item.qty) {
          return { success: false, message: `Insufficient stock for ${item.productName} - ${item.variantName}. Available: ${variant.stock}` }
        }
        if (item.soldPrice < variant.buying_price) {
          return { success: false, message: `Price for ${item.variantName} cannot be less than buying price (Rs. ${variant.buying_price})` }
        }

        // ── H5 FIX ── Keep the cost we just read
        costMap[item.variantId] = variant.buying_price
      }

      // Calculate totals
      const subtotal = items.reduce((sum, i) => sum + (i.originalPrice * i.qty), 0)
      const grandTotal = items.reduce((sum, i) => sum + i.lineTotal, 0)
      const totalDiscount = subtotal - grandTotal

      // ── BILL DISCOUNT ── whole-bill % discount (0 = none, 1..99 valid).
      // grand_total stays PRE-discount; the customer pays the discounted payable.
      let pct = parseFloat(billDiscountPercent) || 0
      if (pct < 0) pct = 0
      if (pct >= 100) {
        return { success: false, message: 'Discount must be between 1 and 99%' }
      }
      const billDiscountAmount = +(grandTotal * pct / 100).toFixed(2)
      const payable = +(grandTotal - billDiscountAmount).toFixed(2)

      // Validate cash against the DISCOUNTED payable (customer pays less)
      if (!cashPaid || cashPaid < payable) {
        return { success: false, message: `Cash paid (Rs. ${cashPaid}) is less than payable (Rs. ${payable})` }
      }

      const changeAmount = +(cashPaid - payable).toFixed(2)
      const billNumber = BillingIPC.generateBillNumber(db)
      const dayLabel = BillingIPC.getSriLankaDate()
      const billDateTime = BillingIPC.getSriLankaDateTime()

      const saveBillTransaction = db.transaction(() => {
        // Insert bill
        // ── WHOLESALE + BILL DISCOUNT ──
        const billResult = db.prepare(`
          INSERT INTO bills (bill_number, customer_name, subtotal, total_discount, grand_total, cash_paid, change_amount, billed_by, bill_date, day_label, is_wholesale, bill_discount_percent, bill_discount_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(billNumber, customerName || null, subtotal, totalDiscount, grandTotal, cashPaid, changeAmount, billedBy || '', billDateTime, dayLabel, isWholesale ? 1 : 0, pct, billDiscountAmount)

        const billId = billResult.lastInsertRowid

        // Insert bill items & reduce stock
        for (const item of items) {
          // ── H5 FIX ── buying_price added as the last column
          db.prepare(`
            INSERT INTO bill_items (bill_id, product_id, product_code, product_name, variant_id, variant_name, unit, qty, original_price, sold_price, is_price_edited, discount_amount, line_total, buying_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            billId,
            item.productId,
            item.productCode,
            item.productName,
            item.variantId,
            item.variantName,
            item.unit,
            item.qty,
            item.originalPrice,
            item.soldPrice,
            item.isPriceEdited ? 1 : 0,
            item.discountAmount || 0,
            item.lineTotal,
            costMap[item.variantId] ?? 0   // ── H5 FIX ──
          )

          // Reduce stock REAL TIME
          db.prepare(
            'UPDATE variants SET stock = stock - ? WHERE id = ?'
          ).run(item.qty, item.variantId)
        }

        // Clear cart draft for user
        if (userId) {
          db.prepare('DELETE FROM cart_drafts WHERE user_id = ?').run(userId)
        }

        return billId
      })

      const billId = saveBillTransaction()

      return {
        success: true,
        billId,
        billNumber,
        grandTotal,
        changeAmount,
        billDateTime,
        isWholesale: isWholesale ? 1 : 0,        // ── WHOLESALE ──
        billDiscountPercent: pct,                 // ── BILL DISCOUNT ──
        billDiscountAmount,
        payable
      }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getAll(db, filters = {}) {
    try {
      let query = `
        SELECT b.*, COUNT(bi.id) as item_count
        FROM bills b
        LEFT JOIN bill_items bi ON bi.bill_id = b.id
        WHERE b.status = 'active'
      `
      const params = []

      if (filters.dayLabel) {
        query += ' AND b.day_label = ?'
        params.push(filters.dayLabel)
      }
      if (filters.billNumber) {
        query += ' AND b.bill_number LIKE ?'
        params.push(`%${filters.billNumber}%`)
      }
      if (filters.dateFrom) {
        query += ' AND b.day_label >= ?'
        params.push(filters.dateFrom)
      }
      if (filters.dateTo) {
        query += ' AND b.day_label <= ?'
        params.push(filters.dateTo)
      }

      // Newest bills first. Order by id as the primary key (always increasing,
      // never null) so it's reliable even if created_at is missing/inconsistent.
      query += ' GROUP BY b.id ORDER BY b.id DESC'

      const bills = db.prepare(query).all(...params)
      return { success: true, data: bills }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getById(db, id) {
    try {
      const bill = db.prepare('SELECT * FROM bills WHERE id = ? OR bill_number = ?').get(id, id)
      if (!bill) return { success: false, message: 'Bill not found' }

      const items = db.prepare(
        'SELECT * FROM bill_items WHERE bill_id = ?'
      ).all(bill.id)

      return { success: true, data: { ...bill, items } }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static delete(db, id) {
    try {
      const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id)
      if (!bill) return { success: false, message: 'Bill not found' }

      const items = db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(id)

      const deleteTransaction = db.transaction(() => {
        // Restore stock REAL TIME for each item
        for (const item of items) {
          db.prepare(
            'UPDATE variants SET stock = stock + ? WHERE id = ?'
          ).run(item.qty, item.variant_id)
        }

        // Soft delete bill
        db.prepare(
          "UPDATE bills SET status = 'deleted' WHERE id = ?"
        ).run(id)
      })

      deleteTransaction()
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getTodaySales(db) {
    try {
      const today = BillingIPC.getSriLankaDate()
      const items = db.prepare(`
        SELECT
          bi.product_code, bi.product_name, bi.variant_name,
          bi.qty, bi.sold_price, bi.original_price,
          bi.is_price_edited, bi.line_total, bi.unit,
          b.bill_number, b.bill_date
        FROM bill_items bi
        JOIN bills b ON bi.bill_id = b.id
        WHERE b.day_label = ? AND b.status = 'active'
        ORDER BY b.created_at DESC, bi.id ASC
      `).all(today)

      return { success: true, data: items }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getTodayTotal(db) {
    try {
      const today = BillingIPC.getSriLankaDate()
      const result = db.prepare(`
        SELECT
          COALESCE(SUM(grand_total), 0) as total,
          COUNT(*) as billCount
        FROM bills
        WHERE day_label = ? AND status = 'active'
      `).get(today)

      return { success: true, total: result.total, billCount: result.billCount }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getCartDraft(db, userId) {
    try {
      const draft = db.prepare(
        'SELECT * FROM cart_drafts WHERE user_id = ?'
      ).get(userId)
      if (!draft) return { success: true, data: null }
      return {
        success: true,
        data: {
          cart: JSON.parse(draft.cart_data),
          customerName: draft.customer_name
        }
      }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static saveCartDraft(db, { userId, cart, customerName }) {
    try {
      db.prepare(`
        INSERT INTO cart_drafts (user_id, cart_data, customer_name)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          cart_data = excluded.cart_data,
          customer_name = excluded.customer_name,
          updated_at = datetime('now','+5 hours 30 minutes')
      `).run(userId, JSON.stringify(cart), customerName || null)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static clearCartDraft(db, userId) {
    try {
      db.prepare('DELETE FROM cart_drafts WHERE user_id = ?').run(userId)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }
  // ── BILL DISCOUNT ── total discount given on a day (active bills only).
  // Purely additive reporting: NOT subtracted from income/profit anywhere.
  static getDiscountByDay(db, dayLabel) {
    try {
      const row = db.prepare(
        "SELECT COALESCE(SUM(bill_discount_amount), 0) AS t FROM bills WHERE day_label = ? AND status = 'active'"
      ).get(dayLabel)
      return { success: true, total: row.t }
    } catch (err) {
      return { success: false, total: 0, message: err.message }
    }
  }

  static getDiscountByMonth(db, monthLabel) {
    try {
      const monthNums = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }
      const [year, mon] = String(monthLabel).split(' ')
      const prefix = `${year}-${monthNums[mon] || '01'}`
      const row = db.prepare(
        "SELECT COALESCE(SUM(bill_discount_amount), 0) AS t FROM bills WHERE day_label LIKE ? AND status = 'active'"
      ).get(`${prefix}%`)
      return { success: true, total: row.t }
    } catch (err) {
      return { success: false, total: 0, message: err.message }
    }
  }
}
module.exports = BillingIPC