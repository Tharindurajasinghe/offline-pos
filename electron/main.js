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
        nodeIntegration: false,
        backgroundThrottling: false

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

      // Check for updates on launch (production only)
      if (!isDev) {
        setTimeout(() => this.checkForUpdates(), 3000)
      }
    })
  }

  checkForUpdates() {
  const { autoUpdater } = require('electron-updater')

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available.`,
      detail: 'The update will be downloaded in the background. You will be notified when it is ready to install.',
      buttons: ['OK']
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'No Update',
      message: `No update found. Installed: ${app.getVersion()}  Latest: ${info.version}`,
      buttons: ['OK']
    })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'A new update has been downloaded.',
      detail: 'Restart the app now to install the update, or install it next time you close the app.',
      buttons: ['Restart Now', 'Later']
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall()
      }
    })
  })

  autoUpdater.on('error', (err) => {
    dialog.showMessageBox(this.mainWindow, {
      type: 'error',
      title: 'Update Error',
      message: err.message,
      buttons: ['OK']
    })
  })

  autoUpdater.checkForUpdatesAndNotify()
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