import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login, user, trialInfo, refreshTrial } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showActivation, setShowActivation] = useState(false)
  const [activationKey, setActivationKey] = useState('')
  const [activating, setActivating] = useState(false)
  const [activationMsg, setActivationMsg] = useState('')

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user])

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password.trim()) {
      setError('Please enter username and password.')
      return
    }
    setLoading(true)
    const result = await login(username.trim(), password)
    setLoading(false)
    if (result.success) {
  if (result.role === 'admin') {
    navigate('/admin-settings')
  } else {
    navigate('/')
  }
}
  }

  const handleActivate = async () => {
    setActivationMsg('')
    if (!activationKey.trim()) {
      setActivationMsg('Please enter activation key.')
      return
    }
    setActivating(true)
    const result = await window.api.activateSystem(activationKey.trim().toUpperCase())
    setActivating(false)
    if (result.success) {
      setActivationMsg('✅ ' + result.message)
      await refreshTrial()
      setShowActivation(false)
      setError('')
    } else {
      setActivationMsg('❌ ' + result.message)
    }
  }

  const trialExpired = trialInfo && !trialInfo.allowed && trialInfo.reason === 'trial_expired'
  const trialRemaining = trialInfo && trialInfo.allowed && !trialInfo.activated
    ? trialInfo.remaining : null

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo / Title */}
        <div style={styles.header}>
          <div style={styles.logo}>🏪</div>
          <h1 style={styles.title}>POS System</h1>
          <p style={styles.subtitle}>Sign in to continue</p>
        </div>

        {/* Trial banner */}
        {trialExpired && (
          <div className="alert alert-error" style={{ marginBottom: 0, borderRadius: 0 }}>
            ⚠️ Your 5-day trial has expired. Please activate the system.
          </div>
        )}
        {trialRemaining !== null && (
          <div className="alert alert-warning" style={{ marginBottom: 0, borderRadius: 0 }}>
            ⏳ Trial: <strong>{trialRemaining} day{trialRemaining !== 1 ? 's' : ''}</strong> remaining
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleLogin} style={styles.form}>
          {error && (
            <div className="alert alert-error">{error}</div>
          )}

          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="input"
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="input"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            disabled={loading}
            style={{ marginTop: '8px' }}
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        {/* Activate link */}
        <div style={styles.activateLink}>
          <button
            style={styles.linkText}
            onClick={() => setShowActivation(p => !p)}
          >
            {showActivation ? 'Hide activation' : '🔑 Activate system'}
          </button>
        </div>

        {/* Activation form */}
        {showActivation && (
          <div style={styles.activationBox}>
            <p style={styles.activationLabel}>Enter Activation Key</p>
            <p style={styles.activationHint}>Format: XXXX-XXXX-XXXX-XXXX</p>
            <input
              className="input"
              placeholder="e.g. AB12-CD34-POEF-GH78"
              value={activationKey}
              onChange={e => setActivationKey(e.target.value.toUpperCase())}
              maxLength={19}
              style={{ marginBottom: '10px', letterSpacing: '2px' }}
            />
            <button
              className="btn btn-primary btn-block"
              onClick={handleActivate}
              disabled={activating}
            >
              {activating ? 'Activating...' : 'Activate'}
            </button>
            {activationMsg && (
              <p style={{
                marginTop: '10px',
                fontSize: '13px',
                color: activationMsg.startsWith('✅') ? '#166534' : '#991b1b'
              }}>
                {activationMsg}
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          <span>POS System v1.0 - Powered By TAR Solutions</span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1e3a5f 0%, #16a34a 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px'
  },
  card: {
    background: '#fff',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    overflow: 'hidden'
  },
  header: {
    textAlign: 'center',
    padding: '32px 32px 8px'
  },
  logo: {
    fontSize: '48px',
    marginBottom: '8px'
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#111827'
  },
  subtitle: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '4px'
  },
  form: {
    padding: '24px 32px 8px'
  },
  activateLink: {
    textAlign: 'center',
    padding: '8px 32px'
  },
  linkText: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    cursor: 'pointer',
    fontSize: '13px',
    textDecoration: 'underline'
  },
  activationBox: {
    background: '#f9fafb',
    margin: '0 24px 16px',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid #e5e7eb'
  },
  activationLabel: {
    fontWeight: '600',
    fontSize: '13px',
    marginBottom: '4px'
  },
  activationHint: {
    fontSize: '11px',
    color: '#6b7280',
    marginBottom: '10px'
  },
  footer: {
    textAlign: 'center',
    padding: '12px',
    fontSize: '11px',
    color: '#9ca3af',
    borderTop: '1px solid #f3f4f6'
  }
}