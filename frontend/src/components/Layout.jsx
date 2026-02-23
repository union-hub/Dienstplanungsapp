import React from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '🏠', roles: ['leitung','teamleitung','mitarbeitende'] },
  { path: '/employees', label: 'Mitarbeitende', icon: '👥', roles: ['leitung','teamleitung'] },
  { path: '/residents', label: 'Bewohner*innen', icon: '👤', roles: ['leitung','teamleitung'] },
  { path: '/qualifications', label: 'Qualifikationen', icon: '🎓', roles: ['leitung'] },
  { path: '/my-shifts', label: 'Meine Dienste', icon: '📅', roles: ['mitarbeitende'] },
  { path: '/controlling', label: 'Controlling', icon: '📊', roles: ['leitung','teamleitung'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => { logout(); navigate('/login'); };

  const filteredNav = navItems.filter(n => n.roles.includes(user?.role));

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col no-print">
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-lg font-bold">📋 Dienstplan</h1>
          <p className="text-xs text-gray-400 mt-1">Besondere Wohnform</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {filteredNav.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                location.pathname === item.path
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700">
          <div className="text-xs text-gray-400 mb-2">
            {user?.email}
            <span className="ml-2 bg-gray-700 px-2 py-0.5 rounded text-gray-300">{user?.role}</span>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary btn-sm w-full">
            Abmelden
          </button>
        </div>
      </aside>
      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
