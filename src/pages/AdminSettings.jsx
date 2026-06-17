import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import Validator from '../utils/validator'
import DateTime from '../utils/dateTime'

// ─── User Form Modal ──────────────────────────────────────────────────────────
function UserFormModal({ user, onClose, onSave }) {
  const isEdit = !!user
  const [username, setUsername] = useState(user?.username || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(user?.role || 'user')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError('')
    const v = Validator.validateUser({ username, password, isNew: !isEdit })
    if (!v.valid) { setError(v.errors[0]); return }
    setSaving(true)
    const result = await onSave({ username: username.trim(), password, role })
    setSaving(false)
    if (!result.success) setError(result.message)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? '✏️ Edit User' : '+ Add New User'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Username <span className="required">*</span></label>
            <input
              className="input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              autoFocus
            />
          </div>
          {!isEdit && (
            <div className="form-group">
              <label className="form-label">Password <span className="required">*</span></label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 4 characters"
              />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Role</label>
            <select className="input" value={role} onChange={e => setRole(e.target.value)}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
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

// ─── Reset Password Modal ─────────────────────────────────────────────────────
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
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Min 4 characters"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
            />
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

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [resetUser, setResetUser] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadUsers() }, [])

  const loadUsers = async () => {
    setLoading(true)
    const result = await window.api.getUsers()
    if (result.success) setUsers(result.data)
    setLoading(false)
  }

  const showMsg = (text) => {
    setMsg(text)
    setTimeout(() => setMsg(''), 3000)
  }

  const handleRemove = async (id, username) => {
    if (!window.confirm(`Remove user "${username}"?`)) return
    const result = await window.api.removeUser(id)
    if (result.success) { loadUsers(); showMsg('✅ User removed') }
    else showMsg('❌ ' + result.message)
  }

  const handleToggleActive = async (user) => {
    const action = user.is_active ? 'Deactivate' : 'Activate'
    if (!window.confirm(`${action} user "${user.username}"?`)) return
    await window.api.updateUser({ id: user.id, isActive: !user.is_active })
    loadUsers()
  }

  return (
    <div style={{ maxWidth: '700px' }}>
      <div className="flex-between" style={{ marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: '600' }}>System Users</h3>
          <p className="form-hint" style={{ margin: 0 }}>
            Manage who can access this POS system
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + Add User
        </button>
      </div>

      {msg && (
        <div className={`alert ${msg.startsWith('✅') ? 'alert-success' : 'alert-error'}`}>
          {msg}
        </div>
      )}

      {/* Hardcoded admin row */}
      <div style={userStyles.adminBox}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>👤</span>
          <div>
            <div style={{ fontWeight: '600', fontSize: '13px' }}>admin</div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>
              Hardcoded admin — credentials set in .env file
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="badge badge-red">admin</span>
          <span className="badge badge-green">Active</span>
        </div>
      </div>

      {/* Users list */}
      {loading ? (
        <div className="spinner" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
          {users.length === 0 ? (
            <div style={userStyles.emptyBox}>
              No users added yet. Click "+ Add User" to create one.
            </div>
          ) : (
            users.map(user => (
              <div
                key={user.id}
                style={{
                  ...userStyles.userRow,
                  opacity: user.is_active ? 1 : 0.6
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                  <span style={{ fontSize: '20px' }}>👤</span>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '13px' }}>{user.username}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                      Created: {DateTime.formatDate(user.created_at)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`badge ${user.role === 'admin' ? 'badge-red' : 'badge-blue'}`}>
                    {user.role}
                  </span>
                  <span className={`badge ${user.is_active ? 'badge-green' : 'badge-gray'}`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
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
              </div>
            ))
          )}
        </div>
      )}

      {/* Modals */}
      {showAddModal && (
        <UserFormModal
          onClose={() => setShowAddModal(false)}
          onSave={async (data) => {
            const result = await window.api.addUser(data)
            if (result.success) {
              loadUsers()
              setShowAddModal(false)
              showMsg('✅ User added successfully')
            }
            return result
          }}
        />
      )}

      {editUser && (
        <UserFormModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={async (data) => {
            const result = await window.api.updateUser({ id: editUser.id, ...data })
            if (result.success) {
              loadUsers()
              setEditUser(null)
              showMsg('✅ User updated successfully')
            }
            return result
          }}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSave={async (newPassword) => {
            const result = await window.api.resetUserPassword({
              id: resetUser.id,
              newPassword
            })
            if (result.success) {
              setResetUser(null)
              showMsg('✅ Password reset successfully')
            }
            return result
          }}
        />
      )}
    </div>
  )
}

// ─── Main Admin Settings Page ─────────────────────────────────────────────────
export default function AdminSettings() {
  const { isAdmin } = useAuth()
  const { settings, updateSetting, loadSettings } = useApp()
  const navigate = useNavigate()

  const [tab, setTab] = useState('shop')
  const [form, setForm] = useState({
    shop_name: '',
    shop_address: '',
    shop_tel: '',
    shop_bio: '',
    bill_thank_you: '',
    currency: '',
    low_stock_threshold: '',
    expiry_warning_days: '',
    printer_name: ''
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [logoPreview, setLogoPreview] = useState('')

  useEffect(() => {
    if (!isAdmin()) { navigate('/'); return }
    loadSettings()
  }, [])

  useEffect(() => {
    setForm({
      shop_name: settings.shop_name || 'DEMO',
      shop_address: settings.shop_address || '',
      shop_tel: settings.shop_tel || '',
      shop_bio: settings.shop_bio || '',
      bill_thank_you: settings.bill_thank_you || '',
      currency: settings.currency || 'Rs.',
      low_stock_threshold: settings.low_stock_threshold || '5',
      expiry_warning_days: settings.expiry_warning_days || '30',
      printer_name: settings.printer_name || ''
    })
    setLogoPreview(settings.shop_logo || '')
  }, [settings])

  const handleSave = async () => {
    setSaving(true)
    setMsg('')
    for (const key of Object.keys(form)) {
      await updateSetting(key, form[key])
    }
    setSaving(false)
    setMsg('✅ Settings saved successfully!')
    setTimeout(() => setMsg(''), 3000)
  }

  const handleLogoUpload = async () => {
    const result = await window.api.uploadLogo()
    if (result.success) {
      setLogoPreview(result.logo)
      setMsg('✅ Logo uploaded!')
    } else {
      setMsg('❌ ' + result.message)
    }
    setTimeout(() => setMsg(''), 3000)
  }

  const handleBackup = async () => {
    const result = await window.api.backupDatabase()
    setMsg(result.success ? '✅ ' + result.message : '❌ ' + result.message)
    setTimeout(() => setMsg(''), 4000)
  }

  const handleRestore = async () => {
    if (!window.confirm('Restore database? Current data will be replaced. App will need restart.')) return
    const result = await window.api.restoreDatabase()
    setMsg(result.success ? '✅ ' + result.message : '❌ ' + result.message)
    setTimeout(() => setMsg(''), 4000)
  }

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const tabs = [
    { id: 'shop',   label: '🏪 Shop Info' },
    { id: 'bill',   label: '🧾 Bill Settings' },
    { id: 'system', label: '⚙️ System' },
    { id: 'users',  label: '👥 Users' },
    { id: 'backup', label: '💾 Backup' }
  ]

  const showSaveButton = tab !== 'backup' && tab !== 'users'

  return (
    <div className="page-content">
      <div className="card card-body">
        <h1 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '20px' }}>
          ⚙️ Admin Settings
        </h1>

        {/* Tabs */}
        <div style={styles.tabs}>
          {tabs.map(t => (
            <button
              key={t.id}
              style={{ ...styles.tab, ...(tab === t.id ? styles.tabActive : {}) }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Message */}
        {msg && (
          <div className={`alert ${msg.startsWith('✅') ? 'alert-success' : 'alert-error'}`}>
            {msg}
          </div>
        )}

        {/* ── Shop Info ── */}
        {tab === 'shop' && (
          <div style={styles.section}>
            <div className="form-group">
              <label className="form-label">Shop Name</label>
              <input
                className="input"
                value={form.shop_name}
                onChange={e => update('shop_name', e.target.value)}
                placeholder="DEMO"
              />
              <p className="form-hint">Shown in navbar and on printed bills</p>
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <input
                className="input"
                value={form.shop_address}
                onChange={e => update('shop_address', e.target.value)}
                placeholder="Shop address"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                className="input"
                value={form.shop_tel}
                onChange={e => update('shop_tel', e.target.value)}
                placeholder="Tel number"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Shop Logo</label>
              <div style={styles.logoSection}>
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" style={styles.logoPreview} />
                ) : (
                  <div style={styles.logoPlaceholder}>No logo</div>
                )}
                <button className="btn btn-outline" onClick={handleLogoUpload}>
                  📁 Upload Logo
                </button>
              </div>
              <p className="form-hint">PNG or JPG. Shown on printed bills.</p>
            </div>
          </div>
        )}

        {/* ── Bill Settings ── */}
        {tab === 'bill' && (
          <div style={styles.section}>
            <div className="form-group">
              <label className="form-label">Shop Bio / Description</label>
              <textarea
                className="input"
                value={form.shop_bio}
                onChange={e => update('shop_bio', e.target.value)}
                placeholder="e.g. Quality products at best prices"
                rows={2}
                style={{ resize: 'vertical' }}
              />
              <p className="form-hint">Printed on bill below the shop name</p>
            </div>
            <div className="form-group">
              <label className="form-label">Thank You Message</label>
              <input
                className="input"
                value={form.bill_thank_you}
                onChange={e => update('bill_thank_you', e.target.value)}
                placeholder="Thank you for your purchase!"
              />
              <p className="form-hint">Printed at the bottom of every bill</p>
            </div>
            <div className="form-group">
              <label className="form-label">Currency Symbol</label>
              <input
                className="input"
                value={form.currency}
                onChange={e => update('currency', e.target.value)}
                placeholder="Rs."
                style={{ maxWidth: '100px' }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Printer Name</label>
              <input
                className="input"
                value={form.printer_name}
                onChange={e => update('printer_name', e.target.value)}
                placeholder="e.g. XP-58 or leave blank"
              />
              <p className="form-hint">Leave blank to use default system printer</p>
            </div>

            {/* Bill preview */}
            <div style={styles.billPreview}>
              <div style={styles.previewTitle}>Bill Preview</div>
              <div style={styles.previewContent}>
                <p style={{ textAlign: 'center', fontWeight: 'bold' }}>{form.shop_name || 'DEMO'}</p>
                {form.shop_bio && (
                  <p style={{ textAlign: 'center', fontSize: '11px', color: '#6b7280' }}>{form.shop_bio}</p>
                )}
                <p style={{ textAlign: 'center', fontSize: '11px' }}>{form.shop_address}</p>
                <p style={{ textAlign: 'center', fontSize: '11px' }}>
                  {form.shop_tel ? 'Tel: ' + form.shop_tel : ''}
                </p>
                <hr style={{ border: '1px dashed #ccc', margin: '6px 0' }} />
                <p style={{ fontSize: '11px' }}>Bill: #10001 | 04/06/2026 | 10:00 AM</p>
                <hr style={{ border: '1px dashed #ccc', margin: '6px 0' }} />
                <p style={{ fontSize: '11px' }}>Item 1 .............. {form.currency} 200.00</p>
                <p style={{ fontSize: '11px' }}>Item 2 .............. {form.currency} 150.00</p>
                <hr style={{ border: '1px dashed #ccc', margin: '6px 0' }} />
                <p style={{ fontSize: '11px', fontWeight: 'bold' }}>TOTAL: {form.currency} 350.00</p>
                <p style={{ textAlign: 'center', fontSize: '11px', marginTop: '6px' }}>
                  {form.bill_thank_you}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── System Settings ── */}
        {tab === 'system' && (
          <div style={styles.section}>
            <div className="form-group">
              <label className="form-label">Low Stock Threshold (default)</label>
              <input
                className="input"
                type="number"
                min="0"
                value={form.low_stock_threshold}
                onChange={e => update('low_stock_threshold', e.target.value)}
                style={{ maxWidth: '120px' }}
              />
              <p className="form-hint">Show alert when stock falls below this number</p>
            </div>
            <div className="form-group">
              <label className="form-label">Expiry Warning Days</label>
              <input
                className="input"
                type="number"
                min="1"
                value={form.expiry_warning_days}
                onChange={e => update('expiry_warning_days', e.target.value)}
                style={{ maxWidth: '120px' }}
              />
              <p className="form-hint">Show warning when product expires within this many days</p>
            </div>
          </div>
        )}

        {/* ── Users Tab ── */}
        {tab === 'users' && <UsersTab />}

        {/* ── Backup Tab ── */}
        {tab === 'backup' && (
          <div style={styles.section}>
            <div style={styles.backupCard}>
              <div style={styles.backupIcon}>💾</div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>
                  Backup Database
                </h3>
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                  Save a copy of all your data. Keep this file safe.
                </p>
                <button className="btn btn-primary" onClick={handleBackup}>
                  💾 Backup Now
                </button>
              </div>
            </div>

            <div style={{
              ...styles.backupCard,
              marginTop: '16px',
              background: '#fef2f2',
              border: '1px solid #fca5a5'
            }}>
              <div style={styles.backupIcon}>📂</div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px', color: '#991b1b' }}>
                  Restore Database
                </h3>
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                  ⚠️ This will replace ALL current data with the backup file. App will restart.
                </p>
                <button className="btn btn-danger" onClick={handleRestore}>
                  📂 Restore from Backup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save button — only for shop, bill, system tabs */}
        {showSaveButton && (
          <div style={{ marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : '💾 Save Settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  tabs: { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' },
  tab: {
    padding: '8px 16px', borderRadius: '8px',
    border: '1px solid #e5e7eb', background: '#fff',
    cursor: 'pointer', fontSize: '13px', fontWeight: '500'
  },
  tabActive: { background: '#16a34a', color: '#fff', border: '1px solid #16a34a' },
  section: { maxWidth: '600px' },
  logoSection: { display: 'flex', alignItems: 'center', gap: '16px' },
  logoPreview: {
    width: '80px', height: '80px', objectFit: 'contain',
    border: '1px solid #e5e7eb', borderRadius: '8px'
  },
  logoPlaceholder: {
    width: '80px', height: '80px', border: '2px dashed #d1d5db',
    borderRadius: '8px', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '11px', color: '#9ca3af'
  },
  billPreview: {
    border: '1px solid #e5e7eb', borderRadius: '8px',
    overflow: 'hidden', marginTop: '16px', maxWidth: '280px'
  },
  previewTitle: {
    background: '#f9fafb', padding: '8px 14px',
    fontSize: '12px', fontWeight: '600', color: '#6b7280',
    borderBottom: '1px solid #e5e7eb'
  },
  previewContent: {
    padding: '12px', fontFamily: 'monospace',
    fontSize: '12px', background: '#fff'
  },
  backupCard: {
    display: 'flex', gap: '16px', alignItems: 'flex-start',
    background: '#f9fafb', border: '1px solid #e5e7eb',
    borderRadius: '12px', padding: '20px'
  },
  backupIcon: { fontSize: '32px' }
}

const userStyles = {
  adminBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: '8px',
    padding: '12px 16px'
  },
  userRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '12px 16px',
    flexWrap: 'wrap',
    gap: '8px'
  },
  emptyBox: {
    textAlign: 'center',
    padding: '30px',
    color: '#9ca3af',
    border: '2px dashed #e5e7eb',
    borderRadius: '8px',
    fontSize: '13px'
  }
}