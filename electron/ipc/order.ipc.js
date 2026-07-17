// electron/ipc/order.ipc.js
// ── ORDERS ──
// A saved cart held for later delivery. Creating an order does NOT reduce stock
// or write to the bills table. That happens ONLY when the order is completed —
// at which point a real bill is created using the FROZEN prices captured when
// the order was placed.

class OrderIPC {
  static register(ipcMain, db) {
    ipcMain.handle('order:create',      (_, data) => OrderIPC.create(db, data))
    ipcMain.handle('order:getAll',      ()        => OrderIPC.getAll(db))
    ipcMain.handle('order:getById',     (_, id)   => OrderIPC.getById(db, id))
    ipcMain.handle('order:delete',      (_, id)   => OrderIPC.delete(db, id))
    ipcMain.handle('order:complete',    (_, id)   => OrderIPC.complete(db, id))
    ipcMain.handle('order:badgeCount',  ()        => OrderIPC.badgeCount(db))
    ipcMain.handle('order:purgeExpired',()        => OrderIPC.purgeExpired(db))
  }

  static slNow() {
    return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  }
  static slNowStr() {
    return OrderIPC.slNow().toISOString().replace('T', ' ').substring(0, 19)
  }
  static slToday() {
    return OrderIPC.slNow().toISOString().split('T')[0]
  }

  static generateNumber(db) {
    const last = db.prepare(
      "SELECT order_number FROM orders ORDER BY id DESC LIMIT 1"
    ).get()
    let n = 1
    if (last && last.order_number) {
      const parsed = parseInt(String(last.order_number).replace(/\D/g, ''))
      if (!isNaN(parsed)) n = parsed + 1
    }
    return 'ORD-' + String(n).padStart(5, '0')
  }

