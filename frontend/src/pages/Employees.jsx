import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

const EMPTY_FORM = { first_name:'', last_name:'', short_code:'', contract_hours:39, can_do_nightshift_alone:true, notes:'', qualification_ids:[] };

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [qualifications, setQualifications] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    const [emps, quals] = await Promise.all([api.get('/employees'), api.get('/qualifications')]);
    setEmployees(emps); setQualifications(quals);
  };
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) await api.put(`/employees/${editId}`, form);
    else await api.post('/employees', form);
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    load();
  };

  const handleNew = () => {
    // Bug 2 fix: immer EMPTY_FORM setzen, nie alte Daten übernehmen
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(true);
  };

  const handleEdit = (emp) => {
    setForm({
      first_name: emp.first_name,
      last_name: emp.last_name,
      short_code: emp.short_code,
      contract_hours: emp.contract_hours,
      can_do_nightshift_alone: !!emp.can_do_nightshift_alone,
      notes: emp.notes || '',
      qualification_ids: emp.qualifications.map(q => q.id),
    });
    setEditId(emp.id);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
  };

  const toggleQual = (id) => {
    setForm(f => ({
      ...f,
      qualification_ids: f.qualification_ids.includes(id)
        ? f.qualification_ids.filter(q => q !== id)
        : [...f.qualification_ids, id],
    }));
  };

  return (
    <div className="p-8 overflow-y-auto flex-1">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Mitarbeitende</h2>
        <button onClick={handleNew} className="btn-primary">+ Neu</button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-4">{editId ? 'Mitarbeiter*in bearbeiten' : 'Neuer Mitarbeiter / neue Mitarbeiterin'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div><label className="label">Vorname</label>
              <input className="input" required value={form.first_name} onChange={e => setForm(f=>({...f,first_name:e.target.value}))} /></div>
            <div><label className="label">Nachname</label>
              <input className="input" required value={form.last_name} onChange={e => setForm(f=>({...f,last_name:e.target.value}))} /></div>
            <div><label className="label">Kürzel (max. 4 Zeichen)</label>
              <input className="input" required maxLength={4} value={form.short_code} onChange={e => setForm(f=>({...f,short_code:e.target.value.toUpperCase()}))} /></div>
            <div><label className="label">Vertragsstunden / Woche</label>
              <input className="input" type="number" step="0.5" min="0" max="60" value={form.contract_hours} onChange={e => setForm(f=>({...f,contract_hours:parseFloat(e.target.value)}))} /></div>
            <div className="col-span-2">
              <label className="label">Qualifikationen</label>
              <div className="flex flex-wrap gap-2">
                {qualifications.map(q => (
                  <button type="button" key={q.id}
                    onClick={() => toggleQual(q.id)}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                      form.qualification_ids.includes(q.id)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}>
                    {q.is_fachkraft ? '🎓 ' : ''}{q.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="nightalone" checked={form.can_do_nightshift_alone}
                onChange={e => setForm(f=>({...f,can_do_nightshift_alone:e.target.checked}))} />
              <label htmlFor="nightalone" className="text-sm">Darf alleine im Nachtdienst eingesetzt werden</label>
            </div>
            <div className="col-span-2"><label className="label">Notizen</label>
              <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} /></div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="btn-primary">Speichern</button>
              <button type="button" className="btn-secondary" onClick={handleCancel}>Abbrechen</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-3">
        {employees.map(emp => (
          <div key={emp.id} className="card flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">
              {emp.short_code}
            </div>
            <div className="flex-1">
              <p className="font-semibold">{emp.last_name}, {emp.first_name}</p>
              <p className="text-sm text-gray-500">{emp.contract_hours}h/Woche</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {emp.qualifications.map(q => (
                  <span key={q.id} className={`text-xs px-2 py-0.5 rounded-full ${
                    q.is_fachkraft ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>{q.name}</span>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              {!emp.can_do_nightshift_alone && (
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full border border-orange-200">Kein Allein-Nacht</span>
              )}
              <button onClick={() => handleEdit(emp)} className="btn-secondary btn-sm">Bearbeiten</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
