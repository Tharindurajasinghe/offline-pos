import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppProvider } from './context/AppContext'
import Login from './pages/Login'
import Billing from './pages/Billing'
import Inventory from './pages/Inventory'
import Summary from './pages/Summary'
import CheckBill from './pages/CheckBill'
import Barcode from './pages/Barcode'
import AdminSettings from './pages/AdminSettings'
import AdminUsers from './pages/AdminUsers'
import Navbar from './components/Navbar'
import TrialBanner from './components/TrialBanner'
import Backup from './pages/Backup'
import DayEnd from './pages/DayEnd'

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function PermissionRoute({ page, children }) {
  const { user, loading, isAdmin } = useAuth()

  if (loading) return <div className="flex-center" style={{ height: '100vh' }}><div className="spinner" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (isAdmin()) return children

  let perms = []
  try { perms = JSON.parse(user?.permissions || '["billing"]') } catch { perms = ['billing'] }

  if (!perms.includes(page)) return <Navigate to="/" replace />
  return children
}

function RoleRedirect() {
  const { user } = useAuth()
  if (user?.role === 'admin') {
    return <Navigate to="/admin-settings" replace />
  }
  return <Billing />
}

function AppLayout() {
  const { user } = useAuth()

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <div className="page-layout">
      <TrialBanner />
      <Navbar />
      <Routes>
        <Route path="/" element={<ProtectedRoute><RoleRedirect /> </ProtectedRoute>} />
        <Route path="/summary"  element={<PermissionRoute page="summary"><Summary /></PermissionRoute>} />
        <Route path="/checkbill" element={<PermissionRoute page="checkbill"><CheckBill /></PermissionRoute>} />
        <Route path="/backup"   element={<PermissionRoute page="restore"><Backup /></PermissionRoute>} />
        <Route path="/barcode"  element={<PermissionRoute page="barcode"><Barcode /></PermissionRoute>} />
        <Route path="/inventory" element={<PermissionRoute page="store"><Inventory /></PermissionRoute>} />
        <Route path="/admin-settings" element={<ProtectedRoute adminOnly><AdminSettings /></ProtectedRoute>} />
        <Route path="/admin-users" element={<ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>} />
         <Route path="/day-end" element={<ProtectedRoute><DayEnd /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
        

      </Routes>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppProvider>
          <AppLayout />
        </AppProvider>
      </AuthProvider>
    </HashRouter>
  )
}