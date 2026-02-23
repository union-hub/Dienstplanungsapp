const router = require('express').Router();
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', (req, res) => {
  const employees = db.prepare(`
    SELECT e.*, GROUP_CONCAT(q.id || ':' || q.name || ':' || q.is_fachkraft, '|') as quals
    FROM employees e
    LEFT JOIN employee_qualifications eq ON eq.employee_id = e.id
    LEFT JOIN qualifications q ON q.id = eq.qualification_id
    WHERE e.active = 1
    GROUP BY e.id
    ORDER BY e.last_name, e.first_name
  `).all();
  
  const result = employees.map(e => ({
    ...e,
    qualifications: e.quals ? e.quals.split('|').map(q => {
      const [id, name, is_fachkraft] = q.split(':');
      return { id: parseInt(id), name, is_fachkraft: parseInt(is_fachkraft) === 1 };
    }) : []
  }));
  res.json(result);
});

router.get('/:id', (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
  const quals = db.prepare(`
    SELECT q.* FROM employee_qualifications eq
    JOIN qualifications q ON q.id = eq.qualification_id
    WHERE eq.employee_id = ?`).all(req.params.id);
  res.json({ ...emp, qualifications: quals });
});

router.post('/', requireRole('leitung', 'teamleitung'), (req, res) => {
  const { first_name, last_name, short_code, contract_hours, can_do_nightshift_alone, notes, qualification_ids, user_id } = req.body;
  if (!first_name || !last_name || !short_code) return res.status(400).json({ error: 'Pflichtfelder fehlen' });
  
  const insert = db.transaction(() => {
    const emp = db.prepare(`INSERT INTO employees (user_id, first_name, last_name, short_code, contract_hours, can_do_nightshift_alone, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(user_id || null, first_name, last_name, short_code, contract_hours || 39, can_do_nightshift_alone ? 1 : 0, notes || '');
    if (qualification_ids?.length) {
      const ins = db.prepare('INSERT OR IGNORE INTO employee_qualifications VALUES (?, ?)');
      qualification_ids.forEach(qid => ins.run(emp.lastInsertRowid, qid));
    }
    return emp.lastInsertRowid;
  });
  const id = insert();
  res.status(201).json({ id, message: 'Mitarbeiter angelegt' });
});

router.put('/:id', requireRole('leitung', 'teamleitung'), (req, res) => {
  const { first_name, last_name, short_code, contract_hours, can_do_nightshift_alone, notes, overtime_balance, qualification_ids } = req.body;
  
  db.transaction(() => {
    db.prepare(`UPDATE employees SET first_name=?, last_name=?, short_code=?, contract_hours=?, can_do_nightshift_alone=?, notes=?, overtime_balance=? WHERE id=?`)
      .run(first_name, last_name, short_code, contract_hours, can_do_nightshift_alone ? 1 : 0, notes, overtime_balance, req.params.id);
    if (qualification_ids !== undefined) {
      db.prepare('DELETE FROM employee_qualifications WHERE employee_id = ?').run(req.params.id);
      const ins = db.prepare('INSERT OR IGNORE INTO employee_qualifications VALUES (?, ?)');
      qualification_ids.forEach(qid => ins.run(req.params.id, qid));
    }
  })();
  res.json({ message: 'Aktualisiert' });
});

router.delete('/:id', requireRole('leitung'), (req, res) => {
  db.prepare('UPDATE employees SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deaktiviert' });
});

module.exports = router;
