import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import TokenManager from '../utils/token'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [trialInfo, setTrialInfo] = useState(null)

  // Verify token on app start
  useEffect(() => {
    initAuth()
  }, [])

  const initAuth = async () => {
    setLoading(true)
    try {
      // Check trial first
      const trial = await window.api.checkTrial()
      setTrialInfo(trial)

      // Verify existing token
      const token = TokenManager.getToken()
      if (token) {
        const result = await window.api.verifyToken(token)
        if (result.valid) {
          const savedUser = TokenManager.getUser()
          setUser(savedUser)
        } else {
          TokenManager.clear()
          setUser(null)
        }
      }
    } catch (err) {
      console.error('Auth init error:', err)
      TokenManager.clear()
    } finally {
      setLoading(false)
    }
  }

  const login = useCallback(async (username, password) => {
    const result = await window.api.login({ username, password })
    if (result.success) {
      const userData = {
        token: result.token,
        role: result.role,
        username: result.username,
        userId: result.userId,
        expiresAt: result.expiresAt,
        permissions: result.permissions || '["billing"]'
      }
      TokenManager.save(result.token, userData)
      setUser(userData)

      // Check auto end day after login
      await window.api.checkAutoEndDay()
    }
    return result
  }, [])

  const logout = useCallback(async () => {
    const token = TokenManager.getToken()
    if (token) {
      await window.api.logout(token)
    }
    TokenManager.clear()
    setUser(null)
  }, [])

  const isAdmin = () => user?.role === 'admin'
  const isLoggedIn = () => !!user

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      trialInfo,
      login,
      logout,
      isAdmin,
      isLoggedIn,
      refreshTrial: initAuth
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}