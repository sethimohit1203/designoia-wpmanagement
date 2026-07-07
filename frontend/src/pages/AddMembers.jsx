import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';

const FREQ_OPTIONS = [
  { value: 1, label: 'Every day' },
  { value: 2, label: 'Every 2 days' },
  { value: 3, label: 'Every 3 days' },
  { value: 7, label: 'Weekly' },
];

const EMPTY_FORM = {
  name: '',
  number_id: '',
  group_id: '',
  contact_ids: [],
  members_per_day: 10,
  frequency_days: 1,
};

export default function AddMembers() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [contactSearch, setContactSearch] = useState('');

  const { data: queues = [] } = useQuery({ queryKey: ['member-queues'], queryFn: () => api.get('/member-queue').then((r) => r.data) });
  const { data: numbers = [] } = useQuery({ queryKey: ['numbers'], queryFn: () => api.get('/numbers').then((r) => r.data) });
  const { data: contactsData } = useQuery({ queryKey: ['contacts', '', 'All', 1], queryFn: () => api.get('/contacts', { params: { limit: 500 } }).then((r) => r.data) });
  const contacts = contactsData?.rows || [];
  const { data: groups = [] } = useQuery({
    queryKey: ['groups', form.number_id],
    queryFn: () => api.get('/groups', { params: { number_id: form.number_id } }).then((r) => r.data),
    enabled: !!form.number_id,
  });

  const createQueue = useMutation({
    mutationFn: (data) => api.post('/member-queue', data),
    onSuccess: () => { qc.invalidateQueries(['member-queues']); setShowForm(false); setForm(EMPTY_FORM); toast.success('Schedule created!'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const updateQueue = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/member-queue/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['member-queues']); toast.success('Updated'); },
  });

  const deleteQueue = useMutation({
    mutationFn: (id) => api.delete(`/member-queue/${id}`),
    onSuccess: () => { qc.invalidateQueries(['member-queues']); toast.success('Deleted'); },
  });

  const runNow = useMutation({
    mutationFn: (id) => api.post(`/member-queue/${id}/run-now`),
    onSuccess: () => { qc.invalidateQueries(['member-queues']); toast.success('Running — members being added in background'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  function toggleContact(id) {
    setForm((f) => ({
      ...f,
      contact_ids: f.contact_ids.includes(id) ? f.contact_ids.filter((x) => x !== id) : [...f.contact_ids, id],
    }));
  }

  function selectAllContacts() {
    const filtered = contacts.filter((c) =>
      !contactSearch || c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.phone.includes(contactSearch)
    );
    setForm((f) => ({ ...f, contact_ids: filtered.map((c) => c.id) }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.group_id) return toast.error('Select a group');
    if (!form.contact_ids.length) return toast.error('Select at least one contact');
    createQueue.mutate({
      name: form.name,
      number_id: Number(form.number_id),
      group_id: form.group_id,
      contact_ids: form.contact_ids,
      members_per_day: Number(form.members_per_day),
      frequency_days: Number(form.frequency_days),
    });
  }

  const numberName = (id) => numbers.find((n) => n.id === Number(id))?.name || `#${id}`;
  const groupName = (id) => groups.find((g) => g.wa_id === id)?.name || id;

  const filteredContacts = contacts.filter((c) =>
    !contactSearch || c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.phone.includes(contactSearch)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Add Members <span className="chip bg-blue-50 text-blue-700 ml-2">AUTO-ADD</span></h1>
          <p className="text-sm text-gray-500 mt-1">Automatically add contacts to WhatsApp groups on a schedule</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}>+ New Schedule</button>
      </div>

      {/* Empty state */}
      {queues.length === 0 && !showForm && (
        <div className="card text-center py-14 text-gray-400">
          <div className="text-5xl mb-3">➕</div>
          <p className="font-medium text-gray-600">No schedules yet</p>
          <p className="text-sm mt-1">Create a schedule to add contacts to groups automatically</p>
        </div>
      )}

      {/* Queue cards */}
      <div className="space-y-4">
        {queues.map((q) => {
          const cids = JSON.parse(q.contact_ids || '[]');
          const idx = q.current_index || 0;
          const done = Math.min(idx, cids.length);
          const pct = cids.length ? Math.round((done / cids.length) * 100) : 0;

          return (
            <div key={q.id} className="card">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{q.name}</h3>
                    <span className={`chip text-xs ${q.status === 'active' ? 'bg-green-100 text-green-700' : q.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{q.status}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    📱 {numberName(q.number_id)} · 👥 {q.members_per_day}/day · every {q.frequency_days} day{q.frequency_days > 1 ? 's' : ''}
                  </div>
                  <div className="text-sm text-gray-500 truncate">🎯 {q.group_id}</div>
                  <div className="text-xs text-gray-400">📅 Next: <span className="font-medium text-gray-600">{q.next_send_at || '—'}</span></div>
                  {/* Progress */}
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                      <span>{done} / {cids.length} contacts added</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0 flex-wrap">
                  <button
                    className="chip bg-blue-50 text-blue-700 cursor-pointer text-xs px-3 py-1"
                    onClick={() => runNow.mutate(q.id)}
                    disabled={runNow.isPending}
                  >
                    ▶ Run Now
                  </button>
                  <button
                    className={`chip cursor-pointer text-xs px-3 py-1 ${q.status === 'active' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}
                    onClick={() => updateQueue.mutate({ id: q.id, status: q.status === 'active' ? 'paused' : 'active' })}
                  >
                    {q.status === 'active' ? '⏸ Pause' : '▶ Resume'}
                  </button>
                  <button
                    className="chip bg-red-50 text-red-600 cursor-pointer text-xs px-3 py-1"
                    onClick={() => { if (window.confirm('Delete this schedule?')) deleteQueue.mutate(q.id); }}
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[94vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-lg">New Member-Add Schedule</h2>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name */}
                <div>
                  <label className="label">Schedule Name</label>
                  <input className="input" placeholder="e.g. Add buyers to Fashion Group" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                </div>

                {/* Number */}
                <div>
                  <label className="label">Sending Number</label>
                  <select className="input" value={form.number_id} onChange={(e) => setForm((f) => ({ ...f, number_id: e.target.value, group_id: '' }))} required>
                    <option value="">Select number</option>
                    {numbers.map((n) => <option key={n.id} value={n.id}>{n.name} {n.runtimeStatus === 'connected' ? '🟢' : '🔴'}</option>)}
                  </select>
                </div>

                {/* Group */}
                <div>
                  <label className="label">Target Group</label>
                  {!form.number_id ? (
                    <div className="border border-dashed border-gray-200 rounded-lg p-3 text-center text-sm text-gray-400">Select a number above to load groups</div>
                  ) : (
                    <select className="input" value={form.group_id} onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value }))} required>
                      <option value="">Select group</option>
                      {groups.filter((g) => g.type !== 'channel').map((g) => (
                        <option key={g.wa_id} value={g.wa_id}>{g.name} ({g.member_count} members)</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Contacts */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">
                      Contacts to Add <span className="text-blue-600 font-semibold">({form.contact_ids.length} selected)</span>
                    </label>
                    <div className="flex gap-2">
                      <button type="button" className="text-xs text-teal-600 hover:underline" onClick={selectAllContacts}>Select All</button>
                      {form.contact_ids.length > 0 && (
                        <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => setForm((f) => ({ ...f, contact_ids: [] }))}>Clear</button>
                      )}
                    </div>
                  </div>
                  <input
                    className="input mb-2"
                    placeholder="Search contacts…"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                  />
                  <div className="border border-gray-200 rounded-lg divide-y max-h-52 overflow-y-auto">
                    {filteredContacts.length === 0 ? (
                      <div className="p-3 text-sm text-gray-400">No contacts found</div>
                    ) : filteredContacts.map((c) => (
                      <label key={c.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${form.contact_ids.includes(c.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={form.contact_ids.includes(c.id)} onChange={() => toggleContact(c.id)} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{c.name}</div>
                          <div className="text-xs text-gray-400">{c.phone}</div>
                        </div>
                        {form.contact_ids.includes(c.id) && <span className="text-blue-500 text-sm">✓</span>}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Members per day + frequency */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Members per Day</label>
                    <input type="number" min="1" max="50" className="input" value={form.members_per_day} onChange={(e) => setForm((f) => ({ ...f, members_per_day: Number(e.target.value) }))} />
                    <p className="text-[10px] text-gray-400 mt-0.5">WhatsApp allows max ~20–30/day safely</p>
                  </div>
                  <div>
                    <label className="label">Frequency</label>
                    <select className="input" value={form.frequency_days} onChange={(e) => setForm((f) => ({ ...f, frequency_days: Number(e.target.value) }))}>
                      {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  ⚠️ Adding too many members too fast can trigger WhatsApp restrictions. Keep it under 20/day and spread across days.
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" className="btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancel</button>
                  <button type="submit" className="btn-primary flex-1" disabled={createQueue.isPending}>
                    {createQueue.isPending ? 'Creating…' : '✅ Create Schedule'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
