const { app } = require('electron');
const Database = require('better-sqlite3');
const path = require('path');

app.whenReady().then(() => {
  const dbPath = path.join('C:', 'Users', 'THARINDU', 'AppData', 'Roaming', 'pos-system', 'pos-data.db');
  const db = new Database(dbPath);

  const result = db.prepare(`
    UPDATE customer_payments
    SET paid_at = datetime('now','+5 hours 30 minutes')
    WHERE paid_at IS NULL
  `).run();

  console.log('Rows updated:', result.changes);

  console.log(db.prepare('SELECT * FROM customer_payments').all());

  app.quit();
});