  static create(db, { items, customerName, customerTel, deliveryAt, message, isWholesale, advancePaid, createdBy }) {
    try {
      if (!items || items.length === 0) {
        return { success: false, message: 'Cart is empty' }
      }

      const subtotal = items.reduce((s, i) => s + (i.originalPrice * i.qty), 0)
      const grandTotal = items.reduce((s, i) => s + i.lineTotal, 0)
      const totalDiscount = subtotal - grandTotal

      // Advance is optional. Can't exceed the order total (that would be an
      // overpayment, not an advance).
      const advance = Math.max(0, parseFloat(advancePaid) || 0)
      if (advance > grandTotal + 0.01) {
        return { success: false, message: `Advance (Rs. ${advance.toFixed(2)}) cannot exceed the order total (Rs. ${grandTotal.toFixed(2)})` }
      }

      const orderNumber = OrderIPC.generateNumber(db)

      const tx = db.transaction(() => {
        const res = db.prepare(`
          INSERT INTO orders (
            order_number, customer_name, customer_tel, delivery_at, message,
            is_wholesale, subtotal, total_discount, grand_total, advance_paid,
            status, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `).run(
          orderNumber, customerName || null, customerTel || null,
          deliveryAt || null, message || null,
          isWholesale ? 1 : 0, subtotal, totalDiscount, grandTotal, advance,
          createdBy || '', OrderIPC.slNowStr()
        )
        const orderId = res.lastInsertRowid

        // Freeze the current cost of each variant so profit is correct even if
        // the buying price changes before the order is completed.
        for (const item of items) {
          const v = db.prepare('SELECT buying_price FROM variants WHERE id = ?').get(item.variantId)
          const cost = v ? v.buying_price : 0
          db.prepare(`
            INSERT INTO order_items (
              order_id, product_id, product_code, product_name,
              variant_id, variant_name, unit, qty,
              original_price, sold_price, buying_price,
              is_price_edited, discount_amount, line_total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            orderId, item.productId, item.productCode, item.productName,
            item.variantId, item.variantName, item.unit, item.qty,
            item.originalPrice, item.soldPrice, cost,
            item.isPriceEdited ? 1 : 0, item.discountAmount || 0, item.lineTotal
          )
        }
        return orderId
      })

      const orderId = tx()
      return { success: true, orderId, orderNumber, advancePaid: advance, balance: grandTotal - advance }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getAll(db) {
    try {
      const orders = db.prepare(`
        SELECT o.*, COUNT(oi.id) AS item_count
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        GROUP BY o.id
        ORDER BY
          CASE o.status WHEN 'pending' THEN 0 ELSE 1 END,
          o.delivery_at ASC,
          o.created_at DESC
      `).all()
      return { success: true, data: orders }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getById(db, id) {
    try {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id)
      if (!order) return { success: false, message: 'Order not found' }
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id)
      return { success: true, data: { ...order, items } }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static delete(db, id) {
    try {
      // order_items cascade via FK
      db.prepare('DELETE FROM orders WHERE id = ?').run(id)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  // Complete an order: validate stock, create a REAL bill with frozen prices,
  // reduce stock, mark the order completed. All atomic.
  static complete(db, id) {
    try {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id)
      if (!order) return { success: false, message: 'Order not found' }
      if (order.status === 'completed') {
        return { success: false, message: 'Order already completed' }
      }

      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id)
      if (items.length === 0) {
        return { success: false, message: 'Order has no items' }
      }

      // Block completion if any item is short on stock; report which ones.
      const shortages = []
      for (const item of items) {
        const v = db.prepare('SELECT stock FROM variants WHERE id = ?').get(item.variant_id)
        const available = v ? v.stock : 0
        if (available < item.qty) {
          shortages.push(`${item.product_name} - ${item.variant_name} (need ${item.qty}, have ${available})`)
        }
      }
      if (shortages.length > 0) {
        return {
          success: false,
          message: 'Cannot complete — not enough stock for:\n• ' + shortages.join('\n• '),
          shortages
        }
      }

      // Bill number from the shared counter (same format as cash bills)
      const counterRow = db.prepare("SELECT value FROM settings WHERE key = 'bill_counter'").get()
      const counter = parseInt(counterRow ? counterRow.value : '10000') + 1
      const billNumber = `#${counter}`
      const dayLabel = OrderIPC.slToday()
      const billDateTime = OrderIPC.slNowStr()

      const tx = db.transaction(() => {
        db.prepare("UPDATE settings SET value = ? WHERE key = 'bill_counter'").run(String(counter))

        const billRes = db.prepare(`
          INSERT INTO bills (
            bill_number, customer_name, subtotal, total_discount, grand_total,
            cash_paid, change_amount, billed_by, bill_date, day_label, is_wholesale
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          billNumber, order.customer_name || null,
          order.subtotal, order.total_discount, order.grand_total,
          order.grand_total, 0, order.created_by || '',
          billDateTime, dayLabel, order.is_wholesale ? 1 : 0
        )
        const billId = billRes.lastInsertRowid

        for (const item of items) {
          db.prepare(`
            INSERT INTO bill_items (
              bill_id, product_id, product_code, product_name,
              variant_id, variant_name, unit, qty,
              original_price, sold_price, is_price_edited,
              discount_amount, line_total, buying_price
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            billId, item.product_id, item.product_code, item.product_name,
            item.variant_id, item.variant_name, item.unit, item.qty,
            item.original_price, item.sold_price, item.is_price_edited,
            item.discount_amount, item.line_total, item.buying_price
          )
          db.prepare('UPDATE variants SET stock = stock - ? WHERE id = ?')
            .run(item.qty, item.variant_id)
        }

        db.prepare(`
          UPDATE orders SET status = 'completed', completed_at = ?, bill_id = ?
          WHERE id = ?
        `).run(OrderIPC.slNowStr(), billId, id)

        return { billId, billNumber }
      })

      const { billId, billNumber: bn } = tx()
      return { success: true, billId, billNumber: bn }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  // Badge = count of PENDING orders whose delivery date is today or tomorrow.
  static badgeCount(db) {
    try {
      const today = OrderIPC.slToday()
      const tmr = new Date(OrderIPC.slNow().getTime() + 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0]

      const row = db.prepare(`
        SELECT COUNT(*) AS c FROM orders
        WHERE status = 'pending'
          AND delivery_at IS NOT NULL
          AND substr(delivery_at, 1, 10) IN (?, ?)
      `).get(today, tmr)

      return { success: true, count: row.c }
    } catch (err) {
      return { success: false, count: 0, message: err.message }
    }
  }

  // Auto-delete completed orders more than 1 day (24h) after completion.
  static purgeExpired(db) {
    try {
      const cutoff = new Date(OrderIPC.slNow().getTime() - 24 * 60 * 60 * 1000)
        .toISOString().replace('T', ' ').substring(0, 19)

      const res = db.prepare(`
        DELETE FROM orders
        WHERE status = 'completed'
          AND completed_at IS NOT NULL
          AND completed_at < ?
      `).run(cutoff)

      return { success: true, deleted: res.changes }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }
}

module.exports = OrderIPC