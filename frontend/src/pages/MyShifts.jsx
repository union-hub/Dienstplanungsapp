import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

const TYPE_LABELS = { frueh:'Früh', spaet:'Spät', nacht:'Nacht', bereitschaft:'Bereitschaft', rufbereitschaft:'Rufbereitschaft' };
const TYPE_COLORS = { frueh:'bg-amber-100 text-amber-800', spaet:'bg-blue-100 text-blue-800', nacht:'bg-purple-100 text-purple-800', bereitschaft:'bg-green-100 text-green-800', rufbereitschaft:'bg-gray-100 text-gray-700' };

export default function MyShifts() {
  const [shifts, setShifts] = useState([]);

  useEffect(() => { api.get('/assignments/my').then(setShifts); }, []);

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Meine Dienste</h2>
      <div className="grid gap-3">
        {shifts.length === 0 && (
          <div className="card text-center text-gray-500 py-12">
            <p className="text-4xl mb-3">📅</p>
            <p>Keine veröffentlichten Dienste gefunden.</p>
          </div>
        )}
        {shifts.map(s => (
          <div key={s.assignment_id} className="card flex items-center gap-4">
            <div className={`px-3 py-2 rounded-lg text-sm font-medium ${TYPE_COLORS[s.shift_type]}`}>
              {TYPE_LABELS[s.shift_type]}
            </div>
            <div className="flex-1">
              <p className="font-semibold">{format(parseISO(s.date), 'EEEE, dd.MM.yyyy', { locale: de })}</p>
              <p className="text-sm text-gray-500">{s.start_time} – {s.end_time} Uhr · {s.schedule_name}</p>
            </div>
            {s.is_sick && <span className="badge-error">Krank gemeldet</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
