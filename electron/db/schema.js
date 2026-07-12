class Schema {
  static initialize(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS trial (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        install_date TEXT NOT NULL,
        is_activated INTEGER DEFAULT 0,
        activation_key TEXT
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        token TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes')),
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        action TEXT NOT NULL,
        details TEXT,
        created_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes'))
      );

      CREATE TABLE IF NOT EXISTS login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        attempted_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes')),
        ip TEXT
      );

      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes'))
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes')),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      );

      CREATE TABLE IF NOT EXISTS variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT 'Standard',
        unit TEXT DEFAULT 'unit',
        stock REAL DEFAULT 0,
        low_stock_threshold REAL DEFAULT 5,
        buying_price REAL DEFAULT 0,
        selling_price REAL DEFAULT 0,
        barcode TEXT UNIQUE,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes')),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS variant_expiry_dates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        variant_id INTEGER NOT NULL,
        expire_date TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes')),
        FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS stock_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        variant_id INTEGER NOT NULL,
        adjustment REAL NOT NULL,
        reason TEXT,
        adjusted_by TEXT,
        created_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes')),
        FOREIGN KEY (variant_id) REFERENCES variants(id)
      );

      CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_number TEXT UNIQUE NOT NULL,
        customer_name TEXT,
        subtotal REAL DEFAULT 0,
        total_discount REAL DEFAULT 0,
        grand_total REAL DEFAULT 0,
        cash_paid REAL DEFAULT 0,
        change_amount REAL DEFAULT 0,
        billed_by TEXT,
        bill_date TEXT DEFAULT (datetime('now','+5 hours 30 minutes')),
        day_label TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes'))
      );

      CREATE TABLE IF NOT EXISTS bill_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        product_code TEXT NOT NULL,
        product_name TEXT NOT NULL,
        variant_id INTEGER NOT NULL,
        variant_name TEXT NOT NULL,
        unit TEXT NOT NULL,
        qty REAL NOT NULL,
        original_price REAL NOT NULL,
        sold_price REAL NOT NULL,
        is_price_edited INTEGER DEFAULT 0,
        discount_amount REAL DEFAULT 0,
        line_total REAL NOT NULL,
        FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS cart_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        cart_data TEXT NOT NULL,
        customer_name TEXT,
        updated_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes'))
      );

      CREATE TABLE IF NOT EXISTS daily_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day_label TEXT UNIQUE NOT NULL,
        total_bills INTEGER DEFAULT 0,
        total_income REAL DEFAULT 0,
        total_profit REAL DEFAULT 0,
        total_discount REAL DEFAULT 0,
        ended_manually INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes'))
      );

      CREATE TABLE IF NOT EXISTS daily_summary_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        summary_id INTEGER NOT NULL,
        product_code TEXT NOT NULL,
        product_name TEXT NOT NULL,
        variant_name TEXT NOT NULL,
        sold_qty REAL DEFAULT 0,
        total_income REAL DEFAULT 0,
        total_profit REAL DEFAULT 0,
        FOREIGN KEY (summary_id) REFERENCES daily_summary(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS monthly_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        month_label TEXT UNIQUE NOT NULL,
        total_bills INTEGER DEFAULT 0,
        total_income REAL DEFAULT 0,
        total_profit REAL DEFAULT 0,
        total_discount REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes'))
      );

      CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      address1 TEXT DEFAULT '',
      address2 TEXT DEFAULT '',
      credit_limit REAL DEFAULT NULL,
      total_pending REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes'))
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL,
      company_name TEXT DEFAULT '',
      invoice_date TEXT NOT NULL,
      cheque_no TEXT DEFAULT '',
      cheque_date TEXT DEFAULT '',
      total_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes'))
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customer_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      note TEXT DEFAULT '',
      paid_at TEXT DEFAULT (datetime('now','+5 hours 30 minutes')),
      recorded_by TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
    `)

    try {
  db.exec(`ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '["billing"]'`)
} catch (_) {}
try {
  db.exec(`INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_bio', '')`)
} catch (_) {}
try { db.exec(`ALTER TABLE bills ADD COLUMN customer_id INTEGER DEFAULT NULL`) } catch (_) {}
try { db.exec(`ALTER TABLE bills ADD COLUMN is_customer_bill INTEGER DEFAULT 0`) } catch (_) {}
try { db.exec(`ALTER TABLE bills ADD COLUMN bill_status TEXT DEFAULT 'paid'`) } catch (_) {}
try { db.exec(`INSERT OR IGNORE INTO settings (key, value) VALUES ('default_credit_limit', '5000')`) } catch (_) {}

// ── H5 FIX ── snapshot the cost at sale time so editing a product's buying
// price no longer rewrites past profit
try { db.exec(`ALTER TABLE bill_items ADD COLUMN buying_price REAL DEFAULT NULL`) } catch (_) {}

// ── WHOLESALE FEATURE ──
// Per-variant wholesale price (0 = not set → falls back to retail price)
try { db.exec(`ALTER TABLE variants ADD COLUMN wholesale_price REAL DEFAULT 0`) } catch (_) {}
// Marks an entire bill as a wholesale bill
try { db.exec(`ALTER TABLE bills ADD COLUMN is_wholesale INTEGER DEFAULT 0`) } catch (_) {}

    Schema.seedSettings(db)
    Schema.initTrial(db)
  }

  static seedSettings(db) {
    const defaults = [
      ['shop_name', 'DEMO'],
      ['shop_bio', ''],
      ['shop_address', ''],
      ['shop_tel', ''],
      ['shop_logo', ''],
      ['bill_thank_you', 'Thank you for your purchase!'],
      ['currency', 'Rs.'],
      ['low_stock_threshold', '5'],
      ['expiry_warning_days', '30'],
      ['printer_name', ''],
      ['bill_counter', '10000']
    ]
    const insert = db.prepare(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
    )
    defaults.forEach(([key, value]) => insert.run(key, value))
  }

  static initTrial(db) {
    const existing = db.prepare('SELECT id FROM trial WHERE id = 1').get()
    if (!existing) {
      const now = new Date().toISOString()
      db.prepare(
        'INSERT INTO trial (id, install_date, is_activated) VALUES (1, ?, 0)'
      ).run(now)
    }
  }
}

module.exports = Schema