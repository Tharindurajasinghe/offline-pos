// electron/ipc/return.ipc.js
// ── RETURNS ──
// Returns are recorded SEPARATELY and never alter income/profit in summaries.
// They are surfaced only as an additive "Return Amount" + a returns list.

class ReturnIPC {
  static register(ipcMain, db) {
    ipcMain.handle('return:getReturnable', (_, billId) => ReturnIPC.getReturnable(db, billId))
    ipcMain.handle('return:process',       (_, data)   => ReturnIPC.process(db, data))
    ipcMain.handle('return:getByDay',      (_, dayLabel) => ReturnIPC.getByDay(db, dayLabel))
    ipcMain.handle('return:getByMonth',    (_, monthLabel) => ReturnIPC.getByMonth(db, monthLabel))
  }

  static slNowStr() {
    return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').substring(0, 19)
  }
  static slToday() {
    return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0]
  }

  // For the return window: each bill item with its already-returned qty and
  // the remaining quantity that can still be returned.
  static getReturnable(db, billId) {
    try {
      const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId)
      if (!bill) return { success: false, message: 'Bill not found' }

      const items = db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(billId)

      // sum already-returned qty per bill_item across all prior returns
      const rows = items.map(it => {
        const r = db.prepare(`
          SELECT COALESCE(SUM(ri.qty), 0) AS returned
          FROM return_items ri
          JOIN returns rt ON ri.return_id = rt.id
          WHERE ri.bill_item_id = ?
        `).get(it.id)
        const alreadyReturned = r.returned || 0
        return {
          bill_item_id: it.id,
          variant_id: it.variant_id,
          product_code: it.product_code,
          product_name: it.product_name,
          variant_name: it.variant_name,
          unit: it.unit,
          sold_qty: it.qty,
          sold_price: it.sold_price,
          already_returned: alreadyReturned,
          returnable_qty: Math.max(0, it.qty - alreadyReturned)
        }
      })

      return {
        success: true,
        data: {
          bill_number: bill.bill_number,
          return_status: bill.return_status,
          items: rows
        }
      }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  // items = [{ bill_item_id, qty }]  (qty > 0, each ≤ its returnable_qty)
  // restock = boolean; returnedBy = username
  static process(db, { billId, items, restock, returnedBy }) {
    try {
      const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId)
      if (!bill) return { success: false, message: 'Bill not found' }
      if (!items || items.length === 0) return { success: false, message: 'No items selected to return' }

      const billItems = db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(billId)
      const byId = {}
      billItems.forEach(bi => { byId[bi.id] = bi })

      // Validate each requested return line against remaining returnable qty
      const toReturn = []
      for (const req of items) {
        const bi = byId[req.bill_item_id]
        if (!bi) return { success: false, message: 'Invalid bill item' }
        const qty = parseFloat(req.qty)
        if (isNaN(qty) || qty <= 0) continue

        const prev = db.prepare(`
          SELECT COALESCE(SUM(ri.qty), 0) AS returned
          FROM return_items ri JOIN returns rt ON ri.return_id = rt.id
          WHERE ri.bill_item_id = ?
        `).get(bi.id).returned || 0
        const remaining = bi.qty - prev

        if (qty > remaining + 0.0001) {
          return { success: false, message: `Cannot return ${qty} of ${bi.product_name} — only ${remaining} left to return` }
        }
        toReturn.push({ bi, qty })
      }

      if (toReturn.length === 0) return { success: false, message: 'No valid quantities to return' }

      const totalAmount = toReturn.reduce((s, r) => s + r.qty * r.bi.sold_price, 0)
      const dayLabel = ReturnIPC.slToday()

      const tx = db.transaction(() => {
        const res = db.prepare(`
          INSERT INTO returns (bill_id, bill_number, return_type, total_amount, restocked, returned_by, day_label, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(billId, bill.bill_number, 'partial', totalAmount, restock ? 1 : 0, returnedBy || '', dayLabel, ReturnIPC.slNowStr())
        const returnId = res.lastInsertRowid

        for (const { bi, qty } of toReturn) {
          db.prepare(`
            INSERT INTO return_items (return_id, bill_item_id, variant_id, product_code, product_name, variant_name, unit, qty, sold_price, line_total)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(returnId, bi.id, bi.variant_id, bi.product_code, bi.product_name, bi.variant_name, bi.unit, qty, bi.sold_price, qty * bi.sold_price)

          // Optional restock — add the returned qty back to the variant
          if (restock) {
            db.prepare('UPDATE variants SET stock = stock + ? WHERE id = ?').run(qty, bi.variant_id)
          }
        }

        // Recompute the bill's return status from CUMULATIVE returns:
        // 'full' if every bill item is fully returned, else 'partial'.
        let allFull = true
        for (const bi of billItems) {
          const totRet = db.prepare(`
            SELECT COALESCE(SUM(ri.qty), 0) AS returned
            FROM return_items ri JOIN returns rt ON ri.return_id = rt.id
            WHERE ri.bill_item_id = ?
          `).get(bi.id).returned || 0
          if (totRet < bi.qty - 0.0001) { allFull = false; break }
        }
        const status = allFull ? 'full' : 'partial'
        db.prepare('UPDATE bills SET return_status = ? WHERE id = ?').run(status, billId)

        return { returnId, status }
      })

      const { returnId, status } = tx()
      return { success: true, returnId, returnStatus: status, totalAmount, restocked: !!restock }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  // Summary support — total + item list for a given day (no recomputation of
  // income/profit; this is purely additive reporting)
  static getByDay(db, dayLabel) {
    try {
      const total = db.prepare(
        'SELECT COALESCE(SUM(total_amount), 0) AS t FROM returns WHERE day_label = ?'
      ).get(dayLabel).t

      const items = db.prepare(`
        SELECT ri.product_code, ri.product_name, ri.variant_name, ri.unit,
               ri.qty, ri.sold_price, ri.line_total,
               rt.bill_number, rt.created_at, rt.restocked
        FROM return_items ri
        JOIN returns rt ON ri.return_id = rt.id
        WHERE rt.day_label = ?
        ORDER BY rt.created_at DESC
      `).all(dayLabel)

      return { success: true, data: { total, items } }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  // monthLabel is the display label e.g. "2026 Jul"; map to a YYYY-MM prefix
  static getByMonth(db, monthLabel) {
    try {
      const monthNums = {
        Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
        Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'
      }
      const [year, mon] = String(monthLabel).split(' ')
      const prefix = `${year}-${monthNums[mon] || '01'}`

      const total = db.prepare(
        "SELECT COALESCE(SUM(total_amount), 0) AS t FROM returns WHERE day_label LIKE ?"
      ).get(`${prefix}%`).t

      const items = db.prepare(`
        SELECT ri.product_code, ri.product_name, ri.variant_name, ri.unit,
               ri.qty, ri.sold_price, ri.line_total,
               rt.bill_number, rt.created_at, rt.restocked
        FROM return_items ri
        JOIN returns rt ON ri.return_id = rt.id
        WHERE rt.day_label LIKE ?
        ORDER BY rt.created_at DESC
      `).all(`${prefix}%`)

      return { success: true, data: { total, items } }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }
}

module.exports = ReturnIPC