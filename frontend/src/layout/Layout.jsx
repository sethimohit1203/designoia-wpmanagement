import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { navItems } from './navItems';
import NumberSwitcher from '../components/NumberSwitcher';

const mainMobile = navItems.slice(0, 4);

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: numbers = [] } = useQuery({
    queryKey: ['numbers'],
    queryFn: () => api.get('/numbers').then((r) => r.data),
    refetchInterval: 5000,
  });

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 bg-ink text-white shrink-0">
        <div className="p-5 border-b border-white/10">
          <div className="text-lg font-bold">Designoia</div>
          <div className="text-accent font-bold -mt-1">-WPManagement</div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive ? 'bg-accent text-white' : 'text-gray-300 hover:bg-white/10'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Mobile hamburger drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-ink text-white p-3 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive ? 'bg-accent text-white' : 'text-gray-300'
                  }`
                }
              >
                <span>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between gap-3 bg-white border-b border-gray-100 px-4 py-3">
          <button className="md:hidden text-xl" onClick={() => setMenuOpen(true)}>☰</button>
          <div className="font-semibold text-gray-700 hidden sm:block">Designoia-WPManagement</div>
          <NumberSwitcher numbers={numbers} />
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
