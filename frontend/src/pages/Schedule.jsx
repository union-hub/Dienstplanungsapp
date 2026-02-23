import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import ViolationPanel from '../components/ViolationPanel';
import { format, parseISO, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const SHIFT_COLORS = {
  frueh:         'bg-amber-50  border-amber-300  text-amber-800',
  spaet:         'bg-blue-50   border-blue-300   text-blue-800',
  nacht:         'bg-indigo-50 border-indigo-300 text-indigo-800',
  bereitschaft:  'bg-green-50  border-green-300  text-green-800',
  rufbereitschaft:'bg-gray-50  border-gray-300   text-gray-700',
};
const SHIFT_LABELS = {
  frueh:'Früh', spaet:'Spät', nacht:'Nacht',
  bereitschaft:'Bereitschaft', rufbereitschaft:'Rufbereitschaft'
};
const SHIFT_DEFAULTS = {
  frueh: { start_time:'06:00', end_time:'14:00', break_minutes:30, label:'Frühdienst' },
  spaet: { start_time:'14:00', end_time:'22:00', break_minutes:30, label:'Spätdienst' },
  nacht: { start_time:'22:00', end_time:'06:00', break_minutes:0,  label:'Nachtwache' },
  bereitschaft: { start_time:'06:00', end_time:'22:00', break_minutes:0, label:'Bereitschaft' },
  rufbereitschaft: { start_time:'06:00', end_time:'22:00', break_minutes:0, label:'Rufbereitschaft' },
};

const EMPTY_SHIFT_FORM = {
  shift_type: 'frueh', label: 'Frühdienst',
  start_time: '06:00', end_time: '14:00',
  break_minutes: 30, min_staff: 2, min_fachkraft: 1,
};

function calcNetHours(start, end, breakMin) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 1440;
  const net = mins - (breakMin || 0);
  const h = Math.floor(net / 60);
  const m = net % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default function Schedule() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal: Dienst anlegen
  const [shiftModal, setShiftModal] = useState(null); // { date } or null
  const [shiftForm, setShiftForm] = useState(EMPTY_SHIFT_FORM);
  const [shiftSaving, setShiftSaving] = useState(false);

  // Modal: Dienst bearbeiten
  const [editModal, setEditModal] = useState(null); // shift object
  const [editForm, setEditForm] = useState({});

  // Expanded shift (to show MA controls)
  const [expandedShift, setExpandedShift] = useState(null);

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

  // Build week days from schedule
  const days = schedule ? Array.from({ length: 7 }, (_, i) => {
    const d = addDays(parseISO(schedule.week_start), i);
    return { date: d.toISOString().split('T')[0], label: format(d, 'EEE dd.MM.', { locale: de }) };
  }) : [];

  // Group shifts by date
  const shiftsByDate = shifts.reduce((acc, s) => {
    (acc[s.date] = acc[s.date] || []).push(s);
    return acc;
  }, {});

  // ------- Shift Modal Handlers -------
  const openShiftModal = (date) => {
    setShiftForm({ ...EMPTY_SHIFT_FORM, date });
    setShiftModal(date);
  };

  const handleShiftTypeChange = (type) => {
    const defaults = SHIFT_DEFAULTS[type] || {};
    setShiftForm(f => ({ ...f, shift_type: type, ...defaults }));
  };

  const handleCreateShift = async (e) => {
    e.preventDefault();
    setShiftSaving(true);
    try {
      const r = await api.post('/shifts', { ...shiftForm, schedule_id: parseInt(id) });
      setViolations(r.violations || []);
      setShiftModal(null);
      await load();
    } catch (err) { alert(err.message); }
    finally { setShiftSaving(false); }
  };

  const handleDeleteShift = async (shiftId) => {
    if (!confirm('Dienst und alle Einplanungen löschen?')) return;
    await api.delete(`/shifts/${shiftId}`);
    setExpandedShift(null);
    await load();
  };

  const handleEditShift = async (e) => {
    e.preventDefault();
    const r = await api.put(`/shifts/${editModal.id}`, editForm);
    setViolations(r.violations || []);
    setEditModal(null);
    await load();
  };

  // ------- Assignment Handlers -------
  const addAssignment = async (shiftId, employeeId) => {
    if (!employeeId) return;
    try {
      const r = await api.post('/assignments', { shift_id: shiftId, employee_id: parseInt(employeeId) });
      setViolations(r.violations || []);
      await load();
    } catch (e) { alert(e.message); }
  };

  const removeAssignment = async (assignmentId) => {
    await api.delete(`/assignments/${assignmentId}`);
    await load();
  };

  const markSick = async (assignmentId, is_sick) => {
    const r = await api.patch(`/assignments/${assignmentId}/sick`, { is_sick });
    setViolations(r.violations || []);
    await load();
  };

  // ------- Publish / PDF -------
  const handlePublish = async () => {
    try {
      await api.patch(`/schedules/${id}/status`, { status: 'published' });
      await load();
    } catch (e) { alert('Kann nicht veröffentlicht werden:\n' + e.message); }
  };

  const handlePDF = async () => {
    const el = document.getElementById('schedule-print-area');
    const canvas = await html2canvas(el, { scale: 1.5, useCORS: true });
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth();
    const h = (canvas.height / canvas.width) * w;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
    pdf.save(`Dienstplan-${schedule?.name || id}.pdf`);
  };

  if (loading) return <div className="p-8 text-gray-500">Lade…</div>;

  const statusColor = { draft:'bg-yellow-100 text-yellow-800', published:'bg-green-100 text-green-800', archived:'bg-gray-100 text-gray-500' };
  const statusLabel = { draft:'Entwurf', published:'Veröffentlicht', archived:'Archiviert' };

  return (
    <div className="p-6 max-w-full">

      {/* ===== HEADER ===== */}
      <div className="flex items-start justify-between mb-4 no-print flex-wrap gap-3">
        <div>
          <button onClick={() => navigate('/')} className="text-sm text-blue-600 hover:underline mb-1 block">← Zurück</button>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{schedule?.name}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[schedule?.status]}`}>
              {statusLabel[schedule?.status]}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">Woche ab {schedule?.week_start}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canEdit && schedule?.status === 'draft' && (
            <button onClick={handlePublish} className="btn-primary btn-sm">✅ Veröffentlichen</button>
          )}
          <button onClick={handlePDF} className="btn-secondary btn-sm">📄 PDF</button>
          <button onClick={() => window.print()} className="btn-secondary btn-sm">🖨 Drucken</button>
        </div>
      </div>

      {/* ===== VIOLATIONS ===== */}
      <div className="mb-4 no-print">
        <ViolationPanel violations={violations} />
      </div>

      {/* ===== WOCHENPLAN ===== */}
      <div id="schedule-print-area">
        <div className="print-only mb-3">
          <h2 className="text-lg font-bold">{schedule?.name} – Einrichtung der besonderen Wohnform</h2>
        </div>

        {/* Spalten-Header */}
        <div className="grid gap-2" style={{ gridTemplateColumns: `120px repeat(7, 1fr)` }}>
          <div className="" />
          {days.map(d => (
            <div key={d.date} className="text-center">
              <div className="text-xs font-bold text-gray-700 capitalize bg-gray-100 rounded-lg px-2 py-2">
                {d.label}
              </div>
            </div>
          ))}
        </div>

        {/* Zeilen: je Dienstart eine Reihe, dann Zellen pro Tag */}
        {['frueh','spaet','nacht','bereitschaft','rufbereitschaft'].map(type => {
          const hasAny = days.some(d => (shiftsByDate[d.date]||[]).some(s => s.shift_type === type));
          // Zeige Zeile immer (für ‘+’-Button), oder nur wenn Daten vorhanden
          if (!hasAny && !canEdit) return null;

          return (
            <div key={type} className="grid gap-2 mt-2" style={{ gridTemplateColumns: `120px repeat(7, 1fr)` }}>
              {/* Zeilenbeschriftung */}
              <div className={`flex items-center justify-center rounded-lg border text-xs font-bold px-2 py-3 ${SHIFT_COLORS[type]}`}>
                {SHIFT_LABELS[type]}
              </div>

              {/* Tageszellen */}
              {days.map(d => {
                const dayShifts = (shiftsByDate[d.date]||[]).filter(s => s.shift_type === type);
                return (
                  <div key={d.date} className="flex flex-col gap-1">
                    {dayShifts.map(shift => (
                      <ShiftCell
                        key={shift.id}
                        shift={shift}
                        employees={employees}
                        canEdit={canEdit}
                        expanded={expandedShift === shift.id}
                        onToggle={() => setExpandedShift(expandedShift === shift.id ? null : shift.id)}
                        onAddAssignment={addAssignment}
                        onRemoveAssignment={removeAssignment}
                        onMarkSick={markSick}
                        onEdit={() => { setEditForm({...shift}); setEditModal(shift); }}
                        onDelete={() => handleDeleteShift(shift.id)}
                        violations={violations.filter(v => v.shiftId === shift.id)}
                      />
                    ))}
                    {/* + Dienst hinzufügen */}
                    {canEdit && schedule?.status === 'draft' && (
                      <button
                        onClick={() => { openShiftModal(d.date); setShiftForm(f => ({ ...f, ...SHIFT_DEFAULTS[type], shift_type: type })); }}
                        className="text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 border border-dashed border-gray-300 hover:border-blue-400 rounded-lg py-2 transition-colors no-print"
                        title={`${SHIFT_LABELS[type]} für ${d.label} anlegen`}
                      >
                        +
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ===== MODAL: DIENST ANLEGEN ===== */}
      {shiftModal && (
        <Modal title="Dienst anlegen" onClose={() => setShiftModal(null)}>
          <form onSubmit={handleCreateShift} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Datum</label>
                <input className="input bg-gray-50" readOnly value={shiftModal} />
              </div>
              <div className="col-span-2">
                <label className="label">Diensttyp</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SHIFT_LABELS).map(([val, lbl]) => (
                    <button type="button" key={val}
                      onClick={() => handleShiftTypeChange(val)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        shiftForm.shift_type === val ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'
                      }`}>{lbl}</button>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className="label">Bezeichnung (frei wählbar)</label>
                <input className="input" placeholder="z. B. Frühdienst 1, Spätdienst A…"
                  value={shiftForm.label} onChange={e => setShiftForm(f => ({...f, label: e.target.value}))} />
              </div>
              <div>
                <label className="label">Beginn</label>
                <input type="time" className="input" required
                  value={shiftForm.start_time} onChange={e => setShiftForm(f => ({...f, start_time: e.target.value}))} />
              </div>
              <div>
                <label className="label">Ende</label>
                <input type="time" className="input" required
                  value={shiftForm.end_time} onChange={e => setShiftForm(f => ({...f, end_time: e.target.value}))} />
              </div>
              <div>
                <label className="label">Pause (Minuten)</label>
                <input type="number" className="input" min="0" max="120" step="5"
                  value={shiftForm.break_minutes} onChange={e => setShiftForm(f => ({...f, break_minutes: parseInt(e.target.value)||0}))} />
              </div>
              <div className="flex items-end">
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700 w-full">
                  <span className="font-medium">⏱ Nettoarbeitszeit:</span>{' '}
                  {calcNetHours(shiftForm.start_time, shiftForm.end_time, shiftForm.break_minutes)}
                </div>
              </div>
              <div>
                <label className="label">Mindestbesetzung (MA gesamt)</label>
                <input type="number" className="input" min="1" max="20"
                  value={shiftForm.min_staff} onChange={e => setShiftForm(f => ({...f, min_staff: parseInt(e.target.value)||1}))} />
              </div>
              <div>
                <label className="label">davon Fachkräfte (mind.)</label>
                <input type="number" className="input" min="0" max="10"
                  value={shiftForm.min_fachkraft} onChange={e => setShiftForm(f => ({...f, min_fachkraft: parseInt(e.target.value)||0}))} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={shiftSaving} className="btn-primary flex-1 justify-center">
                {shiftSaving ? 'Speichere…' : 'Dienst anlegen'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShiftModal(null)}>Abbrechen</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ===== MODAL: DIENST BEARBEITEN ===== */}
      {editModal && (
        <Modal title={`Dienst bearbeiten – ${editModal.date}`} onClose={() => setEditModal(null)}>
          <form onSubmit={handleEditShift} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Bezeichnung</label>
                <input className="input" value={editForm.label||''} onChange={e => setEditForm(f=>({...f,label:e.target.value}))} />
              </div>
              <div>
                <label className="label">Beginn</label>
                <input type="time" className="input" value={editForm.start_time||''} onChange={e => setEditForm(f=>({...f,start_time:e.target.value}))} />
              </div>
              <div>
                <label className="label">Ende</label>
                <input type="time" className="input" value={editForm.end_time||''} onChange={e => setEditForm(f=>({...f,end_time:e.target.value}))} />
              </div>
              <div>
                <label className="label">Pause (Minuten)</label>
                <input type="number" className="input" min="0" step="5" value={editForm.break_minutes||0} onChange={e => setEditForm(f=>({...f,break_minutes:parseInt(e.target.value)||0}))} />
              </div>
              <div className="flex items-end">
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700 w-full">
                  ⏱ Netto: {editForm.start_time && editForm.end_time ? calcNetHours(editForm.start_time, editForm.end_time, editForm.break_minutes) : '–'}
                </div>
              </div>
              <div>
                <label className="label">Mindestbesetzung</label>
                <input type="number" className="input" min="1" value={editForm.min_staff||1} onChange={e => setEditForm(f=>({...f,min_staff:parseInt(e.target.value)||1}))} />
              </div>
              <div>
                <label className="label">Mind. Fachkräfte</label>
                <input type="number" className="input" min="0" value={editForm.min_fachkraft||0} onChange={e => setEditForm(f=>({...f,min_fachkraft:parseInt(e.target.value)||0}))} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="btn-primary flex-1 justify-center">Speichern</button>
              <button type="button" className="btn-secondary" onClick={() => setEditModal(null)}>Abbrechen</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ===== Sub-Components =====

function ShiftCell({ shift, employees, canEdit, expanded, onToggle, onAddAssignment, onRemoveAssignment, onMarkSick, onEdit, onDelete, violations }) {
  const hasError = violations.some(v => v.severity === 'error');
  const assignedIds = shift.assignments.map(a => a.employee_id);
  const available = employees.filter(e => !assignedIds.includes(e.id));

  return (
    <div className={`rounded-lg border-2 overflow-hidden ${
      hasError ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
    }`}>
      {/* Shift Header */}
      <div
        className="px-2 py-1.5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold text-gray-800 truncate">
            {shift.label || SHIFT_LABELS[shift.shift_type]}
          </span>
          {hasError && <span title="Regelverstoß">⚠️</span>}
          <span className="text-gray-400 text-xs ml-auto">{expanded ? '▲' : '▼'}</span>
        </div>
        <div className="text-xs text-gray-500">
          {shift.start_time}–{shift.end_time}
          {shift.break_minutes > 0 && <span className="ml-1 text-gray-400">({shift.break_minutes}min Pause)</span>}
        </div>
        {/* Assigned employees badges */}
        <div className="flex flex-wrap gap-0.5 mt-1">
          {shift.assignments.map(a => (
            <span key={a.id} className={`text-xs px-1.5 py-0.5 rounded font-medium ${
              a.is_sick ? 'bg-red-100 text-red-600 line-through' : 'bg-blue-100 text-blue-700'
            }`}>{a.short_code}</span>
          ))}
          {shift.assignments.length === 0 && (
            <span className="text-xs text-gray-400 italic">Niemand eingeplant</span>
          )}
        </div>
        {/* Besetzungsstand */}
        <div className="mt-1">
          <BesetzungsBar current={shift.assignments.filter(a=>!a.is_sick).length} min={shift.min_staff} />
        </div>
      </div>

      {/* Expanded: MA-Verwaltung */}
      {expanded && (
        <div className="border-t border-gray-200 bg-gray-50 px-2 py-2 space-y-1.5 no-print">
          {/* Existing assignments */}
          {shift.assignments.map(a => (
            <div key={a.id} className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
              a.is_sick ? 'bg-red-50 border border-red-200' : 'bg-white border border-gray-200'
            }`}>
              <span className="font-medium w-8">{a.short_code}</span>
              <span className="flex-1 text-gray-600 truncate">{a.last_name}, {a.first_name}</span>
              {canEdit && (
                <>
                  <button
                    onClick={() => onMarkSick(a.id, !a.is_sick)}
                    title={a.is_sick ? 'Gesund melden' : 'Krank melden'}
                    className={`px-1.5 py-0.5 rounded text-xs border ${
                      a.is_sick
                        ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                        : 'bg-red-50 border-red-300 text-red-600 hover:bg-red-100'
                    }`}
                  >{a.is_sick ? '⭕ Gesund' : '🤕 Krank'}</button>
                  <button onClick={() => onRemoveAssignment(a.id)}
                    className="text-gray-400 hover:text-red-600 font-bold px-1" title="Entfernen">×</button>
                </>
              )}
            </div>
          ))}

          {/* Add employee */}
          {canEdit && available.length > 0 && (
            <div className="pt-1">
              <select
                className="text-xs border border-dashed border-blue-400 rounded-lg px-2 py-1.5 w-full text-gray-600 bg-white hover:bg-blue-50 cursor-pointer"
                value=""
                onChange={e => { if (e.target.value) onAddAssignment(shift.id, e.target.value); }}
              >
                <option value="">+ Mitarbeiter/in einplanen…</option>
                {available.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.short_code} – {e.last_name}, {e.first_name}
                    {e.qualifications?.some(q=>q.is_fachkraft) ? ' ★' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {canEdit && available.length === 0 && (
            <p className="text-xs text-gray-400 italic">Alle Mitarbeitenden bereits eingeplant.</p>
          )}

          {/* Edit / Delete */}
          {canEdit && (
            <div className="flex gap-2 pt-1 border-t border-gray-200">
              <button onClick={onEdit} className="text-xs text-blue-600 hover:underline">✏️ Bearbeiten</button>
              <button onClick={onDelete} className="text-xs text-red-500 hover:underline ml-auto">🗑 Löschen</button>
            </div>
          )}

          {/* Violations for this shift */}
          {violations.map((v,i) => (
            <div key={i} className="text-xs bg-red-50 border border-red-200 rounded px-2 py-1 text-red-700">
              ⚠️ {v.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BesetzungsBar({ current, min }) {
  const pct = min > 0 ? Math.min(100, (current / min) * 100) : 100;
  const color = current >= min ? 'bg-green-400' : current > 0 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-1">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium ${
        current >= min ? 'text-green-600' : 'text-red-600'
      }`}>{current}/{min}</span>
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
