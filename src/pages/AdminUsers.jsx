import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import Validator from '../utils/validator'
import DateTime from '../utils/dateTime'

const PAGES = [
  { key: 'summary',   label: 'Summary' },
  { key: 'checkbill', label: 'Check Bill' },
  { key: 'restore',   label: 'Backup & Restore' },
  { key: 'barcode',   label: 'Barcode Print' },
  { key: 'stock',     label: 'Stock Adjust' },
  { key: 'store',     label: 'Store' },
  { key: 'customer', label: 'Customers' },
  { key: 'invoice', label: 'Invoice' },
]

export default function AdminUsers() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [resetUser, setResetUser] = useState(null)
  const [activityLog, setActivityLog] = useState([])
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    if (!isAdmin()) { navigate('/'); return }
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    const result = await window.api.getUsers()
    if (result.success) setUsers(result.data)
    setLoading(false)
  }

  const loadActivityLog = async () => {
    const result = await window.api.getActivityLog()
    if (result.success) setActivityLog(result.data)
    setShowLog(true)
  }

  const handleRemove = async (id, username) => {
    if (!window.confirm(`Deactivate user "${username}"?`)) return
    const result = await window.api.removeUser(id)
    if (result.success) loadUsers()
    else alert(result.message)
  }

  const handleToggleActive = async (user) => {
    const action = user.is_active ? 'deactivate' : 'activate'
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} user "${user.username}"?`)) return
    await window.api.updateUser({ id: user.id, isActive: !user.is_active })
    loadUsers()
  }

  return (
    <div className="page-content">
      <div className="card card-body">
        <div className="flex-between" style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700' }}>👥 User Management</h1>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-outline" onClick={loadActivityLog}>
              📋 Activity Log
            </button>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              + Add User
            </button>
          </div>
        </div>

        {/* Admin info box */}
        <div style={styles.adminBox}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={styles.adminAvatar}>👤</span>
            <div>
              <div style={{ fontWeight: '600' }}>admin (Admin)</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Hardcoded — credentials set in .env file
              </div>
            </div>
          </div>
          <span className="badge badge-green">ACTIVE</span>
        </div>

        {/* Users table */}
        {loading ? <div className="spinner" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Page Access</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: '30px' }}>
                      No users added yet
                    </td>
                  </tr>
                ) : (
                  users.map(user => {
                    let perms = []
                    try { perms = JSON.parse(user.permissions || '["billing"]') } catch { perms = ['billing'] }
                    return (
                      <tr key={user.id}>
                        <td style={{ fontWeight: '600' }}>👤 {user.username}</td>
                        <td>
                          <span className={`badge ${user.role === 'admin' ? 'badge-red' : 'badge-blue'}`}>
                            {user.role}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${user.is_active ? 'badge-green' : 'badge-gray'}`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <span className="badge badge-green">Billing</span>
                            {PAGES.filter(p => perms.includes(p.key)).map(p => (
                              <span key={p.key} className="badge badge-blue">{p.label}</span>
                            ))}
                          </div>
                        </td>
                        <td style={{ fontSize: '12px', color: '#6b7280' }}>
                          {DateTime.formatDate(user.created_at)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              className="link-btn link-btn-blue"
                              onClick={() => setEditUser(user)}
                            >Edit</button>
                            <button
                              className="link-btn link-btn-blue"
                              onClick={() => setResetUser(user)}
                            >Reset PW</button>
                            <button
                              className="link-btn"
                              style={{ color: user.is_active ? '#d97706' : '#16a34a' }}
                              onClick={() => handleToggleActive(user)}
                            >
                              {user.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              className="link-btn link-btn-red"
                              onClick={() => handleRemove(user.id, user.username)}
                            >Remove</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <UserFormModal
          pages={PAGES}
          onClose={() => setShowAddModal(false)}
          onSave={async (data) => {
            const result = await window.api.addUser(data)
            if (result.success) { loadUsers(); setShowAddModal(false) }
            return result
          }}
        />
      )}

      {/* Edit User Modal */}
      {editUser && (
        <UserFormModal
          user={editUser}
          pages={PAGES}
          onClose={() => setEditUser(null)}
          onSave={async (data) => {
            const result = await window.api.updateUser({ id: editUser.id, ...data })
            if (result.success) { loadUsers(); setEditUser(null) }
            return result
          }}
        />
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSave={async (newPassword) => {
            const result = await window.api.resetUserPassword({ id: resetUser.id, newPassword })
            if (result.success) { setResetUser(null); alert('Password reset successfully') }
            return result
          }}
        />
      )}

      {/* Activity Log Modal */}
      {showLog && (
        <div className="modal-overlay" onClick={() => setShowLog(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📋 Activity Log</h2>
              <button className="modal-close" onClick={() => setShowLog(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLog.map((log, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {DateTime.formatDateTime(log.created_at)}
                        </td>
                        <td style={{ fontWeight: '500' }}>{log.username || '—'}</td>
                        <td>
                          <span className={`badge ${log.action === 'LOGIN' ? 'badge-green' : log.action === 'LOGOUT' ? 'badge-gray' : 'badge-blue'}`}>
                            {log.action}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: '#6b7280' }}>{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowLog(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UserFormModal({ user, pages, onClose, onSave }) {
  const isEdit = !!user
  const [username, setUsername] = useState(user?.username || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(user?.role || 'user')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Parse existing permissions or default to billing only
  const [permissions, setPermissions] = useState(() => {
    try { return JSON.parse(user?.permissions || '["billing"]') } catch { return ['billing'] }
  })

  const togglePermission = (key) => {
    setPermissions(prev =>
      prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]
    )
  }

  const handleSave = async () => {
    setError('')
    const v = Validator.validateUser({ username, password, isNew: !isEdit })
    if (!v.valid) { setError(v.errors[0]); return }
    setSaving(true)
    const result = await onSave({ username: username.trim(), password, role, permissions })
    setSaving(false)
    if (!result.success) setError(result.message)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? 'Edit User' : 'Add New User'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Username <span className="required">*</span></label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter username" autoFocus />
          </div>
          {!isEdit && (
            <div className="form-group">
              <label className="form-label">Password <span className="required">*</span></label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 4 characters" />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Role</label>
            <select className="input" value={role} onChange={e => setRole(e.target.value)}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Page Access Permissions */}
          <div className="form-group">
            <label className="form-label">Page Access</label>
            <div style={styles.permBox}>
              <div style={styles.permRow}>
                <input type="checkbox" checked disabled />
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Billing (always enabled)</span>
              </div>
              {pages.map(p => (
                <label key={p.key} style={styles.permRow}>
                  <input
                    type="checkbox"
                    checked={permissions.includes(p.key)}
                    onChange={() => togglePermission(p.key)}
                  />
                  <span style={{ fontSize: '14px', cursor: 'pointer' }}>{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <div className="alert alert-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Add User'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ResetPasswordModal({ user, onClose, onSave }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError('')
    if (!newPassword || newPassword.length < 4) { setError('Password must be at least 4 characters'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    setSaving(true)
    const result = await onSave(newPassword)
    setSaving(false)
    if (!result.success) setError(result.message)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔑 Reset Password — {user.username}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input className="input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 4 characters" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input className="input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  adminBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px'
  },
  adminAvatar: { fontSize: '24px' },
  permBox: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  permRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer'
  }
}