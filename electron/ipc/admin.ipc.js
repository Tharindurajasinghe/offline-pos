const bcrypt = require('bcryptjs')

class AdminIPC {
  static register(ipcMain, db) {
    ipcMain.handle('admin:getUsers', () => AdminIPC.getUsers(db))
    ipcMain.handle('admin:addUser', (_, data) => AdminIPC.addUser(db, data))
    ipcMain.handle('admin:updateUser', (_, data) => AdminIPC.updateUser(db, data))
    ipcMain.handle('admin:removeUser', (_, id) => AdminIPC.removeUser(db, id))
    ipcMain.handle('admin:resetPassword', (_, data) => AdminIPC.resetPassword(db, data))
    ipcMain.handle('admin:getActivityLog', () => AdminIPC.getActivityLog(db))
  }

  static getUsers(db) {
    try {
      const users = db.prepare(`
        SELECT id, username, role, is_active, created_at FROM users ORDER BY created_at DESC
      `).all()
      return { success: true, data: users }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static addUser(db, { username, password, role }) {
    try {
      if (!username || !username.trim()) return { success: false, message: 'Username is required' }
      if (!password || password.length < 4) return { success: false, message: 'Password must be at least 4 characters' }

      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim())
      if (existing) return { success: false, message: 'Username already exists' }

      // Cannot use admin username
      const adminUsername = process.env.VITE_ADMIN_USERNAME || 'admin'
      if (username.trim().toLowerCase() === adminUsername.toLowerCase()) {
        return { success: false, message: 'This username is reserved' }
      }

      const hash = bcrypt.hashSync(password, 10)
      const result = db.prepare(`
        INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)
      `).run(username.trim(), hash, role || 'user')

      return { success: true, id: result.lastInsertRowid }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static updateUser(db, { id, username, role, isActive }) {
    try {
      if (username) {
        const existing = db.prepare(
          'SELECT id FROM users WHERE username = ? AND id != ?'
        ).get(username.trim(), id)
        if (existing) return { success: false, message: 'Username already exists' }
      }

      db.prepare(`
        UPDATE users SET
          username = COALESCE(?, username),
          role = COALESCE(?, role),
          is_active = COALESCE(?, is_active)
        WHERE id = ?
      `).run(username || null, role || null, isActive !== undefined ? (isActive ? 1 : 0) : null, id)

      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static removeUser(db, id) {
    try {
      db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id)
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static resetPassword(db, { id, newPassword }) {
    try {
      if (!newPassword || newPassword.length < 4) {
        return { success: false, message: 'Password must be at least 4 characters' }
      }
      const hash = bcrypt.hashSync(newPassword, 10)
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id)
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getActivityLog(db) {
    try {
      const logs = db.prepare(`
        SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 200
      `).all()
      return { success: true, data: logs }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }
}

module.exports = AdminIPC