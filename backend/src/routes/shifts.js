const router = require('express').Router();
const { db } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateShift, suggestReplacements } = require('../rules/ruleEngine');

router.use(authenticate);

router.get('/schedule/:scheduleId', (req, res) => {
  const shifts = db.prepare('SELECT * FROM shifts WHERE schedule_id=? ORDER BY date, start_time').all(req.params.scheduleId);
  const result = shifts.map(s => {
    const assignments = db.prepare(
      'SELECT a.id, a.employee_id, a.is_sick, e.first_name, e.last_name, e.short_code FROM assignments a JOIN employees e ON e.id=a.employee_id WHERE a.shift_id=?'
    ).all(s.id);
    return { ...s, assignments };
  });
  res.json(result);
});

router.post('/', requireRole('leitung','teamleitung'), (req, res) => {
  const { schedule_id, date, shift_type, start_time, end_time, min_staff, min_fachkraft, label } = req.body;
  if (!schedule_id||!date||!shift_type||!start_time||!end_time) return res.status(400).json({ error: 'Pflichtfelder fehlen' });
  const r = db.prepare('INSERT INTO shifts (schedule_id,date,shift_type,start_time,end_time,min_staff,min_fachkraft,label) VALUES (?,?,?,?,?,?,?,?)')
    .run(schedule_id, date, shift_type, start_time, end_time, min_staff||1, min_fachkraft||1, label||'');
  const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(r.lastInsertRowid);
  res.status(201).json({ id: r.lastInsertRowid, violations: validateShift(shift) });
});

router.put('/:id', requireRole('leitung','teamleitung'), (req, res) => {
  const { shift_type, start_time, end_time, min_staff, min_fachkraft, label } = req.body;
  db.prepare('UPDATE shifts SET shift_type=?,start_time=?,end_time=?,min_staff=?,min_fachkraft=?,label=? WHERE id=?')
    .run(shift_type, start_time, end_time, min_staff, min_fachkraft, label, req.params.id);
  const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(req.params.id);
  res.json({ message:'Aktualisiert', violations: validateShift(shift) });
});

router.delete('/:id', requireRole('leitung','teamleitung'), (req, res) => {
  db.prepare('DELETE FROM shifts WHERE id=?').run(req.params.id);
  res.json({ message: 'Gelöscht' });
});

router.get('/:id/replacements', requireRole('leitung','teamleitung'), (req, res) => {
  res.json(suggestReplacements(req.params.id));
});

module.exports = router;
