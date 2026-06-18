import { useState, useEffect, useRef } from 'react'

export default function CustomerBillModal({ cart, grandTotal, totalDiscount, billedBy, userId, onClose, onSuccess }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [creditInfo, setCreditInfo] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const searchRef = useRef(null)

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 100)
  }, [])

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      const result = await window.api.searchCustomers(search.trim())
      if (result.success) setResults(result.data)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const handleSelect = async (customer) => {
    setSelected(customer)
    setResults([])
    setSearch(customer.name)
    setError('')

    // Get default credit limit from settings
    const settingsRes = await window.api.getSettings()
    const defaultLimit = settingsRes.success
      ? parseFloat(settingsRes.data.default_credit_limit || '5000')
      : 5000

    const limit = customer.credit_limit !== null ? customer.credit_limit : defaultLimit
    const available = limit - customer.total_pending
    const canAdd = customer.total_pending + grandTotal <= limit

    setCreditInfo({
      limit,
      pending: customer.total_pending,
      available,
      canAdd,
      afterBill: customer.total_pending + grandTotal
    })
  }

  const handleAddBill = async () => {
    if (!selected) { setError('Please select a customer'); return }
    if (!creditInfo?.canAdd) { setError('Credit limit exceeded for this customer'); return }
    setSaving(true)
    setError('')
    const result = await window.api.saveCustomerBill({
      customerId: selected.id,
      items: cart,
      billedBy,
      userId
    })
    setSaving(false)
    if (result.success) {
      onSuccess(result)
    } else {
      setError(result.message)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h2>👥 Add to Customer Bill</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* Cart total summary */}
          <div style={styles.totalBox}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>Bill Amount</span>
            <span style={{ fontSize: '20px', fontWeight: '700', color: '#16a34a' }}>
              Rs. {grandTotal.toFixed(2)}
            </span>
          </div>

          {/* Search */}
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Search Customer</label>
            <input
              ref={searchRef}
              className="input"
              placeholder="Search by name, phone or ID..."
              value={search}
              onChange={e => { setSearch(e.target.value); setSelected(null); setCreditInfo(null) }}
            />
            {results.length > 0 && (
              <div style={styles.dropdown}>
                {results.map(c => (
                  <button
                    key={c.id}
                    style={styles.dropItem}
                    onClick={() => handleSelect(c)}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px' }}>{c.name}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>
                        {c.customer_code} · {c.phone}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {c.total_pending > 0 ? (
                        <span className="badge badge-red" style={{ fontSize: '10px' }}>
                          Due: Rs.{c.total_pending.toFixed(2)}
                        </span>
                      ) : (
                        <span className="badge badge-green" style={{ fontSize: '10px' }}>Clear</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected customer credit info */}
          {selected && creditInfo && (
            <div style={{
              ...styles.creditBox,
              borderColor: creditInfo.canAdd ? '#86efac' : '#fca5a5',
              background: creditInfo.canAdd ? '#f0fdf4' : '#fef2f2'
            }}>
              <div style={styles.creditRow}>
                <span style={styles.creditLabel}>Customer</span>
                <span style={{ fontWeight: '600' }}>{selected.name}</span>
              </div>
              <div style={styles.creditRow}>
                <span style={styles.creditLabel}>Current Pending</span>
                <span style={{ color: creditInfo.pending > 0 ? '#dc2626' : '#16a34a', fontWeight: '600' }}>
                  Rs. {creditInfo.pending.toFixed(2)}
                </span>
              </div>
              <div style={styles.creditRow}>
                <span style={styles.creditLabel}>Credit Limit</span>
                <span>Rs. {creditInfo.limit.toFixed(2)}</span>
              </div>
              <div style={styles.creditRow}>
                <span style={styles.creditLabel}>This Bill</span>
                <span style={{ fontWeight: '600' }}>Rs. {grandTotal.toFixed(2)}</span>
              </div>
              <div style={{ borderTop: '1px dashed #d1d5db', marginTop: '6px', paddingTop: '6px', ...styles.creditRow }}>
                <span style={styles.creditLabel}>Balance After Bill</span>
                <span style={{ fontWeight: '700', color: creditInfo.canAdd ? '#16a34a' : '#dc2626', fontSize: '15px' }}>
                  Rs. {creditInfo.afterBill.toFixed(2)}
                </span>
              </div>
              {!creditInfo.canAdd && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#dc2626', fontWeight: '500' }}>
                  ⚠️ Exceeds credit limit by Rs. {(creditInfo.afterBill - creditInfo.limit).toFixed(2)}
                </div>
              )}
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleAddBill}
            disabled={saving || !selected || !creditInfo?.canAdd}
          >
            {saving ? 'Saving...' : '✅ Add to Customer Bill'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  totalBox: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#f0fdf4', border: '1px solid #86efac',
    borderRadius: '8px', padding: '12px 16px', marginBottom: '16px'
  },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 500,
    maxHeight: '200px', overflowY: 'auto'
  },
  dropItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', padding: '10px 14px', background: 'none', border: 'none',
    borderBottom: '1px solid #f3f4f6', cursor: 'pointer', textAlign: 'left'
  },
  creditBox: {
    border: '1px solid', borderRadius: '8px', padding: '12px',
    marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px'
  },
  creditRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' },
  creditLabel: { color: '#6b7280' }
}