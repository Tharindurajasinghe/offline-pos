class BarcodeIPC {
  static register(ipcMain, db) {
    ipcMain.handle('barcode:getProducts', () => BarcodeIPC.getProducts(db))
    ipcMain.handle('barcode:print', (_, data) => BarcodeIPC.print(db, data))
  }

  static getProducts(db) {
    try {
      const rows = db.prepare(`
        SELECT
          p.id as product_id, p.product_code, p.name as product_name,
          v.id as variant_id, v.name as variant_name,
          v.barcode, v.selling_price, v.unit
        FROM products p
        JOIN variants v ON v.product_id = p.id
        WHERE p.is_active = 1 AND v.is_active = 1
          AND v.barcode IS NOT NULL AND v.barcode != ''
        ORDER BY p.product_code ASC, v.name ASC
      `).all()
      return { success: true, data: rows }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static print(db, { variantId, quantity }) {
    try {
      const variant = db.prepare(`
        SELECT
          v.id, v.name as variant_name, v.barcode, v.selling_price,
          p.product_code, p.name as product_name
        FROM variants v
        JOIN products p ON v.product_id = p.id
        WHERE v.id = ?
      `).get(variantId)

      if (!variant) return { success: false, message: 'Variant not found' }
      if (!variant.barcode) return { success: false, message: 'No barcode for this variant' }

      return {
        success: true,
        data: {
          ...variant,
          quantity: quantity || 1
        }
      }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }
}

module.exports = BarcodeIPC