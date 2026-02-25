import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

const LEVELS = ['', 'Gering', 'Mäßig', 'Hoch', 'Sehr hoch', 'Intensiv'];
const EMPTY_RESTR = { employee_id: '', restriction_type: 'forbidden', reason: '' };

export default function Residents() {
  const [residents, setResidents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ first_name:'', last_name:'', short_code:'', support_level:2, needs_1to1:false, needs_night_supervision:false, notes:'' });
  const [editId, setEditId] = useState(null);
  const [showRestr, setShowRestr] = useState(null);
  const [restrForm, setRestrForm] = useState(EMPTY_RESTR);
  const [detail, setDetail] = useState(null);

  const load = async () => {
    const [res, emps] = await Promise.all([api.get('/residents'), api.get('/employees')]);
    setResidents(res); setEmployees(emps);
  };
  useEffect(() => { load(); }, []);

  const loadDetail = async (id) => {
    const d = await api.get(`/residents/${id}`);
    setDetail(d); setShowRestr(id);
    // Bug 3 fix: Dropdown zurücksetzen beim Öffnen des Restriktions-Panels
    setRestrForm(EMPTY_RESTR);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) await api.put(`/residents/${editId}`, form);
    else await api.post('/residents', form);
    setShowForm(false);
    load();
  };

  const addRestriction = async (e) => {
    e.preventDefault();
    await api.post(`/residents/${showRestr}/restrictions`, restrForm);
    // Bug 3 fix: Dropdown nach Hinzufügen zurücksetzen
    setRestrForm(EMPTY_RESTR);
    loadDetail(showRestr);
  };

  const removeRestriction = async (residentId, empId) => {
    await api.delete(`/residents/${residentId}/restrictions/${empId}`);
    // Bug 3 fix: Dropdown nach Entfernen zurücksetzen
    setRestrForm(EMPTY_RESTR);
    loadDetail(residentId);
  };

  return (
    <div className="p-8 overflow-y-auto flex-1">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Bewohner*innen</h2>
        <button onClick={() => setShowForm(s => !s)} className="btn-primary">+ Neu</button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-4">{editId ? 'Bearbeiten' : 'Neuer Bewohner / neue Bewohnerin'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div><label className="label">Vorname</label>
              <input className="input" required value={form.first_name} onChange={e => setForm(f=>({...f,first_name:e.target.value}))} /></div>
            <div><label className="label">Nachname</label>
              <input className="input" required value={form.last_name} onChange={e => setForm(f=>({...f,last_name:e.target.value}))} /></div>
            <div><label className="label">Kürzel</label>
              <input className="input" required maxLength={4} value={form.short_code} onChange={e => setForm(f=>({...f,short_code:e.target.value.toUpperCase()}))} /></div>
            <div>
              <label className="label">Unterstützungsbedarf</label>
              <select className="input" value={form.support_level} onChange={e => setForm(f=>({...f,support_level:parseInt(e.target.value)}))}>              
                {LEVELS.slice(1).map((l,i) => <option key={i+1} value={i+1}>{i+1} – {l}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.needs_1to1} onChange={e => setForm(f=>({...f,needs_1to1:e.target.checked}))} />
                1:1-Begleitung erforderlich
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.needs_night_supervision} onChange={e => setForm(f=>({...f,needs_night_supervision:e.target.checked}))} />
                Nachtaufsicht erforderlich
              </label>
            </div>
            <div className="col-span-2"><label className="label">Notizen / Besonderheiten</label>
              <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} /></div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="btn-primary">Speichern</button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Abbrechen</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-3">
        {residents.map(r => (
          <div key={r.id} className="card">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                r.support_level >= 4 ? 'bg-red-100 text-red-700' :
                r.support_level >= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
              }`}>{r.short_code}</div>
              <div className="flex-1">
                <p className="font-semibold">{r.last_name}, {r.first_name}</p>
                <p className="text-sm text-gray-500">Unterstützungsbedarf: Stufe {r.support_level} ({LEVELS[r.support_level]})</p>
                <div className="flex gap-2 mt-1">
                  {r.needs_1to1 && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full border border-orange-200">1:1 Begleitung</span>}
                  {r.needs_night_supervision && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">Nachtaufsicht</span>}
                </div>
                {r.notes && <p className="text-sm text-gray-500 mt-1">{r.notes}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => loadDetail(r.id)} className="btn-secondary btn-sm">Restriktionen</button>
                <button onClick={() => { setForm({...r, needs_1to1:!!r.needs_1to1, needs_night_supervision:!!r.needs_night_supervision}); setEditId(r.id); setShowForm(true); }}
                  className="btn-secondary btn-sm">Bearbeiten</button>
              </div>
            </div>

            {showRestr === r.id && detail && (
              <div className="mt-4 border-t pt-4">
                <h4 className="font-semibold text-sm mb-3">Einsatzrestriktionen</h4>
                {detail.restrictions?.length === 0 && <p className="text-sm text-gray-400">Keine Restriktionen hinterlegt.</p>}
                {detail.restrictions?.map((rr, i) => {
                  const emp = employees.find(e => e.id === rr.employee_id);
                  return (
                    <div key={i} className="flex items-center gap-3 text-sm mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        rr.restriction_type === 'forbidden'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-green-50 text-green-700 border-green-200'
                      }`}>
                        {rr.restriction_type === 'forbidden' ? '⛔ Verboten' : '✅ Pflicht'}
                      </span>
                      <span>{emp?.short_code} – {emp?.last_name}</span>
                      <span className="text-gray-400">{rr.reason}</span>
                      <button onClick={() => removeRestriction(r.id, rr.employee_id)}
                        className="text-red-500 hover:text-red-700 ml-auto">Entfernen</button>
                    </div>
                  );
                })}
                <form onSubmit={addRestriction} className="flex gap-2 mt-3">
                  <select className="input flex-1" required
                    value={restrForm.employee_id}
                    onChange={e => setRestrForm(f=>({...f, employee_id: e.target.value}))}>
                    <option value="">Mitarbeiter auswählen...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.short_code} – {e.last_name}</option>)}
                  </select>
                  <select className="input w-32"
                    value={restrForm.restriction_type}
                    onChange={e => setRestrForm(f=>({...f, restriction_type: e.target.value}))}>
                    <option value="forbidden">Verboten</option>
                    <option value="required">Pflicht</option>
                  </select>
                  <input className="input flex-1" placeholder="Begründung..."
                    value={restrForm.reason}
                    onChange={e => setRestrForm(f=>({...f, reason: e.target.value}))} />
                  <button type="submit" className="btn-primary btn-sm">+</button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
