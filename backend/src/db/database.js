const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../../data/dienstplan.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('leitung','teamleitung','mitarbeitende')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qualifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_fachkraft INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  short_code TEXT UNIQUE NOT NULL,
  contract_hours REAL NOT NULL DEFAULT 39,
  overtime_balance REAL NOT NULL DEFAULT 0,
  can_do_nightshift_alone INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employee_qualifications (
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  qualification_id INTEGER REFERENCES qualifications(id) ON DELETE CASCADE,
  PRIMARY KEY (employee_id, qualification_id)
);

CREATE TABLE IF NOT EXISTS residents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  short_code TEXT UNIQUE NOT NULL,
  support_level INTEGER NOT NULL DEFAULT 1 CHECK(support_level BETWEEN 1 AND 5),
  needs_1to1 INTEGER NOT NULL DEFAULT 0,
  needs_night_supervision INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resident_restrictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  restriction_type TEXT NOT NULL CHECK(restriction_type IN ('forbidden','required')),
  reason TEXT,
  UNIQUE(resident_id, employee_id)
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  week_start TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  shift_type TEXT NOT NULL CHECK(shift_type IN ('frueh','spaet','nacht','bereitschaft','rufbereitschaft')),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  min_staff INTEGER NOT NULL DEFAULT 1,
  min_fachkraft INTEGER NOT NULL DEFAULT 1,
  label TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  is_sick INTEGER NOT NULL DEFAULT 0,
  replacement_for INTEGER REFERENCES assignments(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(shift_id, employee_id)
);

CREATE TABLE IF NOT EXISTS schedule_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  changed_by INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS swap_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_assignment_id INTEGER NOT NULL REFERENCES assignments(id),
  target_assignment_id INTEGER REFERENCES assignments(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','accepted','rejected')),
  created_at TEXT DEFAULT (datetime('now'))
);
`;

db.exec(schema);

module.exports = db;
