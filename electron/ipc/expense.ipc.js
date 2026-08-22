// electron/ipc/expense.ipc.js
// ── EXPENSES ──
// Simple day-to-day shop expenses. Reported separately on the Summary page
// (day + month totals) — never affects income/profit calculations anywhere.

class ExpenseIPC {
  static register(ipcMain, db) {
    ipcMain.handle('expense:add',        (_, data)      => ExpenseIPC.add(db, data))
    ipcMain.handle('expense:getByDate',  (_, dayLabel)  => ExpenseIPC.getByDate(db, dayLabel))
    ipcMain.handle('expense:remove',     (_, id)        => ExpenseIPC.remove(db, id))
    ipcMain.handle('expense:getTotalByDay',   (_, dayLabel)   => ExpenseIPC.getTotalByDay(db, dayLabel))
    ipcMain.handle('expense:getTotalByMonth', (_, monthLabel) => ExpenseIPC.getTotalByMonth(db, monthLabel))
  }

  // Timestamp computed explicitly in JS (Sri Lanka time) rather than relying
  // on a SQLite column DEFAULT expression — proven the reliable pattern
  // elsewhere in this app (orders, invoices, stock history).
  static slNowStr() {
    return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').substring(0, 19)
  }
  static slToday() {
    return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0]
  }

  static add(db, { amount, message, addedBy }) {
    try {
      const amt = parseFloat(amount)
      if (isNaN(amt) || amt <= 0) {
        return { success: false, message: 'Enter a valid amount' }
      }
      const msg = (message || '').trim()
      if (!msg) {
        return { success: false, message: 'Enter a short note for this expense' }
      }

      const now = ExpenseIPC.slNowStr()
      const dayLabel = ExpenseIPC.slToday()

      const res = db.prepare(`
        INSERT INTO expenses (amount, message, day_label, added_by, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(amt, msg, dayLabel, addedBy || '', now)

      return { success: true, id: res.lastInsertRowid }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getByDate(db, dayLabel) {
    try {
      const day = dayLabel || ExpenseIPC.slToday()
      const rows = db.prepare(
        'SELECT * FROM expenses WHERE day_label = ? ORDER BY created_at DESC, id DESC'
      ).all(day)
      const total = rows.reduce((s, r) => s + r.amount, 0)
      return { success: true, data: rows, total }
    } catch (err) {
      return { success: false, message: err.message, data: [], total: 0 }
    }
  }

  static remove(db, id) {
    try {
      db.prepare('DELETE FROM expenses WHERE id = ?').run(id)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getTotalByDay(db, dayLabel) {
    try {
      const row = db.prepare(
        'SELECT COALESCE(SUM(amount), 0) AS t FROM expenses WHERE day_label = ?'
      ).get(dayLabel)
      return { success: true, total: row.t }
    } catch (err) {
      return { success: false, total: 0, message: err.message }
    }
  }

  // monthLabel matches the app's display format, e.g. "2026 Jul"
  static getTotalByMonth(db, monthLabel) {
    try {
      const monthNums = {
        Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
        Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'
      }
      const [year, mon] = String(monthLabel).split(' ')
      const prefix = `${year}-${monthNums[mon] || '01'}`
      const row = db.prepare(
        'SELECT COALESCE(SUM(amount), 0) AS t FROM expenses WHERE day_label LIKE ?'
      ).get(`${prefix}%`)
      return { success: true, total: row.t }
    } catch (err) {
      return { success: false, total: 0, message: err.message }
    }
  }
}

module.exports = ExpenseIPC