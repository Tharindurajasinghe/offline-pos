class SummaryIPC {
  static register(ipcMain, db) {
    ipcMain.handle('summary:getDaily', () => SummaryIPC.getDaily(db))
    ipcMain.handle('summary:getMonthly', () => SummaryIPC.getMonthly(db))
    ipcMain.handle('summary:endDay', () => SummaryIPC.endDay(db, true))
    ipcMain.handle('summary:checkAutoEnd', () => SummaryIPC.checkAutoEnd(db))
    ipcMain.handle('summary:getMonthlyItems', (_, monthLabel) => SummaryIPC.getMonthlyItems(db, monthLabel))
  }

  static getSriLankaDate() {
    const now = new Date()
    const sl = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
    return sl.toISOString().split('T')[0]
  }

  static getMonthLabel(dateStr) {
    const d = new Date(dateStr)
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${d.getFullYear()} ${months[d.getMonth()]}`
  }

  static checkAutoEnd(db) {
    try {
      const today = SummaryIPC.getSriLankaDate()

      // Find any bills from days before today that don't have a summary
      const unsummarizedDays = db.prepare(`
        SELECT DISTINCT day_label FROM bills
        WHERE day_label < ? AND status = 'active'
          AND day_label NOT IN (SELECT day_label FROM daily_summary)
        ORDER BY day_label ASC
      `).all(today)

      for (const row of unsummarizedDays) {
        SummaryIPC.endDay(db, false, row.day_label)
      }

      return { success: true, autoEnded: unsummarizedDays.length }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getMonthlyItems(db, monthLabel) {
  try {
    const monthNums = {
      'Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06',
      'Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12'
    }
    // monthLabel is like "2025 Jun" → prefix becomes "2025-06"
    const [year, mon] = monthLabel.split(' ')
    const prefix = `${year}-${monthNums[mon]}`

    const items = db.prepare(`
      SELECT
        dsi.product_code,
        dsi.product_name,
        dsi.variant_name,
        SUM(dsi.sold_qty)     AS sold_qty,
        SUM(dsi.total_income) AS total_income,
        SUM(dsi.total_profit) AS total_profit
      FROM daily_summary_items dsi
      JOIN daily_summary ds ON dsi.summary_id = ds.id
      WHERE ds.day_label LIKE ?
      GROUP BY dsi.product_code, dsi.variant_name
      ORDER BY sold_qty DESC
    `).all(`${prefix}%`)

    return { success: true, data: items }
  } catch (err) {
    return { success: false, message: err.message }
  }
}

  static endDay(db, manually = true, targetDate = null) {
    try {
      const dayLabel = targetDate || SummaryIPC.getSriLankaDate()

      // Check if already summarized
      const existing = db.prepare(
        'SELECT id FROM daily_summary WHERE day_label = ?'
      ).get(dayLabel)
      if (existing) {
        return { success: false, message: 'Day already ended' }
      }

      // Get all bills for this day
      const bills = db.prepare(`
        SELECT * FROM bills WHERE day_label = ? AND status = 'active'
      `).all(dayLabel)

      if (bills.length === 0) {
        return { success: false, message: 'No sales found for this day' }
      }

      const totalIncome = bills.reduce((s, b) => s + b.grand_total, 0)
      const totalDiscount = bills.reduce((s, b) => s + b.total_discount, 0)

      // Calculate profit from bill items
      const itemRows = db.prepare(`
        SELECT
          bi.product_code, bi.product_name, bi.variant_name,
          bi.variant_id, bi.qty, bi.sold_price, bi.line_total,
          v.buying_price
        FROM bill_items bi
        JOIN bills b ON bi.bill_id = b.id
        LEFT JOIN variants v ON bi.variant_id = v.id
        WHERE b.day_label = ? AND b.status = 'active'
      `).all(dayLabel)

      const totalProfit = itemRows.reduce((s, i) => {
        return s + ((i.sold_price - (i.buying_price || 0)) * i.qty)
      }, 0)

      // Group items by variant
      const variantMap = {}
      for (const item of itemRows) {
        const key = `${item.product_code}-${item.variant_name}`
        if (!variantMap[key]) {
          variantMap[key] = {
            product_code: item.product_code,
            product_name: item.product_name,
            variant_name: item.variant_name,
            sold_qty: 0,
            total_income: 0,
            total_profit: 0
          }
        }
        variantMap[key].sold_qty += item.qty
        variantMap[key].total_income += item.line_total
        variantMap[key].total_profit += (item.sold_price - (item.buying_price || 0)) * item.qty
      }

      const endDayTransaction = db.transaction(() => {
        const summaryResult = db.prepare(`
          INSERT INTO daily_summary (day_label, total_bills, total_income, total_profit, total_discount, ended_manually)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(dayLabel, bills.length, totalIncome, totalProfit, totalDiscount, manually ? 1 : 0)

        const summaryId = summaryResult.lastInsertRowid

        for (const item of Object.values(variantMap)) {
          db.prepare(`
            INSERT INTO daily_summary_items (summary_id, product_code, product_name, variant_name, sold_qty, total_income, total_profit)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(summaryId, item.product_code, item.product_name, item.variant_name, item.sold_qty, item.total_income, item.total_profit)
        }

        // Update monthly summary
        const monthLabel = SummaryIPC.getMonthLabel(dayLabel)
        db.prepare(`
          INSERT INTO monthly_summary (month_label, total_bills, total_income, total_profit, total_discount)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(month_label) DO UPDATE SET
            total_bills = total_bills + excluded.total_bills,
            total_income = total_income + excluded.total_income,
            total_profit = total_profit + excluded.total_profit,
            total_discount = total_discount + excluded.total_discount
        `).run(monthLabel, bills.length, totalIncome, totalProfit, totalDiscount)
      })

      endDayTransaction()
      return { success: true, dayLabel, totalIncome, totalProfit }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getDaily(db) {
    try {
      const summaries = db.prepare(`
        SELECT ds.*,
          (SELECT json_group_array(json_object(
            'product_code', dsi.product_code,
            'product_name', dsi.product_name,
            'variant_name', dsi.variant_name,
            'sold_qty', dsi.sold_qty,
            'total_income', dsi.total_income,
            'total_profit', dsi.total_profit
          )) FROM daily_summary_items dsi WHERE dsi.summary_id = ds.id) as items
        FROM daily_summary ds
        ORDER BY ds.day_label DESC
      `).all()

      const parsed = summaries.map(s => ({
        ...s,
        items: s.items ? JSON.parse(s.items) : []
      }))

      return { success: true, data: parsed }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static getMonthly(db) {
    try {
      const summaries = db.prepare(`
        SELECT * FROM monthly_summary ORDER BY month_label DESC
      `).all()
      return { success: true, data: summaries }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }
}

module.exports = SummaryIPC