import React, { useState } from 'react';
import { api } from '../api/client';

export default function ChangePassword({ onClose }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);
  const [saving,  setSaving]  = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (form.new_password !== form.confirm)
      return setError('Passwörter stimmen nicht überein');
    if (form.new_password.length < 8)
      return setError('Neues Passwort muss mindestens 8 Zeichen haben');
    setSaving(true);
    try {
      await api.patch('/auth/me/password', {
        current_password: form.current_password,
        new_password:     form.new_password,
      });
      setSuccess(true);
      setTimeout(onClose, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        {success ? (
          <div className="p-10 text-center">
            <div className="text-5xl mb-3">✅</div>
            <h3 className="font-bold text-gray-900 text-lg">Passwort geändert</h3>
            <p className="text-gray-500 text-sm mt-1">Das neue Passwort ist ab sofort aktiv.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-gray-900">Passwort ändern</h3>
              <button onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">⚠ {error}</div>
              )}
              <div>
                <label className="label">Aktuelles Passwort</label>
                <input type="password" className="input" required autoFocus
                  value={form.current_password}
                  onChange={e => setForm(f => ({...f, current_password: e.target.value}))} />
              </div>
              <div>
                <label className="label">Neues Passwort (mind. 8 Zeichen)</label>
                <input type="password" className="input" required minLength={8}
                  value={form.new_password}
                  onChange={e => setForm(f => ({...f, new_password: e.target.value}))} />
              </div>
              <div>
                <label className="label">Neues Passwort bestätigen</label>
                <input type="password" className="input" required
                  value={form.confirm}
                  onChange={e => setForm(f => ({...f, confirm: e.target.value}))} />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? 'Speichere…' : 'Passwort ändern'}
                </button>
                <button type="button" className="btn-secondary" onClick={onClose}>Abbrechen</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
