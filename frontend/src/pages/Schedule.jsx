import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { format, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// ─── Konstanten ────────────────────────────────────────────────────────────────
const SHIFT_TYPE_META = {
  frueh:          { label: 'Früh',           color: 'bg-orange-500',  light: 'bg-orange-50 border-orange-300 text-orange-800',  dot: 'bg-orange-500',  defaults: { start: '06:00', end: '14:00', break: 30 } },
  spaet:          { label: 'Spät',           color: 'bg-blue-500',    light: 'bg-blue-50   border-blue-300   text-blue-800',    dot: 'bg-blue-500',    defaults: { start: '14:00', end: '22:00', break: 30 } },
  nacht:          { label: 'Nacht',          color: 'bg-indigo-700',  light: 'bg-indigo-50 border-indigo-300 text-indigo-800', dot: 'bg-indigo-700', defaults: { start: '22:00', end: '06:00', break: 0  } },
  bereitschaft:   { label: 'Bereitschaft',   color: 'bg-emerald-500', light: 'bg-emerald-50 border-emerald-300 text-emerald-800', dot: 'bg-emerald-500', defaults: { start: '06:00', end: '22:00', break: 0  } },
  rufbereitschaft:{ label: 'Rufbereitschaft',color: 'bg-gray-500',    light: 'bg-gray-50   border-gray-300   text-gray-700',    dot: 'bg-gray-500',    defaults: { start: '06:00', end: '22:00', break: 0  } },
};

const STATUS_META = {
  draft:     { label: 'Entwurf',        cls: 'bg-amber-100 text-amber-700 border-amber-300' },
  published: { label: 'Veröffentlicht', cls: 'bg-green-100 text-green-700  border-green-300' },
  archived:  { label: 'Archiviert',     cls: 'bg-gray-100  text-gray-500   border-gray-300' },
};

function calcNet(start, end, brk) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let m = (eh * 60 + em) - (sh * 60 + sm);
  if (m < 0) m += 1440;
  m -= (brk || 0);
  return m / 60;
}
function fmtH(h) {
  const hrs = Math.floor(h), min = Math.round((h - hrs) * 60);
  return min ? `${hrs}h${min}` : `${hrs}h`;
}

/**
 * Bug 1 – ROOT FIX:
 * parseISO('2026-02-23') liefert UTC-Mitternacht (00:00Z).
 * In UTC+1 ist das 22.02. 23:00 Uhr lokal → alle format()-Aufrufe
 * zeigen einen Tag zu früh an.
 *
 * Lösung: Datum immer als lokalen Mittag parsen ('T12:00:00').
 * Dann ist man 12 h von jeder DST-Grenze entfernt und timezone-sicher.
 */
function localNoon(dateStr) {
  // dateStr z.B. '2026-02-23'
  return new Date(dateStr + 'T12:00:00');
}

