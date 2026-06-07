const { dialog } = require('electron')
const path = require('path')
const fs = require('fs')

class SettingsIPC {
  static register(ipcMain, db, app) {
    ipcMain.handle('settings:getAll', () => SettingsIPC.getAll(db))
    ipcMain.handle('settings:update', (_, data) => SettingsIPC.update(db, data))
    ipcMain.handle('settings:uploadLogo', (event) => SettingsIPC.uploadLogo(db, app, event))
    ipcMain.handle('settings:backup', (event) => SettingsIPC.backup(db, app, event))
    ipcMain.handle('settings:restore', (event) => SettingsIPC.restore(db, app, event))
  }

  static getAll(db) {
    try {
      const rows = db.prepare('SELECT key, value FROM settings').all()
      const settings = {}
      rows.forEach(r => { settings[r.key] = r.value })
      return { success: true, data: settings }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static update(db, { key, value }) {
    try {
      db.prepare(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
      ).run(key, value)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static async uploadLogo(db, app, event) {
    try {
      const { BrowserWindow } = require('electron')
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showOpenDialog(win, {
        title: 'Select Logo',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
        properties: ['openFile']
      })

      if (result.canceled || !result.filePaths.length) {
        return { success: false, message: 'No file selected' }
      }

      const srcPath = result.filePaths[0]
      const userDataPath = app.getPath('userData')
      const logoDir = path.join(userDataPath, 'logos')

      if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true })

      const ext = path.extname(srcPath)
      const destPath = path.join(logoDir, `logo${ext}`)
      fs.copyFileSync(srcPath, destPath)

      // Store as base64 for easy use
      const base64 = fs.readFileSync(destPath, { encoding: 'base64' })
      const dataUrl = `data:image/${ext.replace('.', '')};base64,${base64}`

      db.prepare(
        "UPDATE settings SET value = ? WHERE key = 'shop_logo'"
      ).run(dataUrl)

      return { success: true, logo: dataUrl }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static async backup(db, app, event) {
    try {
      const { BrowserWindow } = require('electron')
      const win = BrowserWindow.fromWebContents(event.sender)
      const date = new Date().toISOString().split('T')[0]
      const result = await dialog.showSaveDialog(win, {
        title: 'Save Backup',
        defaultPath: `pos-backup-${date}.db`,
        filters: [{ name: 'Database', extensions: ['db'] }]
      })

      if (result.canceled) return { success: false, message: 'Cancelled' }

      const userDataPath = app.getPath('userData')
      const dbPath = path.join(userDataPath, 'pos-data.db')
      fs.copyFileSync(dbPath, result.filePath)

      return { success: true, message: 'Backup saved successfully' }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static async restore(db, app, event) {
    try {
      const { BrowserWindow } = require('electron')
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showOpenDialog(win, {
        title: 'Select Backup File',
        filters: [{ name: 'Database', extensions: ['db'] }],
        properties: ['openFile']
      })

      if (result.canceled || !result.filePaths.length) {
        return { success: false, message: 'No file selected' }
      }

      const userDataPath = app.getPath('userData')
      const dbPath = path.join(userDataPath, 'pos-data.db')
      fs.copyFileSync(result.filePaths[0], dbPath)

      return { success: true, message: 'Restore successful. Please restart the app.' }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }
}

module.exports = SettingsIPC