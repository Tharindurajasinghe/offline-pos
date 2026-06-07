import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import DateTime from '../utils/dateTime'

export default function TodaySalesModal({ onClose }) {
  const { formatCurrency } = useApp()
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSales()
  }, [])

  const loadSales = async () => {
    setLoading(true)
    const result = await window.api.getTodaySales()
    if (result.success) setSales(result.data)
    setLoading(false)
  }

  const grandTotal = sales.reduce((s, i) => s + i.line_total, 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📊 Today's Sales — Up to Now</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '0' }}>
          {loading ? (
            <div className="spinner" />
          ) : sales.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
              No sales recorded today yet.
            </div>
          ) : (
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Bill No.</th>
                    <th>Product ID</th>
                    <th>Variant</th>
                    <th style={{ textAlign: 'center' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Price/Item</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((item, i) => (
                    <tr key={i} style={{ background: item.is_price_edited ? '#fffbeb' : 'transparent' }}>
                      <td style={{ fontSize: '12px', color: '#6b7280' }}>{item.bill_number}</td>
                      <td style={{ fontWeight: '700' }}>{item.product_code}</td>
                      <td>
                        <div style={{ fontWeight: '500' }}>{item.product_name}</div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>{item.variant_name}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>{item.qty} {item.unit}</td>
                      <td style={{ textAlign: 'right', color: item.is_price_edited ? '#d97706' : '#111827' }}>
                        {formatCurrency(item.sold_price)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '600', color: '#16a34a' }}>
                        {formatCurrency(item.line_total)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {item.is_price_edited
                          ? <span className="badge badge-orange">✏️ Edited</span>
                          : <span style={{ color: '#9ca3af', fontSize: '11px' }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div style={{ fontWeight: '700', fontSize: '16px' }}>
            Grand Total: <span style={{ color: '#16a34a' }}>{formatCurrency(grandTotal)}</span>
          </div>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}