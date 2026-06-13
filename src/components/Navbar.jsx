import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import DateTime from '../utils/dateTime'

const NAV_ITEMS_USER = [
  { path: '/',          label: 'Start Today', icon: '🖥️', page: 'billing'   },
  { path: '/inventory', label: 'Store',       icon: '📦', page: 'store'     },
  { path: '/summary',   label: 'Summary',     icon: '📊', page: 'summary'   },
  { path: '/checkbill', label: 'Check Bill',  icon: '📄', page: 'checkbill' },
  { path: '/barcode',   label: 'Barcode',     icon: '🔖', page: 'barcode'   },
  { path: '/backup', label: 'Backup', icon: '💾', page: 'restore' },
]

const NAV_ITEMS_ADMIN = [
  { path: '/admin-settings', label: 'Settings', icon: '⚙️' },
  { path: '/admin-users',    label: 'Users',     icon: '👥' }
]

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth()
  const { settings } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [clock, setClock] = useState(DateTime.getLiveClock())
  const [showAdminMenu, setShowAdminMenu] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setClock(DateTime.getLiveClock())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await logout()
      navigate('/login')
    }
  }

  const shopName = settings?.shop_name || 'DEMO'

  // Get user permissions
  const userPerms = (() => {
    try { return JSON.parse(user?.permissions || '["billing"]') } catch { return ['billing'] }
  })()

  // Filter nav items by permission for regular users
  const visibleUserNav = isAdmin()
    ? NAV_ITEMS_USER
    : NAV_ITEMS_USER.filter(item =>
        item.page === 'billing' || userPerms.includes(item.page)
      )

  return (
    <nav style={styles.nav}>
      {/* Shop name */}
      <div style={styles.shopName} onClick={() => isAdmin() && setShowAdminMenu(p => !p)}>
        {shopName}
        {isAdmin() && <span style={styles.adminBadge}>ADMIN</span>}
      </div>

      {/* Admin dropdown */}
      {isAdmin() && showAdminMenu && (
        <div style={styles.adminDropdown}>
          <button style={styles.dropdownItem} onClick={() => { navigate('/admin-settings'); setShowAdminMenu(false) }}>
            ⚙️ Settings
          </button>
          <button style={styles.dropdownItem} onClick={() => { navigate('/admin-users'); setShowAdminMenu(false) }}>
            👥 Manage Users
          </button>
        </div>
      )}

      {/* Nav items */}
      <div style={styles.navItems}>
        {(user?.role === 'admin' ? NAV_ITEMS_ADMIN : visibleUserNav).map(item => {
          const isActive = location.pathname === item.path
          return (
            <button
              key={item.path}
              style={{
                ...styles.navBtn,
                ...(isActive ? styles.navBtnActive : {})
              }}
              onClick={() => navigate(item.path)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>

      {/* Right side */}
      <div style={styles.rightSide}>
        <div style={styles.clockBox}>
          <span style={styles.clockText}>{clock}</span>
          <span style={styles.userText}>👤 {user?.username}</span>
        </div>
        <button style={styles.logoutBtn} onClick={handleLogout}>
          Logout
        </button>
      </div>

      {/* Close admin menu on outside click */}
      {showAdminMenu && (
        <div
          style={styles.overlay}
          onClick={() => setShowAdminMenu(false)}
        />
      )}
    </nav>
  )
}

const styles = {
  nav: {
    display: 'flex',
    alignItems: 'center',
    background: '#111827',
    color: '#f9fafb',
    padding: '0 16px',
    height: '52px',
    position: 'relative',
    zIndex: 100,
    flexShrink: 0,
    gap: '12px'
  },
  shopName: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#fff',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: '120px'
  },
  adminBadge: {
    fontSize: '9px',
    background: '#16a34a',
    color: '#fff',
    padding: '2px 5px',
    borderRadius: '4px',
    fontWeight: '600'
  },
  navItems: {
    display: 'flex',
    gap: '4px',
    flex: 1,
    justifyContent: 'center'
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: '#d1d5db',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'all 0.15s'
  },
  navBtnActive: {
    background: '#16a34a',
    color: '#fff'
  },
  rightSide: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '200px',
    justifyContent: 'flex-end'
  },
  clockBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end'
  },
  clockText: {
    fontSize: '11px',
    color: '#9ca3af'
  },
  userText: {
    fontSize: '11px',
    color: '#d1d5db'
  },
  logoutBtn: {
    padding: '6px 14px',
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500'
  },
  adminDropdown: {
    position: 'absolute',
    top: '52px',
    left: '16px',
    background: '#fff',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    padding: '6px',
    minWidth: '180px',
    zIndex: 200
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: '9px 12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#111827',
    textAlign: 'left',
    borderRadius: '6px'
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 150
  }
}