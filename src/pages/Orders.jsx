// src/pages/Orders.jsx
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import DateTime from '../utils/dateTime'
import { printOrder } from '../utils/printOrder'

export default function Orders() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [paperSize, setPaperSize] = useState('80mm')

  const load = useCallback(async () => {
    setLoading(true)
    // remove completed orders older than 1 day, then fetch
    try { await window.api.purgeExpiredOrders() } catch (_) {}
    const r = await window.api.getOrders()
    if (r.success) setOrders(r.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const flash = (setter, text) => { setter(text); setTimeout(() => setter(''), 3500) }

  const handleComplete = async (order) => {
    if (!window.confirm(
      `Complete order ${order.order_number}?\n\nThis creates the bill and reduces stock. This cannot be undone.`
    )) return
    setBusyId(order.id)
    const r = await window.api.completeOrder(order.id)
    setBusyId(null)
    if (r.success) {
      flash(setMsg, `Order ${order.order_number} completed → bill ${r.billNumber} created`)
      load()
    } else {
      flash(setErr, r.message)
    }
  }

  const handleDelete = async (order) => {
    if (!window.confirm(`Remove order ${order.order_number}? This cannot be undone.`)) return
    setBusyId(order.id)
    const r = await window.api.deleteOrder(order.id)
    setBusyId(null)
    if (r.success) { flash(setMsg, `Order ${order.order_number} removed`); load() }
    else flash(setErr, r.message)
  }

  const handlePrint = (order) => {
    printOrder({ orderId: order.id, size: paperSize })
  }

  // Delivery urgency: today / tomorrow / past
  const urgency = (order) => {
    if (order.status === 'completed' || !order.delivery_at) return null
    const day = order.delivery_at.slice(0, 10)
    const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
    const tmr = new Date(Date.now() + 5.5 * 3600 * 1000 + 86400000).toISOString().slice(0, 10)
    if (day < today) return { label: 'OVERDUE', color: '#dc2626' }
    if (day === today) return { label: 'TODAY', color: '#dc2626' }
    if (day === tmr) return { label: 'TOMORROW', color: '#d97706' }
    return null
  }

  const pending = orders.filter(o => o.status === 'pending')
  const completed = orders.filter(o => o.status === 'completed')

  return (
    <div className="page-content">
      <div className="card card-body">
        <div style={styles.header}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>📋 Orders</h2>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0' }}>
              {pending.length} pending · completed orders auto-remove 1 day after completion
            </p>
          </div>
          <div style={styles.printBar}>
            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600 }}>🖨️ Size:</span>
            <div style={styles.sizeToggle}>
              <button style={{ ...styles.sizeBtn, ...(paperSize === '80mm' ? styles.sizeBtnOn : {}) }}
                onClick={() => setPaperSize('80mm')}>80mm</button>
              <button style={{ ...styles.sizeBtn, ...(paperSize === 'A4' ? styles.sizeBtnOn : {}) }}
                onClick={() => setPaperSize('A4')}>A4</button>
            </div>
          </div>
        </div>

        {msg && <div className="alert alert-success" style={{ marginTop: 12 }}>{msg}</div>}
        {err && <div className="alert alert-error" style={{ marginTop: 12, whiteSpace: 'pre-line' }}>{err}</div>}

        {loading ? (
          <div className="spinner" style={{ margin: '40px auto' }} />
        ) : orders.length === 0 ? (
          <div style={styles.empty}>
            <span style={{ fontSize: 40 }}>📋</span>
            <p style={{ color: '#9ca3af', marginTop: 12 }}>No orders yet</p>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            {pending.length > 0 && (
              <>
                <h3 style={styles.sectionTitle}>Pending ({pending.length})</h3>
                <div style={styles.grid}>
                  {pending.map(o => (
                    <OrderCard key={o.id} order={o} urgency={urgency(o)} busy={busyId === o.id}
                      onComplete={handleComplete} onDelete={handleDelete} onPrint={handlePrint} />
                  ))}
                </div>
              </>
            )}

            {completed.length > 0 && (
              <>
                <h3 style={{ ...styles.sectionTitle, marginTop: 24, color: '#9ca3af' }}>
                  Completed ({completed.length})
                </h3>
                <div style={styles.grid}>
                  {completed.map(o => (
                    <OrderCard key={o.id} order={o} urgency={null} busy={busyId === o.id}
                      onComplete={handleComplete} onDelete={handleDelete} onPrint={handlePrint} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function OrderCard({ order, urgency, busy, onComplete, onDelete, onPrint }) {
  const done = order.status === 'completed'
  return (
    <div style={{ ...styles.orderCard, ...(done ? styles.orderCardDone : {}) }}>
      <div style={styles.cardTop}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{order.order_number}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{order.customer_name || '—'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#7c3aed' }}>
            Rs. {order.grand_total.toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{order.item_count} items</div>
        </div>
      </div>

      {urgency && (
        <div style={{ ...styles.urgencyTag, background: urgency.color }}>
          🚚 DELIVERY {urgency.label}
        </div>
      )}

      <div style={styles.cardMeta}>
        {order.customer_tel && <div>📞 {order.customer_tel}</div>}
        {order.delivery_at && <div>🚚 {DateTime.formatDateTime(order.delivery_at)}</div>}
        {order.message && <div style={{ fontStyle: 'italic', color: '#6b7280' }}>💬 {order.message}</div>}
        {order.is_wholesale === 1 && <div style={{ color: '#b45309', fontWeight: 700 }}>🏷️ Wholesale</div>}
        {order.advance_paid > 0 && (
          <div style={{ color: '#16a34a', fontWeight: 700 }}>
            💰 Advance Rs. {order.advance_paid.toFixed(2)} · Balance Rs. {(order.grand_total - order.advance_paid).toFixed(2)}
          </div>
        )}
        {done && <div style={{ color: '#16a34a', fontWeight: 700 }}>✓ Completed {DateTime.formatDateTime(order.completed_at)}</div>}
      </div>

      <div style={styles.cardActions}>
        <button style={styles.btnPrint} disabled={busy} onClick={() => onPrint(order)}>🖨️ Print</button>
        {!done && (
          <button style={styles.btnComplete} disabled={busy} onClick={() => onComplete(order)}>
            {busy ? '...' : '✓ Complete'}
          </button>
        )}
        <button style={styles.btnDelete} disabled={busy} onClick={() => onDelete(order)}>🗑 Remove</button>
      </div>
    </div>
  )
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  printBar: { display: 'flex', alignItems: 'center', gap: 8 },
  sizeToggle: { display: 'flex', border: '1px solid #d1d5db', borderRadius: 6, overflow: 'hidden' },
  sizeBtn: { padding: '4px 14px', fontSize: 12, fontWeight: 700, border: 'none', background: '#fff', color: '#6b7280', cursor: 'pointer' },
  sizeBtnOn: { background: '#7c3aed', color: '#fff' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60 },
  sectionTitle: { fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280', margin: '0 0 10px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 },
  orderCard: { border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, background: '#fff', display: 'flex', flexDirection: 'column', gap: 10 },
  orderCardDone: { background: '#f9fafb', opacity: 0.85 },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  urgencyTag: { color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '0.5px', padding: '4px 8px', borderRadius: 6, textAlign: 'center' },
  cardMeta: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12.5, color: '#374151' },
  cardActions: { display: 'flex', gap: 6, marginTop: 4 },
  btnPrint: { flex: 1, fontSize: 12, fontWeight: 700, padding: '7px 0', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer' },
  btnComplete: { flex: 1, fontSize: 12, fontWeight: 700, padding: '7px 0', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer' },
  btnDelete: { flex: 1, fontSize: 12, fontWeight: 700, padding: '7px 0', borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }
}