import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { navItems } from './navItems';
import NumberSwitcher from '../components/NumberSwitcher';

const mainMobile = navItems.slice(0, 4);

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const navigate = useNavigate();

  const { data: numbers = [] } = useQuery({
    queryKey: ['numbers'],
    queryFn: () => api.get('/numbers').then((r) => r.data),
    refetchInterval: 5000,
  });

  function logout() {
    if (!window.confirm('Log out?')) return;
    sessionStorage.removeItem('token');
    window.location.reload();
  }

  // Real alerts derived from live number state — not a placeholder feed.
  const alerts = [
    ...numbers
      .filter((n) => n.runtimeStatus === 'disconnected' && n.last_error)
      .map((n) => ({ id: `err-${n.id}`, icon: '🔴', text: `${n.name} disconnected — ${n.last_error}` })),
    ...numbers
      .filter((n) => n.ban_risk_score > 70)
      .map((n) => ({ id: `risk-${n.id}`, icon: '⚠️', text: `${n.name} has high ban risk (${n.ban_risk_score}%)` })),
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 bg-white border-r border-gray-100 shrink-0">
        <div className="p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-indigo-700 flex items-center justify-center text-white font-bold text-lg shrink-0">
            D
          </div>
          <div className="min-w-0">
            <div className="font-bold text-gray-900 leading-tight">Designoia</div>
            <div className="text-xs text-gray-400 leading-tight">WPManagement</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive ? 'bg-accent text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 transition">
            <span>🚪</span> Logout
          </button>
        </div>
      </aside>

      {/* Mobile hamburger drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white p-3 space-y-1 overflow-y-auto">
            <div className="flex items-center gap-3 px-2 pb-3 mb-2 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-indigo-700 flex items-center justify-center text-white font-bold shrink-0">D</div>
              <div>
                <div className="font-bold text-gray-900 leading-tight text-sm">Designoia</div>
                <div className="text-[11px] text-gray-400 leading-tight">WPManagement</div>
              </div>
            </div>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive ? 'bg-accent text-white' : 'text-gray-600'
                  }`
                }
              >
                <span>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
            <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 mt-2 border-t border-gray-100 pt-3">
              <span>🚪</span> Logout
            </button>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between gap-3 bg-white border-b border-gray-100 px-4 py-3">
          <button className="md:hidden text-xl" onClick={() => setMenuOpen(true)}>☰</button>
          <div className="font-semibold text-gray-700 hidden sm:block">Designoia-WPManagement</div>
          <div className="flex items-center gap-3">
            <NumberSwitcher numbers={numbers} />

            {/* Notifications */}
            <div className="relative">
              <button
                className="relative w-9 h-9 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 transition"
                title="Notifications"
                onClick={() => { setNotifOpen((o) => !o); setAccountOpen(false); }}
              >
                🔔
                {alerts.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {alerts.length}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-100 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                  <div className="px-4 py-2 border-b border-gray-100 font-semibold text-sm text-gray-700">Notifications</div>
                  {alerts.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-400">No alerts — everything looks good ✅</div>
                  ) : (
                    alerts.map((a) => (
                      <div key={a.id} className="px-4 py-3 border-b border-gray-50 last:border-0 text-sm flex gap-2">
                        <span>{a.icon}</span>
                        <span className="text-gray-700">{a.text}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Account */}
            <div className="relative">
              <button
                className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-indigo-700 flex items-center justify-center text-white text-sm font-bold"
                title="Account"
                onClick={() => { setAccountOpen((o) => !o); setNotifOpen(false); }}
              >
                👤
              </button>
              {accountOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-100 rounded-lg shadow-lg z-50 overflow-hidden">
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => { setAccountOpen(false); navigate('/settings'); }}
                  >
                    ⚙️ Settings
                  </button>
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100"
                    onClick={() => { setAccountOpen(false); logout(); }}
                  >
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 pb-20 md:pb-4 overflow-y-auto">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-2 z-30">
          {mainMobile.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `flex flex-col items-center text-xs ${isActive ? 'text-accent' : 'text-gray-500'}`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
