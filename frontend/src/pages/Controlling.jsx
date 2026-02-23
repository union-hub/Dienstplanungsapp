import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Controlling() {
  const [schedules, setSchedules] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [quote, setQuote] = useState(null);
  const [ausfaelle, setAusfaelle] = useState([]);
  const [overtime, setOvertime] = useState([]);

  useEffect(() => {
    api.get('/schedules').then(s => { setSchedules(s); if (s.length) setSelectedId(String(s[0].id)); });
    api.get('/controlling/ueberstunden').then(setOvertime);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    Promise.all([
      api.get(`/controlling/fachkraftquote/${selectedId}`),
      api.get(`/controlling/ausfaelle/${selectedId}`),
    ]).then(([q, a]) => { setQuote(q); setAusfaelle(a); });
  }, [selectedId]);

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Controlling</h2>

      <div className="mb-6">
        <label className="label">Dienstplan auswählen</label>
        <select className="input w-auto" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
          {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card text-center">
          <p className="text-4xl font-bold text-blue-600">{quote?.quote ?? '–'}%</p>
          <p className="text-sm text-gray-500 mt-1">Fachkraftquote</p>
          <p className="text-xs text-gray-400">{quote?.fachkraefte ?? 0} von {quote?.total ?? 0} Einsätzen</p>
        </div>
        <div className="card text-center">
          <p className="text-4xl font-bold text-red-500">{ausfaelle.reduce((s,a) => s+a.sick_count, 0)}</p>
          <p className="text-sm text-gray-500 mt-1">Ausfälle diese Woche</p>
          <p className="text-xs text-gray-400">{ausfaelle.length} betroffene MA</p>
        </div>
        <div className="card text-center">
          <p className="text-4xl font-bold text-amber-500">
            {overtime.filter(e => e.overtime_balance > 0).reduce((s,e) => s+e.overtime_balance,0).toFixed(1)}h
          </p>
          <p className="text-sm text-gray-500 mt-1">Gesamt-Überstunden</p>
          <p className="text-xs text-gray-400">{overtime.filter(e=>e.overtime_balance>0).length} MA mit Plus</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold mb-4">Ausfälle</h3>
          {ausfaelle.length === 0 ? <p className="text-sm text-gray-400">Keine Ausfälle.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-gray-500"><th className="text-left pb-2">MA</th><th className="text-right pb-2">Ausfalltage</th></tr></thead>
              <tbody>{ausfaelle.map((a,i) => (
                <tr key={i}><td>{a.short_code} – {a.last_name}</td><td className="text-right">{a.sick_count}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3 className="font-semibold mb-4">Überstundenübersicht</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-gray-500"><th className="text-left pb-2">MA</th><th className="text-right pb-2">Überstunden</th></tr></thead>
            <tbody>{overtime.slice(0,10).map((e,i) => (
              <tr key={i}>
                <td>{e.short_code} – {e.last_name}</td>
                <td className={`text-right font-medium ${e.overtime_balance>0?'text-red-600':e.overtime_balance<0?'text-blue-600':''}` }>
                  {e.overtime_balance>0?'+':''}{e.overtime_balance}h
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
