const jwt = require('jsonwebtoken');

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.startsWith('BITTE_AENDERN')) {
    console.warn('⚠ WARNUNG: JWT_SECRET ist nicht gesetzt oder noch der Standardwert!');
    return 'dev-fallback-nur-fuer-entwicklung';
  }
  return s;
}

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  try {
    req.user = jwt.verify(header.slice(7), getSecret());
    next();
  } catch {
    res.status(401).json({ error: 'Token ungültig oder abgelaufen' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role))
      return res.status(403).json({ error: 'Keine Berechtigung' });
    next();
  };
}

module.exports = { authenticate, requireRole, getSecret };
