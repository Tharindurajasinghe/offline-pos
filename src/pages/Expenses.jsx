// src/pages/Expenses.jsx
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import DateTime from '../utils/dateTime'

export default function Expenses() {
  const { user } = useAuth()
  const today = DateTime.getSriLankaDate()

  const [selectedDate, setSelectedDate] = useState(today)
  const [expenses, setExpenses] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [removeId, setRemoveId] = useState(null)   // id pending confirmation
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async (date) => {
    setLoading(true)
    const r = await window.api.getExpensesByDate(date)
    if (r.success) { setExpenses(r.data); setTotal(r.total) }
    setLoading(false)
  }, [])

  useEffect(() => { load(selectedDate) }, [selectedDate, load])

  const flash = (setter, text) => { setter(text); setTimeout(() => setter(''), 3000) }

  const handleRemove = async (id) => {
    const r = await window.api.removeExpense(id)
    setRemoveId(null)
    if (r.success) { flash(setMsg, 'Expense removed'); load(selectedDate) }
    else flash(setErr, r.message)
  }

  const isToday = selectedDate === today

  return (
    <div className="page-content">
      <div className="card card-body">
        <div style={styles.header}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>💵 Expenses</h2>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0' }}>
              {isToday ? "Today's expenses" : `Expenses for ${DateTime.formatDate(selectedDate)}`}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            + Add Expense
          </button>
        </div>

        {/* Filter by date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px' }}>
          <label className="form-label" style={{ margin: 0 }}>Filter by Date:</label>
          <input
            type="date"
            className="input"
            style={{ maxWidth: '180px' }}
            value={selectedDate}
            max={today}
            onChange={e => setSelectedDate(e.target.value)}
          />
          {!isToday && (
            <button className="btn btn-outline btn-sm" onClick={() => setSelectedDate(today)}>
              Today
            </button>
          )}
        </div>

        {/* Total for the selected day */}
        <div style={styles.totalBox}>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            Total Expenses {isToday ? '(Today)' : `(${DateTime.formatDate(selectedDate)})`}
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#dc2626' }}>
            Rs. {total.toFixed(2)}
          </div>
        </div>

        {msg && <div className="alert alert-success" style={{ marginTop: 12 }}>{msg}</div>}
        {err && <div className="alert alert-error" style={{ marginTop: 12 }}>{err}</div>}

        {/* List */}
        <div style={{ marginTop: 16 }}>
          {loading ? (
            <div className="spinner" style={{ margin: '40px auto' }} />
          ) : expenses.length === 0 ? (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: '30px' }}>
              No expenses recorded for this day.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Amount</th>
                    <th>Note</th>
                    <th>Added By</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(e => (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{DateTime.formatTime(e.created_at)}</td>
                      <td style={{ fontWeight: 700, color: '#dc2626' }}>Rs. {e.amount.toFixed(2)}</td>
                      <td>{e.message}</td>
                      <td style={{ fontSize: '12px', color: '#6b7280' }}>{e.added_by || '—'}</td>
                      <td>
                        <button className="link-btn link-btn-red" onClick={() => setRemoveId(e.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Expense modal */}
      {showAdd && (
        <AddExpenseModal
          addedBy={user?.username}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            setSelectedDate(today)   // jump back to today so the new entry is visible
            load(today)
            flash(setMsg, 'Expense added')
          }}
        />
      )}

      {/* Remove confirmation */}
      {removeId !== null && (
        <div className="modal-overlay" onClick={() => setRemoveId(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Remove Expense</h2>
              <button className="modal-close" onClick={() => setRemoveId(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to remove this expense? This cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setRemoveId(null)}>Cancel</button>
              <button className="btn" style={{ background: '#dc2626', color: '#fff' }}
                onClick={() => handleRemove(removeId)}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AddExpenseModal({ addedBy, onClose, onAdded }) {
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError('')
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return }
    if (!message.trim()) { setError('Enter a short note'); return }

    setSaving(true)
    const r = await window.api.addExpense({ amount: amt, message: message.trim(), addedBy })
    setSaving(false)
    if (r.success) onAdded()
    else setError(r.message)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>💵 Add Expense</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Amount (Rs.) *</label>
            <input
              className="input" type="number" step="0.01" min="0" autoFocus
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Short Note *</label>
            <input
              className="input"
              placeholder="e.g. Transport, Tea for staff"
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Adding...' : '+ Add Expense'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 },
  totalBox: {
    marginTop: 16, padding: '14px 16px', background: '#fef2f2',
    border: '1px solid #fecaca', borderRadius: 10
  }
}