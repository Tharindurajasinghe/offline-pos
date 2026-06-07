class CategoryIPC {
  static register(ipcMain, db) {
    ipcMain.handle('category:getAll', () => CategoryIPC.getAll(db))
    ipcMain.handle('category:add', (_, data) => CategoryIPC.add(db, data))
    ipcMain.handle('category:update', (_, data) => CategoryIPC.update(db, data))
    ipcMain.handle('category:remove', (_, id) => CategoryIPC.remove(db, id))
  }

  static getAll(db) {
    try {
      const categories = db.prepare(
        'SELECT * FROM categories ORDER BY name ASC'
      ).all()
      return { success: true, data: categories }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static add(db, { name }) {
    try {
      if (!name || !name.trim()) {
        return { success: false, message: 'Category name is required' }
      }
      const trimmed = name.trim()
      const existing = db.prepare(
        'SELECT id FROM categories WHERE LOWER(name) = LOWER(?)'
      ).get(trimmed)
      if (existing) {
        return { success: false, message: 'Category name already exists' }
      }
      const result = db.prepare(
        'INSERT INTO categories (name) VALUES (?)'
      ).run(trimmed)
      return { success: true, id: result.lastInsertRowid }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static update(db, { id, name }) {
    try {
      if (!name || !name.trim()) {
        return { success: false, message: 'Category name is required' }
      }
      const trimmed = name.trim()
      const existing = db.prepare(
        'SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?'
      ).get(trimmed, id)
      if (existing) {
        return { success: false, message: 'Category name already exists' }
      }
      db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(trimmed, id)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static remove(db, id) {
    try {
      const hasProducts = db.prepare(
        'SELECT id FROM products WHERE category_id = ? LIMIT 1'
      ).get(id)
      if (hasProducts) {
        return { success: false, message: 'Cannot remove category that has products' }
      }
      db.prepare('DELETE FROM categories WHERE id = ?').run(id)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }
}

module.exports = CategoryIPC