// ─── Hauptkomponente ────────────────────────────────────────────────────────────
export default function Schedule() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [schedule, setSchedule]     = useState(null);
  const [shifts, setShifts]         = useState([]);
  const [employees, setEmployees]   = useState([]);
  const [violations, setViolations] = useState([]);
  const [loading, setLoading]       = useState(true);

  const [modal, setModal]   = useState(null);
  const [form, setForm]     = useState({});
  const [saving, setSaving] = useState(false);
  const [showViolations, setShowViolations] = useState(false);

  const canEdit = ['leitung', 'teamleitung'].includes(user?.role);

  const load = useCallback(async () => {
    const [sched, shiftsData, emps, valid] = await Promise.all([
      api.get(`/schedules/${id}`),
      api.get(`/shifts/schedule/${id}`),
      api.get('/employees'),
      api.get(`/schedules/${id}/validate`),
    ]);
    setSchedule(sched);
    setShifts(shiftsData);
    setEmployees(emps);
    setViolations(valid.violations || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Wochentage – Bug1 fix: localNoon() statt parseISO() ──
  const todayStr = format(new Date(), 'yyyy-MM-dd'); // lokales Datum heute
  const days = schedule ? Array.from({ length: 7 }, (_, i) => {
    const d = addDays(localNoon(schedule.week_start), i); // lokaler Mittag + n Tage
    return {
      date:       format(d, 'yyyy-MM-dd'),          // lokales Datum als Key
      shortDay:   format(d, 'EEE', { locale: de }), // lokaler Wochentag
      dayNum:     format(d, 'dd'),
      monthShort: format(d, 'MMM', { locale: de }),
      isToday:    format(d, 'yyyy-MM-dd') === todayStr,
    };
  }) : [];

  // ── Schichten pro MA × Tag ───────────────────────────────────────────────────
  const empDayShifts = {};
  const openShifts = [];
  employees.forEach(e => { empDayShifts[e.id] = {}; });
  shifts.forEach(shift => {
    if (shift.assignments.length === 0) {
      openShifts.push(shift);
    } else {
      shift.assignments.forEach(a => {
        if (!empDayShifts[a.employee_id]) empDayShifts[a.employee_id] = {};
        if (!empDayShifts[a.employee_id][shift.date]) empDayShifts[a.employee_id][shift.date] = [];
        empDayShifts[a.employee_id][shift.date].push({ ...shift, myAssignment: a });
      });
    }
  });

  const empHours = {};
  employees.forEach(e => {
    let total = 0;
    Object.values(empDayShifts[e.id] || {}).forEach(dayArr =>
      dayArr.forEach(s => {
        if (!s.myAssignment?.is_sick)
          total += calcNet(s.start_time, s.end_time, s.break_minutes);
      })
    );
    empHours[e.id] = total;
  });

  const dayStaffCount = {};
  days.forEach(d => {
    dayStaffCount[d.date] = employees.filter(e =>
      (empDayShifts[e.id]?.[d.date] || []).some(s => !s.myAssignment?.is_sick)
    ).length;
  });

  const errCount  = violations.filter(v => v.severity === 'error').length;
  const warnCount = violations.filter(v => v.severity === 'warning').length;
  const violsByShift = violations.reduce((acc, v) => {
    if (v.shiftId) (acc[v.shiftId] = acc[v.shiftId] || []).push(v);
    return acc;
  }, {});

  // ── Modal-Helpers ────────────────────────────────────────────────────────────
  const openCreate = (date, type = 'frueh', employee = null) => {
    const defaults = SHIFT_TYPE_META[type].defaults;
    setForm({
      shift_type: type,
      label: SHIFT_TYPE_META[type].label + 'dienst',
      start_time: defaults.start,
      end_time: defaults.end,
      break_minutes: defaults.break,
      min_staff: 2,
      min_fachkraft: 1,
      date,
      prefillEmployee: employee,
    });
    setModal({ mode: 'create', date, employee });
  };

  const openEdit = (shift) => {
    setForm({ ...shift });
    setModal({ mode: 'edit', shift });
  };

  const handleShiftTypeChange = (type) => {
    const d = SHIFT_TYPE_META[type].defaults;
    setForm(f => ({ ...f, shift_type: type, label: SHIFT_TYPE_META[type].label + 'dienst',
      start_time: d.start, end_time: d.end, break_minutes: d.break }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal.mode === 'create') {
        const r = await api.post('/shifts', { ...form, schedule_id: parseInt(id) });
        setViolations(r.violations || []);
        if (form.prefillEmployee) {
          await api.post('/assignments', { shift_id: r.id, employee_id: form.prefillEmployee.id });
        }
      } else {
        const r = await api.put(`/shifts/${modal.shift.id}`, form);
        setViolations(r.violations || []);
      }
      setModal(null);
      await load();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleDeleteShift = async (shiftId) => {
    if (!confirm('Dienst und alle Einplanungen löschen?')) return;
    await api.delete(`/shifts/${shiftId}`);
    setModal(null);
    await load();
  };

  const handleAddAssignment = async (shiftId, employeeId) => {
    if (!employeeId) return;
    try {
      const r = await api.post('/assignments', { shift_id: shiftId, employee_id: parseInt(employeeId) });
      setViolations(r.violations || []);
      await load();
    } catch (err) { alert(err.message); }
  };

  const handleRemoveAssignment = async (assignmentId) => {
    await api.delete(`/assignments/${assignmentId}`);
    await load();
  };

  const handleMarkSick = async (assignmentId, is_sick) => {
    const r = await api.patch(`/assignments/${assignmentId}/sick`, { is_sick });
    setViolations(r.violations || []);
    await load();
  };

  // Bug 4 fix: Warnung bei leerem Plan
  const handlePublish = async () => {
    if (shifts.length === 0) {
      const ok = confirm('Dieser Dienstplan enthält noch keine Dienste.\n\nTrotzdem veröffentlichen?');
      if (!ok) return;
    }
    try {
      await api.patch(`/schedules/${id}/status`, { status: 'published' });
      await load();
    } catch (e) { alert('Veröffentlichung fehlgeschlagen:\n' + (e.message || '')); }
  };

  const handleArchive = async () => {
    if (!confirm('Plan archivieren?')) return;
    await api.patch(`/schedules/${id}/status`, { status: 'archived' });
    await load();
  };

  const handlePDF = async () => {
    const el = document.getElementById('plan-grid');
    const canvas = await html2canvas(el, { scale: 1.5, useCORS: true });
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth();
    const h = (canvas.height / canvas.width) * w;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
    pdf.save(`Dienstplan-${schedule?.name || id}.pdf`);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <div className="animate-spin w-8 h-8 border-4 border-blue-300 border-t-blue-600 rounded-full mr-3" />
      Lade Dienstplan…
    </div>
  );

  const sm = STATUS_META[schedule?.status] || STATUS_META.draft;

  return (
    <div className="flex flex-col h-full bg-gray-50" style={{ minHeight: 0 }}>

      {/* ═══ HEADER ═══ */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 flex-wrap no-print shadow-sm">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-gray-900 text-lg">{schedule?.name}</h1>
          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${sm.cls}`}>{sm.label}</span>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {(errCount > 0 || warnCount > 0) && (
            <button onClick={() => setShowViolations(v => !v)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                errCount > 0 ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
                             : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
              }`}>
              <span>{errCount > 0 ? '⚠' : '○'}</span>
              {errCount > 0 && <span>{errCount} Fehler</span>}
              {warnCount > 0 && <span>{warnCount} Hinweise</span>}
            </button>
          )}
          {errCount === 0 && warnCount === 0 && (
            <span className="text-xs text-green-600 flex items-center gap-1 px-3 py-1.5">✓ Keine Regelverstöße</span>
          )}
          {canEdit && schedule?.status === 'draft' && (
            <button onClick={handlePublish}
              disabled={errCount > 0}
              title={errCount > 0 ? 'Erst alle Fehler beheben' : ''}
              className={`flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${
                errCount > 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}>
              Veröffentlichen
            </button>
          )}
          {canEdit && schedule?.status === 'published' && (
            <button onClick={handleArchive}
              className="text-sm px-4 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
              Archivieren
            </button>
          )}
          <button onClick={handlePDF}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center gap-1.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            PDF
          </button>
        </div>
      </div>

      {/* ═══ VIOLATIONS PANEL ═══ */}
      {showViolations && violations.length > 0 && (
        <div className="bg-white border-b border-gray-200 px-6 py-3 no-print">
          <div className="flex flex-wrap gap-2">
            {violations.map((v, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg border ${
                v.severity === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                <span className="mt-0.5">{v.severity === 'error' ? '⚠' : '○'}</span>
                <span>{v.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ LEGENDE ═══ */}
      <div className="bg-white border-b border-gray-100 px-6 py-2 flex items-center gap-4 text-xs text-gray-500 no-print overflow-x-auto">
        {Object.entries(SHIFT_TYPE_META).map(([k, m]) => (
          <div key={k} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={`w-2.5 h-2.5 rounded-full ${m.dot}`} />{m.label}
          </div>
        ))}
        <div className="ml-auto">
          {canEdit && schedule?.status === 'draft' && (
            <span className="text-blue-500">Auf leere Zelle klicken → Dienst anlegen</span>
          )}
        </div>
      </div>

      {/* ═══ PLANUNGS-GRID ═══ */}
      <div className="flex-1 overflow-auto">
        <div id="plan-grid" className="min-w-max">

          {/* Spalten-Header */}
          <div className="sticky top-0 z-20 bg-white border-b-2 border-gray-200 flex shadow-sm">
            <div className="w-52 shrink-0 px-4 py-3 border-r border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mitarbeitende</span>
              <div className="text-xs text-gray-400 mt-0.5">{employees.length} Personen</div>
            </div>
            {days.map(d => (
              <div key={d.date}
                className={`flex-1 min-w-[130px] px-2 py-3 text-center border-r border-gray-100 ${d.isToday ? 'bg-blue-50' : ''}`}>
                <div className={`text-xs font-semibold uppercase tracking-wide ${d.isToday ? 'text-blue-600' : 'text-gray-500'}`}>{d.shortDay}</div>
                <div className={`text-2xl font-bold leading-tight ${d.isToday ? 'text-blue-600' : 'text-gray-800'}`}>{d.dayNum}</div>
                <div className="text-xs text-gray-400">{d.monthShort}</div>
                <div className={`mt-1 text-xs font-medium px-2 py-0.5 rounded-full inline-block ${
                  dayStaffCount[d.date] === 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
                }`}>{dayStaffCount[d.date]} MA</div>
              </div>
            ))}
            <div className="w-20 shrink-0 px-2 py-3 text-center">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ist</div>
              <div className="text-xs text-gray-400 mt-0.5">Soll</div>
            </div>
          </div>

          {/* Mitarbeiter-Zeilen */}
          {employees.map((emp, idx) => {
            const planned = empHours[emp.id] || 0;
            const soll    = emp.contract_hours || 39;
            const diff    = planned - soll;
            const diffCls = diff > 0 ? 'text-orange-500' : diff < -2 ? 'text-blue-500' : 'text-green-600';
            return (
              <div key={emp.id}
                className={`flex border-b ${
                  idx === employees.length - 1 ? 'border-gray-300' : 'border-gray-100'
                } hover:bg-gray-50/50 transition-colors group`}>

                <div className="w-52 shrink-0 px-3 py-3 border-r border-gray-200 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {emp.first_name[0]}{emp.last_name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{emp.last_name}, {emp.first_name}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{emp.short_code}</span>
                      {emp.qualifications?.filter(q => q.is_fachkraft).map(q => (
                        <span key={q.id} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded" title={q.name}>★</span>
                      ))}
                    </div>
                  </div>
                </div>

                {days.map(d => {
                  const dayArr = empDayShifts[emp.id]?.[d.date] || [];
                  return (
                    <div key={d.date}
                      onClick={() => {
                        if (canEdit && schedule?.status === 'draft' && dayArr.length === 0)
                          openCreate(d.date, 'frueh', emp);
                      }}
                      className={`flex-1 min-w-[130px] border-r border-gray-100 p-1.5 flex flex-col gap-1 ${
                        d.isToday ? 'bg-blue-50/30' : ''
                      } ${
                        canEdit && schedule?.status === 'draft' && dayArr.length === 0
                          ? 'cursor-pointer hover:bg-blue-50 group/cell' : ''
                      }`}>
                      {dayArr.map(shift => {
                        const meta  = SHIFT_TYPE_META[shift.shift_type] || SHIFT_TYPE_META.frueh;
                        const isErr = (violsByShift[shift.id] || []).some(v => v.severity === 'error');
                        return (
                          <ShiftChip key={`${shift.id}-${emp.id}`}
                            shift={shift} assignment={shift.myAssignment} meta={meta} isErr={isErr}
                            canEdit={canEdit && schedule?.status === 'draft'}
                            onEdit={() => openEdit(shift)}
                            onRemove={() => handleRemoveAssignment(shift.myAssignment?.id)}
                            onMarkSick={() => handleMarkSick(shift.myAssignment?.id, !shift.myAssignment?.is_sick)}
                          />
                        );
                      })}
                      {dayArr.length === 0 && canEdit && schedule?.status === 'draft' && (
                        <div className="flex-1 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity">
                          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="w-20 shrink-0 flex flex-col items-center justify-center py-2 text-center">
                  <div className={`text-sm font-bold ${diffCls}`}>{fmtH(planned)}</div>
                  <div className="text-xs text-gray-400">{soll}h</div>
                  {Math.abs(diff) > 0.5 && (
                    <div className={`text-xs font-medium ${diffCls}`}>{diff > 0 ? '+' : ''}{fmtH(Math.abs(diff))}</div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Offene Schichten */}
          {openShifts.length > 0 && (
            <div className="border-t-2 border-dashed border-gray-300">
              <div className="flex bg-amber-50">
                <div className="w-52 shrink-0 px-4 py-3 border-r border-gray-200">
                  <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">⚠ Offene Dienste</div>
                  <div className="text-xs text-amber-600 mt-0.5">Noch keine MA eingeplant</div>
                </div>
                {days.map(d => {
                  const dayOpenShifts = openShifts.filter(s => s.date === d.date);
                  return (
                    <div key={d.date} className="flex-1 min-w-[130px] p-1.5 border-r border-gray-100 flex flex-col gap-1">
                      {dayOpenShifts.map(shift => {
                        const meta = SHIFT_TYPE_META[shift.shift_type] || SHIFT_TYPE_META.frueh;
                        const available = employees.filter(e => !shift.assignments.map(a => a.employee_id).includes(e.id));
                        return (
                          <div key={shift.id} className="rounded-lg border-2 border-dashed border-amber-300 bg-white px-2 py-1.5 text-xs">
                            <div className="flex items-center gap-1 mb-1">
                              <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                              <span className="font-medium text-gray-700 truncate">{shift.label || meta.label}</span>
                            </div>
                            <div className="text-gray-500">{shift.start_time}–{shift.end_time}</div>
                            {canEdit && schedule?.status === 'draft' && (
                              <select className="mt-1.5 w-full text-xs border border-gray-300 rounded px-1 py-0.5 bg-white"
                                value="" onChange={e => { if (e.target.value) handleAddAssignment(shift.id, e.target.value); }}>
                                <option value="">+ MA einplanen…</option>
                                {available.map(e => <option key={e.id} value={e.id}>{e.short_code} – {e.last_name}</option>)}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                <div className="w-20 shrink-0" />
              </div>
            </div>
          )}

          {/* Fußzeile */}
          {canEdit && schedule?.status === 'draft' && (
            <div className="flex border-t border-gray-100 bg-white no-print">
              <div className="w-52 shrink-0 px-4 py-2 border-r border-gray-200">
                <span className="text-xs text-gray-400">Offenen Dienst anlegen</span>
              </div>
              {days.map(d => (
                <div key={d.date} className="flex-1 min-w-[130px] p-1.5 border-r border-gray-100 flex gap-1 flex-wrap">
                  {['frueh','spaet','nacht'].map(type => (
                    <button key={type} onClick={() => openCreate(d.date, type, null)}
                      className={`text-xs px-2 py-1 rounded-md border font-medium transition-colors ${SHIFT_TYPE_META[type].light} hover:opacity-80`}>
                      + {SHIFT_TYPE_META[type].label}
                    </button>
                  ))}
                </div>
              ))}
              <div className="w-20 shrink-0" />
            </div>
          )}
        </div>
      </div>

      {/* ════ MODAL ════ */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="font-bold text-gray-900">
                  {modal.mode === 'create' ? 'Dienst anlegen' : 'Dienst bearbeiten'}
                </h3>
                {/* Bug 1 fix: localNoon() statt parseISO() für korrekte Datumsanzeige im Modal */}
                <p className="text-xs text-gray-500 mt-0.5">
                  {modal.mode === 'create' && modal.date &&
                    format(localNoon(modal.date), 'EEEE, dd. MMMM yyyy', { locale: de })}
                  {modal.employee && ` · ${modal.employee.first_name} ${modal.employee.last_name}`}
                  {modal.mode === 'edit' && modal.shift &&
                    format(localNoon(modal.shift.date), 'EEEE, dd. MMMM yyyy', { locale: de })}
                </p>
              </div>
              <button onClick={() => setModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors text-xl">×</button>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Diensttyp</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(SHIFT_TYPE_META).map(([val, m]) => (
                    <button type="button" key={val}
                      onClick={() => handleShiftTypeChange(val)}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border-2 transition-all ${
                        form.shift_type === val ? `${m.light} border-current` : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      <div className={`w-2.5 h-2.5 rounded-full ${m.dot} mx-auto mb-1`} />{m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Bezeichnung</label>
                <input className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="z. B. Frühdienst 1, Spätdienst A…"
                  value={form.label || ''}
                  onChange={e => setForm(f => ({...f, label: e.target.value}))} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Beginn</label>
                  <input type="time" required
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.start_time || ''} onChange={e => setForm(f => ({...f, start_time: e.target.value}))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ende</label>
                  <input type="time" required
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.end_time || ''} onChange={e => setForm(f => ({...f, end_time: e.target.value}))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pause</label>
                  <div className="relative">
                    <input type="number" min="0" max="120" step="5"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.break_minutes || 0} onChange={e => setForm(f => ({...f, break_minutes: parseInt(e.target.value)||0}))} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">min</span>
                  </div>
                </div>
              </div>

              {form.start_time && form.end_time && (
                <div className="flex items-center gap-3 bg-blue-50 rounded-xl px-4 py-3">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-blue-700">
                    <span className="font-semibold">{fmtH(calcNet(form.start_time, form.end_time, form.break_minutes))}</span>
                    {' '}Nettoarbeitszeit
                    {form.break_minutes > 0 && <span className="text-blue-500"> ({form.break_minutes} min Pause)</span>}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Mindestbesetzung</label>
                  <input type="number" min="1" max="20"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.min_staff || 1} onChange={e => setForm(f => ({...f, min_staff: parseInt(e.target.value)||1}))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Davon Fachkräfte</label>
                  <input type="number" min="0" max="10"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.min_fachkraft ?? 1} onChange={e => setForm(f => ({...f, min_fachkraft: parseInt(e.target.value)||0}))} />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl transition-colors">
                  {saving ? 'Speichere…' : modal.mode === 'create' ? 'Dienst anlegen' : 'Speichern'}
                </button>
                {modal.mode === 'edit' && canEdit && (
                  <button type="button" onClick={() => handleDeleteShift(modal.shift.id)}
                    className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors">Löschen</button>
                )}
                <button type="button" onClick={() => setModal(null)}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">Abbrechen</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ShiftChip ───────────────────────────────────────────────────────────────
function ShiftChip({ shift, assignment, meta, isErr, canEdit, onEdit, onRemove, onMarkSick }) {
  const [expanded, setExpanded] = useState(false);
  const isSick = assignment?.is_sick;
  return (
    <div className={`rounded-lg border text-xs select-none transition-all ${
      isSick ? 'border-red-300 bg-red-50 opacity-70'
        : isErr ? 'border-red-400 bg-red-50'
        : `${meta.light} border`
    }`}>
      <div className="px-2 py-1.5 cursor-pointer" onClick={() => canEdit && setExpanded(e => !e)}>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot} ${isSick ? 'opacity-40' : ''}`} />
          <span className={`font-semibold truncate flex-1 ${isSick ? 'line-through opacity-60' : ''}`}>
            {shift.label || meta.label}
          </span>
          {isErr && !isSick && <span title="Regelverstoß">⚠</span>}
          {isSick && <span title="Krank gemeldet">🤒</span>}
          {canEdit && <span className="text-current opacity-40">{expanded ? '▲' : '▼'}</span>}
        </div>
        <div className={`text-current opacity-70 mt-0.5 ${isSick ? 'line-through opacity-40' : ''}`}>
          {shift.start_time}–{shift.end_time}
          {shift.break_minutes > 0 && <span className="ml-1 opacity-60">({shift.break_minutes}′)</span>}
        </div>
      </div>
      {expanded && canEdit && (
        <div className="border-t border-current/10 px-2 py-1.5 flex flex-wrap gap-1">
          <button onClick={onMarkSick}
            className={`px-2 py-0.5 rounded border text-xs transition-colors ${
              isSick ? 'border-green-400 text-green-700 bg-green-50 hover:bg-green-100'
                     : 'border-red-300 text-red-600 bg-red-50 hover:bg-red-100'
            }`}>{isSick ? '✓ Gesund' : '✗ Krank'}</button>
          <button onClick={onEdit}
            className="px-2 py-0.5 rounded border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-colors">✏ Bearbeiten</button>
          <button onClick={onRemove}
            className="px-2 py-0.5 rounded border border-gray-300 text-gray-500 bg-white hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors ml-auto">✕</button>
        </div>
      )}
    </div>
  );
}
