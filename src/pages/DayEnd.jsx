import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import DateTime from '../utils/dateTime'

export default function DayEnd() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { formatCurrency } = useApp()
  const [summary, setSummary] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadDaySummary() }, [])

  const loadDaySummary = async () => {
    setLoading(true)
    try {
      const [totalRes, salesRes] = await Promise.all([
        window.api.getTodayTotal(),
        window.api.getTodaySales()
      ])

      if (totalRes.success) {
        setSummary({
          total: totalRes.total,
          billCount: totalRes.billCount
        })
      }

      if (salesRes.success) {
        // Aggregate items by product+variant
        const map = {}
        salesRes.data.forEach(item => {
          const key = item.product_code + '-' + item.variant_name
          if (!map[key]) {
            map[key] = {
              product_code: item.product_code,
              product_name: item.product_name,
              variant_name: item.variant_name,
              unit: item.unit,
              sold_qty: 0,
              total_income: 0
            }
          }
          map[key].sold_qty += item.qty
          map[key].total_income += item.line_total
        })
        setItems(Object.values(map).sort((a, b) => b.sold_qty - a.sold_qty))
      }
    } catch (err) {
      console.error('DayEnd load error:', err)
    }
    setLoading(false)
  }

  const handleEndToday = async () => {
    if (!window.confirm('Confirm end today? This will save the daily summary and log you out.')) return
    setSaving(true)
    const result = await window.api.endDay()
    if (result.success) {
      await logout()
      navigate('/login', { replace: true })
    } else {
      alert('Error: ' + result.message)
      setSaving(false)
    }
  }

  const handleContinue = () => {
    navigate('/', { replace: true })
  }

  const handlePrint = () => {
  const today = new Date().toLocaleDateString('en-GB')
  const rows = items.map(item => `
    <tr>
      <td>${item.product_code}</td>
      <td>${item.product_name} — ${item.variant_name}</td>
      <td style="text-align:center">${item.sold_qty} ${item.unit}</td>
      <td style="text-align:right">Rs.${item.total_income.toFixed(2)}</td>
    </tr>
  `).join('')

  const html = `
    <!DOCTYPE html><html><head>
    <title>Day End Summary — ${today}</title>
    <style>
      body { font-family: sans-serif; padding: 20px; font-size: 13px; }
      h2 { margin-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
      th { background: #f3f4f6; }
      .totals p { margin: 4px 0; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h2>Day End Summary — ${today}</h2>
    <div class="totals">
      <p><strong>Total Bills:</strong> ${summary?.billCount ?? 0}</p>
      <p><strong>Total Income:</strong> Rs.${(summary?.total ?? 0).toFixed(2)}</p>
    </div>
    <table>
      <thead>
        <tr><th>ID</th><th>Product</th><th>Qty</th><th>Income</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    </body></html>
  `

  const win = window.open('', '_blank', 'width=800,height=600')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 500)
}
  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>📋 Day End Summary</h1>
            <p style={styles.subtitle}>{DateTime.formatDate(new Date().toISOString().split('T')[0])}</p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={handlePrint}>
            🖨️ Print
          </button>
        </div>

        {loading ? <div className="spinner" /> : (
          <>
            {/* Totals */}
            <div style={styles.statsGrid}>
              <div style={styles.statBox}>
                <div style={styles.statLabel}>Total Bills</div>
                <div style={styles.statValue}>{summary?.billCount ?? 0}</div>
              </div>
              <div style={styles.statBox}>
                <div style={styles.statLabel}>Total Income</div>
                <div style={{ ...styles.statValue, color: '#16a34a' }}>
                  {formatCurrency(summary?.total ?? 0)}
                </div>
              </div>
            </div>

            {/* Product breakdown */}
            <div style={styles.tableSection}>
              <h3 style={styles.tableTitle}>Product Breakdown</h3>
              {items.length === 0 ? (
                <p style={{ color: '#9ca3af', textAlign: 'center', padding: '30px' }}>
                  No sales recorded today.
                </p>
              ) : (
                <div className="table-wrap" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Product ID</th>
                        <th>Product</th>
                        <th>Variant</th>
                        <th style={{ textAlign: 'center' }}>Sold Qty</th>
                        <th style={{ textAlign: 'right' }}>Income</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: '700' }}>{item.product_code}</td>
                          <td>{item.product_name}</td>
                          <td><span className="badge badge-purple">{item.variant_name}</span></td>
                          <td style={{ textAlign: 'center', fontWeight: '600' }}>{item.sold_qty} {item.unit}</td>
                          <td style={{ textAlign: 'right', color: '#16a34a' }}>{formatCurrency(item.total_income)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Action buttons */}
        <div style={styles.actions}>
          <button
            className="btn btn-outline"
            onClick={handleContinue}
            disabled={saving}
            style={{ minWidth: '160px' }}
          >
            ▶ Continue Sales
          </button>
          <button
            className="btn btn-danger"
            onClick={handleEndToday}
            disabled={saving}
            style={{ minWidth: '160px' }}
          >
            {saving ? 'Saving...' : '✅ End Today'}
          </button>
        </div>

      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px'
  },
  container: {
    background: '#fff',
    borderRadius: '16px',
    padding: '32px',
    width: '100%',
    maxWidth: '760px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px'
  },
  title: { fontSize: '22px', fontWeight: '700', marginBottom: '4px' },
  subtitle: { fontSize: '14px', color: '#6b7280' },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '24px'
  },
  statBox: {
    background: '#f9fafb',
    borderRadius: '10px',
    padding: '16px',
    textAlign: 'center',
    border: '1px solid #e5e7eb'
  },
  statLabel: { fontSize: '12px', color: '#6b7280', marginBottom: '6px' },
  statValue: { fontSize: '24px', fontWeight: '700' },
  tableSection: { marginBottom: '24px' },
  tableTitle: { fontSize: '15px', fontWeight: '600', marginBottom: '10px' },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    borderTop: '1px solid #e5e7eb',
    paddingTop: '20px'
  }
}