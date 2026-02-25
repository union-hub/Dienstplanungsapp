/**
 * SQLite-Wrapper auf Basis von sql.js (reines JavaScript, kein nativer Code).
 * Bietet eine synchrone API ähnlich better-sqlite3.
 */
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../../data/dienstplan.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let _db = null;
let _SQL = null;

function getDb() {
  if (_db) return _db;
  throw new Error('Datenbank nicht initialisiert. Warte auf initDb().');
}

// Führt fehlende Spalten-Migrationen durch (ALTER TABLE ADD COLUMN falls nicht vorhanden)
function runMigrations() {
  const migrations = [
    { table: 'users',     column: 'active',         def: 'INTEGER NOT NULL DEFAULT 1' },
    { table: 'shifts',    column: 'break_minutes',   def: 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'employees', column: 'can_do_nightshift_alone', def: 'INTEGER NOT NULL DEFAULT 1' },
  ];

  for (const { table, column, def } of migrations) {
    try {
      const cols = _db.exec(`PRAGMA table_info(${table})`);
      if (!cols.length || !cols[0].values) continue;
      const exists = cols[0].values.some(row => row[1] === column);
      if (!exists) {
        _db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${def};`);
        console.log(`✅ Migration: ${table}.${column} hinzugefügt`);
        persist();
      }
    } catch (e) {
      console.warn(`Migration ${table}.${column} übersprungen:`, e.message);
    }
  }
}

async function initDb() {
  if (_db) return _db;
  _SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    _db = new _SQL.Database(fileBuffer);
  } else {
    _db = new _SQL.Database();
  }
  _db.run('PRAGMA foreign_keys = ON;');
  runMigrations();
  return _db;
}

function persist() {
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

const db = {
  prepare(sql) {
    return {
      run(...params) {
        const stmt = getDb().prepare(sql);
        stmt.bind(flatParams(params));
        stmt.step();
        stmt.free();
        const lastId = getDb().exec('SELECT last_insert_rowid() as id')[0]?.values[0][0] || 0;
        const changes = getDb().exec('SELECT changes()')[0]?.values[0][0] || 0;
        persist();
        return { lastInsertRowid: lastId, changes };
      },
      get(...params) {
        const stmt = getDb().prepare(sql);
        stmt.bind(flatParams(params));
        if (!stmt.step()) { stmt.free(); return undefined; }
        const row = stmtToObject(stmt);
        stmt.free();
        return row;
      },
      all(...params) {
        const stmt = getDb().prepare(sql);
        stmt.bind(flatParams(params));
        const rows = [];
        while (stmt.step()) rows.push(stmtToObject(stmt));
        stmt.free();
        return rows;
      }
    };
  },

  exec(sql) {
    getDb().run(sql);
    persist();
    return [];
  },

  pragma(str) {
    try { getDb().run(`PRAGMA ${str};`); } catch {}
  },

  transaction(fn) {
    return (...args) => {
      getDb().run('BEGIN;');
      try {
        const result = fn(...args);
        getDb().run('COMMIT;');
        persist();
        return result;
      } catch (e) {
        getDb().run('ROLLBACK;');
        throw e;
      }
    };
  }
};

function flatParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

function stmtToObject(stmt) {
  const cols = stmt.getColumnNames();
  const vals = stmt.get();
  const obj = {};
  cols.forEach((c, i) => { obj[c] = vals[i]; });
  return obj;
}

module.exports = { db, initDb };
