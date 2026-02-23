const router = require('express').Router();
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { getFachkraefteCount } = require('../rules/ruleEngine');

router.use(authenticate);
router.use(requireRole('leitung', 'teamleitung'));

router.get('/fachkraftquote/:scheduleId', (req, res) => {
  const shifts = db.prepare('SELECT id FROM shifts WHERE schedule_id = ?').all(req.params.scheduleId);
  
  let totalAssignments = 0, fachkraftAssignments = 0;
  for (const s of shifts) {
    const empIds = db.prepare('SELECT employee_id FROM assignments WHERE shift_id = ? AND is_sick = 0').all(s.id).map(a => a.employee_id);
    totalAssignments += empIds.length;
    fachkraftAssignments += empIds.length ? getFachkraefteCount(empIds) : 0;
  }
  
  res.json({
    total: totalAssignments,
    fachkraefte: fachkraftAssignments,
    quote: totalAssignments ? (fachkraftAssignments / totalAssignments * 100).toFixed(1) : 0
  });
});

router.get('/ausfaelle/:scheduleId', (req, res) => {
  const sick = db.prepare(`
    SELECT a.employee_id, e.short_code, e.first_name, e.last_name,
           COUNT(*) as sick_count,
           GROUP_CONCAT(s.date, ',') as dates
    FROM assignments a
    JOIN shifts s ON s.id = a.shift_id
    JOIN employees e ON e.id = a.employee_id
    WHERE s.schedule_id = ? AND a.is_sick = 1
    GROUP BY a.employee_id
  `).all(req.params.scheduleId);
  res.json(sick);
});

router.get('/ueberstunden', (req, res) => {
  const emps = db.prepare('SELECT id, short_code, first_name, last_name, overtime_balance, contract_hours FROM employees WHERE active = 1 ORDER BY overtime_balance DESC').all();
  res.json(emps);
});

router.get('/simulation/:shiftId', (req, res) => {
  const { suggestReplacements, validateShift } = require('../rules/ruleEngine');
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.shiftId);
  if (!shift) return res.status(404).json({ error: 'Dienst nicht gefunden' });
  
  const currentViolations = validateShift(shift);
  const replacements = suggestReplacements(req.params.shiftId);
  const currentAssignments = db.prepare(`
    SELECT a.*, e.short_code FROM assignments a JOIN employees e ON e.id = a.employee_id WHERE a.shift_id = ?`).all(req.params.shiftId);
  
  res.json({
    shift,
    currentAssignments,
    currentViolations,
    replacements,
    impact: currentViolations.filter(v => v.severity === 'error').length > 0 ? 'critical' : 'manageable'
  });
});

module.exports = router;
