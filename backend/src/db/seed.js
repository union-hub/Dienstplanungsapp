const db = require('./database');
const bcrypt = require('bcryptjs');

console.log('🌱 Seed-Daten werden geladen...');

const seed = db.transaction(() => {
  // Clear existing data
  db.exec(`
    DELETE FROM swap_requests;
    DELETE FROM schedule_history;
    DELETE FROM assignments;
    DELETE FROM shifts;
    DELETE FROM schedules;
    DELETE FROM resident_restrictions;
    DELETE FROM residents;
    DELETE FROM employee_qualifications;
    DELETE FROM employees;
    DELETE FROM qualifications;
    DELETE FROM users;
  `);

  // Users
  const pw = bcrypt.hashSync('demo1234', 10);
  const insertUser = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)');
  const uLeitung = insertUser.run('leitung@demo.de', pw, 'leitung').lastInsertRowid;
  const uTeam = insertUser.run('teamleitung@demo.de', pw, 'teamleitung').lastInsertRowid;
  const uMa1 = insertUser.run('ma1@demo.de', pw, 'mitarbeitende').lastInsertRowid;
  const uMa2 = insertUser.run('ma2@demo.de', pw, 'mitarbeitende').lastInsertRowid;
  const uMa3 = insertUser.run('ma3@demo.de', pw, 'mitarbeitende').lastInsertRowid;
  const uMa4 = insertUser.run('ma4@demo.de', pw, 'mitarbeitende').lastInsertRowid;

  // Qualifications
  const insertQual = db.prepare('INSERT INTO qualifications (name, description, is_fachkraft) VALUES (?, ?, ?)');
  const qHeil = insertQual.run('Heilerziehungspfleger*in', 'Staatlich anerkannte Fachkraft HEP', 1).lastInsertRowid;
  const qErz = insertQual.run('Erzieher*in', 'Staatlich anerkannte Fachkraft', 1).lastInsertRowid;
  const qPflege = insertQual.run('Pflegefachkraft', 'Examinierte Pflegefachkraft', 1).lastInsertRowid;
  const qAssist = insertQual.run('Assistenzkraft', 'Angelernte Assistenzkraft', 0).lastInsertRowid;
  const qNacht = insertQual.run('Nachtwachenberechtigung', 'Berechtigt für alleinige Nachtwache', 0).lastInsertRowid;

  // Employees
  const insertEmp = db.prepare(`INSERT INTO employees 
    (user_id, first_name, last_name, short_code, contract_hours, can_do_nightshift_alone, overtime_balance)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const e1 = insertEmp.run(uLeitung, 'Anna', 'Schreiber', 'AS', 39, 1, 2.5).lastInsertRowid;
  const e2 = insertEmp.run(uTeam, 'Ben', 'Müller', 'BM', 39, 1, -1.0).lastInsertRowid;
  const e3 = insertEmp.run(uMa1, 'Clara', 'Weber', 'CW', 30, 1, 0).lastInsertRowid;
  const e4 = insertEmp.run(uMa2, 'David', 'Fischer', 'DF', 20, 0, 4.0).lastInsertRowid;
  const e5 = insertEmp.run(uMa3, 'Eva', 'Bauer', 'EB', 39, 1, 0).lastInsertRowid;
  const e6 = insertEmp.run(uMa4, 'Frank', 'Koch', 'FK', 30, 1, 1.5).lastInsertRowid;

  // Employee qualifications
  const insertEQ = db.prepare('INSERT INTO employee_qualifications VALUES (?, ?)');
  insertEQ.run(e1, qHeil); insertEQ.run(e1, qNacht);
  insertEQ.run(e2, qErz);  insertEQ.run(e2, qNacht);
  insertEQ.run(e3, qHeil); insertEQ.run(e3, qNacht);
  insertEQ.run(e4, qAssist);
  insertEQ.run(e5, qPflege); insertEQ.run(e5, qNacht);
  insertEQ.run(e6, qAssist);

  // Residents
  const insertRes = db.prepare(`INSERT INTO residents
    (first_name, last_name, short_code, support_level, needs_1to1, needs_night_supervision, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const r1 = insertRes.run('Max', 'Mustermann', 'MM', 3, 0, 1, 'Nächtliche Unruhe möglich').lastInsertRowid;
  const r2 = insertRes.run('Lena', 'Müller', 'LM', 4, 1, 1, '1:1 Begleitung bei Aktivitäten').lastInsertRowid;
  const r3 = insertRes.run('Peter', 'Schmidt', 'PS', 2, 0, 0, '').lastInsertRowid;
  const r4 = insertRes.run('Maria', 'Braun', 'MB', 5, 1, 1, 'Hoher Pflegebedarf').lastInsertRowid;

  // Resident restriction: David Fischer darf nicht bei Lena eingesetzt werden
  db.prepare('INSERT INTO resident_restrictions (resident_id, employee_id, restriction_type, reason) VALUES (?, ?, ?, ?)')
    .run(r2, e4, 'forbidden', 'Persönliche Unverträglichkeit lt. Dokumentation');

  // Schedule for current week
  const today = new Date();
  const mon = new Date(today);
  mon.setDate(today.getDate() - today.getDay() + 1);
  const weekStart = mon.toISOString().split('T')[0];

  const schedId = db.prepare('INSERT INTO schedules (name, week_start, status, created_by) VALUES (?, ?, ?, ?)')
    .run(`KW ${getWeekNumber(mon)} / ${mon.getFullYear()}`, weekStart, 'draft', e1).lastInsertRowid;

  // Create shifts for Mon-Sun
  const insertShift = db.prepare(`INSERT INTO shifts 
    (schedule_id, date, shift_type, start_time, end_time, min_staff, min_fachkraft, label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const shiftIds = [];
  for (const date of dates) {
    shiftIds.push({
      date,
      frueh: insertShift.run(schedId, date, 'frueh', '06:30', '14:00', 2, 1, 'Frühdienst').lastInsertRowid,
      spaet: insertShift.run(schedId, date, 'spaet', '13:30', '21:30', 2, 1, 'Spätdienst').lastInsertRowid,
      nacht: insertShift.run(schedId, date, 'nacht', '21:00', '07:00', 1, 1, 'Nachtwache').lastInsertRowid,
    });
  }

  // Sample assignments
  const insertAssign = db.prepare('INSERT INTO assignments (shift_id, employee_id) VALUES (?, ?)');
  // Monday
  insertAssign.run(shiftIds[0].frueh, e1);
  insertAssign.run(shiftIds[0].frueh, e3);
  insertAssign.run(shiftIds[0].spaet, e2);
  insertAssign.run(shiftIds[0].spaet, e5);
  insertAssign.run(shiftIds[0].nacht, e6);
  // Tuesday
  insertAssign.run(shiftIds[1].frueh, e2);
  insertAssign.run(shiftIds[1].frueh, e4);
  insertAssign.run(shiftIds[1].spaet, e3);
  insertAssign.run(shiftIds[1].spaet, e5);
  insertAssign.run(shiftIds[1].nacht, e1);

  console.log('✅ Seed erfolgreich. Demo-Zugangsdaten:');
  console.log('   leitung@demo.de / demo1234');
  console.log('   teamleitung@demo.de / demo1234');
  console.log('   ma1@demo.de / demo1234');
});

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

seed();
