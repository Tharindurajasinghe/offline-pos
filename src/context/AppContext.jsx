import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [settings, setSettings] = useState({
    shop_name: 'DEMO',
    shop_address: '',
    shop_tel: '',
    shop_logo: '',
    bill_thank_you: 'Thank you for your purchase!',
    currency: 'Rs.',
    low_stock_threshold: '5',
    expiry_warning_days: '30',
    printer_name: '',
    bill_counter: '10000'
  })
  const [lowStockItems, setLowStockItems] = useState([])
  const [expiryWarnings, setExpiryWarnings] = useState([])
  const [todayTotal, setTodayTotal] = useState(0)
  const [todayBillCount, setTodayBillCount] = useState(0)
  const [loadingSettings, setLoadingSettings] = useState(true)

  useEffect(() => {
    loadSettings()
    loadAlerts()
  }, [])

  const loadSettings = async () => {
    setLoadingSettings(true)
    try {
      const result = await window.api.getSettings()
      if (result.success) setSettings(result.data)
    } catch (err) {
      console.error('Settings load error:', err)
    } finally {
      setLoadingSettings(false)
    }
  }

  const loadAlerts = async () => {
    try {
      const [lowStock, expiry, todaySales] = await Promise.all([
        window.api.getLowStockItems(),
        window.api.getExpiryWarnings(),
        window.api.getTodayTotal()
      ])
      if (lowStock.success) setLowStockItems(lowStock.data)
      if (expiry.success) setExpiryWarnings(expiry.data)
      if (todaySales.success) {
        setTodayTotal(todaySales.total)
        setTodayBillCount(todaySales.billCount)
      }
    } catch (err) {
      console.error('Alerts load error:', err)
    }
  }

  const refreshTodayTotal = useCallback(async () => {
    try {
      const result = await window.api.getTodayTotal()
      if (result.success) {
        setTodayTotal(result.total)
        setTodayBillCount(result.billCount)
      }
    } catch (err) {
      console.error('Today total refresh error:', err)
    }
  }, [])

  const refreshAlerts = useCallback(async () => {
    await loadAlerts()
  }, [])

  const updateSetting = useCallback(async (key, value) => {
    const result = await window.api.updateSetting({ key, value })
    if (result.success) {
      setSettings(prev => ({ ...prev, [key]: value }))
    }
    return result
  }, [])

  const currency = settings.currency || 'Rs.'

  const formatCurrency = useCallback((amount) => {
    const num = parseFloat(amount) || 0
    return `${currency} ${num.toFixed(2)}`
  }, [currency])

  return (
    <AppContext.Provider value={{
      settings,
      loadingSettings,
      lowStockItems,
      expiryWarnings,
      todayTotal,
      todayBillCount,
      currency,
      formatCurrency,
      loadSettings,
      refreshAlerts,
      refreshTodayTotal,
      updateSetting
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}