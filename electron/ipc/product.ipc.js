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
    ipcMain.handle('product:getStockHistory', (_, productId) => ProductIPC.getStockHistory(db, productId))
    ipcMain.handle('product:getVariantStockHistory', (_, variantId) => ProductIPC.getVariantStockHistory(db, variantId))
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
          v.selling_price, v.wholesale_price, v.barcode, v.is_active as variant_active
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
          v.stock, v.buying_price, v.selling_price, v.wholesale_price, v.barcode
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

          const variantResult = db.prepare(`
            INSERT INTO variants (product_id, name, unit, stock, low_stock_threshold, buying_price, selling_price, wholesale_price, barcode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            productId,
            v.name || 'Standard',
            v.unit || 'unit',
            v.stock || 0,
            v.lowStockThreshold || 5,
            v.buyingPrice || 0,
            v.sellingPrice || 0,
            v.wholesalePrice || 0,   // ── WHOLESALE ──
            v.barcode || null
          )

          // ── EXPIRY DATES ON CREATE ──
          // The form collects expiry dates locally (no variant id exists yet
          // until this INSERT runs), then sends them along with the variant.
          // Insert them now that we have a real variant id.
          if (Array.isArray(v.expiryDates)) {
            const variantId = variantResult.lastInsertRowid
            for (const ed of v.expiryDates) {
              const dateStr = typeof ed === 'string' ? ed : ed.expireDate
              if (!dateStr) continue
              db.prepare(
                'INSERT INTO variant_expiry_dates (variant_id, expire_date) VALUES (?, ?)'
              ).run(variantId, dateStr)
            }
          }
        }

        return productId
      })

      const productId = addProduct()
      return { success: true, productId, productCode }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static update(db, { productId, name, categoryId, variants, updatedBy }) {
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

            // ── STOCK CHANGE HISTORY ──
            // Capture the stock BEFORE this update so a direct edit in the
            // product form (not the separate Stock Adjust tool) is still
            // recorded: date/time, previous → new, and the delta.
            const before = db.prepare('SELECT stock FROM variants WHERE id = ?').get(v.id)
            const previousStock = before ? before.stock : 0
            const newStock = v.stock ?? 0

            db.prepare(`
              UPDATE variants SET
                name = ?, unit = ?, stock = ?, low_stock_threshold = ?,
                buying_price = ?, selling_price = ?, wholesale_price = ?, barcode = ?
              WHERE id = ?
            `).run(
              v.name || 'Standard',
              v.unit || 'unit',
              newStock,
              v.lowStockThreshold || 5,
              v.buyingPrice || 0,
              v.sellingPrice || 0,
              v.wholesalePrice || 0,   // ── WHOLESALE ──
              v.barcode || null,
              v.id
            )

            if (newStock !== previousStock) {
              db.prepare(`
                INSERT INTO stock_adjustments (variant_id, adjustment, reason, adjusted_by, previous_stock, new_stock)
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(v.id, newStock - previousStock, 'Edited via product update', updatedBy || '', previousStock, newStock)
            }

            // ── EXPIRY DATES ── reconcile the local list against the DB for
            // this existing variant: update rows that carry a real expiry id,
            // insert rows that don't (added locally before save), and delete
            // any saved date the user removed from the local list.
            if (Array.isArray(v.expiryDates)) {
              const keepIds = new Set()
              for (const ed of v.expiryDates) {
                if (typeof ed === 'string') {
                  db.prepare('INSERT INTO variant_expiry_dates (variant_id, expire_date) VALUES (?, ?)').run(v.id, ed)
                } else if (ed.id) {
                  db.prepare('UPDATE variant_expiry_dates SET expire_date = ? WHERE id = ?').run(ed.expireDate, ed.id)
                  keepIds.add(ed.id)
                } else if (ed.expireDate) {
                  const res = db.prepare('INSERT INTO variant_expiry_dates (variant_id, expire_date) VALUES (?, ?)').run(v.id, ed.expireDate)
                  keepIds.add(res.lastInsertRowid)
                }
              }
              const existing = db.prepare('SELECT id FROM variant_expiry_dates WHERE variant_id = ?').all(v.id)
              for (const row of existing) {
                if (!keepIds.has(row.id)) {
                  db.prepare('DELETE FROM variant_expiry_dates WHERE id = ?').run(row.id)
                }
              }
            }
          } else {
            // New variant added during update
            const variantResult = db.prepare(`
              INSERT INTO variants (product_id, name, unit, stock, low_stock_threshold, buying_price, selling_price, wholesale_price, barcode)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              productId,
              v.name || 'Standard',
              v.unit || 'unit',
              v.stock || 0,
              v.lowStockThreshold || 5,
              v.buyingPrice || 0,
              v.sellingPrice || 0,
              v.wholesalePrice || 0,   // ── WHOLESALE ──
              v.barcode || null
            )

            // ── EXPIRY DATES ON CREATE (during edit) ──
            if (Array.isArray(v.expiryDates)) {
              const variantId = variantResult.lastInsertRowid
              for (const ed of v.expiryDates) {
                const dateStr = typeof ed === 'string' ? ed : ed.expireDate
                if (!dateStr) continue
                db.prepare(
                  'INSERT INTO variant_expiry_dates (variant_id, expire_date) VALUES (?, ?)'
                ).run(variantId, dateStr)
              }
            }
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

  // ── STOCK CHANGE HISTORY ──
  // All stock changes for every variant of a product — from direct edits in
  // the product form AND from the separate Stock Adjust tool, since both
  // write to the same stock_adjustments table. Newest first.
  static getStockHistory(db, productId) {
    try {
      const rows = db.prepare(`
        SELECT
          sa.id, sa.variant_id, v.name AS variant_name,
          sa.previous_stock, sa.new_stock, sa.adjustment,
          sa.reason, sa.adjusted_by, sa.created_at
        FROM stock_adjustments sa
        JOIN variants v ON v.id = sa.variant_id
        WHERE v.product_id = ?
        ORDER BY sa.created_at DESC, sa.id DESC
      `).all(productId)
      return { success: true, data: rows }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  // ── STOCK CHANGE HISTORY (per variant) ──
  // Same source data as getStockHistory, scoped to ONE variant — used by the
  // 📜 icon on each variant row.
  static getVariantStockHistory(db, variantId) {
    try {
      const rows = db.prepare(`
        SELECT
          sa.id, sa.variant_id, v.name AS variant_name,
          sa.previous_stock, sa.new_stock, sa.adjustment,
          sa.reason, sa.adjusted_by, sa.created_at
        FROM stock_adjustments sa
        JOIN variants v ON v.id = sa.variant_id
        WHERE sa.variant_id = ?
        ORDER BY sa.created_at DESC, sa.id DESC
      `).all(variantId)
      return { success: true, data: rows }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static adjustStock(db, { variantId, adjustment, reason, adjustedBy }) {
    try {
      const before = db.prepare('SELECT stock FROM variants WHERE id = ?').get(variantId)
      const previousStock = before ? before.stock : 0

      db.prepare(
        'UPDATE variants SET stock = stock + ? WHERE id = ?'
      ).run(adjustment, variantId)

      const variant = db.prepare('SELECT stock FROM variants WHERE id = ?').get(variantId)

      db.prepare(`
        INSERT INTO stock_adjustments (variant_id, adjustment, reason, adjusted_by, previous_stock, new_stock)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(variantId, adjustment, reason || '', adjustedBy || '', previousStock, variant.stock)

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