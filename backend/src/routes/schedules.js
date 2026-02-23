const router = require('express').Router();
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateSchedule } = require('../rules/ruleEngine');

router.use(authenticate);

router.get('/', (req, res) => {
  const schedules = db.prepare('SELECT * FROM schedules ORDER BY week_start DESC LIMIT 20').all();
  res.json(schedules);
});

router.get('/:id', (req, res) => {
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(schedule);
});

router.get('/:id/validate', (req, res) => {
  const result = validateSchedule(parseInt(req.params.id));
  res.json(result);
});

router.get('/:id/history', (req, res) => {
  const history = db.prepare(`
    SELECT sh.*, u.email FROM schedule_history sh
    LEFT JOIN users u ON u.id = sh.changed_by
    WHERE sh.schedule_id = ?
    ORDER BY sh.timestamp DESC LIMIT 100
  `).all(req.params.id);
  res.json(history);
});

router.post('/', requireRole('leitung', 'teamleitung'), (req, res) => {
  const { name, week_start } = req.body;
  if (!name || !week_start) return res.status(400).json({ error: 'Name und Wochenbeginn erforderlich' });
  const r = db.prepare('INSERT INTO schedules (name, week_start, created_by) VALUES (?,?,?)')
    .run(name, week_start, req.user.userId);
  res.status(201).json({ id: r.lastInsertRowid });
});

router.patch('/:id/status', requireRole('leitung', 'teamleitung'), (req, res) => {
  const { status } = req.body;
  if (!['draft', 'published', 'archived'].includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });
  
  // Validate before publishing
  if (status === 'published') {
    const { valid, violations } = validateSchedule(parseInt(req.params.id));
    if (!valid) return res.status(422).json({ error: 'Dienstplan hat Regelverstöße', violations });
  }
  
  db.prepare('UPDATE schedules SET status=?, updated_at=datetime("now") WHERE id=?').run(status, req.params.id);
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  
  db.prepare('INSERT INTO schedule_history (schedule_id, changed_by, action, details) VALUES (?,?,?,?)')
    .run(req.params.id, req.user.userId, 'status_changed', JSON.stringify({ status }));
  
  res.json(schedule);
});

module.exports = router;
