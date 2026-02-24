import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [newWeek, setNewWeek] = useState(() => {
    const today = new Date();
    const mon = new Date(today);
    mon.setDate(today.getDate() - today.getDay() + 1);
    return mon.toISOString().split('T')[0];
  });
  const canCreate = ['leitung', 'teamleitung'].includes(user?.role);

  useEffect(() => {
    api.get('/schedules')
      .then(setSchedules)
      .catch(e => setError('Verbindung zum Backend fehlgeschlagen: ' + e.message));
  }, []);

  const autoName = () => {
    if (!newWeek) return;
    const d = new Date(newWeek + 'T00:00:00');
    setNewName(`KW ${getWeekNumber(d)} / ${d.getFullYear()}`);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api.post('/schedules', { name: newName, week_start: newWeek });
      navigate(`/schedule/${r.id}`);
    } catch (err) {
      setError('Fehler beim Erstellen: ' + err.message);
    }
  };

  const statusColor = {
    draft:     'bg-yellow-100 text-yellow-700 border border-yellow-200',
    published: 'bg-green-100  text-green-700  border border-green-200',
    archived:  'bg-gray-100   text-gray-500   border border-gray-200',
  };
  const statusLabel = { draft: 'Entwurf', published: 'Veröffentlicht', archived: 'Archiviert' };

  return (
    <div className="p-8 overflow-y-auto flex-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dienstpläne</h2>
          <p className="text-gray-500 text-sm mt-1">Alle Wochenübersichten</p>
        </div>
        {canCreate && (
          <button onClick={() => { setShowCreate(s => !s); setError(''); }} className="btn-primary">
            + Neuer Dienstplan
          </button>
        )}
      </div>

      {/* Fehlermeldung */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          ⚠ {error}
        </div>
      )}

      {/* Formular */}
      {showCreate && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-4 text-gray-800">Neuen Dienstplan erstellen</h3>
          <form onSubmit={handleCreate} className="flex gap-4 flex-wrap items-end">
            <div>
              <label className="label">Wochenbeginn (Montag)</label>
              <input type="date" className="input w-auto"
                value={newWeek}
                onChange={e => setNewWeek(e.target.value)}
                onBlur={autoName}
                required
              />
            </div>
            <div className="flex-1 min-w-48">
              <label className="label">Bezeichnung</label>
              <input type="text" className="input"
                placeholder="z. B. KW 10 / 2026"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Erstellen</button>
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Abbrechen</button>
            </div>
          </form>
        </div>
      )}

      {/* Liste */}
      <div className="grid gap-3">
        {schedules.length === 0 && !error && (
          <div className="card text-center text-gray-500 py-16">
            <p className="text-5xl mb-4">📅</p>
            <p className="font-medium">Noch keine Dienstpläne vorhanden.</p>
            {canCreate && <p className="text-sm mt-1">Klicke auf „+ Neuer Dienstplan“, um zu beginnen.</p>}
          </div>
        )}
        {schedules.map(s => (
          <Link key={s.id} to={`/schedule/${s.id}`}
            className="card hover:shadow-md transition-all flex items-center justify-between gap-4 py-4">
            <div>
              <h3 className="font-semibold text-gray-900">{s.name}</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Woche ab {s.week_start
                  ? format(parseISO(s.week_start), 'dd. MMMM yyyy', { locale: de })
                  : s.week_start}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${statusColor[s.status]}`}>
                {statusLabel[s.status]}
              </span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
