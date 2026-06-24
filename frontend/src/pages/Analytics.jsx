import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function Analytics() {
  const { data: summary } = useQuery({ queryKey: ['analytics-summary'], queryFn: () => api.get('/analytics/summary').then((r) => r.data) });
  const { data: byNumber = [] } = useQuery({ queryKey: ['analytics-by-number'], queryFn: () => api.get('/analytics/by-number').then((r) => r.data) });
  const { data: campaigns = [] } = useQuery({ queryKey: ['analytics-campaigns'], queryFn: () => api.get('/analytics/campaigns').then((r) => r.data) });

  const stats = [
    ['Sent', summary?.sent || 0, 'text-blue-600'],
    ['Delivered', summary?.delivered || 0, 'text-green-600'],
    ['Read', summary?.read || 0, 'text-purple-600'],
    ['Replied', summary?.replied || 0, 'text-amber-600'],
    ['Failed', summary?.failed || 0, 'text-red-600'],
  ];

  const riskColor = (score) => (score > 70 ? 'bg-red-50 text-red-700' : score > 40 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700');

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Analytics & Reports <span className="chip bg-purple-50 text-purple-700 ml-2">DATA</span></h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map(([label, value, color]) => (
          <div key={label} className="card text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Per-Number Breakdown</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={byNumber}>
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar dataKey="sent" fill="#6c5ce7" />
            <Bar dataKey="failed" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
        <div className="grid sm:grid-cols-3 gap-2 mt-3">
          {byNumber.map((n) => (
            <div key={n.id} className="border rounded-lg p-2 flex justify-between items-center text-sm">
              <span>{n.name}</span>
              <span className={`chip ${riskColor(n.ban_risk_score)}`}>{n.ban_risk_score}% risk</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Campaign History</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b"><th>Name</th><th>Number</th><th>Sent</th><th>Failed</th><th>Date</th></tr></thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="py-2">{c.name}</td>
                <td>{c.number_name || 'Auto-rotate'}</td>
                <td>{c.stats.sent ?? '-'}</td>
                <td>{c.stats.failed ?? '-'}</td>
                <td>{c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
