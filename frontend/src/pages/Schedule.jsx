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
  frueh: 'bg-amber-100 border-amber-300 text-amber-800',
  spaet: 'bg-blue-100 border-blue-300 text-blue-800',
  nacht: 'bg-purple-100 border-purple-300 text-purple-800',
  bereitschaft: 'bg-green-100 border-green-300 text-green-800',
  rufbereitschaft: 'bg-gray-100 border-gray-300 text-gray-700',
};
const SHIFT_LABELS = {
  frueh: 'Früh', spaet: 'Spät', nacht: 'Nacht', bereitschaft: 'Bereit.', rufbereitschaft: 'Rufber.'
};

export default function Schedule({ printMode }) {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [violations, setViolations] = useState([]);
  const [selectedShift, setSelectedShift] = useState(null);
  const [dragEmployee, setDragEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replacements, setReplacements] = useState([]);
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

  // Group shifts by date
  const shiftsByDate = shifts.reduce((acc, s) => {
    (acc[s.date] = acc[s.date] || []).push(s);
    return acc;
  }, {});

  // Build week days
  const days = schedule ? Array.from({ length: 7 }, (_, i) => {
    const d = addDays(parseISO(schedule.week_start), i);
    return { date: d.toISOString().split('T')[0], label: format(d, 'EEE dd.MM.', { locale: de }) };
  }) : [];

  const addAssignment = async (shiftId, employeeId) => {
    try {
      const r = await api.post('/assignments', { shift_id: shiftId, employee_id: employeeId });
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
    if (is_sick && selectedShift) {
      const reps = await api.get(`/shifts/${selectedShift.id}/replacements`);
      setReplacements(reps);
    }
  };

  const handlePublish = async () => {
    try {
      await api.patch(`/schedules/${id}/status`, { status: 'published' });
      await load();
      alert('Dienstplan veröffentlicht!');
    } catch (e) { alert('Kann nicht veröffentlicht werden:\n' + e.message); }
  };

  const handlePDF = async () => {
    const el = document.getElementById('schedule-print-area');
    const canvas = await html2canvas(el, { scale: 1.5 });
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth();
    const h = (canvas.height / canvas.width) * w;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, w, h);
    pdf.save(`Dienstplan-${schedule?.name || id}.pdf`);
  };

  if (loading) return <div className="p-8 text-gray-500">Lade...</div>;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 no-print">
        <div>
          <button onClick={() => navigate('/')} className="text-sm text-blue-600 hover:underline mb-1 block">← Zurück</button>
          <h2 className="text-xl font-bold">{schedule?.name}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            schedule?.status === 'published' ? 'bg-green-100 text-green-700' :
            schedule?.status === 'draft' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
          }`}>{schedule?.status}</span>
        </div>
        <div className="flex gap-2">
          {canEdit && schedule?.status === 'draft' && (
            <button onClick={handlePublish} className="btn-primary btn-sm">Veröffentlichen</button>
          )}
          <button onClick={handlePDF} className="btn-secondary btn-sm">📄 PDF</button>
          <button onClick={() => window.print()} className="btn-secondary btn-sm">🖨 Drucken</button>
        </div>
      </div>

      {/* Violations */}
      <div className="mb-4 no-print">
        <ViolationPanel violations={violations} />
      </div>

      {/* Main grid */}
      <div id="schedule-print-area" className="overflow-x-auto">
        <div className="print-only mb-4">
          <h2 className="text-xl font-bold">{schedule?.name}</h2>
          <p className="text-sm text-gray-500">Dienstplan – Einrichtung der besonderen Wohnform</p>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left w-28">Dienst</th>
              {days.map(d => (
                <th key={d.date} className="border border-gray-300 px-2 py-2 text-center min-w-28 capitalize">
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {['frueh', 'spaet', 'nacht', 'bereitschaft', 'rufbereitschaft'].map(type => {
              const rowShifts = days.map(d =>
                (shiftsByDate[d.date] || []).find(s => s.shift_type === type) || null
              );
              if (rowShifts.every(s => !s)) return null;
              return (
                <tr key={type}>
                  <td className={`border border-gray-300 px-3 py-2 font-semibold text-xs ${SHIFT_COLORS[type]}`}>
                    {SHIFT_LABELS[type]}
                  </td>
                  {rowShifts.map((shift, i) => (
                    <td key={i} className="border border-gray-300 px-2 py-2 align-top min-h-16">
                      {shift ? (
                        <div>
                          <div className="text-xs text-gray-400 mb-1">{shift.start_time}–{shift.end_time}</div>
                          <div className="space-y-1">
                            {(shift.assignments || []).map(a => (
                              <div key={a.id}
                                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
                                  a.is_sick ? 'bg-red-100 text-red-700 line-through' : 'bg-white border border-gray-200'
                                }`}>
                                <span className="font-medium">{a.short_code}</span>
                                {canEdit && (
                                  <>
                                    <button
                                      title={a.is_sick ? 'Gesund melden' : 'Krank melden'}
                                      onClick={() => markSick(a.id, !a.is_sick)}
                                      className="ml-auto text-gray-400 hover:text-red-500 no-print"
                                    >{a.is_sick ? '⭕' : '🤕'}</button>
                                    <button
                                      onClick={() => removeAssignment(a.id)}
                                      className="text-gray-400 hover:text-red-600 no-print"
                                    >×</button>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                          {canEdit && (
                            <div className="mt-1 no-print">
                              <select
                                className="text-xs border border-dashed border-gray-300 rounded px-1 py-0.5 w-full text-gray-500"
                                value=""
                                onChange={e => { if (e.target.value) addAssignment(shift.id, e.target.value); e.target.value = ''; }}
                              >
                                <option value="">+ MA</option>
                                {employees.filter(e => !(shift.assignments || []).find(a => a.employee_id === e.id))
                                  .map(e => (
                                    <option key={e.id} value={e.id}>{e.short_code} – {e.last_name}</option>
                                  ))}
                              </select>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-200 text-xs">-</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Replacements */}
      {replacements.length > 0 && (
        <div className="mt-6 card no-print">
          <h3 className="font-semibold mb-3">🔄 Ersatzvorschläge</h3>
          <div className="space-y-2">
            {replacements.map((r, i) => (
              <div key={i} className={`flex items-center gap-4 p-3 rounded-lg border ${
                r.feasible ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'
              }`}>
                <div className="flex-1">
                  <span className="font-semibold">{r.employee.short_code}</span> – {r.employee.first_name} {r.employee.last_name}
                  {r.isFachkraft && <span className="ml-2 badge-ok">Fachkraft</span>}
                  {r.warnings.map((w, j) => <span key={j} className="ml-2 badge-warn">{w}</span>)}
                </div>
                {r.feasible && canEdit && (
                  <button
                    onClick={() => { addAssignment(selectedShift?.id, r.employee.id); setReplacements([]); }}
                    className="btn-primary btn-sm"
                  >Einplanen</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
