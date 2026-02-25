const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { db }  = require('../db/database');
const { authenticate, getSecret } = require('../middleware/auth');

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  const user = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Ungültige Zugangsdaten' });
  const employee = db.prepare('SELECT * FROM employees WHERE user_id=?').get(user.id);
  const token = jwt.sign(
    { userId: user.id, role: user.role, employeeId: employee?.id, email: user.email },
    getSecret(),
    { expiresIn: '8h' }
  );
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, employee } });
});

router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id,email,role,created_at FROM users WHERE id=?').get(req.user.userId);
  const employee = db.prepare('SELECT * FROM employees WHERE user_id=?').get(req.user.userId);
  res.json({ ...user, employee });
});

router.patch('/me/password', authenticate, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'Aktuelles und neues Passwort erforderlich' });
  if (new_password.length < 8)
    return res.status(400).json({ error: 'Neues Passwort muss mindestens 8 Zeichen haben' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.userId);
  if (!bcrypt.compareSync(current_password, user.password_hash))
    return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?')
    .run(bcrypt.hashSync(new_password, 12), user.id);
  res.json({ message: 'Passwort erfolgreich geändert' });
});

module.exports = router;
