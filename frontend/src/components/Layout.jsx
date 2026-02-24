import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { path: '/',               label: 'Dienstpläne',    icon: '📅', roles: ['leitung','teamleitung','mitarbeitende'] },
  { path: '/employees',      label: 'Mitarbeitende',  icon: '👥', roles: ['leitung','teamleitung'] },
  { path: '/residents',      label: 'Bewohner*innen', icon: '🏠', roles: ['leitung','teamleitung'] },
  { path: '/qualifications', label: 'Qualifikationen',icon: '🎓', roles: ['leitung'] },
  { path: '/my-shifts',      label: 'Meine Dienste',  icon: '🗓', roles: ['mitarbeitende'] },
  { path: '/controlling',    label: 'Auswertungen',   icon: '📊', roles: ['leitung','teamleitung'] },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  const filtered = navItems.filter(n => n.roles.includes(user?.role));

  const roleLabel = { leitung: 'Leitung', teamleitung: 'Teamleitung', mitarbeitende: 'Mitarbeitende' };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* ─── Sidebar ─── */}
      <aside className="w-56 shrink-0 bg-slate-900 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-700">
          <div className="text-white font-bold text-lg leading-tight">Dienstplan</div>
          <div className="text-slate-400 text-xs mt-0.5">Einrichtung Besondere Wohnform</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {filtered.map(n => (
            <Link key={n.path} to={n.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                pathname === n.path || (n.path !== '/' && pathname.startsWith(n.path))
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}>
              <span className="text-base">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>

        {/* User info */}
        <div className="px-4 py-4 border-t border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-white text-xs font-medium truncate">{user?.email}</div>
              <div className="text-slate-400 text-xs">{roleLabel[user?.role]}</div>
            </div>
          </div>
          <button onClick={logout}
            className="w-full text-slate-400 hover:text-white text-xs text-left px-2 py-1.5 rounded hover:bg-slate-800 transition-colors flex items-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Abmelden
          </button>
        </div>
      </aside>

      {/* ─── Content ─── */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  );
}
