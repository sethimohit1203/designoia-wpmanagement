import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';

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
  });

  const cancel = useMutation({
    mutationFn: (id) => api.post(`/campaigns/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const onTemplateChange = (id) => {
    const t = templates.find((t) => String(t.id) === id);
    setForm({ ...form, template_id: id, message: t?.content || form.message });
  };

  const badgeColor = { scheduled: 'bg-amber-50 text-amber-700', sent: 'bg-green-50 text-green-700', failed: 'bg-red-50 text-red-700', cancelled: 'bg-gray-100 text-gray-500' };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Campaign Scheduler <span className="chip bg-orange-50 text-orange-700 ml-2">AUTO</span></h1>

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
                <td>{c.status === 'scheduled' && <button className="text-red-600 text-xs" onClick={() => cancel.mutate(c.id)}>Cancel</button>}</td>
              </tr>
            ))}
            {!campaigns.length && <tr><td colSpan={5} className="text-center text-gray-400 py-6">No campaigns yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
