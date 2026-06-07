// All times use Sri Lanka timezone (UTC+5:30)

class DateTime {
  static getSriLankaDate() {
    const now = new Date()
    const sl = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
    return sl.toISOString().split('T')[0]
  }

  static getSriLankaDateTime() {
    const now = new Date()
    const sl = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
    return sl.toISOString().replace('T', ' ').substring(0, 19)
  }

  static formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  }

  static formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return ''
    const d = new Date(dateTimeStr)
    const date = DateTime.formatDate(dateTimeStr)
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const seconds = String(d.getSeconds()).padStart(2, '0')
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
    const h12 = d.getHours() % 12 || 12
    return `${date} | ${String(h12).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`
  }

  static formatTime(dateTimeStr) {
    if (!dateTimeStr) return ''
    const d = new Date(dateTimeStr)
    const h12 = d.getHours() % 12 || 12
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
    return `${String(h12).padStart(2, '0')}:${minutes} ${ampm}`
  }

  static getMonthLabel(dateStr) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec']
    const d = new Date(dateStr)
    return `${d.getFullYear()} ${months[d.getMonth()]}`
  }

  static getDaysUntilExpiry(expireDateStr) {
    const today = new Date(DateTime.getSriLankaDate())
    const expiry = new Date(expireDateStr)
    const diff = expiry - today
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  static getExpiryStatus(expireDateStr) {
    const days = DateTime.getDaysUntilExpiry(expireDateStr)
    if (days < 0) return 'EXPIRED'
    if (days <= 30) return 'EXPIRING_SOON'
    return 'OK'
  }

  static formatCurrency(amount, symbol = 'Rs.') {
    const num = parseFloat(amount) || 0
    return `${symbol} ${num.toFixed(2)}`
  }

  static getLiveClock() {
    const now = new Date()
    const sl = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
    const h = sl.getUTCHours()
    const m = String(sl.getUTCMinutes()).padStart(2, '0')
    const s = String(sl.getUTCSeconds()).padStart(2, '0')
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    const day = String(sl.getUTCDate()).padStart(2, '0')
    const month = String(sl.getUTCMonth() + 1).padStart(2, '0')
    const year = sl.getUTCFullYear()
    return `${day}/${month}/${year} | ${String(h12).padStart(2, '0')}:${m}:${s} ${ampm}`
  }
}

export default DateTime