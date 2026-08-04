import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';
import StatCard from '../components/StatCard';

export default function Campaigns() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', group_name: 'All', template_id: '', number_id: '', message: '', scheduled_at: '', recurrence: 'none',
  });

  const { data: campaigns = [] } = useQuery({ queryKey: ['campaigns'], queryFn: () => api.get('/campaigns').then((r) => r.data), refetchInterval: 5000 });
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: () => api.get('/templates').then((r) => r.data) });
  const { data: numbers = [] } = useQuery({ queryKey: ['numbers'], queryFn: () => api.get('/numbers').then((r) => r.data) });
  const { data: groups = [] } = useQuery({ queryKey: ['contact-groups'], queryFn: () => api.get('/contacts/groups').then((r) => r.data) });

  const create = useMutation({
    mutationFn: () => api.post('/campaigns', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign scheduled');
      setForm({ name: '', group_name: 'All', template_id: '', number_id: '', message: '', scheduled_at: '', recurrence: 'none' });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to schedule campaign'),
  });

  const cancel = useMutation({
    mutationFn: (id) => api.post(`/campaigns/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to cancel campaign'),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/campaigns/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign deleted'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to delete campaign'),
  });

  const onTemplateChange = (id) => {
    const t = templates.find((t) => String(t.id) === id);
    setForm({ ...form, template_id: id, message: t?.content || form.message });
  };

  const badgeColor = { scheduled: 'bg-amber-50 text-amber-700', sent: 'bg-green-50 text-green-700', failed: 'bg-red-50 text-red-700', cancelled: 'bg-gray-100 text-gray-500' };
  const scheduledCount = campaigns.filter((c) => c.status === 'scheduled').length;
  const sentCount = campaigns.filter((c) => c.status === 'sent').length;
  const failedCount = campaigns.filter((c) => c.status === 'failed').length;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Campaign Scheduler <span className="chip bg-accent/10 text-accent ml-2">AUTO</span></h1>

      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon="🗓️" iconBg="bg-accent/10" iconColor="text-accent" label="Total Campaigns" value={campaigns.length} />
          <StatCard icon="⏳" iconBg="bg-amber-50" iconColor="text-amber-600" label="Scheduled" value={scheduledCount} />
          <StatCard icon="✅" iconBg="bg-green-50" iconColor="text-wagreen" label="Sent" value={sentCount} />
          <StatCard icon="❌" iconBg="bg-red-50" iconColor="text-red-600" label="Failed" value={failedCount} />
        </div>
      )}

      <div className="card grid sm:grid-cols-2 gap-3">
        <input className="input" placeholder="Campaign name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="input" value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })}>
          <option value="All">All Contacts</option>
          {groups.map((g) => <option key={g.group_name} value={g.group_name}>{g.group_name}</option>)}
        </select>
        <select className="input" value={form.template_id} onChange={(e) => onTemplateChange(e.target.value)}>
          <option value="">No template (write below)</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="input" value={form.number_id} onChange={(e) => setForm({ ...form, number_id: e.target.value })}>
          <option value="">Auto-rotate</option>
          {numbers.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <textarea className="input sm:col-span-2 h-24" placeholder="Message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        <input type="datetime-local" className="input" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
        <select className="input" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
          <option value="none">No repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <button className="btn-primary sm:col-span-2" disabled={!form.name || !form.scheduled_at} onClick={() => create.mutate()}>Schedule Campaign</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b"><th>Name</th><th>Scheduled</th><th>Recurrence</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="py-2">{c.name}</td>
                <td>{c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : '-'}</td>
                <td>{c.recurrence}</td>
                <td><span className={`chip ${badgeColor[c.status] || 'bg-gray-100'}`}>{c.status}</span></td>
                <td className="whitespace-nowrap">
                  <div className="flex gap-2 justify-end">
                    {c.status === 'scheduled' && (
                      <button className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 flex items-center justify-center transition" title="Cancel" onClick={() => cancel.mutate(c.id)}>
                        ⏹️
                      </button>
                    )}
                    <button className="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center transition" title="Delete" onClick={() => { if (window.confirm(`Delete campaign "${c.name}"?`)) remove.mutate(c.id); }}>
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!campaigns.length && <tr><td colSpan={5} className="text-center text-gray-400 py-6">No campaigns yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
