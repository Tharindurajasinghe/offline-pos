const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Auth
  login: (data) => ipcRenderer.invoke('auth:login', data),
  logout: (token) => ipcRenderer.invoke('auth:logout', token),
  verifyToken: (token) => ipcRenderer.invoke('auth:verify', token),
  checkTrial: () => ipcRenderer.invoke('auth:checkTrial'),
  activateSystem: (key) => ipcRenderer.invoke('auth:activate', key),
  getAppVersion: () => require('electron').ipcRenderer.invoke('app:getVersion'),

  // Categories
  getCategories: () => ipcRenderer.invoke('category:getAll'),
  addCategory: (data) => ipcRenderer.invoke('category:add', data),
  updateCategory: (data) => ipcRenderer.invoke('category:update', data),
  removeCategory: (id) => ipcRenderer.invoke('category:remove', id),

  // Products
  getProducts: (filters) => ipcRenderer.invoke('product:getAll', filters),
  searchProduct: (query) => ipcRenderer.invoke('product:search', query),
  addProduct: (data) => ipcRenderer.invoke('product:add', data),
  updateProduct: (data) => ipcRenderer.invoke('product:update', data),
  removeProduct: (id) => ipcRenderer.invoke('product:remove', id),
  generateBarcodes: (productId) => ipcRenderer.invoke('product:generateBarcodes', productId),

  // Expiry dates
  getExpiryDates: (variantId) => ipcRenderer.invoke('product:getExpiry', variantId),
  addExpiryDate: (data) => ipcRenderer.invoke('product:addExpiry', data),
  updateExpiryDate: (data) => ipcRenderer.invoke('product:updateExpiry', data),
  removeExpiryDate: (id) => ipcRenderer.invoke('product:removeExpiry', id),

  // Stock
  adjustStock: (data) => ipcRenderer.invoke('product:adjustStock', data),
  getLowStockItems: () => ipcRenderer.invoke('product:getLowStock'),
  getExpiryWarnings: () => ipcRenderer.invoke('product:getExpiryWarnings'),

  // Billing
  saveBill: (data) => ipcRenderer.invoke('billing:save', data),
  getBills: (filters) => ipcRenderer.invoke('billing:getAll', filters),
  getBillById: (id) => ipcRenderer.invoke('billing:getById', id),
  deleteBill: (id) => ipcRenderer.invoke('billing:delete', id),
  getTodaySales: () => ipcRenderer.invoke('billing:getTodaySales'),
  getTodayTotal: () => ipcRenderer.invoke('billing:getTodayTotal'),
  getCartDraft: (userId) => ipcRenderer.invoke('billing:getCartDraft', userId),
  saveCartDraft: (data) => ipcRenderer.invoke('billing:saveCartDraft', data),
  clearCartDraft: (userId) => ipcRenderer.invoke('billing:clearCartDraft', userId),

  // Summary
  getDailySummaries: () => ipcRenderer.invoke('summary:getDaily'),
  getMonthlySummaries: () => ipcRenderer.invoke('summary:getMonthly'),
  endDay: () => ipcRenderer.invoke('summary:endDay'),
  checkAutoEndDay: () => ipcRenderer.invoke('summary:checkAutoEnd'),
  getMonthlyItems: (monthLabel) => ipcRenderer.invoke('summary:getMonthlyItems', monthLabel),


  // Barcodes
  getBarcodeProducts: () => ipcRenderer.invoke('barcode:getProducts'),
  printBarcodeLabel: (data) => ipcRenderer.invoke('barcode:print', data),

  // Admin
  getUsers: () => ipcRenderer.invoke('admin:getUsers'),
  addUser: (data) => ipcRenderer.invoke('admin:addUser', data),
  updateUser: (data) => ipcRenderer.invoke('admin:updateUser', data),
  removeUser: (id) => ipcRenderer.invoke('admin:removeUser', id),
  resetUserPassword: (data) => ipcRenderer.invoke('admin:resetPassword', data),
  getActivityLog: () => ipcRenderer.invoke('admin:getActivityLog'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  updateSetting: (data) => ipcRenderer.invoke('settings:update', data),
  uploadLogo: () => ipcRenderer.invoke('settings:uploadLogo'),
  backupDatabase: () => ipcRenderer.invoke('settings:backup'),
  restoreDatabase: () => ipcRenderer.invoke('settings:restore'),

  // Customer
  getAllCustomers:      ()     => ipcRenderer.invoke('customer:getAll'),
  searchCustomers:     (q)    => ipcRenderer.invoke('customer:search', q),
  getCustomerById:     (id)   => ipcRenderer.invoke('customer:getById', id),
  addCustomer:         (data) => ipcRenderer.invoke('customer:add', data),
  updateCustomer:      (data) => ipcRenderer.invoke('customer:update', data),
  removeCustomer:      (id)   => ipcRenderer.invoke('customer:remove', id),
  getCustomerBills:    (id)   => ipcRenderer.invoke('customer:getBills', id),
  addCustomerPayment:  (data) => ipcRenderer.invoke('customer:addPayment', data),
  getCustomerPayments: (id)   => ipcRenderer.invoke('customer:getPayments', id),
  saveCustomerBill:    (data) => ipcRenderer.invoke('customer:saveCustomerBill', data),
  getBillDetails: (billId) => ipcRenderer.invoke('billing:getBillDetails', billId),

  // ── QUICK SALE ──
  getQuickSale:    ()          => ipcRenderer.invoke('quicksale:getAll'),
  addQuickSale:    (variantId) => ipcRenderer.invoke('quicksale:add', variantId),
  removeQuickSale: (variantId) => ipcRenderer.invoke('quicksale:remove', variantId),

  // ── FOCUS FIX ── manual refocus fallback
  refocus: () => ipcRenderer.invoke('window:refocus'),

  // invoice
  getAllInvoices:  (filters) => ipcRenderer.invoke('invoice:getAll', filters),
  getInvoiceById: (id)      => ipcRenderer.invoke('invoice:getById', id),
  addInvoice:     (data)    => ipcRenderer.invoke('invoice:add', data),
  updateInvoice:  (data)    => ipcRenderer.invoke('invoice:update', data),
  removeInvoice:  (id)      => ipcRenderer.invoke('invoice:remove', id),
})