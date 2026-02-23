import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Qualifications() {
  const [quals, setQuals] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', is_fachkraft: false });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => api.get('/qualifications').then(setQuals);
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) await api.put(`/qualifications/${editId}`, form);
    else await api.post('/qualifications', form);
    setForm({ name:'', description:'', is_fachkraft:false }); setShowForm(false); setEditId(null); load();
  };

  const del = async (id) => {
    if (!confirm('Qualifikation löschen?')) return;
    try { await api.delete(`/qualifications/${id}`); load(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Qualifikationen</h2>
        <button onClick={() => setShowForm(s => !s)} className="btn-primary">+ Neu</button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="label">Name</label><input className="input" required value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} /></div>
            <div><label className="label">Beschreibung</label><input className="input" value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_fachkraft} onChange={e => setForm(f=>({...f,is_fachkraft:e.target.checked}))} />
              Gilt als Fachkraft für Fachkraftquote
            </label>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Speichern</button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Abbrechen</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-3">
        {quals.map(q => (
          <div key={q.id} className="card flex items-center gap-4">
            <div className="flex-1">
              <p className="font-semibold">{q.name}</p>
              {q.description && <p className="text-sm text-gray-500">{q.description}</p>}
            </div>
            {q.is_fachkraft && <span className="badge-ok">🎓 Fachkraft</span>}
            <button onClick={() => { setForm({...q,is_fachkraft:!!q.is_fachkraft}); setEditId(q.id); setShowForm(true); }}
              className="btn-secondary btn-sm">Bearbeiten</button>
            <button onClick={() => del(q.id)} className="btn-danger btn-sm">Löschen</button>
          </div>
        ))}
      </div>
    </div>
  );
}
