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

const DELAY_UNITS = [
  { value: 'seconds', label: 'Seconds', min: 5, max: 300 },
  { value: 'minutes', label: 'Minutes', min: 1, max: 60 },
  { value: 'hours',   label: 'Hours',   min: 1, max: 12 },
];

function toSeconds(val, unit) {
  if (unit === 'minutes') return val * 60;
  if (unit === 'hours') return val * 3600;
  return val;
}

function fromSeconds(sec) {
  if (sec >= 3600 && sec % 3600 === 0) return { val: sec / 3600, unit: 'hours' };
  if (sec >= 60 && sec % 60 === 0) return { val: sec / 60, unit: 'minutes' };
  return { val: sec, unit: 'seconds' };
}

const EMPTY_FORM = {
  name: '',
  number_id: '',
  target_ids: [],
  product_ids: [],
  products_per_day: 1,
  frequency_days: 1,
  delay_val: 10,
  delay_unit: 'seconds',
  send_times: ['09:00'],
};

export default function AutoBroadcast() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: queues = [] } = useQuery({ queryKey: ['broadcast-queues'], queryFn: () => api.get('/broadcast-queue').then((r) => r.data) });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => api.get('/sheets/products').then((r) => r.data) });
  const { data: numbers = [] } = useQuery({ queryKey: ['numbers'], queryFn: () => api.get('/numbers').then((r) => r.data) });
  const { data: groups = [] } = useQuery({
    queryKey: ['groups', form.number_id],
    queryFn: () => api.get('/groups', { params: { number_id: form.number_id } }).then((r) => r.data),
    enabled: !!form.number_id,
  });

  const createQueue = useMutation({
    mutationFn: (data) => api.post('/broadcast-queue', data),
    onSuccess: () => { qc.invalidateQueries(['broadcast-queues']); setShowForm(false); setForm(EMPTY_FORM); toast.success('Schedule created!'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const updateQueue = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/broadcast-queue/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['broadcast-queues']); toast.success('Updated'); },
  });

  const deleteQueue = useMutation({
    mutationFn: (id) => api.delete(`/broadcast-queue/${id}`),
    onSuccess: () => { qc.invalidateQueries(['broadcast-queues']); toast.success('Deleted'); },
  });

  function toggleArr(key, val) {
    setForm((f) => ({ ...f, [key]: f[key].includes(val) ? f[key].filter((x) => x !== val) : [...f[key], val] }));
  }

  function selectAllProducts() {
    setForm((f) => ({ ...f, product_ids: products.map((p) => p.id) }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.target_ids.length) return toast.error('Select at least one group / channel');
    if (!form.product_ids.length) return toast.error('Select at least one product');
    createQueue.mutate({
      name: form.name,
      number_id: Number(form.number_id),
      target_ids: form.target_ids,
      product_ids: form.product_ids,
      products_per_day: Number(form.products_per_day),
      frequency_days: Number(form.frequency_days),
      delay_seconds: toSeconds(Number(form.delay_val), form.delay_unit),
      send_times: form.send_times,
    });
  }

  const numberName = (id) => numbers.find((n) => n.id === Number(id))?.name || `#${id}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Auto Broadcast <span className="chip bg-purple-50 text-purple-700 ml-2">SCHEDULER</span></h1>
          <p className="text-sm text-gray-500 mt-1">Automatically send products daily to multiple groups & channels</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}>+ New Schedule</button>
      </div>

      {/* Empty state */}
      {queues.length === 0 && !showForm && (
        <div className="card text-center py-14 text-gray-400">
          <div className="text-5xl mb-3">📅</div>
          <p className="font-medium text-gray-600">No schedules yet</p>
          <p className="text-sm mt-1">Create a schedule to send products automatically every day</p>
        </div>
      )}

      {/* Queue cards */}
      <div className="space-y-4">
        {queues.map((q) => {
          const pids = JSON.parse(q.product_ids || '[]');
          const tids = JSON.parse(q.target_ids || '[]');
          const stimes = (() => { try { const a = JSON.parse(q.send_times || '[]'); return a.length ? a : [q.send_time || '09:00']; } catch (_) { return [q.send_time || '09:00']; } })();
          const total = pids.length;
          const cur = (q.current_index || 0) % (total || 1);
          const { val: dVal, unit: dUnit } = fromSeconds(q.delay_seconds || 10);

          return (
            <div key={q.id} className="card">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{q.name}</h3>
                    <span className={`chip text-xs ${q.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{q.status}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    📱 {numberName(q.number_id)} · 🕐 {stimes.join(', ')} · every {q.frequency_days} day{q.frequency_days > 1 ? 's' : ''}
                  </div>
                  <div className="text-sm text-gray-500">
                    📦 {q.products_per_day}/day · ⏱ {dVal} {dUnit} delay · 🎯 {tids.length || 1} target{(tids.length || 1) > 1 ? 's' : ''}
                  </div>
                  {tids.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tids.slice(0, 3).map((t) => (
                        <span key={t} className="chip bg-blue-50 text-blue-600 text-[10px]">{t.substring(0, 15)}…</span>
                      ))}
                      {tids.length > 3 && <span className="chip bg-gray-100 text-gray-500 text-[10px]">+{tids.length - 3} more</span>}
                    </div>
                  )}
                  <div className="text-xs text-gray-400">📅 Next: <span className="font-medium text-gray-600">{q.next_send_at || '—'}</span></div>
                  {/* Progress */}
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                      <span>Position in cycle: {cur}/{total}</span>
                      <span>{total ? Math.round((cur / total) * 100) : 0}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full" style={{ width: `${total ? Math.round((cur / total) * 100) : 0}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0 flex-wrap">
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
          <div
            className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[94vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-lg">New Broadcast Schedule</h2>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name */}
                <div>
                  <label className="label">Schedule Name</label>
                  <input className="input" placeholder="e.g. Daily Women's Fashion" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                </div>

                {/* Number */}
                <div>
                  <label className="label">Sending Number</label>
                  <select className="input" value={form.number_id} onChange={(e) => setForm((f) => ({ ...f, number_id: e.target.value }))} required>
                    <option value="">Select number</option>
                    {numbers.map((n) => <option key={n.id} value={n.id}>{n.name} {n.runtimeStatus === 'connected' ? '🟢' : '🔴'}</option>)}
                  </select>
                </div>

                {/* Targets: multi-select groups/channels */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">
                      Groups &amp; Channels <span className="text-teal-600 font-semibold">({form.target_ids.length} selected)</span>
                    </label>
                    {form.target_ids.length > 0 && (
                      <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => setForm((f) => ({ ...f, target_ids: [] }))}>Clear all</button>
                    )}
                  </div>
                  {!form.number_id ? (
                    <div className="border border-dashed border-gray-200 rounded-lg p-4 text-center text-sm text-gray-400">Select a number above to load groups</div>
                  ) : groups.length === 0 ? (
                    <div className="border border-dashed border-gray-200 rounded-lg p-4 text-center text-sm text-gray-400">No groups found — go to Groups page and refresh</div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg divide-y max-h-52 overflow-y-auto">
                      {/* Groups section */}
                      {groups.filter((g) => g.type !== 'channel').length > 0 && (
                        <>
                          <div className="px-3 py-1 bg-gray-50 text-[10px] font-semibold text-gray-500 uppercase tracking-wider sticky top-0">👥 Groups</div>
                          {groups.filter((g) => g.type !== 'channel').map((g) => (
                            <label key={g.wa_id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${form.target_ids.includes(g.wa_id) ? 'bg-teal-50' : 'hover:bg-gray-50'}`}>
                              <input type="checkbox" checked={form.target_ids.includes(g.wa_id)} onChange={() => toggleArr('target_ids', g.wa_id)} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{g.name}</div>
                                <div className="text-xs text-gray-400">{g.member_count} members</div>
                              </div>
                              {form.target_ids.includes(g.wa_id) && <span className="text-teal-500 text-sm">✓</span>}
                            </label>
                          ))}
                        </>
                      )}
                      {/* Channels section */}
                      {groups.filter((g) => g.type === 'channel').length > 0 && (
                        <>
                          <div className="px-3 py-1 bg-purple-50 text-[10px] font-semibold text-purple-600 uppercase tracking-wider sticky top-0">📢 Channels</div>
                          {groups.filter((g) => g.type === 'channel').map((g) => (
                            <label key={g.wa_id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${form.target_ids.includes(g.wa_id) ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                              <input type="checkbox" checked={form.target_ids.includes(g.wa_id)} onChange={() => toggleArr('target_ids', g.wa_id)} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{g.name}</div>
                                <div className="text-xs text-gray-400">{g.member_count} followers</div>
                              </div>
                              {form.target_ids.includes(g.wa_id) && <span className="text-purple-500 text-sm">✓</span>}
                            </label>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">You can select multiple groups and channels — product will be sent to all of them</p>
                </div>

                {/* Frequency */}
                <div>
                  <label className="label">Frequency</label>
                  <select className="input" value={form.frequency_days} onChange={(e) => setForm((f) => ({ ...f, frequency_days: Number(e.target.value) }))}>
                    {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {/* Multiple Send Times */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">
                      Send Times (IST) <span className="text-teal-600 font-semibold">— {form.send_times.length} slot{form.send_times.length > 1 ? 's' : ''}</span>
                    </label>
                    <button
                      type="button"
                      className="text-xs text-teal-600 hover:underline font-medium"
                      onClick={() => setForm((f) => ({ ...f, send_times: [...f.send_times, '12:00'] }))}
                    >
                      + Add Time
                    </button>
                  </div>
                  <div className="space-y-2">
                    {form.send_times.map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-16">Slot {i + 1}</span>
                        <input
                          type="time"
                          className="input flex-1"
                          value={t}
                          onChange={(e) => setForm((f) => {
                            const times = [...f.send_times];
                            times[i] = e.target.value;
                            return { ...f, send_times: times };
                          })}
                        />
                        {form.send_times.length > 1 && (
                          <button
                            type="button"
                            className="text-red-400 hover:text-red-600 text-lg leading-none px-1"
                            onClick={() => setForm((f) => ({ ...f, send_times: f.send_times.filter((_, j) => j !== i) }))}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Each slot sends <strong>{form.products_per_day}</strong> product(s). Total per day: {form.send_times.length * form.products_per_day} products.
                  </p>
                </div>

                {/* Products per day + delay */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Products per Day</label>
                    <input type="number" min="1" max="20" className="input" value={form.products_per_day} onChange={(e) => setForm((f) => ({ ...f, products_per_day: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="label">Delay Between Products</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        className="input flex-1 min-w-0"
                        min={DELAY_UNITS.find((u) => u.value === form.delay_unit)?.min}
                        max={DELAY_UNITS.find((u) => u.value === form.delay_unit)?.max}
                        value={form.delay_val}
                        onChange={(e) => setForm((f) => ({ ...f, delay_val: Number(e.target.value) }))}
                      />
                      <select className="input w-28 flex-shrink-0" value={form.delay_unit} onChange={(e) => setForm((f) => ({ ...f, delay_unit: e.target.value }))}>
                        {DELAY_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Products */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">
                      Products to Cycle Through <span className="text-teal-600 font-semibold">({form.product_ids.length} selected)</span>
                    </label>
                    <div className="flex gap-3 text-xs">
                      <button type="button" className="text-teal-600 hover:underline font-medium" onClick={selectAllProducts}>Select All</button>
                      {form.product_ids.length > 0 && (
                        <button type="button" className="text-red-500 hover:underline" onClick={() => setForm((f) => ({ ...f, product_ids: [] }))}>Clear</button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto border border-gray-200 rounded-lg p-2">
                    {products.map((p) => (
                      <label key={p.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors text-xs ${form.product_ids.includes(p.id) ? 'border-teal-400 bg-teal-50' : 'border-gray-100 hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={form.product_ids.includes(p.id)} onChange={() => toggleArr('product_ids', p.id)} className="flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{p.product_name}</div>
                          <div className="text-green-700">₹{p.price}</div>
                        </div>
                      </label>
                    ))}
                    {products.length === 0 && <p className="col-span-2 text-center text-gray-400 py-4">No products — sync your sheet first</p>}
                  </div>
                  {form.product_ids.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {form.product_ids.length} products · {form.products_per_day}/day → full cycle in {Math.ceil(form.product_ids.length / form.products_per_day)} days
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-1">
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
