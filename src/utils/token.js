// Token helpers for React side (read from localStorage)

const TOKEN_KEY = 'pos_token'
const USER_KEY = 'pos_user'

class TokenManager {
  static save(token, user) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  }

  static getToken() {
    return localStorage.getItem(TOKEN_KEY)
  }

  static getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  static clear() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  static isLoggedIn() {
    return !!localStorage.getItem(TOKEN_KEY)
  }
}

export default TokenManager