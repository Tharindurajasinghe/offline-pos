const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')

const ADMIN_USERNAME = process.env.VITE_ADMIN_USERNAME || 'admin'
const ADMIN_PASSWORD = process.env.VITE_ADMIN_PASSWORD || 'admin@pos2024'
const TRIAL_DAYS = parseInt(process.env.VITE_TRIAL_DAYS || '5')
const TOKEN_SECRET = process.env.VITE_TOKEN_SECRET || 'pos-secret'
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

class AuthIPC {
  static register(ipcMain, db, app) {
    ipcMain.handle('auth:checkTrial', () => AuthIPC.checkTrial(db))
    ipcMain.handle('auth:activate', (_, key) => AuthIPC.activate(db, key))
    ipcMain.handle('auth:login', (_, data) => AuthIPC.login(db, data))
    ipcMain.handle('auth:logout', (_, token) => AuthIPC.logout(db, token))
    ipcMain.handle('auth:verify', (_, token) => AuthIPC.verify(db, token))
  }

  static checkTrial(db) {
    try {
      const trial = db.prepare('SELECT * FROM trial WHERE id = 1').get()
      if (!trial) return { allowed: false, reason: 'no_trial' }
      if (trial.is_activated) return { allowed: true, activated: true }

      const installDate = new Date(trial.install_date)
      const now = new Date()
      const diffMs = now - installDate
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      const remaining = TRIAL_DAYS - diffDays

      if (remaining <= 0) {
        return { allowed: false, reason: 'trial_expired', remaining: 0 }
      }
      return { allowed: true, activated: false, remaining }
    } catch (err) {
      return { allowed: false, reason: 'error', message: err.message }
    }
  }

  static activate(db, key) {
    try {
      // Key format: XXXX-XXXX-XXXX-XXXX (offline validation)
      const validFormat = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)
      if (!validFormat) return { success: false, message: 'Invalid key format' }

      // Simple offline checksum validation
      const parts = key.split('-')
      const sum = parts[0].charCodeAt(0) + parts[1].charCodeAt(0)
      const check = parts[2].substring(0, 2)
      if (check !== 'PO') return { success: false, message: 'Invalid activation key' }

      db.prepare(
        'UPDATE trial SET is_activated = 1, activation_key = ? WHERE id = 1'
      ).run(key)

      return { success: true, message: 'System activated successfully' }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static login(db, { username, password }) {
    try {
      // Check lockout
      const lockout = AuthIPC.checkLockout(db, username)
      if (lockout.locked) {
        return { success: false, message: `Too many failed attempts. Try again in ${lockout.minutesLeft} minutes.` }
      }

      // Check trial
      const trial = AuthIPC.checkTrial(db)
      if (!trial.allowed) {
        return { success: false, message: 'Trial expired. Please activate the system.', trialExpired: true }
      }

      let user = null
      let role = null

      // Check admin (hardcoded)
      if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        user = { id: null, username: ADMIN_USERNAME }
        role = 'admin'
      } else {
        // Check database users
        const dbUser = db.prepare(
          'SELECT * FROM users WHERE username = ? AND is_active = 1'
        ).get(username)

        if (!dbUser) {
          AuthIPC.recordFailedAttempt(db, username)
          return { success: false, message: 'Invalid username or password' }
        }

        const passwordMatch = bcrypt.compareSync(password, dbUser.password_hash)
        if (!passwordMatch) {
          AuthIPC.recordFailedAttempt(db, username)
          return { success: false, message: 'Invalid username or password' }
        }

        user = dbUser
        role = dbUser.role
      }

      // Clear failed attempts on success
      AuthIPC.clearAttempts(db, username)

      // Create token
      const token = uuidv4() + '-' + TOKEN_SECRET.substring(0, 4) + '-' + Date.now()
      const expiresAt = new Date()
              expiresAt.setHours(23, 59, 59, 0)  // expires at midnight same day

              // If login is after 11 PM, give them until next midnight
              if (new Date().getHours() >= 23) {
                expiresAt.setDate(expiresAt.getDate() + 1)
                expiresAt.setHours(23, 59, 59, 0)
              }

      // For admin (hardcoded), use special user_id = -1
// For db users, clear old sessions first
const sessionUserId = (role === 'admin') ? -1 : user.id

if (role !== 'admin') {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
}
// Remove any old admin sessions
db.prepare('DELETE FROM sessions WHERE user_id = -1').run()

db.prepare(`
  INSERT INTO sessions (user_id, token, role, expires_at)
  VALUES (?, ?, ?, ?)
`).run(sessionUserId, token, role, expiresAt.toISOString())

      // Log activity
const logUserId = role === 'admin' ? null : user.id
db.prepare(`
  INSERT INTO activity_log (user_id, username, action, details)
  VALUES (?, ?, 'LOGIN', 'User logged in')
`).run(logUserId, username)
      return {
        success: true,
        token,
        role,
        username,
        userId: user.id,
        expiresAt: expiresAt.toISOString()
      }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static logout(db, token) {
    try {
      const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)
      if (session) {
        db.prepare(`
          INSERT INTO activity_log (user_id, username, action, details)
          VALUES (?, ?, 'LOGOUT', 'User logged out')
        `).run(session.user_id, '')
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
      }
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static verify(db, token) {
    try {
      if (!token) return { valid: false }
      const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)
      if (!session) return { valid: false }

      const now = new Date()
      const expires = new Date(session.expires_at)
      if (now > expires) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
        return { valid: false, reason: 'expired' }
      }

      return {
        valid: true,
        role: session.role,
        userId: session.user_id === -1 ? null : session.user_id
      }
    } catch (err) {
      return { valid: false }
    }
  }

  static checkLockout(db, username) {
    const windowMs = LOCKOUT_MINUTES * 60 * 1000
    const since = new Date(Date.now() - windowMs).toISOString()
    const attempts = db.prepare(`
      SELECT COUNT(*) as count FROM login_attempts
      WHERE username = ? AND attempted_at > ?
    `).get(username, since)

    if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
      const latest = db.prepare(`
        SELECT attempted_at FROM login_attempts
        WHERE username = ? ORDER BY attempted_at DESC LIMIT 1
      `).get(username)
      const latestTime = new Date(latest.attempted_at)
      const unlockTime = new Date(latestTime.getTime() + windowMs)
      const minutesLeft = Math.ceil((unlockTime - new Date()) / 60000)
      return { locked: true, minutesLeft }
    }
    return { locked: false }
  }

  static recordFailedAttempt(db, username) {
    db.prepare(
      'INSERT INTO login_attempts (username) VALUES (?)'
    ).run(username)
  }

  static clearAttempts(db, username) {
    db.prepare('DELETE FROM login_attempts WHERE username = ?').run(username)
  }
}

module.exports = AuthIPC