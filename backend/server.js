require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors    = require('cors');
const { initDb } = require('./src/db/database');

const app  = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS: Origin nicht erlaubt'));
  },
  credentials: true,
}));
app.use(express.json());
// Frontend ausliefern
const path = require('path');
const fs   = require('fs');
const distPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}
initDb().then(() => {
  app.use('/api/auth',           require('./src/routes/auth'));
  app.use('/api/users',          require('./src/routes/users'));
  app.use('/api/employees',      require('./src/routes/employees'));
  app.use('/api/residents',      require('./src/routes/residents'));
  app.use('/api/qualifications', require('./src/routes/qualifications'));
  app.use('/api/shifts',         require('./src/routes/shifts'));
  app.use('/api/assignments',    require('./src/routes/assignments'));
  app.use('/api/schedules',      require('./src/routes/schedules'));
  app.use('/api/controlling',    require('./src/routes/controlling'));

  app.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' }));

  app.use((err, _req, res, _next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({ error: err.message || 'Interner Serverfehler' });
  });

  app.listen(PORT, () => {
    console.log(`✅ Backend läuft auf Port ${PORT}`);
    console.log(`   JWT_SECRET: ${process.env.JWT_SECRET &&
      process.env.JWT_SECRET !== 'BITTE_AENDERN_min32zeichen_zufaellig_abc123'
      ? '✓ gesetzt' : '⚠ NICHT GESETZT oder Standardwert – bitte .env anlegen!'}`);
  });

  const { runBackup } = require('./src/backup');
  const H24 = 24 * 60 * 60 * 1000;
  setTimeout(() => { runBackup(); setInterval(runBackup, H24); }, 5000);

}).catch(err => {
  console.error('❌ Datenbankinitialisierung fehlgeschlagen:', err);
  process.exit(1);
});

module.exports = app;
