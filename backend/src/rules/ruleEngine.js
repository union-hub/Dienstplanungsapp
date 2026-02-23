/**
 * Regel-Engine für die Dienstplanvalidierung
 * Alle Prüfungen laufen serverseitig.
 */
const { db } = require('../db/database');

const RULES = {
  MIN_REST_HOURS: 11,
  MAX_DAILY_HOURS: 10,
  MAX_WEEKLY_HOURS: 48,
  BEREITSCHAFT_FACTOR: 0.25,
};

function validateSchedule(scheduleId) {
  const violations = [];
  const shifts = db.prepare(
    'SELECT s.*, sc.week_start FROM shifts s JOIN schedules sc ON sc.id=s.schedule_id WHERE s.schedule_id=? ORDER BY s.date, s.start_time'
  ).all(scheduleId);

  for (const shift of shifts) violations.push(...validateShift(shift));
  violations.push(...validateWeeklyHours(scheduleId));
  return { violations, valid: violations.filter(v => v.severity === 'error').length === 0 };
}

function validateShift(shift) {
  const violations = [];
  const assignments = db.prepare(
    'SELECT a.*, e.can_do_nightshift_alone, e.first_name, e.last_name, e.short_code FROM assignments a JOIN employees e ON e.id=a.employee_id WHERE a.shift_id=? AND a.is_sick=0'
  ).all(shift.id);

  if (assignments.length < shift.min_staff) {
    violations.push({ rule:'MIN_STAFF', severity:'error', shiftId:shift.id,
      message:`Mindestbesetzung: ${assignments.length}/${shift.min_staff} MA am ${shift.date} (${shift.label||shift.shift_type})` });
  }

  const fachkraefte = getFachkraefteCount(assignments.map(a => a.employee_id));
  if (fachkraefte < shift.min_fachkraft) {
    violations.push({ rule:'MIN_FACHKRAFT', severity:'error', shiftId:shift.id,
      message:`Fachkraftquote: ${fachkraefte}/${shift.min_fachkraft} Fachkräfte am ${shift.date} (${shift.label||shift.shift_type})` });
  }

  if (shift.shift_type === 'nacht') {
    const noNight = assignments.filter(a => !a.can_do_nightshift_alone);
    if (noNight.length > 0 && assignments.length === 1) {
      violations.push({ rule:'NIGHTSHIFT_ALONE', severity:'error', shiftId:shift.id,
        message:`${noNight.map(a=>a.short_code).join(',')} darf nicht alleine im Nachtdienst.` });
    }
  }

  violations.push(...checkRestrictions(shift, assignments));
  for (const a of assignments) violations.push(...checkRestTime(a.employee_id, shift));
  if (shift.shift_type === 'nacht') violations.push(...checkNightSupervision(shift, assignments));
  return violations;
}

function getFachkraefteCount(employeeIds) {
  if (!employeeIds.length) return 0;
  const rows = db.prepare(
    'SELECT COUNT(DISTINCT eq.employee_id) as cnt FROM employee_qualifications eq JOIN qualifications q ON q.id=eq.qualification_id WHERE q.is_fachkraft=1'
  ).get();
  // Filter by IDs manually since sql.js doesn't support dynamic IN() easily
  let count = 0;
  for (const id of employeeIds) {
    const r = db.prepare(
      'SELECT COUNT(*) as cnt FROM employee_qualifications eq JOIN qualifications q ON q.id=eq.qualification_id WHERE q.is_fachkraft=1 AND eq.employee_id=?'
    ).get(id);
    if (r && r.cnt > 0) count++;
  }
  return count;
}

function checkRestrictions(shift, assignments) {
  const violations = [];
  for (const a of assignments) {
    const restrictions = db.prepare(
      'SELECT rr.*, r.first_name||\'  \'||r.last_name as resident_name, e.short_code as employee_code FROM resident_restrictions rr JOIN residents r ON r.id=rr.resident_id JOIN employees e ON e.id=rr.employee_id WHERE r.active=1 AND rr.employee_id=?'
    ).all(a.employee_id);
    for (const r of restrictions) {
      if (r.restriction_type === 'forbidden') {
        violations.push({ rule:'EMPLOYEE_RESTRICTION', severity:'error', shiftId:shift.id, employeeId:a.employee_id,
          message:`${r.employee_code} darf nicht mit Bewohner*in ${r.resident_name} eingesetzt werden.` });
      }
    }
  }
  return violations;
}

