const router = require('express').Router();
const { db } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);
router.get('/', (_req, res) => res.json(db.prepare('SELECT * FROM qualifications ORDER BY is_fachkraft DESC, name').all()));

router.post('/', requireRole('leitung'), (req, res) => {
  const { name, description, is_fachkraft } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  const r = db.prepare('INSERT INTO qualifications (name,description,is_fachkraft) VALUES (?,?,?)').run(name, description||'', is_fachkraft?1:0);
  res.status(201).json({ id: r.lastInsertRowid });
});

router.put('/:id', requireRole('leitung'), (req, res) => {
  const { name, description, is_fachkraft } = req.body;
  db.prepare('UPDATE qualifications SET name=?,description=?,is_fachkraft=? WHERE id=?').run(name, description, is_fachkraft?1:0, req.params.id);
  res.json({ message: 'Aktualisiert' });
});

router.delete('/:id', requireRole('leitung'), (req, res) => {
  try { db.prepare('DELETE FROM qualifications WHERE id=?').run(req.params.id); res.json({ message: 'Gelöscht' }); }
  catch { res.status(400).json({ error: 'Qualifikation wird noch verwendet' }); }
});

module.exports = router;
