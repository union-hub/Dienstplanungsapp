/**
 * Regel-Engine für die Dienstplanvalidierung
 * Prüft alle fachlichen und arbeitsrechtlichen Regeln
 */
const db = require('../db/database');

const RULES = {
  MIN_REST_HOURS: 11,          // §5 ArbZG: Mindestruhezeit
  MAX_DAILY_HOURS: 10,         // §3 ArbZG: Tageshöchstarbeitszeit
  MAX_WEEKLY_HOURS: 48,        // §3 ArbZG: Wochenhöchstarbeitszeit
  BEREITSCHAFT_FACTOR: 0.25,   // Bereitschaftszeit: 25% der Zeit als Arbeitszeit
};

/**
 * Hauptfunktion: Validiert einen kompletten Dienstplan oder einzelne Schicht
 * @returns {violations: [{rule, severity, message, shiftId?, employeeId?}]}
 */
function validateSchedule(scheduleId) {
  const violations = [];

  const shifts = db.prepare(`
    SELECT s.*, sc.week_start FROM shifts s
    JOIN schedules sc ON sc.id = s.schedule_id
    WHERE s.schedule_id = ?
    ORDER BY s.date, s.start_time
  `).all(scheduleId);

  for (const shift of shifts) {
    violations.push(...validateShift(shift));
  }

  // Wochenarbeitszeit pro Mitarbeiter prüfen
  violations.push(...validateWeeklyHours(scheduleId));

  return { violations, valid: violations.filter(v => v.severity === 'error').length === 0 };
}

function validateShift(shift) {
  const violations = [];
  const assignments = db.prepare(`
    SELECT a.*, e.can_do_nightshift_alone, e.first_name, e.last_name, e.short_code
    FROM assignments a
    JOIN employees e ON e.id = a.employee_id
    WHERE a.shift_id = ? AND a.is_sick = 0
  `).all(shift.id);

  // 1. Mindestbesetzung
  if (assignments.length < shift.min_staff) {
    violations.push({
      rule: 'MIN_STAFF',
      severity: 'error',
      shiftId: shift.id,
      message: `Mindestbesetzung nicht erfüllt: ${assignments.length}/${shift.min_staff} Mitarbeitende am ${shift.date} (${shift.label || shift.shift_type})`
    });
  }

  // 2. Mindestanzahl Fachkräfte
  const fachkraefte = getFachkraefteCount(assignments.map(a => a.employee_id));
  if (fachkraefte < shift.min_fachkraft) {
    violations.push({
      rule: 'MIN_FACHKRAFT',
      severity: 'error',
      shiftId: shift.id,
      message: `Fachkraftquote nicht erfüllt: ${fachkraefte}/${shift.min_fachkraft} Fachkräfte am ${shift.date} (${shift.label || shift.shift_type})`
    });
  }

  // 3. Nachtdienst: Berechtigung prüfen
  if (shift.shift_type === 'nacht') {
    const alone = assignments.filter(a => !a.can_do_nightshift_alone);
    if (alone.length > 0 && assignments.length === 1) {
      violations.push({
        rule: 'NIGHTSHIFT_ALONE',
        severity: 'error',
        shiftId: shift.id,
        message: `${alone.map(a => a.short_code).join(', ')} darf nicht alleine im Nachtdienst eingesetzt werden.`
      });
    }
  }

  // 4. Einsatzrestriktionen prüfen
  violations.push(...checkRestrictions(shift, assignments));

  // 5. Ruhezeiten prüfen
  for (const a of assignments) {
    violations.push(...checkRestTime(a.employee_id, shift));
  }

  // 6. Bewohner mit Nachtaufsichtsbedarf prüfen
  if (shift.shift_type === 'nacht') {
    violations.push(...checkNightSupervision(shift, assignments));
  }

  return violations;
}

function getFachkraefteCount(employeeIds) {
  if (!employeeIds.length) return 0;
  const placeholders = employeeIds.map(() => '?').join(',');
  const result = db.prepare(`
    SELECT COUNT(DISTINCT eq.employee_id) as cnt
    FROM employee_qualifications eq
    JOIN qualifications q ON q.id = eq.qualification_id
    WHERE q.is_fachkraft = 1 AND eq.employee_id IN (${placeholders})
  `).get(...employeeIds);
  return result?.cnt || 0;
}

function checkRestrictions(shift, assignments) {
  const violations = [];
  const empIds = assignments.map(a => a.employee_id);
  if (!empIds.length) return [];

  const restrictions = db.prepare(`
    SELECT rr.*, r.first_name || ' ' || r.last_name as resident_name, 
           e.short_code as employee_code
    FROM resident_restrictions rr
    JOIN residents r ON r.id = rr.resident_id
    JOIN employees e ON e.id = rr.employee_id
    WHERE r.active = 1 AND rr.employee_id IN (${empIds.map(() => '?').join(',')})
  `).all(...empIds);

  for (const r of restrictions) {
    if (r.restriction_type === 'forbidden') {
      violations.push({
        rule: 'EMPLOYEE_RESTRICTION',
        severity: 'error',
        shiftId: shift.id,
        employeeId: r.employee_id,
        message: `${r.employee_code} darf nicht mit Bewohner*in ${r.resident_name} eingesetzt werden: ${r.reason || ''}`
      });
    }
  }
  return violations;
}

