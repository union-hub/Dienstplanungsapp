const router = require('express').Router();
const { db } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateSchedule } = require('../rules/ruleEngine');

router.use(authenticate);

router.get('/', (_req, res) => res.json(db.prepare('SELECT * FROM schedules ORDER BY week_start DESC LIMIT 20').all()));
router.get('/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM schedules WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(s);
});
router.get('/:id/validate', (req, res) => res.json(validateSchedule(parseInt(req.params.id))));
router.get('/:id/history', (req, res) => {
  const h = db.prepare('SELECT sh.*, u.email FROM schedule_history sh LEFT JOIN users u ON u.id=sh.changed_by WHERE sh.schedule_id=? ORDER BY sh.timestamp DESC LIMIT 100').all(req.params.id);
  res.json(h);
});

router.post('/', requireRole('leitung','teamleitung'), (req, res) => {
  const { name, week_start } = req.body;
  if (!name||!week_start) return res.status(400).json({ error: 'Name und Wochenbeginn erforderlich' });
  const r = db.prepare('INSERT INTO schedules (name,week_start,created_by) VALUES (?,?,?)').run(name, week_start, req.user.userId);
  res.status(201).json({ id: r.lastInsertRowid });
});

router.patch('/:id/status', requireRole('leitung','teamleitung'), (req, res) => {
  const { status } = req.body;
  if (!['draft','published','archived'].includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });
  if (status === 'published') {
    const { valid, violations } = validateSchedule(parseInt(req.params.id));
    if (!valid) return res.status(422).json({ error: 'Regelverstöße vorhanden', violations });
  }
  db.prepare('UPDATE schedules SET status=?,updated_at=datetime(\'now\') WHERE id=?').run(status, req.params.id);
  db.prepare('INSERT INTO schedule_history (schedule_id,changed_by,action,details) VALUES (?,?,?,?)')
    .run(req.params.id, req.user.userId, 'status_changed', JSON.stringify({ status }));
  res.json(db.prepare('SELECT * FROM schedules WHERE id=?').get(req.params.id));
});

module.exports = router;
