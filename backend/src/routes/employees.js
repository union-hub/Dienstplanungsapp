const router = require('express').Router();
const { db } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', (_req, res) => {
  const employees = db.prepare('SELECT * FROM employees WHERE active=1 ORDER BY last_name, first_name').all();
  const result = employees.map(e => {
    const quals = db.prepare('SELECT q.* FROM employee_qualifications eq JOIN qualifications q ON q.id=eq.qualification_id WHERE eq.employee_id=?').all(e.id);
    return { ...e, qualifications: quals };
  });
  res.json(result);
});

router.get('/:id', (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id=?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Nicht gefunden' });
  const quals = db.prepare('SELECT q.* FROM employee_qualifications eq JOIN qualifications q ON q.id=eq.qualification_id WHERE eq.employee_id=?').all(req.params.id);
  res.json({ ...emp, qualifications: quals });
});

router.post('/', requireRole('leitung','teamleitung'), (req, res) => {
  const { first_name, last_name, short_code, contract_hours, can_do_nightshift_alone, notes, qualification_ids } = req.body;
  if (!first_name||!last_name||!short_code) return res.status(400).json({ error: 'Pflichtfelder fehlen' });
  const r = db.prepare('INSERT INTO employees (first_name,last_name,short_code,contract_hours,can_do_nightshift_alone,notes) VALUES (?,?,?,?,?,?)')
    .run(first_name, last_name, short_code, contract_hours||39, can_do_nightshift_alone?1:0, notes||'');
  if (qualification_ids?.length)
    qualification_ids.forEach(qid => db.prepare('INSERT OR IGNORE INTO employee_qualifications VALUES (?,?)').run(r.lastInsertRowid, qid));
  res.status(201).json({ id: r.lastInsertRowid });
});

router.put('/:id', requireRole('leitung','teamleitung'), (req, res) => {
  const { first_name, last_name, short_code, contract_hours, can_do_nightshift_alone, notes, overtime_balance, qualification_ids } = req.body;
  db.prepare('UPDATE employees SET first_name=?,last_name=?,short_code=?,contract_hours=?,can_do_nightshift_alone=?,notes=?,overtime_balance=? WHERE id=?')
    .run(first_name, last_name, short_code, contract_hours, can_do_nightshift_alone?1:0, notes, overtime_balance, req.params.id);
  if (qualification_ids !== undefined) {
    db.prepare('DELETE FROM employee_qualifications WHERE employee_id=?').run(req.params.id);
    qualification_ids.forEach(qid => db.prepare('INSERT OR IGNORE INTO employee_qualifications VALUES (?,?)').run(req.params.id, qid));
  }
  res.json({ message: 'Aktualisiert' });
});

router.delete('/:id', requireRole('leitung'), (req, res) => {
  db.prepare('UPDATE employees SET active=0 WHERE id=?').run(req.params.id);
  res.json({ message: 'Deaktiviert' });
});

module.exports = router;