function checkRestTime(employeeId, currentShift) {
  const violations = [];
  // Find last assignment before this shift
  const prev = db.prepare(`
    SELECT s.date, s.end_time, s.start_time, s.shift_type
    FROM assignments a
    JOIN shifts s ON s.id = a.shift_id
    WHERE a.employee_id = ? AND a.is_sick = 0
      AND (s.date < ? OR (s.date = ? AND s.start_time < ?))
    ORDER BY s.date DESC, s.start_time DESC
    LIMIT 1
  `).get(employeeId, currentShift.date, currentShift.date, currentShift.start_time);

  if (!prev) return [];

  const prevEnd = parseDateTime(prev.date, prev.end_time, prev.shift_type === 'nacht');
  const currStart = parseDateTime(currentShift.date, currentShift.start_time);
  const restHours = (currStart - prevEnd) / (1000 * 60 * 60);

  if (restHours < RULES.MIN_REST_HOURS) {
    const emp = db.prepare('SELECT short_code FROM employees WHERE id = ?').get(employeeId);
    violations.push({
      rule: 'REST_TIME',
      severity: 'error',
      shiftId: currentShift.id,
      employeeId,
      message: `${emp?.short_code}: Mindestruhezeit von 11h unterschritten (nur ${restHours.toFixed(1)}h Ruhe vor Dienst am ${currentShift.date})`
    });
  }
  return violations;
}

function checkNightSupervision(shift, assignments) {
  const violations = [];
  if (!assignments.length) return [];

  const residentsNeedingSupervision = db.prepare(
    `SELECT first_name, last_name, short_code FROM residents WHERE needs_night_supervision = 1 AND active = 1`
  ).all();

  if (residentsNeedingSupervision.length > 0 && assignments.length === 0) {
    violations.push({
      rule: 'NIGHT_SUPERVISION',
      severity: 'error',
      shiftId: shift.id,
      message: `Nachtaufsicht erforderlich für: ${residentsNeedingSupervision.map(r => r.short_code).join(', ')} – kein Personal eingeplant`
    });
  }
  return violations;
}

function validateWeeklyHours(scheduleId) {
  const violations = [];
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId);
  if (!schedule) return [];

  // Get all employees in this schedule
  const employees = db.prepare(`
    SELECT DISTINCT a.employee_id, e.short_code, e.contract_hours
    FROM assignments a
    JOIN shifts s ON s.id = a.shift_id
    JOIN employees e ON e.id = a.employee_id
    WHERE s.schedule_id = ? AND a.is_sick = 0
  `).all(scheduleId);

  for (const emp of employees) {
    const shifts = db.prepare(`
      SELECT s.start_time, s.end_time, s.date, s.shift_type, s.id
      FROM assignments a
      JOIN shifts s ON s.id = a.shift_id
      WHERE s.schedule_id = ? AND a.employee_id = ? AND a.is_sick = 0
    `).all(scheduleId, emp.employee_id);

    let totalMinutes = 0;
    for (const s of shifts) {
      totalMinutes += calculateShiftMinutes(s);
    }
    const totalHours = totalMinutes / 60;

    if (totalHours > RULES.MAX_WEEKLY_HOURS) {
      violations.push({
        rule: 'WEEKLY_HOURS',
        severity: 'error',
        employeeId: emp.employee_id,
        message: `${emp.short_code}: Wochenhöchstarbeitszeit überschritten (${totalHours.toFixed(1)}h > ${RULES.MAX_WEEKLY_HOURS}h)`
      });
    }
  }
  return violations;
}

function calculateShiftMinutes(shift) {
  const [sh, sm] = shift.start_time.split(':').map(Number);
  let [eh, em] = shift.end_time.split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60; // overnight
  
  if (shift.shift_type === 'bereitschaft') minutes = Math.round(minutes * RULES.BEREITSCHAFT_FACTOR);
  if (shift.shift_type === 'rufbereitschaft') minutes = Math.round(minutes * 0.125);
  return minutes;
}

function parseDateTime(date, time, nextDay = false) {
  const [h, m] = time.split(':').map(Number);
  const dt = new Date(`${date}T${time.padStart(5, '0')}:00`);
  if (nextDay || h < 6) dt.setDate(dt.getDate() + (nextDay ? 1 : 0));
  return dt;
}

/**
 * Schlägt Ersatzmitarbeiter für eine ausgefallene Schicht vor
 */
function suggestReplacements(shiftId) {
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
  if (!shift) return [];

  // Get all active employees not already in this shift
  const assigned = db.prepare('SELECT employee_id FROM assignments WHERE shift_id = ?').all(shiftId).map(a => a.employee_id);
  const candidates = db.prepare(`
    SELECT e.*, GROUP_CONCAT(q.name) as qualifications, 
           GROUP_CONCAT(q.is_fachkraft) as is_fachkraft_list
    FROM employees e
    LEFT JOIN employee_qualifications eq ON eq.employee_id = e.id
    LEFT JOIN qualifications q ON q.id = eq.qualification_id
    WHERE e.active = 1 ${assigned.length ? `AND e.id NOT IN (${assigned.join(',')})` : ''}
    GROUP BY e.id
  `).all();

  const scored = [];
  for (const emp of candidates) {
    const restViolations = checkRestTime(emp.id, shift);
    const hasRestIssue = restViolations.length > 0;
    const isFachkraft = (emp.is_fachkraft_list || '').includes('1');
    const hasNightAuth = emp.can_do_nightshift_alone || shift.shift_type !== 'nacht';
    
    scored.push({
      employee: emp,
      feasible: !hasRestIssue && hasNightAuth,
      warnings: hasRestIssue ? ['Ruhezeit nicht eingehalten'] : [],
      isFachkraft,
      score: (isFachkraft ? 2 : 0) + (hasNightAuth ? 1 : 0) - (emp.overtime_balance > 10 ? 1 : 0)
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, 5);
}

module.exports = { validateSchedule, validateShift, suggestReplacements, getFachkraefteCount };
