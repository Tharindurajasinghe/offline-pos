class InvoiceIPC {
  static register(ipcMain, db) {
    ipcMain.handle('invoice:getAll',    (_, filters) => InvoiceIPC.getAll(db, filters))
    ipcMain.handle('invoice:getById',   (_, id)      => InvoiceIPC.getById(db, id))
    ipcMain.handle('invoice:add',       (_, data)    => InvoiceIPC.add(db, data))
    ipcMain.handle('invoice:update',    (_, data)    => InvoiceIPC.update(db, data))
    ipcMain.handle('invoice:remove',    (_, id)      => InvoiceIPC.remove(db, id))
  }

  static getAll(db, filters = {}) {
    try {
      let query = `
        SELECT i.*, COALESCE(SUM(ii.amount), 0) as total_amount
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

      query += ' GROUP BY i.id ORDER BY i.invoice_date DESC, i.created_at DESC'

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
      return { success: true, data: { ...invoice, items } }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static add(db, { invoiceNumber, companyName, invoiceDate, chequeNo, chequeDate, items }) {
    try {
      if (!invoiceNumber || !invoiceNumber.trim()) return { success: false, message: 'Invoice number is required' }
      if (!invoiceDate) return { success: false, message: 'Invoice date is required' }
      if (!items || items.length === 0) return { success: false, message: 'Add at least one product' }

      const totalAmount = items.reduce((s, i) => s + parseFloat(i.amount || 0), 0)

      const result = db.prepare(`
        INSERT INTO invoices (invoice_number, company_name, invoice_date, cheque_no, cheque_date, total_amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(invoiceNumber.trim(), companyName || '', invoiceDate, chequeNo || '', chequeDate || '', totalAmount)

      const invoiceId = result.lastInsertRowid

      for (const item of items) {
        db.prepare(`
          INSERT INTO invoice_items (invoice_id, product_name, amount)
          VALUES (?, ?, ?)
        `).run(invoiceId, item.product_name.trim(), parseFloat(item.amount || 0))
      }

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

      const totalAmount = items.reduce((s, i) => s + parseFloat(i.amount || 0), 0)

      db.prepare(`
        UPDATE invoices SET
          invoice_number = ?, company_name = ?, invoice_date = ?,
          cheque_no = ?, cheque_date = ?, total_amount = ?
        WHERE id = ?
      `).run(invoiceNumber.trim(), companyName || '', invoiceDate, chequeNo || '', chequeDate || '', totalAmount, id)

      // Replace items
      db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id)
      for (const item of items) {
        db.prepare(`
          INSERT INTO invoice_items (invoice_id, product_name, amount)
          VALUES (?, ?, ?)
        `).run(id, item.product_name.trim(), parseFloat(item.amount || 0))
      }

      return { success: true }
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