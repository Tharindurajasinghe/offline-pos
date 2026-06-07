import { useState } from 'react'
import { useApp } from '../context/AppContext'

export default function LowStockAlert() {
  const { lowStockItems } = useApp()
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  if (lowStockItems.length === 0) return null

  const categories = [...new Set(lowStockItems.map(i => i.category_name))]

  const getStatus = (item) => {
    if (item.stock <= 0) return 'OUT'
    if (item.stock <= item.low_stock_threshold * 0.4) return 'CRITICAL'
    return 'LOW'
  }

  const filtered = lowStockItems.filter(item => {
    if (categoryFilter !== 'all' && item.category_name !== categoryFilter) return false
    const s = getStatus(item)
    if (statusFilter === 'out' && s !== 'OUT') return false
    if (statusFilter === 'critical' && s !== 'CRITICAL') return false
    if (statusFilter === 'low' && s !== 'LOW') return false
    return true
  })

  const statusBadge = (item) => {
    const s = getStatus(item)
    const map = {
      OUT:      { label: 'OUT OF STOCK', cls: 'stock-out' },
      CRITICAL: { label: 'CRITICAL',     cls: 'stock-critical' },
      LOW:      { label: 'LOW',          cls: 'stock-low' }
    }
    return <span className={`badge ${map[s].cls}`}>{map[s].label}</span>
  }

  return (
    <div className="card" style={{ padding: '16px' }}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <h3 style={styles.title}>Low Stock Alert</h3>
        </div>
        <span className="badge badge-orange">{lowStockItems.length} items</span>
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        <div>
          <label style={styles.filterLabel}>Filter by Category</label>
          <select
            className="input"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ fontSize: '12px' }}
          >
            <option value="all">All Categories ({lowStockItems.length})</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: '8px' }}>
          <label style={styles.filterLabel}>Filter by Status:</label>
          <div style={styles.statusBtns}>
            {[
              { val: 'all', label: 'All' },
              { val: 'out', label: 'Out of Stock' },
              { val: 'critical', label: 'Critical' },
              { val: 'low', label: 'Low' }
            ].map(s => (
              <button
                key={s.val}
                style={{
                  ...styles.statusBtn,
                  ...(statusFilter === s.val ? styles.statusBtnActive : {})
                }}
                onClick={() => setStatusFilter(s.val)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        <table className="table">
          <thead>
            <tr>
              <th>Item ID</th>
              <th>Category</th>
              <th>Item Name</th>
              <th style={{ textAlign: 'center' }}>Available Qty</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => (
              <tr key={i}>
                <td style={{ fontWeight: '700' }}>{item.product_code}</td>
                <td><span className="badge badge-blue">{item.category_name}</span></td>
                <td>{item.product_name} · {item.variant_name}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`badge ${getStatus(item) === 'OUT' ? 'stock-out' : getStatus(item) === 'CRITICAL' ? 'stock-critical' : 'stock-low'}`}>
                    {item.stock}
                  </span>
                </td>
                <td>{statusBadge(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const styles = {
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  titleRow:  { display: 'flex', alignItems: 'center', gap: '8px' },
  title:     { fontSize: '16px', fontWeight: '700', color: '#d97706' },
  filters:   { marginBottom: '12px' },
  filterLabel:{ fontSize: '12px', fontWeight: '500', marginBottom: '4px', display: 'block' },
  statusBtns: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' },
  statusBtn: {
    padding: '4px 12px', borderRadius: '99px',
    border: '1px solid #d1d5db', background: 'none',
    cursor: 'pointer', fontSize: '12px', color: '#374151'
  },
  statusBtnActive: { background: '#111827', color: '#fff', border: '1px solid #111827' },
  tableWrap: { maxHeight: '200px', overflowY: 'auto' }
}