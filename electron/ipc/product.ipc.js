const { v4: uuidv4 } = require('uuid')

class ProductIPC {
  static register(ipcMain, db) {
    ipcMain.handle('product:getAll', (_, filters) => ProductIPC.getAll(db, filters))
    ipcMain.handle('product:search', (_, query) => ProductIPC.search(db, query))
    ipcMain.handle('product:add', (_, data) => ProductIPC.add(db, data))
    ipcMain.handle('product:update', (_, data) => ProductIPC.update(db, data))
    ipcMain.handle('product:remove', (_, id) => ProductIPC.remove(db, id))
    ipcMain.handle('product:generateBarcodes', (_, productId) => ProductIPC.generateBarcodes(db, productId))
    ipcMain.handle('product:getExpiry', (_, variantId) => ProductIPC.getExpiry(db, variantId))
    ipcMain.handle('product:addExpiry', (_, data) => ProductIPC.addExpiry(db, data))
    ipcMain.handle('product:updateExpiry', (_, data) => ProductIPC.updateExpiry(db, data))
    ipcMain.handle('product:removeExpiry', (_, id) => ProductIPC.removeExpiry(db, id))
    ipcMain.handle('product:adjustStock', (_, data) => ProductIPC.adjustStock(db, data))
    ipcMain.handle('product:getLowStock', () => ProductIPC.getLowStock(db))
    ipcMain.handle('product:getExpiryWarnings', () => ProductIPC.getExpiryWarnings(db))
  }

