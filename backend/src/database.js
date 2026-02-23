const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/dienstplan.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    -- Benutzer & Rollen
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('leitung','teamleitung','mitarbeitende')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Wohnbereiche
    CREATE TABLE IF NOT EXISTS wohnbereiche (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kuerzel TEXT NOT NULL,
      min_besetzung_tag INTEGER DEFAULT 2,
      min_besetzung_nacht INTEGER DEFAULT 1,
      min_fachkraft_quote REAL DEFAULT 0.5
    );

    -- Qualifikationen (frei definierbar)
    CREATE TABLE IF NOT EXISTS qualifikationen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kuerzel TEXT NOT NULL,
      ist_fachkraft INTEGER DEFAULT 0
    );

    -- Mitarbeitende
    CREATE TABLE IF NOT EXISTS mitarbeitende (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      vorname TEXT NOT NULL,
      nachname TEXT NOT NULL,
      kuerzel TEXT NOT NULL,
      wohnbereich_id INTEGER REFERENCES wohnbereiche(id),
      vertragsarbeitszeit_pro_woche REAL DEFAULT 39.0,
      ueberstunden_stand REAL DEFAULT 0.0,
      darf_allein_nacht INTEGER DEFAULT 1,
      aktiv INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Mitarbeitende <-> Qualifikationen
    CREATE TABLE IF NOT EXISTS mitarbeitende_qualifikationen (
      mitarbeitende_id INTEGER REFERENCES mitarbeitende(id) ON DELETE CASCADE,
      qualifikation_id INTEGER REFERENCES qualifikationen(id) ON DELETE CASCADE,
      PRIMARY KEY (mitarbeitende_id, qualifikation_id)
    );

    -- Bewohner*innen
    CREATE TABLE IF NOT EXISTS bewohner (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vorname TEXT NOT NULL,
      nachname TEXT NOT NULL,
      kuerzel TEXT NOT NULL,
      wohnbereich_id INTEGER REFERENCES wohnbereiche(id),
      unterstuetzungsbedarf TEXT,
      benoetigt_eins_zu_eins INTEGER DEFAULT 0,
      nachtaufsicht_erforderlich INTEGER DEFAULT 0,
      aktiv INTEGER DEFAULT 1
    );

    -- Einsatzrestriktionen (Bewohner <-> Mitarbeitende)
    CREATE TABLE IF NOT EXISTS einsatzrestriktionen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bewohner_id INTEGER REFERENCES bewohner(id) ON DELETE CASCADE,
      mitarbeitende_id INTEGER REFERENCES mitarbeitende(id) ON DELETE CASCADE,
      typ TEXT NOT NULL CHECK(typ IN ('verboten','pflicht')),
      grund TEXT
    );

    -- Dienstvorlagen (Templates)
    CREATE TABLE IF NOT EXISTS dienstvorlagen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wohnbereich_id INTEGER REFERENCES wohnbereiche(id),
      name TEXT NOT NULL,
      beginn TEXT NOT NULL,
      ende TEXT NOT NULL,
      art TEXT NOT NULL CHECK(art IN ('praesenz','bereitschaft','rufbereitschaft','nachtwache')),
      ueberlappung_minuten INTEGER DEFAULT 0,
      min_besetzung INTEGER DEFAULT 1,
      min_fachkraefte INTEGER DEFAULT 1,
      farbe TEXT DEFAULT '#3B82F6'
    );

    -- Dienstpläne
    CREATE TABLE IF NOT EXISTS dienstplaene (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wohnbereich_id INTEGER REFERENCES wohnbereiche(id),
      jahr INTEGER NOT NULL,
      monat INTEGER NOT NULL,
      status TEXT DEFAULT 'entwurf' CHECK(status IN ('entwurf','freigegeben','archiviert')),
      erstellt_von INTEGER REFERENCES users(id),
      erstellt_am TEXT DEFAULT (datetime('now')),
      UNIQUE(wohnbereich_id, jahr, monat)
    );

    -- Dienste (konkrete Einträge im Plan)
    CREATE TABLE IF NOT EXISTS dienste (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dienstplan_id INTEGER REFERENCES dienstplaene(id) ON DELETE CASCADE,
      dienstvorlage_id INTEGER REFERENCES dienstvorlagen(id),
      mitarbeitende_id INTEGER REFERENCES mitarbeitende(id),
      datum TEXT NOT NULL,
      beginn TEXT NOT NULL,
      ende TEXT NOT NULL,
      art TEXT NOT NULL CHECK(art IN ('praesenz','bereitschaft','rufbereitschaft','nachtwache')),
      ist_krank INTEGER DEFAULT 0,
      ist_urlaub INTEGER DEFAULT 0,
      notiz TEXT,
      erstellt_am TEXT DEFAULT (datetime('now'))
    );

    -- Regelwarnungen (Cache der letzten Prüfung)
    CREATE TABLE IF NOT EXISTS regelwarnungen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dienstplan_id INTEGER REFERENCES dienstplaene(id) ON DELETE CASCADE,
      datum TEXT,
      typ TEXT NOT NULL,
      schwere TEXT CHECK(schwere IN ('fehler','warnung','info')),
      meldung TEXT NOT NULL,
      betroffen_mitarbeitende_id INTEGER REFERENCES mitarbeitende(id),
      betroffen_bewohner_id INTEGER REFERENCES bewohner(id),
      erstellt_am TEXT DEFAULT (datetime('now'))
    );

    -- Änderungsprotokoll
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tabelle TEXT NOT NULL,
      datensatz_id INTEGER NOT NULL,
      aktion TEXT NOT NULL CHECK(aktion IN ('erstellt','geaendert','geloescht')),
      benutzer_id INTEGER REFERENCES users(id),
      vorher TEXT,
      nachher TEXT,
      zeitstempel TEXT DEFAULT (datetime('now'))
    );

    -- Tauschbörse
    CREATE TABLE IF NOT EXISTS tauschbörse (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dienst_id INTEGER REFERENCES dienste(id),
      angefragt_von INTEGER REFERENCES mitarbeitende(id),
      angeboten_dienst_id INTEGER REFERENCES dienste(id),
      status TEXT DEFAULT 'offen' CHECK(status IN ('offen','angenommen','abgelehnt','zurueckgezogen')),
      erstellt_am TEXT DEFAULT (datetime('now'))
    );
  `);
}

module.exports = { getDb };