function checkRestTime(employeeId, currentShift) {
  const prev = db.prepare(
    'SELECT s.date, s.end_time, s.shift_type FROM assignments a JOIN shifts s ON s.id=a.shift_id WHERE a.employee_id=? AND a.is_sick=0 AND s.date<=? AND NOT (s.date=? AND s.start_time>=?) ORDER BY s.date DESC, s.end_time DESC LIMIT 1'
  ).get(employeeId, currentShift.date, currentShift.date, currentShift.start_time);

  if (!prev) return [];
  const prevEnd = parseDateTime(prev.date, prev.end_time, prev.shift_type === 'nacht');
  const currStart = parseDateTime(currentShift.date, currentShift.start_time);
  const restHours = (currStart - prevEnd) / 3600000;
  if (restHours < RULES.MIN_REST_HOURS && restHours > 0) {
    const emp = db.prepare('SELECT short_code FROM employees WHERE id=?').get(employeeId);
    return [{ rule:'REST_TIME', severity:'error', shiftId:currentShift.id, employeeId,
      message:`${emp?.short_code}: Ruhezeit unterschritten (${restHours.toFixed(1)}h < 11h) am ${currentShift.date}` }];
  }
  return [];
}

function checkNightSupervision(shift, assignments) {
  const needed = db.prepare('SELECT short_code FROM residents WHERE needs_night_supervision=1 AND active=1').all();
  if (needed.length > 0 && assignments.length === 0) {
    return [{ rule:'NIGHT_SUPERVISION', severity:'error', shiftId:shift.id,
      message:`Nachtaufsicht nötig für: ${needed.map(r=>r.short_code).join(', ')} – kein Personal.` }];
  }
  return [];
}

function validateWeeklyHours(scheduleId) {
  const violations = [];
  const employees = db.prepare(
    'SELECT DISTINCT a.employee_id, e.short_code FROM assignments a JOIN shifts s ON s.id=a.shift_id JOIN employees e ON e.id=a.employee_id WHERE s.schedule_id=? AND a.is_sick=0'
  ).all(scheduleId);

  for (const emp of employees) {
    const shifts = db.prepare(
      'SELECT s.start_time, s.end_time, s.shift_type FROM assignments a JOIN shifts s ON s.id=a.shift_id WHERE s.schedule_id=? AND a.employee_id=? AND a.is_sick=0'
    ).all(scheduleId, emp.employee_id);
    const totalHours = shifts.reduce((sum, s) => sum + calcMinutes(s)/60, 0);
    if (totalHours > RULES.MAX_WEEKLY_HOURS) {
      violations.push({ rule:'WEEKLY_HOURS', severity:'error', employeeId:emp.employee_id,
        message:`${emp.short_code}: Wochenhöchstarbeitszeit überschritten (${totalHours.toFixed(1)}h)` });
    }
  }
  return violations;
}

function calcMinutes(shift) {
  const [sh,sm] = shift.start_time.split(':').map(Number);
  const [eh,em] = shift.end_time.split(':').map(Number);
  let m = (eh*60+em) - (sh*60+sm);
  if (m < 0) m += 1440;
  if (shift.shift_type === 'bereitschaft') m = Math.round(m * RULES.BEREITSCHAFT_FACTOR);
  if (shift.shift_type === 'rufbereitschaft') m = Math.round(m * 0.125);
  return m;
}

function parseDateTime(date, time, nextDay = false) {
  const [h, m] = time.split(':').map(Number);
  const dt = new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
  if (nextDay) dt.setDate(dt.getDate() + 1);
  return dt;
}

function suggestReplacements(shiftId) {
  const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(shiftId);
  if (!shift) return [];
  const assigned = db.prepare('SELECT employee_id FROM assignments WHERE shift_id=?').all(shiftId).map(a => a.employee_id);
  const all = db.prepare(
    'SELECT e.*, (SELECT COUNT(*) FROM employee_qualifications eq JOIN qualifications q ON q.id=eq.qualification_id WHERE q.is_fachkraft=1 AND eq.employee_id=e.id) as fachkraft_count FROM employees e WHERE e.active=1'
  ).all();

  return all
    .filter(e => !assigned.includes(e.id))
    .map(e => {
      const restViolations = checkRestTime(e.id, shift);
      const isFachkraft = e.fachkraft_count > 0;
      const hasNightAuth = e.can_do_nightshift_alone || shift.shift_type !== 'nacht';
      return {
        employee: e,
        feasible: restViolations.length === 0 && hasNightAuth,
        warnings: restViolations.map(v => v.message),
        isFachkraft,
        score: (isFachkraft?2:0) + (hasNightAuth?1:0) - (e.overtime_balance>10?1:0)
      };
    })
    .sort((a,b) => b.score - a.score)
    .slice(0, 5);
}

module.exports = { validateSchedule, validateShift, suggestReplacements, getFachkraefteCount };
