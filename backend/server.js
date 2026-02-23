const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./src/routes/auth');
const employeeRoutes = require('./src/routes/employees');
const residentRoutes = require('./src/routes/residents');
const qualificationRoutes = require('./src/routes/qualifications');
const shiftRoutes = require('./src/routes/shifts');
const assignmentRoutes = require('./src/routes/assignments');
const scheduleRoutes = require('./src/routes/schedules');
const controllingRoutes = require('./src/routes/controlling');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/residents', residentRoutes);
app.use('/api/qualifications', qualificationRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/controlling', controllingRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Interner Serverfehler' });
});

app.listen(PORT, () => console.log(`Backend läuft auf Port ${PORT}`));

module.exports = app;
