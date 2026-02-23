import React from 'react';

export default function ViolationPanel({ violations, className = '' }) {
  if (!violations?.length) {
    return (
      <div className={`flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 text-sm ${className}`}>
        <span>✅</span>
        <span>Keine Regelverstöße – Dienstplan regelkonform.</span>
      </div>
    );
  }

  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');

  return (
    <div className={`space-y-2 ${className}`}>
      {errors.map((v, i) => (
        <div key={i} className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
          <span className="mt-0.5">⚠️</span>
          <div>
            <span className="font-semibold text-red-700">[{v.rule}]</span>{' '}
            <span className="text-red-600">{v.message}</span>
          </div>
        </div>
      ))}
      {warnings.map((v, i) => (
        <div key={i} className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
          <span className="mt-0.5">⚠️</span>
          <span className="text-yellow-700">{v.message}</span>
        </div>
      ))}
    </div>
  );
}
