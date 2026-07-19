import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useApp } from '../context/AppContext'
import DateTime from '../utils/dateTime'

export default function Summary() {
  const { formatCurrency } = useApp()
  const [tab, setTab] = useState('daily')
  const [dailySummaries, setDailySummaries] = useState([])
  const [monthlySummaries, setMonthlySummaries] = useState([])
  const [selectedSummary, setSelectedSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [monthlyItems, setMonthlyItems] = useState([])
  const [returns, setReturns] = useState({ total: 0, items: [] })   // ── RETURNS ──
  const [paperSize, setPaperSize] = useState('a4')
  const [shopName, setShopName] = useState('')

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const [daily, monthly, settings] = await Promise.all([
      window.api.getDailySummaries(),
      window.api.getMonthlySummaries(),
      window.api.getSettings()
    ])
    if (daily.success) setDailySummaries(daily.data)
    if (monthly.success) setMonthlySummaries(monthly.data)
    if (settings.success) setShopName(settings.data.shop_name || '')  
    setLoading(false)
  }

  const chartData = (tab === 'daily' ? dailySummaries : monthlySummaries)
    .slice(0, 7)
    .reverse()
    .map(s => ({
      label: tab === 'daily' ? DateTime.formatDate(s.day_label) : s.month_label,
      Income: parseFloat(s.total_income.toFixed(2)),
      Profit: parseFloat(s.total_profit.toFixed(2))
    }))

  const summaries = tab === 'daily' ? dailySummaries : monthlySummaries

  const displayItems = tab === 'monthly' ? monthlyItems : (selectedSummary?.items || [])

  const top5 = [...displayItems]
    .sort((a, b) => b.sold_qty - a.sold_qty)
    .slice(0, 5)

  return (
    <div className="page-content">
      {/* Tab switch */}
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(tab === 'daily' ? styles.tabActive : {}) }}
          onClick={() => { setTab('daily'); setSelectedSummary(null); setMonthlyItems([]); setReturns({ total: 0, items: [] }) }}
        >Daily Summary</button>
        <button
          style={{ ...styles.tab, ...(tab === 'monthly' ? styles.tabActive : {}) }}
          onClick={() => { setTab('monthly'); setSelectedSummary(null); setMonthlyItems([]); setReturns({ total: 0, items: [] }) }}
        >Monthly Summary</button>
      </div>

      {loading ? <div className="spinner" /> : (
        <div style={styles.grid}>
          {/* Left — list */}
          <div className="card card-body">
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>
              {tab === 'daily' ? 'Daily Summaries' : 'Monthly Summaries'}
            </h2>
            {summaries.length === 0 ? (
              <p style={{ color: '#9ca3af', textAlign: 'center', padding: '30px' }}>
                No summaries yet. End a day to create one.
              </p>
            ) : (
              <div style={styles.summaryList}>
                {summaries.map((s, i) => (
                  <button
                    key={i}
                    style={{
                      ...styles.summaryItem,
                      ...(selectedSummary === s ? styles.summaryItemActive : {})
                    }}
                    onClick={async () => {
                      setSelectedSummary(s)
                      // ── RETURNS ──
                      if (tab === 'daily') {
                        const rr = await window.api.getReturnsByDay(s.day_label)
                        if (rr.success) setReturns(rr.data)
                      } else {
                        const rr = await window.api.getReturnsByMonth(s.month_label)
                        if (rr.success) setReturns(rr.data)
                      }
                      if (tab === 'monthly') {
                        const result = await window.api.getMonthlyItems(s.month_label)
                        setMonthlyItems(result.success ? result.data : [])
                      }
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>
                        {tab === 'daily' ? DateTime.formatDate(s.day_label) : s.month_label}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {s.total_bills} bills
                        {tab === 'daily' && s.ended_manually ? ' · Manual' : tab === 'daily' ? ' · Auto' : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#16a34a', fontWeight: '700' }}>
                        {formatCurrency(s.total_income)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        Profit: {formatCurrency(s.total_profit)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right — details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Chart */}
            <div className="card card-body">
              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>
                Last 7 {tab === 'daily' ? 'Days' : 'Months'}
              </h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData}>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(val) => `Rs. ${val.toFixed(2)}`} />
                    <Legend />
                    <Bar dataKey="Income" fill="#16a34a" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Profit" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: '#9ca3af', textAlign: 'center' }}>No data for chart</p>
              )}
            </div>

            {/* Selected summary details */}
            {selectedSummary ? (
              <div className="card card-body">
                <div style={styles.detailHeader}>
                  <h3 style={{ fontSize: '15px', fontWeight: '600' }}>
                    {tab === 'daily'
                      ? DateTime.formatDate(selectedSummary.day_label)
                      : selectedSummary.month_label} — Details
                  </h3>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    className="input"
                    value={paperSize}
                    onChange={e => setPaperSize(e.target.value)}
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                  >
                    <option value="a4">A4 Paper</option>
                    <option value="80mm">80mm Thermal</option>
                  </select>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => printSummary(selectedSummary, tab, displayItems, paperSize, shopName)}
                  >
                    🖨️ Print
                  </button>
                </div>
                </div>

                {/* Stats */}
                <div style={styles.statsGrid}>
                  <div style={styles.statBox}>
                    <div style={styles.statLabel}>Total Bills</div>
                    <div style={styles.statValue}>{selectedSummary.total_bills}</div>
                  </div>
                  <div style={styles.statBox}>
                    <div style={styles.statLabel}>Total Income</div>
                    <div style={{ ...styles.statValue, color: '#16a34a' }}>
                      {formatCurrency(selectedSummary.total_income)}
                    </div>
                  </div>
                  <div style={styles.statBox}>
                    <div style={styles.statLabel}>Total Profit</div>
                    <div style={{ ...styles.statValue, color: '#2563eb' }}>
                      {formatCurrency(selectedSummary.total_profit)}
                    </div>
                  </div>
                  <div style={styles.statBox}>
                    <div style={styles.statLabel}>Total Discount</div>
                    <div style={{ ...styles.statValue, color: '#d97706' }}>
                      {formatCurrency(selectedSummary.total_discount)}
                    </div>
                  </div>
                  {/* ── RETURNS ── additive only; does not affect income/profit */}
                  <div style={styles.statBox}>
                    <div style={styles.statLabel}>Return Amount</div>
                    <div style={{ ...styles.statValue, color: '#ea580c' }}>
                      {formatCurrency(returns.total || 0)}
                    </div>
                  </div>
                </div>

                {/* Items breakdown */}
                {displayItems.length > 0 ? (
                  <>
                    <h4 style={{ fontSize: '13px', fontWeight: '600', margin: '14px 0 8px' }}>
                      Product Breakdown
                    </h4>
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Product ID</th>
                            <th>Product</th>
                            <th>Variant</th>
                            <th style={{ textAlign: 'center' }}>Sold Qty</th>
                            <th style={{ textAlign: 'right' }}>Income</th>
                            <th style={{ textAlign: 'right' }}>Profit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayItems.map((item, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: '700' }}>{item.product_code}</td>
                              <td>{item.product_name}</td>
                              <td><span className="badge badge-purple">{item.variant_name}</span></td>
                              <td style={{ textAlign: 'center', fontWeight: '600' }}>{item.sold_qty}</td>
                              <td style={{ textAlign: 'right', color: '#16a34a' }}>{formatCurrency(item.total_income)}</td>
                              <td style={{ textAlign: 'right', color: '#2563eb' }}>{formatCurrency(item.total_profit)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Top 5 */}
                    {top5.length > 0 && (
                      <>
                        <h4 style={{ fontSize: '13px', fontWeight: '600', margin: '14px 0 8px' }}>
                          🏆 Top 5 Items by Quantity
                        </h4>
                        <div style={styles.top5}>
                          {top5.map((item, i) => (
                            <div key={i} style={styles.top5Item}>
                              <span style={styles.top5Rank}>#{i + 1}</span>
                              <span style={{ flex: 1 }}>{item.product_name} — {item.variant_name}</span>
                              <span style={{ fontWeight: '700', color: '#16a34a' }}>{item.sold_qty} sold</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <p style={{ color: '#9ca3af', textAlign: 'center', padding: '20px' }}>
                    No product breakdown available.
                  </p>
                )}

                {/* ── RETURNS ── returns list (separate from summary calcs) */}
                {returns.items && returns.items.length > 0 && (
                  <>
                    <h4 style={{ fontSize: '13px', fontWeight: '600', margin: '18px 0 8px', color: '#ea580c' }}>
                      ↩️ Returned Items — Total {formatCurrency(returns.total || 0)}
                    </h4>
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Bill</th>
                            <th>Product</th>
                            <th>Variant</th>
                            <th style={{ textAlign: 'center' }}>Qty</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                            <th style={{ textAlign: 'center' }}>Restocked</th>
                          </tr>
                        </thead>
                        <tbody>
                          {returns.items.map((r, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 600 }}>{r.bill_number}</td>
                              <td>{r.product_name}</td>
                              <td><span className="badge badge-purple">{r.variant_name}</span></td>
                              <td style={{ textAlign: 'center' }}>{r.qty} {r.unit}</td>
                              <td style={{ textAlign: 'right', color: '#ea580c', fontWeight: 600 }}>{formatCurrency(r.line_total)}</td>
                              <td style={{ textAlign: 'center' }}>{r.restocked ? '✅' : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                Select a summary to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function printSummary(summary, tab, displayItems, paperSize, shopName) {
  const label = tab === 'daily'
    ? DateTime.formatDate(summary.day_label)
    : summary.month_label

  const printedAt = new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })

  const rows = displayItems.map(item => `
    <tr>
      <td>${item.product_code}</td>
      <td>${item.product_name} — ${item.variant_name}</td>
      <td style="text-align:center">${item.sold_qty}</td>
      <td style="text-align:right">Rs.${parseFloat(item.total_income).toFixed(2)}</td>
      <td style="text-align:right">Rs.${parseFloat(item.total_profit).toFixed(2)}</td>
    </tr>
  `).join('')

  const is80mm = paperSize === '80mm'

  const html = `
    <!DOCTYPE html><html><head>
    <title>Summary ${label}</title>
    <style>
      body {
        font-family: ${is80mm ? 'monospace' : 'sans-serif'};
        width: ${is80mm ? '72mm' : 'auto'};
        margin: ${is80mm ? '0 auto' : '0'};
        padding: ${is80mm ? '4px' : '20px'};
        font-size: ${is80mm ? '11px' : '13px'};
      }
      h2 { text-align: ${is80mm ? 'center' : 'left'}; font-size: ${is80mm ? '13px' : '18px'}; margin-bottom: 4px; }
      .shop { text-align: center; font-size: 12px; margin-bottom: 2px; font-weight: bold; }
      .printed { text-align: ${is80mm ? 'center' : 'left'}; font-size: ${is80mm ? '10px' : '11px'}; color: #555; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: ${is80mm ? 'none' : '1px solid #ddd'}; padding: ${is80mm ? '2px 4px' : '6px 10px'}; text-align: left; font-size: ${is80mm ? '10px' : '12px'}; }
      th { background: ${is80mm ? 'none' : '#f3f4f6'}; border-bottom: 1px dashed #999; font-weight: bold; }
      .totals p { margin: 3px 0; }
      hr { border: none; border-top: 1px dashed #999; margin: 6px 0; }
      @media print { body { padding: 0; } }
    </style></head><body>
    ${shopName ? `<div class="shop">${shopName}</div>` : ''}
    <h2>${tab === 'daily' ? 'Daily' : 'Monthly'} Summary</h2>
    <div class="printed">Period: ${label}</div>
    <div class="printed">Printed: ${printedAt}</div>
    <hr/>
    <div class="totals">
      <p><strong>Total Bills:</strong> ${summary.total_bills}</p>
      <p><strong>Total Income:</strong> Rs.${parseFloat(summary.total_income).toFixed(2)}</p>
      <p><strong>Total Profit:</strong> Rs.${parseFloat(summary.total_profit).toFixed(2)}</p>
      <p><strong>Total Discount:</strong> Rs.${parseFloat(summary.total_discount).toFixed(2)}</p>
    </div>
    <table>
      <thead><tr><th>ID</th><th>Product</th><th>Qty</th><th>Income</th><th>Profit</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </body></html>
  `
  const win = window.open('', '_blank', is80mm ? 'width=400,height=600' : 'width=800,height=600')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 500)
}

const styles = {
  tabs: { display: 'flex', gap: '8px', marginBottom: '16px' },
  tab: {
    padding: '8px 20px', borderRadius: '8px', border: '1px solid #e5e7eb',
    background: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '500'
  },
  tabActive: { background: '#16a34a', color: '#fff', border: '1px solid #16a34a' },
  grid: { display: 'grid', gridTemplateColumns: '350px 1fr', gap: '16px', alignItems: 'start' },
  summaryList: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '500px', overflowY: 'auto' },
  summaryItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: '8px',
    background: '#fff', cursor: 'pointer', textAlign: 'left', width: '100%'
  },
  summaryItemActive: { border: '1px solid #16a34a', background: '#f0fdf4' },
  detailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' },
  statBox: { background: '#f9fafb', borderRadius: '8px', padding: '12px', textAlign: 'center' },
  statLabel: { fontSize: '11px', color: '#6b7280', marginBottom: '4px' },
  statValue: { fontSize: '18px', fontWeight: '700' },
  top5: { display: 'flex', flexDirection: 'column', gap: '6px' },
  top5Item: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '8px 12px', background: '#f9fafb', borderRadius: '6px', fontSize: '13px'
  },
  top5Rank: { fontWeight: '700', color: '#6b7280', minWidth: '24px' }
}