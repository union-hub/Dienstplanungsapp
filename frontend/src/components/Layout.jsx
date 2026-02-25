import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ChangePassword from '../pages/ChangePassword';

const navItems = [
  { path: '/',               label: 'Dienstpläne',     icon: '📅', roles: ['leitung','teamleitung','mitarbeitende'] },
  { path: '/employees',      label: 'Mitarbeitende',   icon: '👥', roles: ['leitung','teamleitung'] },
  { path: '/residents',      label: 'Bewohner*innen',  icon: '🏠', roles: ['leitung','teamleitung'] },
  { path: '/qualifications', label: 'Qualifikationen', icon: '🎓', roles: ['leitung'] },
  { path: '/users',          label: 'Nutzerverwaltung',icon: '🔐', roles: ['leitung'] },
  { path: '/my-shifts',      label: 'Meine Dienste',   icon: '🗓', roles: ['mitarbeitende'] },
  { path: '/controlling',    label: 'Auswertungen',    icon: '📊', roles: ['leitung','teamleitung'] },
];

export default function Layout() {
  const { user, logout }    = useAuth();
  const { pathname }        = useLocation();
  const [showPwChange, setShowPwChange] = useState(false);
  const [userMenu, setUserMenu]         = useState(false);

  const filtered  = navItems.filter(n => n.roles.includes(user?.role));
  const roleLabel = { leitung: 'Leitung', teamleitung: 'Teamleitung', mitarbeitende: 'Mitarbeitende' };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className="w-56 shrink-0 bg-slate-900 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-700">
          <div className="text-white font-bold text-lg leading-tight">Dienstplan</div>
          <div className="text-slate-400 text-xs mt-0.5">Einrichtung Besondere Wohnform</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {filtered.map(n => (
            <Link key={n.path} to={n.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                pathname === n.path || (n.path !== '/' && pathname.startsWith(n.path))
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}>
              <span>{n.icon}</span>{n.label}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-700 relative">
          <button
            onClick={() => setUserMenu(o => !o)}
            className="w-full flex items-center gap-2 rounded-xl hover:bg-slate-800 p-2 transition-colors">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 text-left flex-1">
              <div className="text-white text-xs font-medium truncate">{user?.email}</div>
              <div className="text-slate-400 text-xs">{roleLabel[user?.role]}</div>
            </div>
            <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${userMenu ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {userMenu && (
            <div className="absolute bottom-20 left-3 right-3 bg-slate-800 rounded-xl overflow-hidden shadow-xl border border-slate-700 z-50">
              <button
                onClick={() => { setShowPwChange(true); setUserMenu(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
                🔑 Passwort ändern
              </button>
              <div className="border-t border-slate-700" />
              <button
                onClick={logout}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-400 hover:bg-slate-700 hover:text-red-300 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Abmelden
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-hidden flex flex-col">
        <Outlet />
      </main>

      {showPwChange && <ChangePassword onClose={() => setShowPwChange(false)} />}
    </div>
  );
}
