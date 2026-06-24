import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

const modules = [
  ['Bulk Sender', 'Send personalized messages to contact groups with anti-ban delay controls'],
  ['Contact Manager', 'CRM: add, import, tag, filter, group contacts'],
  ['Template Builder', 'Create reusable message templates with AI generation'],
  ['Campaign Scheduler', 'Schedule one-time or recurring campaigns to run automatically'],
  ['Chatbot / Auto-Reply', 'Keyword trigger -> auto-reply flows, live testable'],
  ['Analytics', 'Track sent, delivered, read, replied, failed per campaign'],
  ['Settings & Anti-Ban', 'Delay controls, rate limits, toggles, live safety checklist'],
  ['Google Sheets Sync', 'Connect any Sheet -> read products -> auto-send on schedule date'],
  ['Groups & Communities', 'Broadcast to WA Groups, Community Channels, Broadcast Lists'],
  ['Product Broadcast', 'Sheet products -> formatted WA message -> individual or group send'],
  ['Multi-WA Numbers', 'Connect multiple numbers, switch between them, auto-rotate'],
];

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
    ['Sent', summary?.sent || 0, 'bg-blue-50 text-blue-600'],
    ['Delivered', summary?.delivered || 0, 'bg-green-50 text-green-600'],
    ['Read', summary?.read || 0, 'bg-purple-50 text-purple-600'],
    ['Replied', summary?.replied || 0, 'bg-amber-50 text-amber-600'],
    ['Failed', summary?.failed || 0, 'bg-red-50 text-red-600'],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Designoia-WPManagement</h1>
        <p className="text-gray-500 text-sm">WhatsApp Automation Platform with Multi-Number Support</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map(([label, value, color]) => (
          <div key={label} className={`card ${color}`}>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs font-medium opacity-80">{label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Connected Numbers ({numbers.filter((n) => n.runtimeStatus === 'connected').length}/{numbers.length})</h2>
        <div className="flex gap-2 flex-wrap">
          {numbers.map((n) => (
            <span key={n.id} className={`chip ${n.runtimeStatus === 'connected' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {n.name} · {n.messages_sent_today}/{n.daily_limit}
            </span>
          ))}
          {!numbers.length && <span className="text-sm text-gray-400">No numbers added yet — go to Numbers tab.</span>}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Modules</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map(([name, desc]) => (
            <div key={name} className="border border-gray-100 rounded-lg p-3">
              <div className="font-medium text-sm text-gray-800">{name}</div>
              <div className="text-xs text-gray-500 mt-1">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
