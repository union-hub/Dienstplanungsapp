const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });

  const mitarbeitende = db.prepare('SELECT * FROM mitarbeitende WHERE user_id = ?').get(user.id);

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, mitarbeitende_id: mitarbeitende?.id },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token, user: { id: user.id, email: user.email, role: user.role, mitarbeitende } });
});

// POST /api/auth/register (nur Leitung)
router.post('/register', require('../middleware/auth').authenticate, require('../middleware/auth').requireRole('leitung'), (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role) return res.status(400).json({ error: 'Fehlende Felder' });

  const db = getDb();
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run(email, hash, role);
    res.json({ id: result.lastInsertRowid, email, role });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'E-Mail bereits vergeben' });
    throw e;
  }
});

module.exports = router;
