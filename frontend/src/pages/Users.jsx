import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

const ROLE_LABELS = { leitung: 'Leitung', teamleitung: 'Teamleitung', mitarbeitende: 'Mitarbeitende' };
const ROLE_COLORS = {
  leitung:       'bg-purple-100 text-purple-700 border-purple-200',
  teamleitung:   'bg-blue-100   text-blue-700   border-blue-200',
  mitarbeitende: 'bg-gray-100   text-gray-600   border-gray-200',
};
const EMPTY = { email: '', password: '', role: 'mitarbeitende' };

export default function Users() {
  const [users,   setUsers]   = useState([]);
  const [modal,   setModal]   = useState(null);
  const [form,    setForm]    = useState(EMPTY);
  const [resetPw, setResetPw] = useState('');
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [saving,  setSaving]  = useState(false);

  const load = () => api.get('/users').then(setUsers).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  const flash = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  const handleCreate = async e => {
    e.preventDefault(); setError(''); setSaving(true);
    try { await api.post('/users', form); flash('Nutzer erfolgreich angelegt'); setModal(null); setForm(EMPTY); load(); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const handleEdit = async e => {
    e.preventDefault(); setError(''); setSaving(true);
    try { await api.put(`/users/${modal.user.id}`, { email: form.email, role: form.role }); flash('Nutzer aktualisiert'); setModal(null); load(); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const handleResetPw = async e => {
    e.preventDefault(); setError(''); setSaving(true);
    try { await api.patch(`/users/${modal.user.id}/reset-password`, { new_password: resetPw }); flash(`Passwort für ${modal.user.email} zurückgesetzt`); setModal(null); setResetPw(''); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const toggleActive = async user => {
    if (!confirm(`Nutzer "${user.email}" ${user.active ? 'deaktivieren' : 'aktivieren'}?`)) return;
    try {
      user.active ? await api.delete(`/users/${user.id}`) : await api.put(`/users/${user.id}`, { active: true });
      flash(user.active ? 'Nutzer deaktiviert' : 'Nutzer aktiviert'); load();
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="p-8 overflow-y-auto flex-1">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Nutzerverwaltung</h2>
          <p className="text-gray-500 text-sm mt-1">Zugänge anlegen, bearbeiten und Passwörter zurücksetzen</p>
        </div>
        <button onClick={() => { setForm(EMPTY); setError(''); setModal('create'); }} className="btn-primary">
          + Neuer Nutzer
        </button>
      </div>

      {success && <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">✓ {success}</div>}
      {error && !modal && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">⚠ {error}</div>}

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left">
              {['E-Mail','Mitarbeiter*in','Rolle','Status','Angelegt am',''].map(h => (
                <th key={h} className="px-5 py-3 font-semibold text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${!u.active ? 'opacity-50' : ''}`}>
                <td className="px-5 py-3.5 font-medium text-gray-800">{u.email}</td>
                <td className="px-5 py-3.5 text-gray-600">
                  {u.first_name ? `${u.last_name}, ${u.first_name}` : <span className="text-gray-400 italic">kein MA verknüpft</span>}
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                    u.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'
                  }`}>{u.active ? 'Aktiv' : 'Deaktiviert'}</span>
                </td>
                <td className="px-5 py-3.5 text-gray-500">{u.created_at?.split('T')[0]}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => { setForm({ email: u.email, role: u.role, password: '' }); setError(''); setModal({ user: u }); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors">Bearbeiten</button>
                    <button onClick={() => { setModal({ reset: true, user: u }); setResetPw(''); setError(''); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors">🔑 Passwort</button>
                    <button onClick={() => toggleActive(u)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        u.active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'
                      }`}>{u.active ? 'Deaktivieren' : 'Aktivieren'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <div className="text-center py-12 text-gray-400">Keine Nutzer gefunden</div>}
      </div>

      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
        <strong>Hinweis:</strong> Verknüpfe einen Nutzer mit einem Mitarbeitenden über die Mitarbeitenden-Verwaltung.
      </div>

      {modal === 'create' && (
        <Modal title="Neuen Nutzer anlegen" onClose={() => setModal(null)}>
          <form onSubmit={handleCreate} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">⚠ {error}</div>}
            <div><label className="label">E-Mail-Adresse</label>
              <input type="email" className="input" required autoFocus placeholder="vorname@einrichtung.de"
                value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} /></div>
            <div><label className="label">Passwort (mind. 8 Zeichen)</label>
              <input type="password" className="input" required minLength={8}
                value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} />
              <p className="text-xs text-gray-400 mt-1">Der Nutzer kann es nach dem Login selbst ändern.</p></div>
            <div><label className="label">Rolle</label>
              <select className="input" value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}>
                <option value="mitarbeitende">Mitarbeitende – sieht eigene Dienste</option>
                <option value="teamleitung">Teamleitung – erstellt und bearbeitet Pläne</option>
                <option value="leitung">Leitung – voller Zugriff inkl. Nutzerverwaltung</option>
              </select></div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving ? 'Anlegen…' : 'Nutzer anlegen'}</button>
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Abbrechen</button>
            </div>
          </form>
        </Modal>
      )}

      {modal?.user && !modal?.reset && (
        <Modal title="Nutzer bearbeiten" onClose={() => setModal(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">⚠ {error}</div>}
            <div><label className="label">E-Mail-Adresse</label>
              <input type="email" className="input" required value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} /></div>
            <div><label className="label">Rolle</label>
              <select className="input" value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}>
                <option value="mitarbeitende">Mitarbeitende</option>
                <option value="teamleitung">Teamleitung</option>
                <option value="leitung">Leitung</option>
              </select></div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving ? 'Speichere…' : 'Speichern'}</button>
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Abbrechen</button>
            </div>
          </form>
        </Modal>
      )}

      {modal?.reset && (
        <Modal title="Passwort zurücksetzen" onClose={() => setModal(null)}>
          <p className="text-sm text-gray-600 mb-4">Neues Passwort für <strong>{modal.user.email}</strong>.</p>
          <form onSubmit={handleResetPw} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">⚠ {error}</div>}
            <div><label className="label">Neues Passwort (mind. 8 Zeichen)</label>
              <input type="password" className="input" required minLength={8} autoFocus
                value={resetPw} onChange={e => setResetPw(e.target.value)} /></div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving ? 'Zurücksetzen…' : '🔑 Passwort zurücksetzen'}</button>
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Abbrechen</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-gray-900 text-lg">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
