class Migrations {
  static run(db) {
    // Get current version
    db.exec(`
      CREATE TABLE IF NOT EXISTS db_version (
        version INTEGER PRIMARY KEY
      )
    `)
    const row = db.prepare('SELECT version FROM db_version').get()
    const currentVersion = row ? row.version : 0

    if (currentVersion < 1) {
      // v1 - initial schema (handled by schema.js)
      db.prepare('INSERT OR REPLACE INTO db_version (version) VALUES (1)').run()
    }

    // Future migrations go here as:
    // if (currentVersion < 2) { ... }
  }
}

module.exports = Migrations