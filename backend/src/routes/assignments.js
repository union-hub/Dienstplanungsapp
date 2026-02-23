const router = require('express').Router();
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateShift } = require('../rules/ruleEngine');

router.use(authenticate);

// Add employee to shift
router.post('/', requireRole('leitung', 'teamleitung'), (req, res) => {
  const { shift_id, employee_id } = req.body;
  if (!shift_id || !employee_id) return res.status(400).json({ error: 'Pflichtfelder fehlen' });
  
  try {
    const r = db.prepare('INSERT INTO assignments (shift_id, employee_id) VALUES (?, ?)').run(shift_id, employee_id);
    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shift_id);
    
    // Log history
    const emp = db.prepare('SELECT short_code FROM employees WHERE id = ?').get(employee_id);
    db.prepare('INSERT INTO schedule_history (schedule_id, changed_by, action, details) VALUES (?,?,?,?)')
      .run(shift.schedule_id, req.user.userId, 'assignment_added', 
          JSON.stringify({ shift_id, employee_id, short_code: emp?.short_code, date: shift.date }));
    
    const violations = validateShift(shift);
    res.status(201).json({ id: r.lastInsertRowid, violations });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Mitarbeiter bereits in diesem Dienst eingeplant' });
    }
    throw e;
  }
});

// Remove assignment
router.delete('/:id', requireRole('leitung', 'teamleitung'), (req, res) => {
  const assignment = db.prepare('SELECT a.*, s.schedule_id, s.date FROM assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.id = ?').get(req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Nicht gefunden' });
  
  db.prepare('DELETE FROM assignments WHERE id = ?').run(req.params.id);
  
  db.prepare('INSERT INTO schedule_history (schedule_id, changed_by, action, details) VALUES (?,?,?,?)')
    .run(assignment.schedule_id, req.user.userId, 'assignment_removed',
        JSON.stringify({ assignment_id: req.params.id, date: assignment.date }));
  
  res.json({ message: 'Entfernt' });
});

// Mark as sick
router.patch('/:id/sick', requireRole('leitung', 'teamleitung'), (req, res) => {
  const { is_sick } = req.body;
  const assignment = db.prepare('SELECT a.*, s.schedule_id, s.date FROM assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.id = ?').get(req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Nicht gefunden' });
  
  db.prepare('UPDATE assignments SET is_sick = ? WHERE id = ?').run(is_sick ? 1 : 0, req.params.id);
  
  db.prepare('INSERT INTO schedule_history (schedule_id, changed_by, action, details) VALUES (?,?,?,?)')
    .run(assignment.schedule_id, req.user.userId, is_sick ? 'sick_reported' : 'sick_cancelled',
        JSON.stringify({ assignment_id: req.params.id, date: assignment.date }));
  
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(assignment.shift_id);
  res.json({ message: 'Aktualisiert', violations: validateShift(shift) });
});

// My own shifts (for Mitarbeitende role)
router.get('/my', (req, res) => {
  if (!req.user.employeeId) return res.json([]);
  const shifts = db.prepare(`
    SELECT s.*, a.id as assignment_id, a.is_sick,
      sc.name as schedule_name, sc.week_start
    FROM assignments a
    JOIN shifts s ON s.id = a.shift_id
    JOIN schedules sc ON sc.id = s.schedule_id
    WHERE a.employee_id = ? AND sc.status != 'draft'
    ORDER BY s.date DESC, s.start_time
    LIMIT 50
  `).all(req.user.employeeId);
  res.json(shifts);
});

module.exports = router;
