const { initDb, db } = require('./database');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function run() {
  await initDb();

  // Schema erstellen
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // sql.js: run each statement separately
  schema.split(';').map(s => s.trim()).filter(Boolean).forEach(s => {
    try { db.prepare(s + ';').run(); } catch (e) { /* ignore already exists */ }
  });

  // Bestehende Daten löschen
  [
    'swap_requests','schedule_history','assignments','shifts','schedules',
    'resident_restrictions','residents','employee_qualifications','employees',
    'qualifications','users'
  ].forEach(t => { try { db.prepare(`DELETE FROM ${t}`).run(); } catch {} });

  const pw = bcrypt.hashSync('demo1234', 10);
  const iU = (email, role) => db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run(email, pw, role).lastInsertRowid;
  const uLeitung  = iU('leitung@demo.de',     'leitung');
  const uTeam     = iU('teamleitung@demo.de', 'teamleitung');
  const uMa1      = iU('ma1@demo.de',         'mitarbeitende');
  const uMa2      = iU('ma2@demo.de',         'mitarbeitende');
  const uMa3      = iU('ma3@demo.de',         'mitarbeitende');
  const uMa4      = iU('ma4@demo.de',         'mitarbeitende');

  const iQ = (name, desc, fk) => db.prepare('INSERT INTO qualifications (name, description, is_fachkraft) VALUES (?, ?, ?)').run(name, desc, fk).lastInsertRowid;
  const qHeil   = iQ('Heilerziehungspfleger*in', 'Staatlich anerkannte Fachkraft HEP', 1);
  const qErz    = iQ('Erzieher*in', 'Staatlich anerkannte Fachkraft', 1);
  const qPflege = iQ('Pflegefachkraft', 'Examinierte Pflegefachkraft', 1);
  const qAssist = iQ('Assistenzkraft', 'Angelernte Assistenzkraft', 0);
  const qNacht  = iQ('Nachtwachenberechtigung', 'Berechtigt für alleinige Nachtwache', 0);

  const iE = (uid, fn, ln, code, h, night, ot) =>
    db.prepare('INSERT INTO employees (user_id,first_name,last_name,short_code,contract_hours,can_do_nightshift_alone,overtime_balance) VALUES (?,?,?,?,?,?,?)')
      .run(uid, fn, ln, code, h, night, ot).lastInsertRowid;
  const e1 = iE(uLeitung, 'Anna',  'Schreiber', 'AS', 39, 1,  2.5);
  const e2 = iE(uTeam,    'Ben',   'Müller',    'BM', 39, 1, -1.0);
  const e3 = iE(uMa1,    'Clara', 'Weber',     'CW', 30, 1,  0.0);
  const e4 = iE(uMa2,    'David', 'Fischer',   'DF', 20, 0,  4.0);
  const e5 = iE(uMa3,    'Eva',   'Bauer',     'EB', 39, 1,  0.0);
  const e6 = iE(uMa4,    'Frank', 'Koch',      'FK', 30, 1,  1.5);

  const iEQ = (eid, qid) => db.prepare('INSERT OR IGNORE INTO employee_qualifications VALUES (?, ?)').run(eid, qid);
  iEQ(e1,qHeil); iEQ(e1,qNacht);
  iEQ(e2,qErz);  iEQ(e2,qNacht);
  iEQ(e3,qHeil); iEQ(e3,qNacht);
  iEQ(e4,qAssist);
  iEQ(e5,qPflege); iEQ(e5,qNacht);
  iEQ(e6,qAssist);

  const iR = (fn, ln, code, sl, o1, ns, notes) =>
    db.prepare('INSERT INTO residents (first_name,last_name,short_code,support_level,needs_1to1,needs_night_supervision,notes) VALUES (?,?,?,?,?,?,?)')
      .run(fn, ln, code, sl, o1, ns, notes).lastInsertRowid;
  const r1 = iR('Max',   'Mustermann', 'MM', 3, 0, 1, 'Nächtliche Unruhe möglich');
  const r2 = iR('Lena',  'Müller',    'LM', 4, 1, 1, '1:1 Begleitung bei Aktivitäten');
  const r3 = iR('Peter', 'Schmidt',   'PS', 2, 0, 0, '');
  const r4 = iR('Maria', 'Braun',     'MB', 5, 1, 1, 'Hoher Pflegebedarf');

  db.prepare('INSERT INTO resident_restrictions (resident_id,employee_id,restriction_type,reason) VALUES (?,?,?,?)')
    .run(r2, e4, 'forbidden', 'Persönliche Unverträglichkeit lt. Dokumentation');

  // Aktueller Wochenplan
  const today = new Date();
  const mon = new Date(today);
  mon.setDate(today.getDate() - today.getDay() + 1);
  const weekStart = mon.toISOString().split('T')[0];
  const kw = getWeekNumber(mon);

  const schedId = db.prepare('INSERT INTO schedules (name,week_start,status,created_by) VALUES (?,?,?,?)')
    .run(`KW ${kw} / ${mon.getFullYear()}`, weekStart, 'draft', e1).lastInsertRowid;

  const iS = (date, type, start, end, minS, minF, label) =>
    db.prepare('INSERT INTO shifts (schedule_id,date,shift_type,start_time,end_time,min_staff,min_fachkraft,label) VALUES (?,?,?,?,?,?,?,?)')
      .run(schedId, date, type, start, end, minS, minF, label).lastInsertRowid;

  const dates = Array.from({length:7}, (_,i) => { const d=new Date(mon); d.setDate(mon.getDate()+i); return d.toISOString().split('T')[0]; });

  const week = dates.map(date => ({
    date,
    frueh:  iS(date,'frueh', '06:30','14:00',2,1,'Frühdienst'),
    spaet:  iS(date,'spaet', '13:30','21:30',2,1,'Spätdienst'),
    nacht:  iS(date,'nacht', '21:00','07:00',1,1,'Nachtwache'),
  }));

  const iA = (sid, eid) => db.prepare('INSERT INTO assignments (shift_id,employee_id) VALUES (?,?)').run(sid, eid);
  // Montag
  iA(week[0].frueh,e1); iA(week[0].frueh,e3);
  iA(week[0].spaet,e2); iA(week[0].spaet,e5);
  iA(week[0].nacht,e6);
  // Dienstag
  iA(week[1].frueh,e2); iA(week[1].frueh,e4);
  iA(week[1].spaet,e3); iA(week[1].spaet,e5);
  iA(week[1].nacht,e1);

  console.log('✅ Seed erfolgreich!');
  console.log('   leitung@demo.de      / demo1234');
  console.log('   teamleitung@demo.de  / demo1234');
  console.log('   ma1@demo.de          / demo1234');
  process.exit(0);
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d-y)/86400000)+1)/7);
}

run().catch(e => { console.error(e); process.exit(1); });
