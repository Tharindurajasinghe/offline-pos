const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')

const isDev = !app.isPackaged

class POSApp {
  constructor() {
    this.mainWindow = null
    this.db = null
    this.openDialogs = 0        // ── FOCUS FIX ── how many native dialogs are open
    this.focusWatchdog = null
    this.focusLog = false       // set true to write a diagnostic log (see below)
  }

  // ── FOCUS FIX ── Wrap every native dialog so we know when one is genuinely
  // open. Windows DISABLES the parent window while a modal dialog owns it; if
  // the dialog goes away without re-enabling it, the window stops accepting
  // mouse AND keyboard input while still looking perfectly normal.
  async withDialog(fn) {
    this.openDialogs++
    try {
      return await fn()
    } finally {
      this.openDialogs--
      this.repairWindow()
    }
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

  // ── FOCUS FIX (GLOBAL CATCH-ALL) ──────────────────────────────────────────
  // Keyboard input is dead in exactly one detectable state: the window HAS OS
  // focus, but the web page inside it does NOT. Whatever caused it (native
  // dialog, print popup, menu bar, updater toast), the symptom is the same and
  // so is the repair. Detect that state and fix it, instead of chasing triggers.
  ensureRendererFocus() {
    this.repairWindow()
  }

  // The real repair. Handles BOTH failure modes:
  //   (a) window disabled by a vanished modal dialog -> no mouse, no keyboard
  //   (b) webContents unfocused                      -> no keyboard only
  repairWindow() {
    const w = this.mainWindow
    if (!w || w.isDestroyed()) return
    if (!w.isVisible() || w.isMinimized()) return

    try {
      // (a) Never leave the window disabled once no dialog is actually open.
      //     This is the fix for "mouse clicks do nothing either".
      if (this.openDialogs === 0) {
        w.setEnabled(true)
      }

      // (b) Close orphaned print popups. window.open() popups were never closed
      //     in the original code; an invisible/stale one sitting on top will eat
      //     every click meant for the main window.
      for (const child of BrowserWindow.getAllWindows()) {
        if (child === w || child.isDestroyed()) continue
        if (!child.isVisible()) child.destroy()
      }

      // (c) Re-arm keyboard focus.
      if (w.isFocused() && !w.webContents.isFocused()) {
        w.webContents.focus()
      }
    } catch (_) {}
  }

  // ── DIAGNOSTIC ── Set this.focusLog = true in the constructor to record the
  // real focus state once a second. Reproduce the bug, then send me the file:
  //     %APPDATA%\POS System\focus-log.txt
  logFocusState() {
    if (!this.focusLog) return
    const w = this.mainWindow
    if (!w || w.isDestroyed()) return
    try {
      const fs = require('fs')
      const wins = BrowserWindow.getAllWindows().map(b => ({
        id: b.id,
        visible: b.isVisible(),
        focused: b.isFocused(),
        title: b.getTitle()
      }))
      const line = JSON.stringify({
        t: new Date().toISOString(),
        winFocused: w.isFocused(),
        pageFocused: w.webContents.isFocused(),
        openDialogs: this.openDialogs,
        windowCount: wins.length,
        wins
      }) + '\n'
      fs.appendFileSync(
        path.join(app.getPath('userData'), 'focus-log.txt'),
        line
      )
    } catch (_) {}
  }

  // Runs continuously — cheap (two boolean checks), and repairs the window
  // within a second no matter what stole focus.
  startFocusWatchdog() {
    this.stopFocusWatchdog()
    this.focusWatchdog = setInterval(() => {
      this.repairWindow()
      this.logFocusState()
    }, 1000)
  }

  stopFocusWatchdog() {
    if (this.focusWatchdog) {
      clearInterval(this.focusWatchdog)
      this.focusWatchdog = null
    }
  }

  // ── FOCUS FIX ── Reusable helper.
  // Reproduces the "click the taskbar and come back" cycle that restores
  // keyboard input, but programmatically. Call after anything that steals
  // focus from the renderer (print popups, native dialogs, alert/confirm).
  refocusMain() {
    const w = this.mainWindow
    if (!w || w.isDestroyed()) return

    const cycle = () => {
      if (!w || w.isDestroyed()) return
      try {
        if (w.isMinimized()) w.restore()
        // app.focus() brings the app forward on Windows; blur+focus forces the
        // OS deactivate -> activate cycle that actually re-arms keyboard input.
        app.focus({ steal: true })
        w.blur()
        w.focus()
        w.webContents.focus()
      } catch (_) {}
    }

    cycle()
    // Windows sometimes swallows the first cycle while a dialog is still
    // tearing down — retry once on the next tick.
    setTimeout(cycle, 80)
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

    this.mainWindow.on('closed', () => {
      this.stopFocusWatchdog()
      this.mainWindow = null
    })

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show()
      this.mainWindow.maximize()

      // ── FOCUS FIX ── Ensure the renderer has keyboard focus on first paint
      this.mainWindow.focus()
      this.mainWindow.webContents.focus()

      // ── FOCUS FIX ── Start the global watchdog
      this.startFocusWatchdog()

      if (!isDev) {
        setTimeout(() => this.checkForUpdates(), 3000)
      }
    })

