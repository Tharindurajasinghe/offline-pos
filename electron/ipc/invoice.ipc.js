class InvoiceIPC {
  static register(ipcMain, db) {
    ipcMain.handle('invoice:getAll',    (_, filters) => InvoiceIPC.getAll(db, filters))
    ipcMain.handle('invoice:getById',   (_, id)      => InvoiceIPC.getById(db, id))
    ipcMain.handle('invoice:add',       (_, data)    => InvoiceIPC.add(db, data))
    ipcMain.handle('invoice:update',    (_, data)    => InvoiceIPC.update(db, data))
    ipcMain.handle('invoice:remove',    (_, id)      => InvoiceIPC.remove(db, id))
    // ── INVOICE PAYMENTS ──
    ipcMain.handle('invoice:addPayment', (_, data)   => InvoiceIPC.addPayment(db, data))
    ipcMain.handle('invoice:getPayments',(_, id)     => InvoiceIPC.getPayments(db, id))
  }

  static slNowStr() {
    return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').substring(0, 19)
  }

  static getAll(db, filters = {}) {
    try {
      // total_amount is the sum of items; balance/status derive from paid_amount
      let query = `
        SELECT
          i.*,
          COALESCE(SUM(ii.amount), 0) AS total_amount,
          (COALESCE(SUM(ii.amount), 0) - COALESCE(i.paid_amount, 0)) AS balance_due,
          CASE
            WHEN COALESCE(i.paid_amount, 0) >= COALESCE(SUM(ii.amount), 0) - 0.01
                 AND COALESCE(SUM(ii.amount), 0) > 0
              THEN 'paid'
            ELSE 'due'
          END AS status
        FROM invoices i
        LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
        WHERE 1=1
      `
      const params = []

      if (filters.search) {
        query += ' AND (i.invoice_number LIKE ? OR i.company_name LIKE ?)'
        params.push(`%${filters.search}%`, `%${filters.search}%`)
      }
      if (filters.date) {
        query += ' AND i.invoice_date = ?'
        params.push(filters.date)
      }

      query += ' GROUP BY i.id'

      // ── INVOICE PAYMENTS ── status filter ('paid' | 'due') applied after
      // grouping, since status is a computed aggregate
      if (filters.status === 'paid') {
        query += ' HAVING status = ?'
        params.push('paid')
      } else if (filters.status === 'due') {
        query += ' HAVING status = ?'
        params.push('due')
      }

      query += ' ORDER BY i.invoice_date DESC, i.created_at DESC'

      const invoices = db.prepare(query).all(...params)
      return { success: true, data: invoices }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getById(db, id) {
    try {
      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id)
      if (!invoice) return { success: false, message: 'Invoice not found' }
      const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id)
      const payments = db.prepare(
        'SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY paid_at DESC'
      ).all(id)
      const paid = invoice.paid_amount || 0
      const balanceDue = (invoice.total_amount || 0) - paid
      const status = (invoice.total_amount > 0 && paid >= invoice.total_amount - 0.01) ? 'paid' : 'due'
      return { success: true, data: { ...invoice, items, payments, balance_due: balanceDue, status } }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static add(db, { invoiceNumber, companyName, invoiceDate, chequeNo, chequeDate, items, firstPayment, firstPaymentNote }) {
    try {
      if (!invoiceNumber || !invoiceNumber.trim()) return { success: false, message: 'Invoice number is required' }
      if (!invoiceDate) return { success: false, message: 'Invoice date is required' }
      if (!items || items.length === 0) return { success: false, message: 'Add at least one product' }

      const totalAmount = items.reduce((s, i) => s + (i.amount != null ? parseFloat(i.amount) : (parseFloat(i.qty ?? 1) || 1) * (parseFloat(i.price) || 0)), 0)

      // ── INVOICE PAYMENTS ── optional first instalment recorded at creation
      const advance = Math.max(0, parseFloat(firstPayment) || 0)
      if (advance > totalAmount + 0.01) {
        return { success: false, message: `First instalment (Rs. ${advance.toFixed(2)}) cannot exceed the total (Rs. ${totalAmount.toFixed(2)})` }
      }

      const tx = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO invoices (invoice_number, company_name, invoice_date, cheque_no, cheque_date, total_amount, paid_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(invoiceNumber.trim(), companyName || '', invoiceDate, chequeNo || '', chequeDate || '', totalAmount, advance)

        const invoiceId = result.lastInsertRowid

        for (const item of items) {
          const qty = parseFloat(item.qty ?? 1) || 1
          const price = parseFloat(item.price ?? 0) || 0
          const amount = item.amount != null ? parseFloat(item.amount) : qty * price
          db.prepare(`
            INSERT INTO invoice_items (invoice_id, product_name, qty, price, amount)
            VALUES (?, ?, ?, ?, ?)
          `).run(invoiceId, item.product_name.trim(), qty, price, amount)
        }

        if (advance > 0) {
          db.prepare(`
            INSERT INTO invoice_payments (invoice_id, amount, note, paid_at)
            VALUES (?, ?, ?, ?)
          `).run(invoiceId, advance, (firstPaymentNote || 'First instalment').trim(), InvoiceIPC.slNowStr())
        }
        return invoiceId
      })

      const invoiceId = tx()
      return { success: true, id: invoiceId }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static update(db, { id, invoiceNumber, companyName, invoiceDate, chequeNo, chequeDate, items }) {
    try {
      if (!invoiceNumber || !invoiceNumber.trim()) return { success: false, message: 'Invoice number is required' }
      if (!invoiceDate) return { success: false, message: 'Invoice date is required' }
      if (!items || items.length === 0) return { success: false, message: 'Add at least one product' }

      const totalAmount = items.reduce((s, i) => s + (i.amount != null ? parseFloat(i.amount) : (parseFloat(i.qty ?? 1) || 1) * (parseFloat(i.price) || 0)), 0)

      db.prepare(`
        UPDATE invoices SET
          invoice_number = ?, company_name = ?, invoice_date = ?,
          cheque_no = ?, cheque_date = ?, total_amount = ?
        WHERE id = ?
      `).run(invoiceNumber.trim(), companyName || '', invoiceDate, chequeNo || '', chequeDate || '', totalAmount, id)

      // Replace items
      db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id)
      for (const item of items) {
        const qty = parseFloat(item.qty ?? 1) || 1
        const price = parseFloat(item.price ?? 0) || 0
        const amount = item.amount != null ? parseFloat(item.amount) : qty * price
        db.prepare(`
          INSERT INTO invoice_items (invoice_id, product_name, qty, price, amount)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, item.product_name.trim(), qty, price, amount)
      }

      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  // ── INVOICE PAYMENTS ──
  static addPayment(db, { invoiceId, amount, note, paidAt }) {
    try {
      const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId)
      if (!inv) return { success: false, message: 'Invoice not found' }

      const pay = parseFloat(amount)
      if (isNaN(pay) || pay <= 0) return { success: false, message: 'Enter a valid amount' }

      const already = inv.paid_amount || 0
      const balance = (inv.total_amount || 0) - already
      if (pay > balance + 0.01) {
        return { success: false, message: `Payment exceeds balance due (Rs. ${balance.toFixed(2)})` }
      }

      const when = paidAt && paidAt.trim() ? paidAt.trim() : InvoiceIPC.slNowStr()

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO invoice_payments (invoice_id, amount, note, paid_at)
          VALUES (?, ?, ?, ?)
        `).run(invoiceId, pay, (note || '').trim(), when)
        db.prepare('UPDATE invoices SET paid_amount = paid_amount + ? WHERE id = ?')
          .run(pay, invoiceId)
      })
      tx()

      const newPaid = already + pay
      return {
        success: true,
        paidAmount: newPaid,
        balanceDue: (inv.total_amount || 0) - newPaid,
        status: newPaid >= (inv.total_amount || 0) - 0.01 ? 'paid' : 'due'
      }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getPayments(db, invoiceId) {
    try {
      const payments = db.prepare(
        'SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY paid_at DESC'
      ).all(invoiceId)
      return { success: true, data: payments }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static remove(db, id) {
    try {
      db.prepare('DELETE FROM invoices WHERE id = ?').run(id)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }
}

module.exports = InvoiceIPC