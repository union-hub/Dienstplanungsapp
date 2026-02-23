const router = require('express').Router();
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', (req, res) => {
  const residents = db.prepare(`
    SELECT r.*,
      (SELECT GROUP_CONCAT(rr.employee_id || ':' || rr.restriction_type, '|')
       FROM resident_restrictions rr WHERE rr.resident_id = r.id) as restrictions_raw
    FROM residents r WHERE r.active = 1 ORDER BY r.last_name`).all();
  res.json(residents);
});

router.get('/:id', (req, res) => {
  const resident = db.prepare('SELECT * FROM residents WHERE id = ?').get(req.params.id);
  if (!resident) return res.status(404).json({ error: 'Nicht gefunden' });
  const restrictions = db.prepare('SELECT * FROM resident_restrictions WHERE resident_id = ?').all(req.params.id);
  res.json({ ...resident, restrictions });
});

router.post('/', requireRole('leitung', 'teamleitung'), (req, res) => {
  const { first_name, last_name, short_code, support_level, needs_1to1, needs_night_supervision, notes } = req.body;
  if (!first_name || !last_name || !short_code) return res.status(400).json({ error: 'Pflichtfelder fehlen' });
  const r = db.prepare(`INSERT INTO residents (first_name, last_name, short_code, support_level, needs_1to1, needs_night_supervision, notes) VALUES (?,?,?,?,?,?,?)`)
    .run(first_name, last_name, short_code, support_level || 1, needs_1to1 ? 1 : 0, needs_night_supervision ? 1 : 0, notes || '');
  res.status(201).json({ id: r.lastInsertRowid });
});

router.put('/:id', requireRole('leitung', 'teamleitung'), (req, res) => {
  const { first_name, last_name, short_code, support_level, needs_1to1, needs_night_supervision, notes } = req.body;
  db.prepare(`UPDATE residents SET first_name=?,last_name=?,short_code=?,support_level=?,needs_1to1=?,needs_night_supervision=?,notes=? WHERE id=?`)
    .run(first_name, last_name, short_code, support_level, needs_1to1 ? 1 : 0, needs_night_supervision ? 1 : 0, notes, req.params.id);
  res.json({ message: 'Aktualisiert' });
});

router.post('/:id/restrictions', requireRole('leitung', 'teamleitung'), (req, res) => {
  const { employee_id, restriction_type, reason } = req.body;
  db.prepare('INSERT OR REPLACE INTO resident_restrictions (resident_id, employee_id, restriction_type, reason) VALUES (?,?,?,?)')
    .run(req.params.id, employee_id, restriction_type, reason || '');
  res.status(201).json({ message: 'Restriktion gespeichert' });
});

router.delete('/:id/restrictions/:empId', requireRole('leitung', 'teamleitung'), (req, res) => {
  db.prepare('DELETE FROM resident_restrictions WHERE resident_id = ? AND employee_id = ?')
    .run(req.params.id, req.params.empId);
  res.json({ message: 'Restriktion entfernt' });
});

module.exports = router;
