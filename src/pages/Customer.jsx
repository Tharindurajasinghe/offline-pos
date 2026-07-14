import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import DateTime from '../utils/dateTime'
import { printCustomerBill } from '../utils/printCustomerBill'   // ── PRINT BILL ──

export default function Customer() {
  const { formatCurrency } = useApp()
  const { user } = useAuth()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editCustomer, setEditCustomer] = useState(null)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showPaymentModal, setShowPaymentModal] = useState(null)
  // ── REFRESH FIX ──
  // Bumping this forces CustomerDetail to refetch its bills + payments.
  // Replacing `selectedCustomer` alone is NOT enough: the object changes but
  // its `id` doesn't, and the detail panel's effect only watches `customer.id`.
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => { loadCustomers() }, [])

  useEffect(() => {
    const t = setTimeout(loadCustomers, 300)
    return () => clearTimeout(t)
  }, [search])

  const loadCustomers = async () => {
    setLoading(true)
    const result = search.trim()
      ? await window.api.searchCustomers(search.trim())
      : await window.api.getAllCustomers()
    if (result.success) setCustomers(result.data)
    setLoading(false)
  }

  const handleRemove = async (customer) => {
    if (!window.confirm(`Remove customer "${customer.name}"?`)) return
    const result = await window.api.removeCustomer(customer.id)
    if (result.success) {
      loadCustomers()
      if (selectedCustomer?.id === customer.id) setSelectedCustomer(null)
    } else {
      alert(result.message)
    }
  }

  return (
    <div className="page-content">
      <div style={styles.grid}>

        {/* Left — customer list */}
        <div className="card card-body">
          <div className="flex-between" style={{ marginBottom: '16px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: '700' }}>👥 Customers</h1>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
              + Add Customer
            </button>
          </div>

          <input
            className="input"
            placeholder="Search by name, phone or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginBottom: '12px' }}
          />

          {loading ? <div className="spinner" /> : (
            <div style={styles.customerList}>
              {customers.length === 0 ? (
                <p style={{ color: '#9ca3af', textAlign: 'center', padding: '30px' }}>
                  No customers found
                </p>
              ) : customers.map(c => (
                <button
                  key={c.id}
                  style={{
                    ...styles.customerItem,
                    ...(selectedCustomer?.id === c.id ? styles.customerItemActive : {})
                  }}
                  onClick={() => setSelectedCustomer(c)}
                >
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{c.name}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                      {c.customer_code} · {c.phone}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {c.total_pending > 0 ? (
                      <span className="badge badge-red">
                        Due: {formatCurrency(c.total_pending)}
                      </span>
                    ) : (
                      <span className="badge badge-green">No Due</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right — customer details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {selectedCustomer ? (
            <CustomerDetail
              customer={selectedCustomer}
              refreshKey={refreshKey}
              formatCurrency={formatCurrency}
              user={user}
              onEdit={() => setEditCustomer(selectedCustomer)}
              onRemove={() => handleRemove(selectedCustomer)}
              onPayment={() => setShowPaymentModal(selectedCustomer)}
              onRefresh={async () => {
                await loadCustomers()
                const r = await window.api.getCustomerById(selectedCustomer.id)
                if (r.success) setSelectedCustomer(r.data)
                setRefreshKey(k => k + 1)   // ── REFRESH FIX ──
              }}
            />
          ) : (
            <div className="card" style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>👥</div>
              <p>Select a customer to view details</p>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <CustomerFormModal
          onClose={() => setShowAddModal(false)}
          onSave={async (data) => {
            const result = await window.api.addCustomer(data)
            if (result.success) { loadCustomers(); setShowAddModal(false) }
            return result
          }}
        />
      )}

      {editCustomer && (
        <CustomerFormModal
          customer={editCustomer}
          onClose={() => setEditCustomer(null)}
          onSave={async (data) => {
            const result = await window.api.updateCustomer({ id: editCustomer.id, ...data })
            if (result.success) {
              loadCustomers()
              const r = await window.api.getCustomerById(editCustomer.id)
              if (r.success) setSelectedCustomer(r.data)
              setEditCustomer(null)
            }
            return result
          }}
        />
      )}

      {showPaymentModal && (
        <PaymentModal
          customer={showPaymentModal}
          formatCurrency={formatCurrency}
          user={user}
          onClose={() => setShowPaymentModal(null)}
          onSave={async (data) => {
            const result = await window.api.addCustomerPayment(data)
            if (result.success) {
              await loadCustomers()
              const r = await window.api.getCustomerById(showPaymentModal.id)
              if (r.success) setSelectedCustomer(r.data)
              setRefreshKey(k => k + 1)   // ── REFRESH FIX ── reload bills + payments
              setShowPaymentModal(null)
            }
            return result
          }}
        />
      )}
    </div>
  )
}

// ─── Customer Detail Panel ────────────────────────────────────────────────────
function CustomerDetail({ customer, refreshKey, formatCurrency, user, onEdit, onRemove, onPayment, onRefresh }) {
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [tab, setTab] = useState('bills')
  const [loading, setLoading] = useState(true)
  const [paperSize, setPaperSize] = useState('80mm')   // ── PRINT BILL ── '80mm' | 'A4'

  useEffect(() => {
    loadData()
    // ── REFRESH FIX ── refetch when a payment is recorded, not just when a
    // different customer is selected
  }, [customer.id, refreshKey])

  const loadData = async () => {
   setLoading(true)
   const [billsRes, paymentsRes] = await Promise.all([
      window.api.getCustomerBills(customer.id),
      window.api.getCustomerPayments(customer.id)
    ])
    if (billsRes.success) setBills(billsRes.data)
    if (paymentsRes.success) {
      setPayments(paymentsRes.data)
    }
    setLoading(false)
  }

  // ── PRINT BILL ──
  // Prints the bill with shop info, customer info, balance due and the last
  // payment record. Same content in both 80mm and A4.
  const handlePrintBill = (billId) => {
    printCustomerBill({
      billId,
      customer,
      lastPayment: payments.length > 0 ? payments[0] : null,  // getPayments() sorts paid_at DESC
      size: paperSize
    })
  }

  const viewBillDetails = async (billId) => {
  const result = await window.api.getBillDetails(billId)
  if (!result.success) { alert(result.message); return }

  const bill = result.data
  const rows = bill.items.map(item => `
    <tr>
      <td>${item.product_name} — ${item.variant_name}</td>
      <td style="text-align:center">${item.qty} ${item.unit}</td>
      <td style="text-align:right">Rs.${parseFloat(item.sold_price).toFixed(2)}</td>
      <td style="text-align:right">Rs.${parseFloat(item.line_total).toFixed(2)}</td>
    </tr>
  `).join('')

  const html = `
    <!DOCTYPE html><html><head>
    <title>Bill ${bill.bill_number}</title>
    <style>
      body { font-family: sans-serif; padding: 20px; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
      th { background: #f3f4f6; }
      h2 { margin-bottom: 4px; }
      .totals p { margin: 4px 0; }
    </style></head><body>
    <h2>Bill ${bill.bill_number}</h2>
    <p>Customer: ${bill.customer_name}</p>
    <p>Date: ${bill.bill_date}</p>
    <p>Status: ${bill.bill_status === 'paid' ? 'Paid' : 'Pending'}</p>
    <table>
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals" style="margin-top:12px">
      <p><strong>Subtotal:</strong> Rs.${parseFloat(bill.subtotal).toFixed(2)}</p>
      <p><strong>Discount:</strong> Rs.${parseFloat(bill.total_discount).toFixed(2)}</p>
      <p><strong>Total:</strong> Rs.${parseFloat(bill.grand_total).toFixed(2)}</p>
    </div>
    </body></html>
  `
  const win = window.open('', '_blank', 'width=600,height=700')
  win.document.write(html)
  win.document.close()
}

  return (
    <div className="card card-body">
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '700' }}>{customer.name}</h2>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
            {customer.customer_code} · {customer.phone}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-outline btn-sm" onClick={onEdit}>✏️ Edit</button>
          <button className="btn btn-danger btn-sm" onClick={onRemove}>Remove</button>
        </div>
      </div>

      {/* Info */}
      <div style={styles.infoGrid}>
        <div style={styles.infoBox}>
          <div style={styles.infoLabel}>Pending Balance</div>
          <div style={{ ...styles.infoValue, color: customer.total_pending > 0 ? '#dc2626' : '#16a34a' }}>
            {formatCurrency(customer.total_pending)}
          </div>
        </div>
        <div style={styles.infoBox}>
          <div style={styles.infoLabel}>Status</div>
          <div style={styles.infoValue}>
            {customer.total_pending > 0
              ? <span className="badge badge-red">Has Due</span>
              : <span className="badge badge-green">Clear</span>
            }
          </div>
        </div>
        <div style={styles.infoBox}>
          <div style={styles.infoLabel}>Credit Limit</div>
          <div style={styles.infoValue}>
            {customer.credit_limit !== null
              ? formatCurrency(customer.credit_limit)
              : 'Default'}
          </div>
        </div>
        <div style={styles.infoBox}>
          <div style={styles.infoLabel}>Total Bills</div>
          <div style={styles.infoValue}>{bills.length}</div>
        </div>
      </div>

      {/* Address */}
      {(customer.address1 || customer.address2) && (
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
          📍 {customer.address1} {customer.address2 && `· ${customer.address2}`}
        </div>
      )}

      {/* Record Payment button */}
      {customer.total_pending > 0 && (
        <button className="btn btn-primary btn-sm" style={{ marginBottom: '16px' }} onClick={onPayment}>
          💰 Record Payment
        </button>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button
          style={{ ...styles.tab, ...(tab === 'bills' ? styles.tabActive : {}) }}
          onClick={() => setTab('bills')}
        >Bill History</button>
        <button
          style={{ ...styles.tab, ...(tab === 'payments' ? styles.tabActive : {}) }}
          onClick={() => setTab('payments')}
        >Payment History</button>
      </div>

      {loading ? <div className="spinner" /> : (
        <>
          {/* Bills tab */}
          {tab === 'bills' && (
            bills.length === 0 ? (
              <p style={{ color: '#9ca3af', textAlign: 'center', padding: '20px' }}>No bills yet</p>
            ) : (
              <>
              {/* ── PRINT BILL ── paper size selector */}
              <div style={styles.printBar}>
                <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600' }}>
                  🖨️ Print size:
                </span>
                <div style={styles.sizeToggle}>
                  <button
                    style={{ ...styles.sizeBtn, ...(paperSize === '80mm' ? styles.sizeBtnOn : {}) }}
                    onClick={() => setPaperSize('80mm')}
                  >80mm</button>
                  <button
                    style={{ ...styles.sizeBtn, ...(paperSize === 'A4' ? styles.sizeBtnOn : {}) }}
                    onClick={() => setPaperSize('A4')}
                  >A4</button>
                </div>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Bill No</th>
                      <th>Date</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map((b, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: '700', fontSize: '12px' }}>{b.bill_number}</td>
                        <td style={{ fontSize: '12px' }}>{b.bill_date ? DateTime.formatDateTime(b.bill_date) : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: '600', color: '#16a34a' }}>
                          {formatCurrency(b.grand_total)}
                        </td>
                        <td>
                          <span className={`badge ${b.bill_status === 'paid' ? 'badge-green' : 'badge-red'}`}>
                            {b.bill_status === 'paid' ? 'Paid' : 'Pending'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              className="link-btn link-btn-blue"
                              onClick={() => viewBillDetails(b.id)}
                            >View Bill</button>

                            {/* ── PRINT BILL ── */}
                            <button
                              style={styles.printBtn}
                              title={`Print this bill (${paperSize})`}
                              onClick={() => handlePrintBill(b.id)}
                            >🖨️ Print</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )
          )}

          {/* Payments tab */}
          {tab === 'payments' && (
            payments.length === 0 ? (
              <p style={{ color: '#9ca3af', textAlign: 'center', padding: '20px' }}>No payments recorded</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Note</th>
                      <th>Recorded By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: '12px' }}>{DateTime.formatDate(p.paid_at)}</td>
                        <td style={{ textAlign: 'right', fontWeight: '600', color: '#2563eb' }}>
                          {formatCurrency(p.amount)}
                        </td>
                        <td style={{ fontSize: '12px', color: '#6b7280' }}>{p.note || '—'}</td>
                        <td style={{ fontSize: '12px' }}>{p.recorded_by || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}

// ─── Customer Form Modal ──────────────────────────────────────────────────────
function CustomerFormModal({ customer, onClose, onSave }) {
  const isEdit = !!customer
  const [name, setName] = useState(customer?.name || '')
  const [phone, setPhone] = useState(customer?.phone || '')
  const [address1, setAddress1] = useState(customer?.address1 || '')
  const [address2, setAddress2] = useState(customer?.address2 || '')
  const [creditLimit, setCreditLimit] = useState(customer?.credit_limit || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError('')
    if (!name.trim()) { setError('Name is required'); return }
    if (!phone.trim()) { setError('Phone number is required'); return }
    setSaving(true)
    const result = await onSave({
      name: name.trim(),
      phone: phone.trim(),
      address1: address1.trim(),
      address2: address2.trim(),
      credit_limit: creditLimit ? parseFloat(creditLimit) : null
    })
    setSaving(false)
    if (!result.success) setError(result.message)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? '✏️ Edit Customer' : '+ Add Customer'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Full Name <span className="required">*</span></label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Phone Number <span className="required">*</span></label>
            <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 0771234567" />
          </div>
          <div className="form-group">
            <label className="form-label">Address Line 1</label>
            <input className="input" value={address1} onChange={e => setAddress1(e.target.value)} placeholder="Street / Area" />
          </div>
          <div className="form-group">
            <label className="form-label">Address Line 2</label>
            <input className="input" value={address2} onChange={e => setAddress2(e.target.value)} placeholder="City / District" />
          </div>
          <div className="form-group">
            <label className="form-label">Credit Limit (Rs.)</label>
            <input
              className="input"
              type="number"
              value={creditLimit}
              onChange={e => setCreditLimit(e.target.value)}
              placeholder="Leave blank to use default"
            />
            <p className="form-hint">Leave blank to use the system default credit limit</p>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Add Customer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Payment Modal ────────────────────────────────────────────────────────────
// ── PAYMENT DATE/TIME ──
// Current Sri Lanka date AND time, formatted for a <input type="datetime-local">
// i.e. "YYYY-MM-DDTHH:MM".
// NOTE: plain toISOString() is UTC — between midnight and 5:30am SL time that
// returns YESTERDAY's date. The +5:30 offset (used everywhere else in this app)
// is required for the default to be correct around the clock.
const slNowForInput = () => {
  const sl = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return sl.toISOString().slice(0, 16)   // "2026-07-14T20:35"
}

function PaymentModal({ customer, formatCurrency, user, onClose, onSave }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  // ── PAYMENT DATE/TIME ── defaults to right now (date + time)
  const [paidAt, setPaidAt] = useState(slNowForInput())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handlePayFull = () => setAmount(customer.total_pending.toFixed(2))

  const handleSave = async () => {
    setError('')
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return }
    if (amt > customer.total_pending) { setError(`Amount exceeds pending balance of ${formatCurrency(customer.total_pending)}`); return }
    setSaving(true)
    const result = await onSave({
      customerId: customer.id,
      amount: amt,
      note: note.trim(),
      recordedBy: user?.username || '',
      // ── PAYMENT DATE/TIME ──
      // datetime-local gives "2026-07-14T20:35"; the DB wants
      // "2026-07-14 20:35:00"
      paidAt: paidAt ? paidAt.replace('T', ' ') + ':00' : ''
    })
    setSaving(false)
    if (!result.success) setError(result.message)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>💰 Record Payment — {customer.name}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Pending Balance</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#dc2626' }}>
              {formatCurrency(customer.total_pending)}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Payment Amount (Rs.)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="input"
                type="number"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Enter amount"
                autoFocus
              />
              <button className="btn btn-outline btn-sm" onClick={handlePayFull} style={{ whiteSpace: 'nowrap' }}>
                Pay Full
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Note (optional)</label>
            <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Cash payment" />
          </div>
          {/* ── PAYMENT DATE/TIME ── defaults to the current date and time */}
          <div className="form-group">
            <label className="form-label">Payment Date &amp; Time</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="input"
                type="datetime-local"
                value={paidAt}
                onChange={e => setPaidAt(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-outline"
                type="button"
                title="Reset to the current date and time"
                onClick={() => setPaidAt(slNowForInput())}
              >Now</button>
            </div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
              Defaults to now — change it only for a back-dated payment.
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  // ── PRINT BILL ──
  printBar: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '8px 10px', marginBottom: '10px',
    background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px'
  },
  sizeToggle: {
    display: 'flex', border: '1px solid #d1d5db',
    borderRadius: '6px', overflow: 'hidden'
  },
  sizeBtn: {
    padding: '4px 14px', fontSize: '12px', fontWeight: '700',
    border: 'none', background: '#fff', color: '#6b7280', cursor: 'pointer'
  },
  sizeBtnOn: { background: '#2563eb', color: '#fff' },
  printBtn: {
    fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap',
    padding: '4px 9px', borderRadius: '6px',
    border: '1px solid #16a34a', background: '#f0fdf4',
    color: '#15803d', cursor: 'pointer'
  },

  grid: { display: 'grid', gridTemplateColumns: '380px 1fr', gap: '16px', alignItems: 'start' },
  customerList: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '600px', overflowY: 'auto' },
  customerItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px',
    background: '#fff', cursor: 'pointer', width: '100%'
  },
  customerItemActive: { border: '1px solid #16a34a', background: '#f0fdf4' },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' },
  infoBox: { background: '#f9fafb', borderRadius: '8px', padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' },
  infoLabel: { fontSize: '11px', color: '#6b7280', marginBottom: '4px' },
  infoValue: { fontSize: '16px', fontWeight: '700' },
  tab: {
    padding: '6px 14px', borderRadius: '6px', border: '1px solid #e5e7eb',
    background: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '500'
  },
  tabActive: { background: '#16a34a', color: '#fff', border: '1px solid #16a34a' }
}