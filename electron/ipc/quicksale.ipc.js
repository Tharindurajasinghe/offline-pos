// electron/ipc/quicksale.ipc.js
// ── QUICK SALE ──
// Up to 12 pinned variants shown as one-tap cards on the Billing page.

const MAX_QUICK_SALE = 12

class QuickSaleIPC {
  static register(ipcMain, db) {
    ipcMain.handle('quicksale:getAll', ()             => QuickSaleIPC.getAll(db))
    ipcMain.handle('quicksale:add',    (_, variantId) => QuickSaleIPC.add(db, variantId))
    ipcMain.handle('quicksale:remove', (_, variantId) => QuickSaleIPC.remove(db, variantId))
  }

  // Returns rows in the SAME shape as product:search, so the Billing page can
  // feed them straight into makeCartItem() with no extra mapping.
  static getAll(db) {
    try {
      const rows = db.prepare(`
        SELECT
          p.id, p.product_code, p.name AS product_name,
          v.id AS variant_id, v.name AS variant_name, v.unit,
          v.stock, v.buying_price, v.selling_price, v.wholesale_price,
          v.barcode,
          q.sort_order
        FROM quick_sale q
        JOIN variants v  ON q.variant_id = v.id
        JOIN products p  ON v.product_id = p.id
        WHERE p.is_active = 1 AND v.is_active = 1
        ORDER BY q.sort_order ASC, q.id ASC
      `).all()

      return { success: true, data: rows }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static add(db, variantId) {
    try {
      if (!variantId) return { success: false, message: 'No product selected' }

      const variant = db.prepare('SELECT id FROM variants WHERE id = ?').get(variantId)
      if (!variant) return { success: false, message: 'Product variant not found' }

      const already = db.prepare(
        'SELECT id FROM quick_sale WHERE variant_id = ?'
      ).get(variantId)
      if (already) {
        return { success: false, message: 'Already in Quick Sale' }
      }

      const { count } = db.prepare('SELECT COUNT(*) AS count FROM quick_sale').get()
      if (count >= MAX_QUICK_SALE) {
        return {
          success: false,
          message: `Quick Sale is full (max ${MAX_QUICK_SALE}). Remove an item first.`
        }
      }

      const next = db.prepare(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM quick_sale'
      ).get().next

      db.prepare(
        'INSERT INTO quick_sale (variant_id, sort_order) VALUES (?, ?)'
      ).run(variantId, next)

      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static remove(db, variantId) {
    try {
      db.prepare('DELETE FROM quick_sale WHERE variant_id = ?').run(variantId)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }
}

module.exports = QuickSaleIPC