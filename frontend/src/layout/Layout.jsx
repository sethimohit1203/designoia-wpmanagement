import { NavLink, Outlet } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { navItems } from './navItems';
import NumberSwitcher from '../components/NumberSwitcher';
import * as Icons from '../components/Icons';
import { useTheme } from '../context/ThemeContext';

const mainMobile = navItems.slice(0, 4);

const iconMap = {
  'dashboard': Icons.DashboardIcon,
  'numbers': Icons.NumbersIcon,
  'bulk-sender': Icons.BulkSenderIcon,
  'contacts': Icons.ContactsIcon,
  'templates': Icons.TemplatesIcon,
  'campaigns': Icons.CampaignsIcon,
  'chatbot': Icons.ChatbotIcon,
  'analytics': Icons.AnalyticsIcon,
  'sheets': Icons.SheetsSyncIcon,
  'groups': Icons.GroupsIcon,
  'broadcast': Icons.BroadcastIcon,
  'auto-broadcast': Icons.AutoBroadcastIcon,
  'add-members': Icons.AddMembersIcon,
  'settings': Icons.SettingsIcon,
};

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const darkMode = theme === 'dark';

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [hasNotifications, setHasNotifications] = useState(true);

  const notificationsRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  function renderIcon(iconName, active) {
    const IconComp = iconMap[iconName] || Icons.DashboardIcon;
    return <IconComp className={`w-5 h-5 transition-colors ${active ? 'text-white' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />;
  }

  return (
    <div className="flex min-h-screen bg-[#f4f5f8] dark:bg-[#0b0c14] text-slate-800 dark:text-slate-200 transition-colors duration-200">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 bg-white dark:bg-[#0c0e17] border-r border-gray-100 dark:border-gray-800/40 shrink-0 transition-colors duration-200">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800/40 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white font-extrabold text-xl shadow-lg shadow-indigo-600/20 dark:shadow-indigo-500/10">
            D
          </div>
          <div>
            <div className="text-base font-bold text-slate-900 dark:text-white leading-tight">Designoia</div>
            <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider uppercase">WPMANAGEMENT</div>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `group flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-lg shadow-indigo-600/15 dark:shadow-indigo-500/10'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 hover:text-slate-900 dark:hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {renderIcon(item.icon, isActive)}
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Pro Banner in Sidebar */}
        <div className="px-4 mb-4">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-[#1b1933] dark:to-[#131124] border border-indigo-100/50 dark:border-indigo-950/30 text-center">
            <h4 className="text-xs font-bold text-indigo-950 dark:text-white mb-1">Upgrade to Pro</h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
              Unlock all premium features and automate your campaigns.
            </p>
            <button className="w-full py-2 bg-gradient-to-r from-purple-500 to-indigo-500 hover:opacity-95 text-white text-[10px] font-bold rounded-xl shadow-md shadow-purple-500/15 transition-all active:scale-95">
              Upgrade Now
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800/40">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all active:scale-98"
          >
            <Icons.LogoutIcon className="w-5 h-5 text-rose-500" />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile hamburger drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white dark:bg-[#0c0e17] p-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-3.5 px-2 pb-4 border-b border-gray-100 dark:border-gray-800/40">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-extrabold text-lg">
                  D
                </div>
                <div>
                  <div className="text-sm font-bold dark:text-white">Designoia</div>
                  <div className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">WPManagement</div>
                </div>
              </div>
              
              <nav className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                        isActive ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {renderIcon(item.icon, isActive)}
                        <span>{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </nav>
            </div>
            
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20"
            >
              <Icons.LogoutIcon className="w-5 h-5 text-rose-500" />
              Logout
            </button>
          </aside>
        </div>
      )}

      {/* Main page area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between gap-4 bg-white dark:bg-[#0c0e17] border-b border-gray-100 dark:border-gray-800/40 px-6 py-4 transition-colors duration-200">
          <div className="flex items-center gap-3 flex-1">
            <button className="md:hidden p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 text-slate-700 dark:text-slate-300" onClick={() => setMenuOpen(true)}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            {/* Search Box */}
            <div className="relative hidden md:block max-w-xs w-full">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Icons.SearchIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
              </span>
              <input
                type="text"
                placeholder="Search anything...          Ctrl /"
                className="w-full pl-9 pr-3 py-2 text-xs border border-gray-100 dark:border-gray-800/60 rounded-xl bg-slate-50/50 dark:bg-[#151824] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1.5 focus:ring-indigo-500"
                readOnly
              />
            </div>
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
            {/* Number connection status switcher */}
            <NumberSwitcher numbers={numbers} />

            {/* Dark Mode toggle group */}
            <div className="flex items-center bg-slate-50 dark:bg-[#151824] p-0.5 rounded-xl border border-gray-100/80 dark:border-gray-800/50">
              <button
                onClick={() => setTheme('light')}
                className="p-1.5 rounded-lg transition-all text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Light Mode"
              >
                <Icons.SunIcon className={`w-4 h-4 ${!darkMode ? 'text-amber-500 fill-amber-500' : ''}`} />
              </button>
              <button
                onClick={() => setTheme('dark')}
                className="p-1.5 rounded-lg transition-all text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Dark Mode"
              >
                <Icons.MoonIcon className={`w-4 h-4 ${darkMode ? 'text-indigo-400 fill-indigo-400' : ''}`} />
              </button>
            </div>

            {/* Notification Bell with Dropdown */}
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setHasNotifications(false);
                }}
                className="p-2 rounded-xl bg-slate-50 dark:bg-[#151824] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border border-gray-100/80 dark:border-gray-800/50 relative focus:outline-none"
              >
                <Icons.BellIcon className="w-5 h-5" />
                {hasNotifications && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-[#0c0e17]" />
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2.5 w-80 bg-white dark:bg-[#151824] rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-800 py-3 z-50">
                  <div className="px-4 pb-2 border-b border-gray-100 dark:border-gray-800/40 flex justify-between items-center">
                    <span className="font-extrabold text-slate-800 dark:text-white text-xs">Notifications</span>
                    <button
                      onClick={() => setHasNotifications(false)}
                      className="text-[10px] text-indigo-500 hover:underline font-bold"
                    >
                      Mark all as read
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800/40 mt-1">
                    <div className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors text-left">
                      <div className="text-[11px] font-bold text-slate-850 dark:text-slate-200 leading-snug">Campaign 'Diwali Promo' scheduled successfully.</div>
                      <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">10 minutes ago</div>
                    </div>
                    <div className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors text-left">
                      <div className="text-[11px] font-bold text-slate-850 dark:text-slate-200 leading-snug">WhatsApp number '+91 98765 43210' is active.</div>
                      <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">1 hour ago</div>
                    </div>
                    <div className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors text-left">
                      <div className="text-[11px] font-bold text-slate-850 dark:text-slate-200 leading-snug">Auto Broadcast queue processed 12 messages.</div>
                      <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">Yesterday</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Avatar with Dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="flex items-center gap-3.5 border-l border-gray-100 dark:border-gray-800/60 pl-4 text-left focus:outline-none select-none cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 text-white font-bold flex items-center justify-center shadow-md shadow-indigo-500/10">
                  C
                </div>
                <div className="hidden sm:block">
                  <div className="text-xs font-bold text-slate-800 dark:text-white leading-tight flex items-center gap-1">
                    <span>cliki</span>
                    <Icons.ChevronDownIcon className={`w-3.5 h-3.5 text-slate-450 transition-transform ${showProfileDropdown ? 'rotate-180' : ''}`} />
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500">Admin</div>
                </div>
              </button>

              {showProfileDropdown && (
                <div className="absolute right-0 mt-2.5 w-48 bg-white dark:bg-[#151824] rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-800 py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800/40">
                    <div className="text-xs font-bold text-slate-800 dark:text-white">cliki</div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500">admin@designoia.com</div>
                  </div>
                  <button
                    onClick={logout}
                    className="w-full text-left px-4 py-2.5 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 font-bold transition-colors flex items-center gap-2"
                  >
                    <Icons.LogoutIcon className="w-4 h-4 text-rose-500" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 pb-24 md:pb-6 overflow-y-auto scrollbar-thin">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-[#0c0e17] border-t border-gray-100 dark:border-gray-800/40 flex justify-around py-3 z-30 shadow-lg">
          {mainMobile.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `flex flex-col items-center text-[10px] font-bold ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}
            >
              {({ isActive }) => (
                <>
                  {renderIcon(item.icon, isActive)}
                  <span className="mt-1">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
