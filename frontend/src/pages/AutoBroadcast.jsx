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

export default function AutoBroadcast() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    number_id: '',
    target_type: 'group',
    target_id: '',
    product_ids: [],
    products_per_day: 3,
    frequency_days: 1,
    delay_seconds: 10,
  });

  const { data: queues = [] } = useQuery({ queryKey: ['broadcast-queues'], queryFn: () => api.get('/broadcast-queue').then((r) => r.data) });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => api.get('/sheets/products').then((r) => r.data) });
  const { data: numbers = [] } = useQuery({ queryKey: ['numbers'], queryFn: () => api.get('/numbers').then((r) => r.data) });
  const { data: contacts = [] } = useQuery({ queryKey: ['contacts'], queryFn: () => api.get('/contacts').then((r) => r.data) });
  const { data: groups = [] } = useQuery({
    queryKey: ['groups', form.number_id],
    queryFn: () => api.get('/groups', { params: { number_id: form.number_id } }).then((r) => r.data),
    enabled: !!form.number_id,
  });

  const createQueue = useMutation({
    mutationFn: (data) => api.post('/broadcast-queue', data),
    onSuccess: () => { qc.invalidateQueries(['broadcast-queues']); setShowForm(false); resetForm(); toast.success('Schedule created!'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to create schedule'),
  });

  const updateQueue = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/broadcast-queue/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['broadcast-queues']); toast.success('Updated'); },
  });

  const deleteQueue = useMutation({
    mutationFn: (id) => api.delete(`/broadcast-queue/${id}`),
    onSuccess: () => { qc.invalidateQueries(['broadcast-queues']); toast.success('Deleted'); },
  });

  function resetForm() {
    setForm({ name: '', number_id: '', target_type: 'group', target_id: '', product_ids: [], products_per_day: 3, frequency_days: 1, delay_seconds: 10 });
  }

  function toggleProduct(id) {
    setForm((f) => ({ ...f, product_ids: f.product_ids.includes(id) ? f.product_ids.filter((x) => x !== id) : [...f.product_ids, id] }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.product_ids.length) return toast.error('Select at least one product');
    createQueue.mutate(form);
  }

  const numberName = (id) => numbers.find((n) => n.id === Number(id))?.name || `#${id}`;
  const groupName = (id) => groups.find((g) => g.wa_id === id)?.name || id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Auto Broadcast <span className="chip bg-purple-50 text-purple-700 ml-2">SCHEDULER</span></h1>
          <p className="text-sm text-gray-500 mt-1">Send products automatically every day or on a custom schedule</p>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>+ New Schedule</button>
      </div>

      {/* Active schedules */}
      {queues.length === 0 && !showForm && (
        <div className="card text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📅</div>
          <p className="font-medium">No schedules yet</p>
          <p className="text-sm mt-1">Create a schedule to automatically send products daily to your groups</p>
        </div>
      )}

      <div className="space-y-4">
        {queues.map((q) => {
          const pids = JSON.parse(q.product_ids || '[]');
          const total = pids.length;
          const sent = q.current_index || 0;
          const progress = total > 0 ? Math.round((sent / total) * 100) : 0;
          return (
            <div key={q.id} className="card">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{q.name}</h3>
                    <span className={`chip text-xs ${q.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {q.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1 space-y-0.5">
                    <div>📱 {numberName(q.number_id)} → {q.target_type === 'contact' ? '👤' : '👥'} {q.target_id?.substring(0, 20)}{q.target_id?.length > 20 ? '…' : ''}</div>
                    <div>📦 {q.products_per_day} products/day · every {q.frequency_days} day{q.frequency_days > 1 ? 's' : ''} · ⏱ {q.delay_seconds}s delay</div>
                    <div>📅 Next send: <span className="font-medium text-gray-700">{q.next_send_at || '—'}</span></div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Products cycled: {sent % (total || 1)}/{total}</span>
                      <span>{progress}% through list</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    className={`chip cursor-pointer text-xs px-3 py-1 ${q.status === 'active' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}
                    onClick={() => updateQueue.mutate({ id: q.id, status: q.status === 'active' ? 'paused' : 'active' })}
                  >
                    {q.status === 'active' ? '⏸ Pause' : '▶ Resume'}
                  </button>
                  <button
                    className="chip bg-red-50 text-red-600 cursor-pointer text-xs px-3 py-1"
                    onClick={() => { if (confirm('Delete this schedule?')) deleteQueue.mutate(q.id); }}
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg">New Broadcast Schedule</h2>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Schedule Name</label>
                  <input className="input" placeholder="e.g. Daily Women's Fashion" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                </div>

                {/* Number */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Sending Number</label>
                  <select className="input" value={form.number_id} onChange={(e) => setForm((f) => ({ ...f, number_id: e.target.value, target_id: '' }))} required>
                    <option value="">Select number</option>
                    {numbers.map((n) => <option key={n.id} value={n.id}>{n.name} {n.runtimeStatus === 'connected' ? '🟢' : '🔴'}</option>)}
                  </select>
                </div>

                {/* Target */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Target Type</label>
                    <select className="input" value={form.target_type} onChange={(e) => setForm((f) => ({ ...f, target_type: e.target.value, target_id: '' }))}>
                      <option value="group">WhatsApp Group</option>
                      <option value="channel">Community Channel</option>
                      <option value="contact">Individual Contact</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">
                      {form.target_type === 'contact' ? 'Contact' : 'Group / Channel'}
                    </label>
                    {form.target_type === 'contact' ? (
                      <select className="input" value={form.target_id} onChange={(e) => setForm((f) => ({ ...f, target_id: e.target.value }))} required>
                        <option value="">Select contact</option>
                        {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : (
                      <select className="input" value={form.target_id} onChange={(e) => setForm((f) => ({ ...f, target_id: e.target.value }))} required>
                        <option value="">{!form.number_id ? 'Pick number first' : 'Select group'}</option>
                        {groups.map((g) => <option key={g.wa_id} value={g.wa_id}>{g.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                {/* Frequency */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Frequency</label>
                    <select className="input" value={form.frequency_days} onChange={(e) => setForm((f) => ({ ...f, frequency_days: Number(e.target.value) }))}>
                      {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Products/day</label>
                    <input type="number" min="1" max="20" className="input" value={form.products_per_day} onChange={(e) => setForm((f) => ({ ...f, products_per_day: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Delay (sec)</label>
                    <input type="number" min="5" max="60" className="input" value={form.delay_seconds} onChange={(e) => setForm((f) => ({ ...f, delay_seconds: Number(e.target.value) }))} />
                  </div>
                </div>

                {/* Product picker */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-2">
                    Select Products to Cycle Through ({form.product_ids.length} selected)
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto border border-gray-200 rounded-lg p-2">
                    {products.map((p) => (
                      <label key={p.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors text-xs ${form.product_ids.includes(p.id) ? 'border-teal-500 bg-teal-50' : 'border-gray-100 hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={form.product_ids.includes(p.id)} onChange={() => toggleProduct(p.id)} className="flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{p.product_name}</div>
                          <div className="text-green-700">₹{p.price}</div>
                        </div>
                      </label>
                    ))}
                    {products.length === 0 && <p className="col-span-2 text-center text-gray-400 py-4 text-xs">No products — sync your sheet first</p>}
                  </div>
                  {form.product_ids.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      Will cycle through all {form.product_ids.length} products, sending {form.products_per_day}/day — full cycle takes {Math.ceil(form.product_ids.length / form.products_per_day)} days
                    </p>
                  )}
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
