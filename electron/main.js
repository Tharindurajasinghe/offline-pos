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

  // ── FOCUS FIX ── Reusable helper.
  // Reproduces the "click the taskbar and come back" cycle that restores
  // keyboard input, but programmatically. Call after anything that steals
  // focus from the renderer (print popups, native dialogs).
  refocusMain() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.blur()
    this.mainWindow.focus()
    this.mainWindow.webContents.focus()
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
        backgroundThrottling: false,
        offscreen: false,
        webSecurity: true
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

      // ── FOCUS FIX ── Ensure the renderer has keyboard focus on first paint
      this.mainWindow.webContents.focus()

      if (!isDev) {
        setTimeout(() => this.checkForUpdates(), 3000)
      }
    })

    // Fix: refocus renderer when window gains OS focus
    this.mainWindow.on('focus', () => {
      this.mainWindow.webContents.focus()
    })

    // Fix: refocus after internal navigation (logout → login etc)
    this.mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.focus()
        }
      }, 100)
    })

    // Fix: refocus after restore from minimize
    this.mainWindow.on('restore', () => {
      setTimeout(() => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.focus()
        }
      }, 100)
    })

    // Allow window.open() popups for bill print preview
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 400,
          height: 600,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
          }
        }
      }
    })

    // ── FOCUS FIX (main one) ──
    // Every print/report popup (printBill, DayEnd, CheckBill, Summary,
    // Customer, Barcode) goes through window.open(), so this single handler
    // covers all six. It auto-closes the preview once the OS print dialog is
    // dismissed, then hands keyboard focus back to the main renderer.
    this.mainWindow.webContents.on('did-create-window', (childWindow) => {
      childWindow.webContents.on('did-finish-load', () => {
        childWindow.webContents
          .executeJavaScript('window.onafterprint = () => window.close()')
          .catch(() => {})
      })

      childWindow.on('closed', () => {
        this.refocusMain()
      })
    })
  }

  checkForUpdates() {
    const { autoUpdater } = require('electron-updater')

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      dialog.showMessageBox(this.mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} is available.`,
        detail: 'The update will be downloaded in the background. You will be notified when it is ready to install.',
        buttons: ['OK']
      }).then(() => {
        // ── FOCUS FIX ── Native dialogs leave the renderer unfocused
        this.refocusMain()
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
        // ── FOCUS FIX ── Refocus whether they chose Restart or Later
        this.refocusMain()
      })
    })

    autoUpdater.on('error', (err) => {
      console.error('Auto updater error:', err.message)
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
      require('./ipc/settings.ipc'),
      require('./ipc/customer.ipc'),
      require('./ipc/invoice.ipc'),
      require('./ipc/quicksale.ipc'),   // ── QUICK SALE ──
    ]
    handlers.forEach(h => h.register(ipcMain, this.db, app))
    ipcMain.handle('app:getVersion', () => app.getVersion())

    // ── FOCUS FIX ── Optional manual fallback the renderer can call.
    // Requires adding to preload.js:  refocus: () => ipcRenderer.invoke('window:refocus'),
    ipcMain.handle('window:refocus', () => this.refocusMain())
  }
}

const posApp = new POSApp()
posApp.init()