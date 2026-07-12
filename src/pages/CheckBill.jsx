import { useState, useEffect } from 'react'
import BillModal from '../components/BillModal'
import DateTime from '../utils/dateTime'
import { useApp } from '../context/AppContext'

export default function CheckBill() {
  const { formatCurrency, refreshAlerts } = useApp()
  const [bills, setBills] = useState([])
  const [dates, setDates] = useState([])
  const [searchId, setSearchId] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedBill, setSelectedBill] = useState(null)
  const [loading, setLoading] = useState(false)

  const today = DateTime.getSriLankaDate()

  useEffect(() => {
    loadTodayBills()
    loadDates()
  }, [])

  const loadDates = async () => {
    const result = await window.api.getBills({})
    if (result.success) {
      const uniqueDates = [...new Set(result.data.map(b => b.day_label))].sort((a, b) => b.localeCompare(a))
      setDates(uniqueDates)
    }
  }

  const loadTodayBills = async () => {
    setLoading(true)
    const result = await window.api.getBills({ dayLabel: today })
    if (result.success) setBills(result.data)
    setLoading(false)
  }

  const handleSearchById = async () => {
    if (!searchId.trim()) return
    setLoading(true)
    const result = await window.api.getBills({ billNumber: searchId.trim() })
    if (result.success) setBills(result.data)
    setLoading(false)
  }

  const handleDateChange = async (date) => {
    setSelectedDate(date)
    if (!date) { loadTodayBills(); return }
    setLoading(true)
    const result = await window.api.getBills({ dayLabel: date })
    if (result.success) setBills(result.data)
    setLoading(false)
  }

  const handleSelectBill = async (bill) => {
    const result = await window.api.getBillById(bill.id)
    if (result.success) setSelectedBill(result.data)
  }

  const handleDeleteBill = async (billId) => {
    if (!window.confirm('Delete this bill? Stock will be restored automatically.')) return
    const result = await window.api.deleteBill(billId)
    if (result.success) {
      setSelectedBill(null)
      loadTodayBills()
      loadDates()
      refreshAlerts()
      alert('Bill deleted and stock restored.')
    } else {
      alert('Error: ' + result.message)
    }
  }

  const handleReprint = (bill) => {
    window.api.getSettings().then(r => {
      if (!r.success) return
      const settings = r.data
      const items = (bill.items || []).map(item => `
        <tr>
          <td>${item.product_name} - ${item.variant_name}</td>
          <td style="text-align:center">${item.qty} ${item.unit}</td>
          <td style="text-align:right">Rs.${parseFloat(item.sold_price).toFixed(2)}</td>
          <td style="text-align:right">Rs.${parseFloat(item.line_total).toFixed(2)}</td>
          <td>${item.is_price_edited ? '✏️' : ''}</td>
        </tr>
      `).join('')

      const html = `
        <!DOCTYPE html><html><head>
        <title>Bill ${bill.bill_number}</title>
        <style>
          body { font-family: monospace; width: 80mm; margin: 0 auto; font-size: 18px; }
          h2,p { text-align: center; margin: 2px 0; }
          h2 { font-size: 22px; }
          p { font-size: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th,td { padding: 5px 4px; font-size: 16px; }
          th { border-bottom: 1px dashed #000; }
          .total { border-top: 1px dashed #000; font-weight: bold; }
          .ws-label { text-align:center; font-weight:bold; font-size:18px; border:2px solid #000; padding:4px; margin:6px 0; }
          @media print { body { margin: 0; } }
        </style></head><body>
        ${settings.shop_logo ? `<img src="${settings.shop_logo}" style="display:block;margin:0 auto;max-width:180px;"/>` : ''}
        <h2>${settings.shop_name || 'DEMO'}</h2>
        <p>${settings.shop_address || ''}</p>
        <p>${settings.shop_tel ? 'Tel: ' + settings.shop_tel : ''}</p>
        <p>Bill: ${bill.bill_number} | ${DateTime.formatDateTime(bill.bill_date)}</p>
        ${bill.customer_name ? `<p>Customer: ${bill.customer_name}</p>` : ''}
        ${bill.is_wholesale === 1 ? `<div class="ws-label">*** WHOLESALE BILL ***</div>` : ''}
        <hr/>
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th><th></th></tr></thead>
          <tbody>${items}</tbody>
        </table>
        <hr/>
        <table>
          ${bill.total_discount > 0 ? `<tr><td>Discount:</td><td style="text-align:right">Rs.${parseFloat(bill.total_discount).toFixed(2)}</td></tr>` : ''}
          <tr class="total"><td>TOTAL:</td><td style="text-align:right">Rs.${parseFloat(bill.grand_total).toFixed(2)}</td></tr>
          <tr><td>Cash:</td><td style="text-align:right">Rs.${parseFloat(bill.cash_paid).toFixed(2)}</td></tr>
          <tr><td>Change:</td><td style="text-align:right">Rs.${parseFloat(bill.change_amount).toFixed(2)}</td></tr>
        </table>
        <hr/>
        <p>${settings.bill_thank_you || 'Thank you!'}</p>
        </body></html>
      `
      const win = window.open('', '_blank', 'width=400,height=600')
        win.document.write(html)
        win.document.close()
        win.focus()
        win.onafterprint = () => win.close()
        setTimeout(() => win.print(), 500)
    })
  }

  return (
    <div className="page-content">
      <div style={styles.grid}>
        {/* Left panel */}
        <div className="card card-body">
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>Check Bill</h2>

          {/* Search by ID */}
          <div className="form-group">
            <label className="form-label">Enter Bill ID:</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="input"
                placeholder="e.g. #10006"
                value={searchId}
                onChange={e => setSearchId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearchById()}
              />
              <button className="btn btn-primary" onClick={handleSearchById}>Search</button>
            </div>
          </div>

          {/* Search by date */}
          <div className="form-group">
            <label className="form-label">Search by Date:</label>
            <select
              className="input"
              value={selectedDate}
              onChange={e => handleDateChange(e.target.value)}
            >
              <option value="">-- Select Date --</option>
              {dates.map(d => (
                <option key={d} value={d}>{DateTime.formatDate(d)}</option>
              ))}
            </select>
          </div>

          {/* Bills list */}
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px' }}>
              {selectedDate ? DateTime.formatDate(selectedDate) : "Today's"} Bills
            </h3>
            {loading ? (
              <div className="spinner" style={{ margin: '20px auto' }} />
            ) : bills.length === 0 ? (
              <p style={{ color: '#9ca3af', textAlign: 'center', padding: '20px' }}>No bills found</p>
            ) : (
              <div style={styles.billList}>
                {bills.map(bill => (
                  <button
                    key={bill.id}
                    style={{
                      ...styles.billItem,
                      ...(selectedBill?.id === bill.id ? styles.billItemActive : {})
                    }}
                    onClick={() => handleSelectBill(bill)}
                  >
                    <div>
                          <div style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            Bill {bill.bill_number}
                            {bill.is_customer_bill === 1 && (
                              <span className="badge badge-purple" style={{ fontSize: '10px' }}>
                                Added to Customer
                              </span>
                            )}
                            {/* ── WHOLESALE ── */}
                            {bill.is_wholesale === 1 && (
                              <span style={styles.wholesaleBadge}>
                                WHOLESALE BILL
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {DateTime.formatTime(bill.bill_date)} · {bill.item_count} items
                          </div>
                        </div>
                    <span style={{ color: '#16a34a', fontWeight: '700' }}>
                      {formatCurrency(bill.grand_total)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="card card-body">
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>Bill Details</h2>
          {!selectedBill ? (
            <div style={styles.empty}>
              <span style={{ fontSize: '40px' }}>📄</span>
              <p style={{ color: '#9ca3af', marginTop: '12px' }}>Select a bill to view details</p>
            </div>
          ) : (
            <div>
              {/* Bill info */}
              {/* ── WHOLESALE ── */}
              {selectedBill.is_wholesale === 1 && (
                <div style={styles.wholesaleBanner}>
                  🏷️ WHOLESALE BILL — all items priced at wholesale rate
                </div>
              )}

              <div style={styles.billInfo}>
                <div><strong>Bill:</strong> {selectedBill.bill_number}</div>
                <div><strong>Date:</strong> {DateTime.formatDateTime(selectedBill.bill_date)}</div>
                <div><strong>Customer:</strong> {selectedBill.customer_name || '—'}</div>
                <div><strong>Billed by:</strong> {selectedBill.billed_by || '—'}</div>
              </div>

              {/* Items */}
              <div className="table-wrap" style={{ margin: '14px 0' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style={{ textAlign: 'center' }}>Qty</th>
                      <th style={{ textAlign: 'right' }}>Price</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedBill.items || []).map((item, i) => (
                      <tr key={i} style={{ background: item.is_price_edited ? '#fffbeb' : 'transparent' }}>
                        <td>
                          <div style={{ fontWeight: '500' }}>{item.product_name}</div>
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>{item.variant_name}</div>
                        </td>
                        <td style={{ textAlign: 'center' }}>{item.qty} {item.unit}</td>
                        <td style={{ textAlign: 'right', color: item.is_price_edited ? '#d97706' : '#111827' }}>
                          {formatCurrency(item.sold_price)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: '600' }}>
                          {formatCurrency(item.line_total)}
                        </td>
                        <td>
                          {item.is_price_edited && <span className="badge badge-orange">✏️</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div style={styles.totals}>
                {selectedBill.total_discount > 0 && (
                  <div style={styles.totalRow}>
                    <span>Discount:</span>
                    <span style={{ color: '#d97706' }}>{formatCurrency(selectedBill.total_discount)}</span>
                  </div>
                )}
                <div style={{ ...styles.totalRow, fontWeight: '700', fontSize: '16px', color: '#16a34a' }}>
                  <span>Grand Total:</span>
                  <span>{formatCurrency(selectedBill.grand_total)}</span>
                </div>
                <div style={styles.totalRow}>
                  <span>Cash:</span>
                  <span>{formatCurrency(selectedBill.cash_paid)}</span>
                </div>
                <div style={styles.totalRow}>
                  <span>Change:</span>
                  <span style={{ color: '#2563eb' }}>{formatCurrency(selectedBill.change_amount)}</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDeleteBill(selectedBill.id)}
                >
                  🗑️ Delete Bill
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleReprint(selectedBill)}
                >
                  🖨️ Reprint
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px'
  },
  billList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '400px',
    overflowY: 'auto'
  },
  billItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    background: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    transition: 'all 0.15s'
  },
  billItemActive: {
    border: '1px solid #16a34a',
    background: '#f0fdf4'
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px',
    color: '#9ca3af'
  },
  billInfo: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    background: '#f9fafb',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '13px'
  },
  totals: {
    background: '#f9fafb',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px'
  },
  // ── WHOLESALE ──
  wholesaleBadge: {
    fontSize: '10px',
    fontWeight: '800',
    letterSpacing: '0.5px',
    background: '#f59e0b',
    color: '#fff',
    padding: '2px 7px',
    borderRadius: '99px'
  },
  wholesaleBanner: {
    background: '#fffbeb',
    border: '2px solid #f59e0b',
    color: '#92400e',
    borderRadius: '8px',
    padding: '10px 12px',
    fontWeight: '700',
    fontSize: '13px',
    marginBottom: '12px',
    textAlign: 'center'
  }
}