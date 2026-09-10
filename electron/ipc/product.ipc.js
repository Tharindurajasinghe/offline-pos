const { v4: uuidv4 } = require('uuid')

class ProductIPC {
  // ── STOCK CHANGE HISTORY ──
  // Compute the timestamp explicitly in JS (Sri Lanka time) instead of relying
  // on the stock_adjustments.created_at column DEFAULT expression. This matches
  // the pattern already used by order.ipc.js / invoice.ipc.js and avoids any
  // dependency on how a specific SQLite build evaluates DEFAULT (datetime(...))
  // expressions on this table.
  static slNowStr() {
    return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').substring(0, 19)
  }

  static register(ipcMain, db, app) {
    ipcMain.handle('product:getAll', (_, filters) => ProductIPC.getAll(db, filters))
    ipcMain.handle('product:search', (_, query) => ProductIPC.search(db, query))
    // ── SCALE BARCODE ── look up a Kg variant by its 6-digit PLU code
    ipcMain.handle('product:findByScaleCode', (_, code6) => ProductIPC.findByScaleCode(db, code6))
    // ── SCALE PLU ── write the "Scale PLU.txt" file to the desktop
    ipcMain.handle('product:exportPluFile', () => ProductIPC.exportPluFile(db, app))
    ipcMain.handle('product:add', (_, data) => ProductIPC.add(db, data))
    ipcMain.handle('product:update', (_, data) => ProductIPC.update(db, data))
    ipcMain.handle('product:remove', (_, id) => ProductIPC.remove(db, id))
    ipcMain.handle('product:generateBarcodes', (_, productId) => ProductIPC.generateBarcodes(db, productId))
    // ── SCALE BARCODE ── bulk-generate 6-digit codes for all Kg variants without one
    ipcMain.handle('product:generateScaleBarcodes', () => ProductIPC.generateScaleBarcodes(db))
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
          v.selling_price, v.normal_price, v.wholesale_price, v.barcode, v.is_active as variant_active
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
          v.stock, v.buying_price, v.selling_price, v.normal_price, v.wholesale_price, v.barcode
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
            INSERT INTO variants (product_id, name, unit, stock, low_stock_threshold, buying_price, selling_price, normal_price, wholesale_price, barcode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            productId,
            v.name || 'Standard',
            v.unit || 'unit',
            v.stock || 0,
            v.lowStockThreshold || 5,
            v.buyingPrice || 0,
            v.sellingPrice || 0,
            v.normalPrice || 0,      // ── NORMAL PRICE ──
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
                buying_price = ?, selling_price = ?, normal_price = ?, wholesale_price = ?, barcode = ?
              WHERE id = ?
            `).run(
              v.name || 'Standard',
              v.unit || 'unit',
              newStock,
              v.lowStockThreshold || 5,
              v.buyingPrice || 0,
              v.sellingPrice || 0,
              v.normalPrice || 0,      // ── NORMAL PRICE ──
              v.wholesalePrice || 0,   // ── WHOLESALE ──
              v.barcode || null,
              v.id
            )

            if (newStock !== previousStock) {
              db.prepare(`
                INSERT INTO stock_adjustments (variant_id, adjustment, reason, adjusted_by, previous_stock, new_stock, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(v.id, newStock - previousStock, 'Edited via product update', updatedBy || '', previousStock, newStock, ProductIPC.slNowStr())
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
              INSERT INTO variants (product_id, name, unit, stock, low_stock_threshold, buying_price, selling_price, normal_price, wholesale_price, barcode)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              productId,
              v.name || 'Standard',
              v.unit || 'unit',
              v.stock || 0,
              v.lowStockThreshold || 5,
              v.buyingPrice || 0,
              v.sellingPrice || 0,
              v.normalPrice || 0,      // ── NORMAL PRICE ──
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
        LIMIT 50
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
        INSERT INTO stock_adjustments (variant_id, adjustment, reason, adjusted_by, previous_stock, new_stock, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(variantId, adjustment, reason || '', adjustedBy || '', previousStock, variant.stock, ProductIPC.slNowStr())

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
  // ── SCALE BARCODE ──
  // Find the Kg variant whose barcode matches an exact 6-digit PLU code.
  // Only Kg variants qualify (scale items); returns the same shape as search
  // so the billing screen can add it to the cart directly.
  static findByScaleCode(db, code6) {
    try {
      const code = String(code6 || '').trim()
      if (!code) return { success: false, message: 'No code' }
      const row = db.prepare(`
        SELECT
          p.id, p.product_code, p.name as product_name,
          c.name as category_name,
          v.id as variant_id, v.name as variant_name, v.unit,
          v.stock, v.buying_price, v.selling_price, v.normal_price, v.wholesale_price, v.barcode
        FROM products p
        JOIN categories c ON p.category_id = c.id
        JOIN variants v ON v.product_id = p.id
        WHERE p.is_active = 1 AND v.is_active = 1
          AND LOWER(v.unit) = 'kg'
          AND v.barcode = ?
        LIMIT 1
      `).get(code)
      if (!row) return { success: false, message: 'No scale product for this code' }
      return { success: true, data: row }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  // ── SCALE PLU ──
  // Write "Scale PLU.txt" to the user's Desktop. One line per Kg variant:
  //   barcode#ProductName VariantName#price
  // (price = the selling / "your" price, no "Rs."). Overwrites if it exists.
  static exportPluFile(db, app) {
    try {
      const fs = require('fs')
      const path = require('path')

      const rows = db.prepare(`
        SELECT p.name as product_name, v.name as variant_name,
               v.barcode, v.selling_price
        FROM products p
        JOIN variants v ON v.product_id = p.id
        WHERE p.is_active = 1 AND v.is_active = 1
          AND LOWER(v.unit) = 'kg'
          AND v.barcode IS NOT NULL AND v.barcode != ''
        ORDER BY v.barcode ASC
      `).all()

      // ── SCALE PLU ── keep ONLY real scale PLU codes: exactly 6 numeric
      // digits. System-generated barcodes look like "POS1725..." and are
      // excluded, since those products aren't sold through the scale.
      const scaleRows = rows.filter(r => /^\d{6}$/.test(String(r.barcode).trim()))

      const lines = scaleRows.map(r => {
        // Skip a blank/"Standard" variant name so the PLU name stays clean,
        // matching how single-variant Kg products read on the scale.
        const vn = (r.variant_name || '').trim()
        const name = (vn && vn.toLowerCase() !== 'standard')
          ? `${r.product_name} ${vn}`.trim()
          : (r.product_name || '').trim()
        const price = (parseFloat(r.selling_price) || 0).toFixed(2)
        return `${r.barcode}#${name}#${price}`
      })

      const desktop = app.getPath('desktop')
      const filePath = path.join(desktop, 'Scale PLU.txt')
      // trailing newline so each record is on its own line (scale import friendly)
      fs.writeFileSync(filePath, lines.join('\r\n') + (lines.length ? '\r\n' : ''), 'utf8')

      return { success: true, path: filePath, count: scaleRows.length }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }
  // ── SCALE BARCODE ──
  // Bulk-generate unique 6-digit codes for every Kg variant that has no barcode
  // yet. Rules: only unit = Kg; skip variants that already have a barcode;
  // exactly 6 digits; never duplicate any existing barcode.
  static generateScaleBarcodes(db) {
    try {
      // Kg variants with no barcode set
      const targets = db.prepare(`
        SELECT v.id, v.barcode
        FROM variants v
        JOIN products p ON p.id = v.product_id
        WHERE p.is_active = 1 AND v.is_active = 1
          AND LOWER(v.unit) = 'kg'
          AND (v.barcode IS NULL OR v.barcode = '')
      `).all()

      // All barcodes already in use (any unit) — so a new 6-digit code can't
      // collide with anything, scale or system.
      const used = new Set(
        db.prepare(`SELECT barcode FROM variants WHERE barcode IS NOT NULL AND barcode != ''`)
          .all().map(r => String(r.barcode))
      )

      const upd = db.prepare('UPDATE variants SET barcode = ? WHERE id = ?')
      let generated = 0

      // ── SEQUENTIAL ── assign codes in order starting at 000100 (000100,
      // 000101, 000102, …) so they're easy to read and match on the scale.
      // Continue past the highest existing 6-digit code, and skip any number
      // already taken.
      let next = 100
      // start after the largest existing barcode that is a 6-digit number
      for (const b of used) {
        if (/^\d{6}$/.test(b)) {
          const n = parseInt(b, 10)
          if (n >= next) next = n + 1
        }
      }

      const tx = db.transaction(() => {
        for (const v of targets) {
          while (used.has(String(next).padStart(6, '0')) && next <= 999999) next++
          if (next > 999999) break   // ran out of 6-digit space
          const code = String(next).padStart(6, '0')
          used.add(code)
          upd.run(code, v.id)
          generated++
          next++
        }
      })
      tx()

      return { success: true, generated, skipped: targets.length - generated }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

}

module.exports = ProductIPC