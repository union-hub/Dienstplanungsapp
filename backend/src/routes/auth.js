const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Ungültige Zugangsdaten' });
  }

  const employee = db.prepare('SELECT * FROM employees WHERE user_id = ?').get(user.id);
  const token = jwt.sign(
    { userId: user.id, role: user.role, employeeId: employee?.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token, user: { id: user.id, email: user.email, role: user.role, employee } });
});

router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, email, role, created_at FROM users WHERE id = ?').get(req.user.userId);
  const employee = db.prepare('SELECT * FROM employees WHERE user_id = ?').get(req.user.userId);
  res.json({ ...user, employee });
});

module.exports = router;
