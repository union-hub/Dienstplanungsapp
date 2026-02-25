require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs   = require('fs');
const path = require('path');

const DB_PATH    = process.env.DB_PATH    || path.join(__dirname, '../../data/dienstplan.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../data/backups');
const KEEP       = parseInt(process.env.BACKUP_KEEP || '14');

function runBackup() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      console.log('Backup: Datenbank nicht gefunden, überspringe.');
      return;
    }
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(BACKUP_DIR, `dienstplan_${ts}.db`);
    fs.copyFileSync(DB_PATH, dest);
    console.log(`✅ Backup: ${dest}`);

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('dienstplan_') && f.endsWith('.db'))
      .sort();
    while (files.length > KEEP) {
      const old = path.join(BACKUP_DIR, files.shift());
      fs.unlinkSync(old);
      console.log(`🗑 Altes Backup gelöscht: ${path.basename(old)}`);
    }
  } catch (err) {
    console.error('❌ Backup fehlgeschlagen:', err.message);
  }
}

module.exports = { runBackup };

if (require.main === module) {
  runBackup();
  process.exit(0);
}
