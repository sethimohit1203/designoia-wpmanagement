import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import * as Icons from '../components/Icons';

const modules = [
  ['Bulk Sender', 'Send personalized messages to contact groups with anti-ban delay controls', 'bulk-sender'],
  ['Contact Manager', 'CRM: add, import, tag, filter, group contacts', 'contacts'],
  ['Template Builder', 'Create reusable message templates with AI generation', 'templates'],
  ['Campaign Scheduler', 'Schedule one-time or recurring campaigns to run automatically', 'campaigns'],
  ['Chatbot / Auto-Reply', 'Keyword trigger -> auto-reply flows, live testable', 'chatbot'],
  ['Analytics', 'Track sent, delivered, read, replied, failed per campaign', 'analytics'],
  ['Settings & Anti-Ban', 'Delay controls, rate limits, toggles, live safety checklist', 'settings'],
  ['Google Sheets Sync', 'Connect any Sheet -> read products -> auto-send on schedule date', 'sheets'],
  ['Groups & Communities', 'Broadcast to WA Groups, Community Channels, Broadcast Lists', 'groups'],
  ['Product Broadcast', 'Sheet products -> formatted WA message -> individual or group send', 'broadcast'],
  ['Multi-WA Numbers', 'Connect multiple numbers, switch between them, auto-rotate', 'numbers'],
];

const moduleIconMap = {
  'bulk-sender': Icons.BulkSenderIcon,
  'contacts': Icons.ContactsIcon,
  'templates': Icons.TemplatesIcon,
  'campaigns': Icons.CampaignsIcon,
  'chatbot': Icons.ChatbotIcon,
  'analytics': Icons.AnalyticsIcon,
  'settings': Icons.SettingsIcon,
  'sheets': Icons.SheetsSyncIcon,
  'groups': Icons.GroupsIcon,
  'broadcast': Icons.BroadcastIcon,
  'numbers': Icons.NumbersIcon,
};

export default function Dashboard() {
  const { data: summary } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: () => api.get('/analytics/summary').then((r) => r.data),
  });
  
  const { data: numbers = [] } = useQuery({
    queryKey: ['numbers'],
    queryFn: () => api.get('/numbers').then((r) => r.data),
  });

  const stats = [
    { label: 'Sent', value: summary?.sent || 0, icon: Icons.BulkSenderIcon, color: 'indigo' },
    { label: 'Delivered', value: summary?.delivered || 0, icon: Icons.DoubleCheckIcon, color: 'emerald' },
    { label: 'Read', value: summary?.read || 0, icon: Icons.DoubleCheckIcon, color: 'sky' },
    { label: 'Replied', value: summary?.replied || 0, icon: Icons.ChatbotIcon, color: 'amber' },
    { label: 'Failed', value: summary?.failed || 0, icon: Icons.DeleteIcon, color: 'rose' },
  ];

  const colorStyles = {
    indigo: {
      bg: 'bg-indigo-50 dark:bg-indigo-950/40',
      text: 'text-indigo-600 dark:text-indigo-400',
    },
    emerald: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-600 dark:text-emerald-400',
    },
    sky: {
      bg: 'bg-sky-50 dark:bg-sky-950/40',
      text: 'text-sky-600 dark:text-sky-400',
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-600 dark:text-amber-400',
    },
    rose: {
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-600 dark:text-rose-400',
    },
  };

  const connectedNumbers = numbers.filter((n) => n.runtimeStatus === 'connected');

  return (
    <div className="space-y-6">
      {/* Header Title */}
      <div className="border-b border-gray-100 dark:border-gray-800/40 pb-5">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Designoia-WPManagement</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
          WhatsApp Automation Platform with Multi-Number Support
        </p>
      </div>

      {/* Stats Counter Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.map(({ label, value, icon: IconComp, color }) => {
          const style = colorStyles[color] || colorStyles.indigo;
          return (
            <div key={label} className="card flex flex-col justify-between p-4 min-h-[110px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</span>
                <div className={`w-7 h-7 rounded-xl ${style.bg} ${style.text} flex items-center justify-center`}>
                  <IconComp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-850 dark:text-white mt-3">
                {value.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connected Senders Card */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Icons.NumbersIcon className="w-5 h-5 text-indigo-500" />
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">
            Connected Senders ({connectedNumbers.length} / {numbers.length})
          </h2>
        </div>
        
        <div className="flex gap-2.5 flex-wrap">
          {numbers.map((n) => {
            const isConn = n.runtimeStatus === 'connected';
            return (
              <span
                key={n.id}
                className={`chip border px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  isConn
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 border-emerald-100 dark:border-emerald-950/20'
                    : 'bg-slate-50 dark:bg-[#1a1c29] text-slate-500 dark:text-slate-400 border border-gray-100 dark:border-gray-800'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isConn ? 'bg-emerald-500' : 'bg-slate-350'}`} />
                <span className="font-bold">{n.name}</span>
                <span className="opacity-60">·</span>
                <span className="text-[10px] opacity-80">{n.messages_sent_today || 0} / {n.daily_limit || 1000} sent</span>
              </span>
            );
          })}
          {!numbers.length && (
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium py-1">
              No numbers added yet. Go to the Numbers tab to connect.
            </span>
          )}
        </div>
      </div>

      {/* Modules Grid */}
      <div className="card">
        <h2 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
          <Icons.DashboardIcon className="w-5 h-5 text-indigo-500" />
          <span>System Modules</span>
        </h2>
        
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map(([name, desc, iconKey]) => {
            const IconComp = moduleIconMap[iconKey] || Icons.DashboardIcon;
            return (
              <div
                key={name}
                className="p-4 rounded-xl border border-gray-100 dark:border-gray-800/40 bg-slate-50/20 dark:bg-[#171926]/20 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 hover:border-indigo-500/30 dark:hover:border-indigo-500/30 transition-all flex gap-3.5"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <IconComp className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 dark:text-white text-xs leading-normal">{name}</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">{desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
