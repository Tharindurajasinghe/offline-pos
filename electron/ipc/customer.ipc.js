class CustomerIPC {
  static register(ipcMain, db) {
    ipcMain.handle('customer:getAll',       ()         => CustomerIPC.getAll(db))
    ipcMain.handle('customer:search',       (_, q)     => CustomerIPC.search(db, q))
    ipcMain.handle('customer:getById',      (_, id)    => CustomerIPC.getById(db, id))
    ipcMain.handle('customer:add',          (_, data)  => CustomerIPC.add(db, data))
    ipcMain.handle('customer:update',       (_, data)  => CustomerIPC.update(db, data))
    ipcMain.handle('customer:remove',       (_, id)    => CustomerIPC.remove(db, id))
    ipcMain.handle('customer:getBills',     (_, id)    => CustomerIPC.getBills(db, id))
    ipcMain.handle('customer:addPayment',   (_, data)  => CustomerIPC.addPayment(db, data))
    ipcMain.handle('customer:getPayments',  (_, id)    => CustomerIPC.getPayments(db, id))
    ipcMain.handle('customer:saveCustomerBill', (_, data) => CustomerIPC.saveCustomerBill(db, data))
  }

  static generateCode(db) {
    const last = db.prepare(`
      SELECT customer_code FROM customers
      ORDER BY id DESC LIMIT 1
    `).get()
    if (!last) return 'CUS001'
    const num = parseInt(last.customer_code.replace('CUS', '')) + 1
    return 'CUS' + String(num).padStart(3, '0')
  }

  static getAll(db) {
    try {
      const customers = db.prepare(`SELECT * FROM customers ORDER BY created_at DESC`).all()
      return { success: true, data: customers }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static search(db, query) {
    try {
      const q = `%${query}%`
      const customers = db.prepare(`
        SELECT * FROM customers
        WHERE name LIKE ? OR phone LIKE ? OR customer_code LIKE ? OR nic LIKE ?
        ORDER BY name ASC
        LIMIT 20
      `).all(q, q, q, q)
      return { success: true, data: customers }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getById(db, id) {
    try {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id)
      if (!customer) return { success: false, message: 'Customer not found' }
      return { success: true, data: customer }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static add(db, { name, phone, address1, address2, credit_limit, nic }) {
    try {
      if (!name || !name.trim()) return { success: false, message: 'Name is required' }
      if (!phone || !phone.trim()) return { success: false, message: 'Phone number is required' }

      const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone.trim())
      if (existing) return { success: false, message: 'Phone number already registered' }

      const customer_code = CustomerIPC.generateCode(db)

      const result = db.prepare(`
        INSERT INTO customers (customer_code, name, phone, address1, address2, credit_limit, nic)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(customer_code, name.trim(), phone.trim(), address1 || '', address2 || '', credit_limit || null, (nic || '').trim())

      return { success: true, id: result.lastInsertRowid, customer_code }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static update(db, { id, name, phone, address1, address2, credit_limit, nic }) {
    try {
      if (!name || !name.trim()) return { success: false, message: 'Name is required' }
      if (!phone || !phone.trim()) return { success: false, message: 'Phone number is required' }

      const existing = db.prepare(
        'SELECT id FROM customers WHERE phone = ? AND id != ?'
      ).get(phone.trim(), id)
      if (existing) return { success: false, message: 'Phone number already registered' }

      db.prepare(`
        UPDATE customers SET
          name = ?, phone = ?, address1 = ?, address2 = ?, credit_limit = ?, nic = ?
        WHERE id = ?
      `).run(name.trim(), phone.trim(), address1 || '', address2 || '', credit_limit || null, (nic || '').trim(), id)

      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static remove(db, id) {
    try {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id)
      if (!customer) return { success: false, message: 'Customer not found' }
      if (customer.total_pending > 0) {
        return { success: false, message: `Cannot remove customer with pending balance of Rs. ${customer.total_pending.toFixed(2)}` }
      }
      db.prepare('DELETE FROM customers WHERE id = ?').run(id)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getBills(db, customerId) {
    try {
      const bills = db.prepare(`
        SELECT
          b.id, b.bill_number, b.grand_total, b.bill_status,
          b.bill_date, b.billed_by, b.day_label,
          b.cash_paid, b.change_amount
        FROM bills b
        WHERE b.customer_id = ? AND b.is_customer_bill = 1
        ORDER BY b.bill_date DESC
      `).all(customerId)
      return { success: true, data: bills }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static addPayment(db, { customerId, amount, note, recordedBy,paidAt }) {
    try {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId)
      if (!customer) return { success: false, message: 'Customer not found' }

      const payAmount = parseFloat(amount)
      if (isNaN(payAmount) || payAmount <= 0) {
        return { success: false, message: 'Invalid payment amount' }
      }
      if (payAmount > customer.total_pending) {
        return { success: false, message: `Payment exceeds pending balance of Rs. ${customer.total_pending.toFixed(2)}` }
      }

      // Record payment — paid_at is explicitly set here, not relying on column DEFAULT
      const finalPaidAt = paidAt && paidAt.trim() ? paidAt.trim() : new Date().toISOString().replace('T', ' ').substring(0, 19)

db.prepare(`
  INSERT INTO customer_payments (customer_id, amount, note, recorded_by, paid_at)
  VALUES (?, ?, ?, ?, ?)
`).run(customerId, payAmount, note || '', recordedBy || '', finalPaidAt)
      // Update customer pending balance
      const newPending = Math.max(0, customer.total_pending - payAmount)
      db.prepare('UPDATE customers SET total_pending = ? WHERE id = ?').run(newPending, customerId)

      // If payment clears full pending balance, mark ALL pending bills as paid
      if (newPending <= 0.01) {
        db.prepare(`
          UPDATE bills SET bill_status = 'paid'
          WHERE customer_id = ? AND bill_status = 'pending'
        `).run(customerId)
      } else {
        let remaining = payAmount
        const pendingBills = db.prepare(`
          SELECT id, grand_total FROM bills
          WHERE customer_id = ? AND bill_status = 'pending'
          ORDER BY bill_date ASC
        `).all(customerId)

        for (const bill of pendingBills) {
          if (remaining <= 0) break
          if (remaining >= bill.grand_total) {
            db.prepare(`UPDATE bills SET bill_status = 'paid' WHERE id = ?`).run(bill.id)
            remaining -= bill.grand_total
          }
        }
      }

      return { success: true, newPending }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getPayments(db, customerId) {
    try {
      const payments = db.prepare(`
        SELECT * FROM customer_payments
        WHERE customer_id = ?
        ORDER BY paid_at DESC
      `).all(customerId)
      return { success: true, data: payments }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static saveCustomerBill(db, { customerId, items, billedBy, userId }) {
    try {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId)
      if (!customer) return { success: false, message: 'Customer not found' }

      const defaultLimit = db.prepare(
        "SELECT value FROM settings WHERE key = 'default_credit_limit'"
      ).get()
      const creditLimit = customer.credit_limit !== null
        ? customer.credit_limit
        : parseFloat(defaultLimit?.value || '5000')

      const grandTotal = items.reduce((s, i) => s + i.lineTotal, 0)

      if (customer.total_pending + grandTotal > creditLimit) {
        return {
          success: false,
          message: `Credit limit exceeded. Current pending: Rs. ${customer.total_pending.toFixed(2)}, Limit: Rs. ${creditLimit.toFixed(2)}`,
          limitExceeded: true
        }
      }

      const counter = db.prepare("SELECT value FROM settings WHERE key = 'bill_counter'").get()
      const billNum = parseInt(counter?.value || '10000') + 1
      const billNumber = 'BILL-' + String(billNum).padStart(5, '0')
      db.prepare("UPDATE settings SET value = ? WHERE key = 'bill_counter'").run(String(billNum))

      const now = new Date()
      const slTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000))
      const dayLabel = slTime.toISOString().split('T')[0]
      const billDate = slTime.toISOString().replace('T', ' ').substring(0, 19)

      const subtotal = items.reduce((s, i) => s + i.lineTotal, 0)
      const totalDiscount = items.reduce((s, i) => s + i.discountAmount, 0)

      const billResult = db.prepare(`
        INSERT INTO bills (
          bill_number, customer_name, subtotal, total_discount,
          grand_total, cash_paid, change_amount, billed_by,
          bill_date, day_label, status,
          customer_id, is_customer_bill, bill_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        billNumber, customer.name, subtotal, totalDiscount,
        grandTotal, 0, 0, billedBy || '',
        billDate, dayLabel, 'active',
        customerId, 1, 'pending'
      )

      const billId = billResult.lastInsertRowid

      for (const item of items) {
        db.prepare(`
          INSERT INTO bill_items (
            bill_id, product_id, product_code, product_name,
            variant_id, variant_name, unit, qty,
            original_price, sold_price, is_price_edited,
            discount_amount, line_total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          billId, item.productId, item.productCode, item.productName,
          item.variantId, item.variantName, item.unit, item.qty,
          item.originalPrice, item.soldPrice,
          item.isPriceEdited ? 1 : 0,
          item.discountAmount, item.lineTotal
        )

        db.prepare(`UPDATE variants SET stock = stock - ? WHERE id = ?`).run(item.qty, item.variantId)
      }

      db.prepare(
        'UPDATE customers SET total_pending = total_pending + ? WHERE id = ?'
      ).run(grandTotal, customerId)

      return {
        success: true,
        billNumber,
        grandTotal,
        customerId,
        customerName: customer.name,
        newPending: customer.total_pending + grandTotal
      }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }
}

module.exports = CustomerIPC