  static getAll(db, filters = {}) {
    try {
      let query = `
        SELECT
          p.id, p.product_code, p.name as product_name, p.is_active,
          c.name as category_name, c.id as category_id,
          v.id as variant_id, v.name as variant_name, v.unit,
          v.stock, v.low_stock_threshold, v.buying_price,
          v.selling_price, v.barcode, v.is_active as variant_active
        FROM products p
        JOIN categories c ON p.category_id = c.id
        JOIN variants v ON v.product_id = p.id
        WHERE p.is_active = 1 AND v.is_active = 1
      `
      const params = []

      if (filters.categoryId) {
        query += ' AND p.category_id = ?'
        params.push(filters.categoryId)
      }
      if (filters.search) {
        query += ' AND (p.name LIKE ? OR p.product_code LIKE ? OR v.name LIKE ?)'
        const s = `%${filters.search}%`
        params.push(s, s, s)
      }
      if (filters.lowStock) {
        query += ' AND v.stock <= v.low_stock_threshold'
      }

      query += ' ORDER BY p.product_code ASC, v.name ASC'

      const rows = db.prepare(query).all(...params)
      return { success: true, data: rows }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static search(db, query) {
    try {
      if (!query || !query.trim()) return { success: true, data: [] }

      const q = query.trim()
      const rows = db.prepare(`
        SELECT
          p.id, p.product_code, p.name as product_name,
          c.name as category_name,
          v.id as variant_id, v.name as variant_name, v.unit,
          v.stock, v.buying_price, v.selling_price, v.barcode
        FROM products p
        JOIN categories c ON p.category_id = c.id
        JOIN variants v ON v.product_id = p.id
        WHERE p.is_active = 1 AND v.is_active = 1
          AND (
            p.product_code = ? OR
            p.name LIKE ? OR
            v.name LIKE ? OR
            v.barcode = ?
          )
        ORDER BY p.product_code ASC, v.name ASC
        LIMIT 20
      `).all(q, `%${q}%`, `%${q}%`, q)

      return { success: true, data: rows }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static add(db, { name, categoryId, variants }) {
    try {
      if (!name || !name.trim()) return { success: false, message: 'Product name is required' }
      if (!categoryId) return { success: false, message: 'Category is required' }
      if (!variants || variants.length === 0) return { success: false, message: 'At least one variant is required' }

      // Generate next product code
      const last = db.prepare(
        "SELECT product_code FROM products ORDER BY CAST(product_code AS INTEGER) DESC LIMIT 1"
      ).get()
      const nextNum = last ? parseInt(last.product_code) + 1 : 1
      const productCode = String(nextNum).padStart(4, '0')

      const addProduct = db.transaction(() => {
        const productResult = db.prepare(`
          INSERT INTO products (product_code, name, category_id)
          VALUES (?, ?, ?)
        `).run(productCode, name.trim(), categoryId)

        const productId = productResult.lastInsertRowid

        for (const v of variants) {
          // Validate barcode uniqueness if provided
          if (v.barcode) {
            const barcodeExists = db.prepare(
              'SELECT id FROM variants WHERE barcode = ?'
            ).get(v.barcode)
            if (barcodeExists) throw new Error(`Barcode ${v.barcode} already exists`)
          }

          db.prepare(`
            INSERT INTO variants (product_id, name, unit, stock, low_stock_threshold, buying_price, selling_price, barcode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            productId,
            v.name || 'Standard',
            v.unit || 'unit',
            v.stock || 0,
            v.lowStockThreshold || 5,
            v.buyingPrice || 0,
            v.sellingPrice || 0,
            v.barcode || null
          )
        }

        return productId
      })

      const productId = addProduct()
      return { success: true, productId, productCode }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static update(db, { productId, name, categoryId, variants }) {
    try {
      const updateAll = db.transaction(() => {
        if (name || categoryId) {
          db.prepare(`
            UPDATE products SET
              name = COALESCE(?, name),
              category_id = COALESCE(?, category_id)
            WHERE id = ?
          `).run(name || null, categoryId || null, productId)
        }

        for (const v of variants) {
          if (v.id) {
            // Update existing variant
            if (v.barcode) {
              const barcodeExists = db.prepare(
                'SELECT id FROM variants WHERE barcode = ? AND id != ?'
              ).get(v.barcode, v.id)
              if (barcodeExists) throw new Error(`Barcode ${v.barcode} already exists`)
            }

            db.prepare(`
              UPDATE variants SET
                name = ?, unit = ?, stock = ?, low_stock_threshold = ?,
                buying_price = ?, selling_price = ?, barcode = ?
              WHERE id = ?
            `).run(
              v.name || 'Standard',
              v.unit || 'unit',
              v.stock ?? 0,
              v.lowStockThreshold || 5,
              v.buyingPrice || 0,
              v.sellingPrice || 0,
              v.barcode || null,
              v.id
            )
          } else {
            // New variant added during update
            db.prepare(`
              INSERT INTO variants (product_id, name, unit, stock, low_stock_threshold, buying_price, selling_price, barcode)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              productId,
              v.name || 'Standard',
              v.unit || 'unit',
              v.stock || 0,
              v.lowStockThreshold || 5,
              v.buyingPrice || 0,
              v.sellingPrice || 0,
              v.barcode || null
            )
          }
        }
      })

      updateAll()
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static remove(db, id) {
    try {
      db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(id)
      db.prepare('UPDATE variants SET is_active = 0 WHERE product_id = ?').run(id)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static generateBarcodes(db, productId) {
    try {
      const variants = db.prepare(
        'SELECT id, barcode FROM variants WHERE product_id = ? AND is_active = 1'
      ).all(productId)

      const updateBarcode = db.prepare(
        'UPDATE variants SET barcode = ? WHERE id = ?'
      )

      const updated = []
      for (const v of variants) {
        if (!v.barcode) {
          let barcode
          let exists = true
          while (exists) {
            barcode = 'POS' + Date.now() + Math.floor(Math.random() * 1000)
            exists = db.prepare('SELECT id FROM variants WHERE barcode = ?').get(barcode)
          }
          updateBarcode.run(barcode, v.id)
          updated.push({ variantId: v.id, barcode })
        }
      }

      return { success: true, updated }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getExpiry(db, variantId) {
    try {
      const dates = db.prepare(
        'SELECT * FROM variant_expiry_dates WHERE variant_id = ? ORDER BY expire_date ASC'
      ).all(variantId)
      return { success: true, data: dates }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static addExpiry(db, { variantId, expireDate }) {
    try {
      const result = db.prepare(
        'INSERT INTO variant_expiry_dates (variant_id, expire_date) VALUES (?, ?)'
      ).run(variantId, expireDate)
      return { success: true, id: result.lastInsertRowid }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static updateExpiry(db, { id, expireDate }) {
    try {
      db.prepare(
        'UPDATE variant_expiry_dates SET expire_date = ? WHERE id = ?'
      ).run(expireDate, id)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static removeExpiry(db, id) {
    try {
      db.prepare('DELETE FROM variant_expiry_dates WHERE id = ?').run(id)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static adjustStock(db, { variantId, adjustment, reason, adjustedBy }) {
    try {
      db.prepare(
        'UPDATE variants SET stock = stock + ? WHERE id = ?'
      ).run(adjustment, variantId)

      db.prepare(`
        INSERT INTO stock_adjustments (variant_id, adjustment, reason, adjusted_by)
        VALUES (?, ?, ?, ?)
      `).run(variantId, adjustment, reason || '', adjustedBy || '')

      const variant = db.prepare('SELECT stock FROM variants WHERE id = ?').get(variantId)
      return { success: true, newStock: variant.stock }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getLowStock(db) {
    try {
      const rows = db.prepare(`
        SELECT
          p.product_code, p.name as product_name,
          c.name as category_name,
          v.id as variant_id, v.name as variant_name,
          v.stock, v.low_stock_threshold, v.unit
        FROM variants v
        JOIN products p ON v.product_id = p.id
        JOIN categories c ON p.category_id = c.id
        WHERE p.is_active = 1 AND v.is_active = 1
          AND v.stock <= v.low_stock_threshold
        ORDER BY v.stock ASC
      `).all()
      return { success: true, data: rows }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getExpiryWarnings(db) {
    try {
      const warningDays = 30
      const warningDate = new Date()
      warningDate.setDate(warningDate.getDate() + warningDays)
      const warningDateStr = warningDate.toISOString().split('T')[0]
      const todayStr = new Date().toISOString().split('T')[0]

      const rows = db.prepare(`
        SELECT
          p.product_code, p.name as product_name,
          c.name as category_name,
          v.id as variant_id, v.name as variant_name,
          e.id as expiry_id, e.expire_date
        FROM variant_expiry_dates e
        JOIN variants v ON e.variant_id = v.id
        JOIN products p ON v.product_id = p.id
        JOIN categories c ON p.category_id = c.id
        WHERE p.is_active = 1 AND v.is_active = 1
          AND e.expire_date <= ?
        ORDER BY e.expire_date ASC
      `).all(warningDateStr)

      const withStatus = rows.map(r => ({
        ...r,
        status: r.expire_date < todayStr ? 'EXPIRED' : 'EXPIRING_SOON'
      }))

      return { success: true, data: withStatus }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }
}

module.exports = ProductIPC