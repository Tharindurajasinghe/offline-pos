
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')

const isDev = !app.isPackaged

class POSApp {
  constructor() {
    this.mainWindow = null
    this.db = null
  }

  init() {
    app.whenReady().then(() => {
      this.setupDatabase()
      this.createWindow()
      this.registerIPC()
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) this.createWindow()
    })
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1366,
      height: 768,
      minWidth: 1024,
      minHeight: 600,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      },
      title: 'POS System',
      show: false
    })

    if (isDev) {
      this.mainWindow.loadURL('http://localhost:5173')
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show()
      this.mainWindow.maximize()
    })
  }

  

  setupDatabase() {
    const Database = require('better-sqlite3')
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'pos-data.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    const schema = require('./db/schema')
    schema.initialize(this.db)
  }

  registerIPC() {
    const handlers = [
      require('./ipc/auth.ipc'),
      require('./ipc/category.ipc'),
      require('./ipc/product.ipc'),
      require('./ipc/billing.ipc'),
      require('./ipc/summary.ipc'),
      require('./ipc/barcode.ipc'),
      require('./ipc/admin.ipc'),
      require('./ipc/settings.ipc')
    ]
    handlers.forEach(h => h.register(ipcMain, this.db, app))
  }
}

const posApp = new POSApp()
posApp.init()
