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
  const [newName, setNewName] = useState('');
  const [newWeek, setNewWeek] = useState(() => {
    const today = new Date();
    const mon = new Date(today);
    mon.setDate(today.getDate() - today.getDay() + 1);
    return mon.toISOString().split('T')[0];
  });
  const canCreate = ['leitung', 'teamleitung'].includes(user?.role);

  useEffect(() => { api.get('/schedules').then(setSchedules); }, []);

  const statusColor = { draft: 'bg-yellow-100 text-yellow-700', published: 'bg-green-100 text-green-700', archived: 'bg-gray-100 text-gray-500' };
  const statusLabel = { draft: 'Entwurf', published: 'Veröffentlicht', archived: 'Archiviert' };

  const handleCreate = async (e) => {
    e.preventDefault();
    const r = await api.post('/schedules', { name: newName, week_start: newWeek });
    navigate(`/schedule/${r.id}`);
  };

  const autoName = () => {
    if (!newWeek) return;
    const d = new Date(newWeek);
    setNewName(`KW ${getWeekNumber(d)} / ${d.getFullYear()}`);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dienstpläne</h2>
          <p className="text-gray-500 text-sm mt-1">Alle Wochenübersichten</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(s => !s)} className="btn-primary">
            + Neuer Dienstplan
          </button>
        )}
      </div>

      {showCreate && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-4">Neuen Dienstplan erstellen</h3>
          <form onSubmit={handleCreate} className="flex gap-4 flex-wrap">
            <div>
              <label className="label">Wochenbeginn (Montag)</label>
              <input type="date" className="input w-auto" value={newWeek}
                onChange={e => { setNewWeek(e.target.value); }}
                onBlur={autoName}
              />
            </div>
            <div className="flex-1 min-w-48">
              <label className="label">Name</label>
              <input type="text" className="input" placeholder="z.B. KW 10 / 2025" value={newName}
                onChange={e => setNewName(e.target.value)} required />
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="btn-primary">Erstellen</button>
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Abbrechen</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4">
        {schedules.length === 0 && (
          <div className="card text-center text-gray-500 py-12">
            <p className="text-4xl mb-3">📅</p>
            <p>Noch keine Dienstpläne vorhanden.</p>
          </div>
        )}
        {schedules.map(s => (
          <Link key={s.id} to={`/schedule/${s.id}`}
            className="card hover:shadow-md transition-shadow flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{s.name}</h3>
              <p className="text-sm text-gray-500">
                Woche ab {s.week_start ? format(parseISO(s.week_start), 'dd.MM.yyyy', { locale: de }) : s.week_start}
              </p>
            </div>
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${statusColor[s.status]}`}>
              {statusLabel[s.status]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