    // Fix: refocus renderer when window gains OS focus
    this.mainWindow.on('focus', () => {
      this.mainWindow.webContents.focus()
    })

    // ── FOCUS FIX ── The default app menu (File/Edit/View/Window) is a focus
    // trap on Windows: pressing Alt moves keyboard focus INTO the menu bar and
    // the page stops receiving keystrokes until the window is re-activated.
    // A POS has no use for it, and removing it also closes the DevTools hole
    // that let cashiers call privileged IPC directly.
    if (!isDev) {
      Menu.setApplicationMenu(null)
      this.mainWindow.setMenuBarVisibility(false)

      // Swallow the keys that would open the menu / devtools
      this.mainWindow.webContents.on('before-input-event', (event, input) => {
        const key = (input.key || '').toLowerCase()
        if (key === 'alt' || key === 'f10') {
          event.preventDefault()
        }
        if (key === 'f12' || (input.control && input.shift && key === 'i')) {
          event.preventDefault()
        }
      })
    }

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
      // ── FOCUS FIX ── tracked, so the window is always re-enabled afterwards
      this.withDialog(() => dialog.showMessageBox(this.mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} is available.`,
        detail: 'The update will be downloaded in the background. You will be notified when it is ready to install.',
        buttons: ['OK']
      })).then(() => this.refocusMain())
    })

    autoUpdater.on('update-downloaded', () => {
      // ── FOCUS FIX ── tracked, so the window is always re-enabled afterwards
      this.withDialog(() => dialog.showMessageBox(this.mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: 'A new update has been downloaded.',
        detail: 'Restart the app now to install the update, or install it next time you close the app.',
        buttons: ['Restart Now', 'Later']
      })).then(result => {
        if (result && result.response === 0) {
          autoUpdater.quitAndInstall()
        }
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
      require('./ipc/order.ipc'),       // ── ORDERS ──
      require('./ipc/return.ipc'),      // ── RETURNS ──
    ]
    handlers.forEach(h => h.register(ipcMain, this.db, app))
    ipcMain.handle('app:getVersion', () => app.getVersion())

    // ── FOCUS FIX ── Optional manual fallback the renderer can call.
    // Requires adding to preload.js:  refocus: () => ipcRenderer.invoke('window:refocus'),
    ipcMain.handle('window:refocus', () => this.refocusMain())

    // ── FOCUS FIX ── Lightweight: only acts if the page has actually lost
    // keyboard focus. Safe to call on every click.
    ipcMain.handle('window:ensureFocus', () => this.ensureRendererFocus())
  }
}

const posApp = new POSApp()
posApp.init()