const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// On Vercel, only /tmp is writable. Locally, use the project db/ directory.
const IS_VERCEL = !!process.env.VERCEL;
const DB_PATH = IS_VERCEL
  ? path.join('/tmp', 'realestate.db')
  : path.join(__dirname, 'realestate.db');

let db;
let SQL;

async function getDb() {
  if (db) return db;

  if (!SQL) {
    SQL = await initSqlJs();
  }

  // Try to load existing database file
  try {
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
  } catch {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  return db;
}

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Failed to save database:', err.message);
  }
}

async function initialize() {
  const db = await getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('building', 'standalone')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL,
      unit_number TEXT NOT NULL,
      bedrooms INTEGER DEFAULT 0,
      bathrooms INTEGER DEFAULT 0,
      square_feet INTEGER,
      rent_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'vacant' CHECK(status IN ('occupied', 'vacant')),
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      emergency_contact TEXT,
      emergency_phone TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS leases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      rent_amount REAL NOT NULL,
      payment_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK(payment_frequency IN ('monthly', 'quarterly')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired', 'pending', 'terminated')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lease_id INTEGER NOT NULL,
      amount_due REAL NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0,
      due_date DATE NOT NULL,
      paid_date DATE,
      payment_method TEXT CHECK(payment_method IN ('cash', 'check', 'bank_transfer', 'credit_card', 'other')),
      late_fee REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('paid', 'partial', 'overdue', 'pending')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lease_id) REFERENCES leases(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id INTEGER NOT NULL,
      tenant_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'completed', 'closed')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
    )
  `);

  // Seed default admin user if none exists
  const result = db.exec('SELECT COUNT(*) as count FROM users');
  const userCount = result[0].values[0][0];
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO users (username, password_hash, name) VALUES (?, ?, ?)', ['admin', hash, 'Administrator']);
  }

  saveDb();
  return db;
}

// Helper: sql.js returns {columns, values} arrays. This converts to objects like better-sqlite3 did.
function queryAll(sql, params = []) {
  const d = db;
  const stmt = d.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryGet(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : undefined;
}

function queryRun(sql, params = []) {
  db.run(sql, params);
  saveDb();
  return { lastInsertRowid: db.exec('SELECT last_insert_rowid()')[0].values[0][0] };
}

module.exports = { getDb, initialize, saveDb, queryAll, queryGet, queryRun };
