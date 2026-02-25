const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { db }  = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);
router.use(requireRole('leitung'));

router.get('/', (_req, res) => {
  const users = db.prepare(
    `SELECT u.id, u.email, u.role, u.active, u.created_at,
            e.first_name, e.last_name, e.short_code
     FROM users u
     LEFT JOIN employees e ON e.user_id = u.id
     ORDER BY u.role, u.email`
  ).all();
  res.json(users);
});

router.post('/', (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role)
    return res.status(400).json({ error: 'E-Mail, Passwort und Rolle erforderlich' });
  if (!['leitung','teamleitung','mitarbeitende'].includes(role))
    return res.status(400).json({ error: 'Ungültige Rolle' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email))
    return res.status(409).json({ error: 'E-Mail bereits vergeben' });
  const r = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?,?,?)')
    .run(email, bcrypt.hashSync(password, 12), role);
  res.status(201).json({ id: r.lastInsertRowid, email, role });
});

router.put('/:id', (req, res) => {
  if (parseInt(req.params.id) === req.user.userId)
    return res.status(400).json({ error: 'Eigenes Konto hier nicht bearbeitbar' });
  const { email, role, active } = req.body;
  if (role && !['leitung','teamleitung','mitarbeitende'].includes(role))
    return res.status(400).json({ error: 'Ungültige Rolle' });
  db.prepare('UPDATE users SET email=COALESCE(?,email), role=COALESCE(?,role), active=COALESCE(?,active) WHERE id=?')
    .run(email || null, role || null, active !== undefined ? (active ? 1 : 0) : null, req.params.id);
  res.json({ message: 'Nutzer aktualisiert' });
});

router.patch('/:id/reset-password', (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 8)
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?')
    .run(bcrypt.hashSync(new_password, 12), req.params.id);
  res.json({ message: 'Passwort zurückgesetzt' });
});

router.delete('/:id', (req, res) => {
  if (parseInt(req.params.id) === req.user.userId)
    return res.status(400).json({ error: 'Eigenes Konto nicht deaktivierbar' });
  db.prepare('UPDATE users SET active=0 WHERE id=?').run(req.params.id);
  res.json({ message: 'Nutzer deaktiviert' });
});

module.exports = router;
