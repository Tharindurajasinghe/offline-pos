// electron/ipc/backup.ipc.js
// ── AUTO BACKUP ──
// Copies pos-data.db into a chosen folder (typically a Google Drive for Desktop
// folder, so Google syncs it to the cloud). Single file, overwritten each run.
// Runs automatically at most once every 2 days, and can be run manually.

const BACKUP_FILENAME = 'POS_Backup.db'
const INTERVAL_MS = 2 * 24 * 60 * 60 * 1000   // 2 days

class BackupIPC {
  static register(ipcMain, db, app) {
    BackupIPC.db = db
    BackupIPC.app = app

    ipcMain.handle('backup:getStatus', () => BackupIPC.getStatus(db))
    ipcMain.handle('backup:saveSettings', (_, data) => BackupIPC.saveSettings(db, data))
    ipcMain.handle('backup:chooseFolder', () => BackupIPC.chooseFolder())
    ipcMain.handle('backup:run', () => BackupIPC.run(db, app, true))   // manual
    // (auto-run is invoked from main.js on startup, not via IPC)
  }

  static slNowStr() {
    return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').substring(0, 19)
  }

  static getSetting(db, key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return row ? row.value : ''
  }

  static getStatus(db) {
    try {
      return {
        success: true,
        folder: BackupIPC.getSetting(db, 'backup_folder') || '',
        enabled: BackupIPC.getSetting(db, 'backup_enabled') === '1',
        lastAt: BackupIPC.getSetting(db, 'backup_last_at') || ''
      }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  static saveSettings(db, { folder, enabled }) {
    try {
      const up = db.prepare(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `)
      up.run('backup_folder', folder || '')
      up.run('backup_enabled', enabled ? '1' : '0')
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  // Open a folder picker so the shop can browse to their Google Drive folder
  static async chooseFolder() {
    try {
      const { dialog } = require('electron')
      const res = await dialog.showOpenDialog({
        title: 'Choose backup folder (e.g. your Google Drive folder)',
        properties: ['openDirectory', 'createDirectory']
      })
      if (res.canceled || !res.filePaths.length) return { success: false, canceled: true }
      return { success: true, folder: res.filePaths[0] }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  // The actual copy. manual=true forces it regardless of the 2-day timer.
  static run(db, app, manual = false) {
    try {
      const fs = require('fs')
      const path = require('path')

      const enabled = BackupIPC.getSetting(db, 'backup_enabled') === '1'
      const folder = BackupIPC.getSetting(db, 'backup_folder')

      if (!manual && !enabled) return { success: false, message: 'Auto backup is off' }
      if (!folder) return { success: false, message: 'No backup folder set' }
      if (!fs.existsSync(folder)) {
        return { success: false, message: `Backup folder not found:\n${folder}\n(Is Google Drive Desktop running?)` }
      }

      // Flush the WAL into the main .db file so the copy is complete/consistent
      try { db.pragma('wal_checkpoint(TRUNCATE)') } catch (_) {}

      const dbPath = path.join(app.getPath('userData'), 'pos-data.db')
      if (!fs.existsSync(dbPath)) return { success: false, message: 'Database file not found' }

      const dest = path.join(folder, BACKUP_FILENAME)
      // Write to a temp file first, then rename — avoids a half-written backup
      // (and avoids Google syncing a partial file).
      const tmp = dest + '.tmp'
      fs.copyFileSync(dbPath, tmp)
      fs.renameSync(tmp, dest)   // overwrites the previous backup

      const now = BackupIPC.slNowStr()
      db.prepare(`
        INSERT INTO settings (key, value) VALUES ('backup_last_at', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(now)

      return { success: true, path: dest, at: now }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  // Called from main.js on startup: back up only if enabled AND 2+ days passed.
  static autoRunIfDue(db, app) {
    try {
      if (BackupIPC.getSetting(db, 'backup_enabled') !== '1') return
      const lastStr = BackupIPC.getSetting(db, 'backup_last_at')
      if (lastStr) {
        // stored as SL time string; compare against SL "now"
        const last = new Date(lastStr.replace(' ', 'T') + '+05:30').getTime()
        const nowMs = Date.now()
        if (!isNaN(last) && (nowMs - last) < INTERVAL_MS) return   // not due yet
      }
      BackupIPC.run(db, app, false)
    } catch (_) { /* never block startup on a backup error */ }
  }
}

module.exports = BackupIPC