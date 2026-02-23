const router = require('express').Router();
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateShift, suggestReplacements } = require('../rules/ruleEngine');

router.use(authenticate);

router.get('/schedule/:scheduleId', (req, res) => {
  const shifts = db.prepare(`
    SELECT s.*,
      (
        SELECT json_group_array(json_object(
          'id', a.id, 'employee_id', a.employee_id, 'is_sick', a.is_sick,
          'first_name', e.first_name, 'last_name', e.last_name, 'short_code', e.short_code
        ))
        FROM assignments a JOIN employees e ON e.id = a.employee_id
        WHERE a.shift_id = s.id
      ) as assignments_json
    FROM shifts s WHERE s.schedule_id = ?
    ORDER BY s.date, s.start_time
  `).all(req.params.scheduleId);

  const result = shifts.map(s => ({
    ...s,
    assignments: JSON.parse(s.assignments_json || '[]')
  }));
  res.json(result);
});

router.post('/', requireRole('leitung', 'teamleitung'), (req, res) => {
  const { schedule_id, date, shift_type, start_time, end_time, min_staff, min_fachkraft, label } = req.body;
  if (!schedule_id || !date || !shift_type || !start_time || !end_time) {
    return res.status(400).json({ error: 'Pflichtfelder fehlen' });
  }
  const r = db.prepare(`INSERT INTO shifts (schedule_id, date, shift_type, start_time, end_time, min_staff, min_fachkraft, label) VALUES (?,?,?,?,?,?,?,?)`)
    .run(schedule_id, date, shift_type, start_time, end_time, min_staff || 1, min_fachkraft || 1, label || '');
  
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(r.lastInsertRowid);
  const violations = validateShift(shift);
  res.status(201).json({ id: r.lastInsertRowid, violations });
});

router.put('/:id', requireRole('leitung', 'teamleitung'), (req, res) => {
  const { shift_type, start_time, end_time, min_staff, min_fachkraft, label } = req.body;
  db.prepare('UPDATE shifts SET shift_type=?,start_time=?,end_time=?,min_staff=?,min_fachkraft=?,label=? WHERE id=?')
    .run(shift_type, start_time, end_time, min_staff, min_fachkraft, label, req.params.id);
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id);
  res.json({ message: 'Aktualisiert', violations: validateShift(shift) });
});

router.delete('/:id', requireRole('leitung', 'teamleitung'), (req, res) => {
  db.prepare('DELETE FROM shifts WHERE id = ?').run(req.params.id);
  res.json({ message: 'Dienst gelöscht' });
});

router.get('/:id/replacements', requireRole('leitung', 'teamleitung'), (req, res) => {
  res.json(suggestReplacements(req.params.id));
});

module.exports = router;
