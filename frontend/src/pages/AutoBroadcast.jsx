import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';
import StatCard from '../components/StatCard';

const FREQ_OPTIONS = [
  { value: 1, label: 'Every day' },
  { value: 2, label: 'Every 2 days' },
  { value: 3, label: 'Every 3 days' },
  { value: 7, label: 'Weekly' },
];

const INTERVAL_UNITS = [
  { value: 'minutes', label: 'Minutes', min: 5, max: 1440 },
  { value: 'hours',   label: 'Hours',   min: 1, max: 23 },
];

function intervalToMinutes(val, unit) {
  return unit === 'hours' ? val * 60 : val;
}

// Evenly spaced times starting at `startTime`, `count` of them, `intervalMinutes` apart.
// Stops early (fewer than `count` times) rather than wrapping past midnight, so every
// generated slot stays on the same calendar day and the existing "last slot" logic
// (which picks the lexicographically-max HH:MM as the day's final send) stays correct.
function computeIntervalTimes(startTime, intervalMinutes, count) {
  const [h, m] = startTime.split(':').map(Number);
  let cur = h * 60 + m;
  const times = [];
  for (let i = 0; i < count && cur < 24 * 60; i++) {
    const hh = String(Math.floor(cur / 60)).padStart(2, '0');
    const mm = String(cur % 60).padStart(2, '0');
    times.push(`${hh}:${mm}`);
    cur += intervalMinutes;
  }
  return times;
}

const EMPTY_FORM = {
  name: '',
  number_id: '',
  target_ids: [],
  product_ids: [],
  products_per_day: 1,
  frequency_days: 1,
  send_times: ['09:00'],
  schedule_mode: 'slots', // 'slots' (pick exact times) | 'interval' (start time + repeat every)
  interval_start: '09:00',
  interval_val: 3,
  interval_unit: 'hours',
};

export default function AutoBroadcast() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['broadcast-queues'] }); setShowForm(false); setForm(EMPTY_FORM); toast.success('Schedule created!'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const updateQueue = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/broadcast-queue/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['broadcast-queues'] }); toast.success('Updated'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const saveEdit = useMutation({
    mutationFn: (data) => api.put(`/broadcast-queue/${editingId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['broadcast-queues'] }); setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); toast.success('Schedule updated!'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const deleteQueue = useMutation({
    mutationFn: (id) => api.delete(`/broadcast-queue/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['broadcast-queues'] }); toast.success('Deleted'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  function toggleArr(key, val) {
    setForm((f) => ({ ...f, [key]: f[key].includes(val) ? f[key].filter((x) => x !== val) : [...f[key], val] }));
  }

  function selectAllProducts() {
    setForm((f) => ({ ...f, product_ids: products.map((p) => p.id) }));
  }

  // Both modes always send exactly 1 product per time slot — Specific Times mode
  // has no separate "products/day" number to keep in sync with the times list
  // (it's just however many times are listed); Interval mode's products/day
  // input is really "how many times to generate."
  const intervalPreviewTimes = form.schedule_mode === 'interval'
    ? computeIntervalTimes(form.interval_start, intervalToMinutes(form.interval_val, form.interval_unit), Number(form.products_per_day) || 1)
    : form.send_times;
  const effectiveProductsPerDay = form.schedule_mode === 'interval' ? intervalPreviewTimes.length : form.send_times.length;

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.target_ids.length) return toast.error('Select at least one group / channel');
    if (!form.product_ids.length) return toast.error('Select at least one product');
    const sendTimes = form.schedule_mode === 'interval' ? intervalPreviewTimes : form.send_times;
    if (!sendTimes.length) return toast.error('No valid send times — adjust the start time or interval');
    const payload = {
      name: form.name,
      number_id: Number(form.number_id),
      target_ids: form.target_ids,
      product_ids: form.product_ids,
      products_per_day: sendTimes.length, // 1 product per slot, always
      frequency_days: Number(form.frequency_days),
      delay_seconds: 10, // only matters if a slot ever sends >1 product, which no longer happens from this UI
      send_times: sendTimes,
    };
    if (editingId) saveEdit.mutate(payload);
    else createQueue.mutate(payload);
  }

  function startEdit(q) {
    const stimes = (() => { try { const a = JSON.parse(q.send_times || '[]'); return a.length ? a : [q.send_time || '09:00']; } catch (_) { return [q.send_time || '09:00']; } })();
    setForm({
      name: q.name,
      number_id: String(q.number_id),
      target_ids: JSON.parse(q.target_ids || '[]'),
      product_ids: JSON.parse(q.product_ids || '[]'),
      products_per_day: stimes.length,
      frequency_days: q.frequency_days,
      send_times: stimes,
      schedule_mode: 'slots',
      interval_start: stimes[0] || '09:00',
      interval_val: 3,
      interval_unit: 'hours',
    });
    setEditingId(q.id);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  const numberName = (id) => numbers.find((n) => n.id === Number(id))?.name || `#${id}`;

  // Stat row — real numbers derived from the actual queue data on this page.
  const activeCount = queues.filter((q) => q.status === 'active').length;
  const totalGroups = new Set(queues.flatMap((q) => { try { return JSON.parse(q.target_ids || '[]'); } catch (_) { return []; } })).size;
  const productsSent = queues.reduce((sum, q) => sum + (q.current_index || 0), 0);
  const nextQueue = queues
    .filter((q) => q.status === 'active' && q.next_send_at)
    .sort((a, b) => a.next_send_at.localeCompare(b.next_send_at))[0];
  const nextSendTime = nextQueue
    ? (() => { try { const a = JSON.parse(nextQueue.send_times || '[]'); return a[0] || nextQueue.send_time || '—'; } catch (_) { return nextQueue.send_time || '—'; } })()
    : '—';

  const filteredQueues = queues.filter((q) => {
    if (statusFilter !== 'all' && q.status !== statusFilter) return false;
    if (search && !q.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Auto Broadcast <span className="chip bg-accent/10 text-accent ml-2">Scheduler</span></h1>
          <p className="text-sm text-gray-500 mt-1">Automatically send products daily to multiple groups & channels</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}>+ New Schedule</button>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="📅" iconBg="bg-accent/10" iconColor="text-accent" label="Active Schedules" value={activeCount} />
        <StatCard icon="👥" iconBg="bg-blue-50" iconColor="text-blue-600" label="Target Groups" value={totalGroups} />
        <StatCard icon="📤" iconBg="bg-green-50" iconColor="text-wagreen" label="Products Sent" value={productsSent} />
        <StatCard icon="🕐" iconBg="bg-amber-50" iconColor="text-amber-600" label="Next Send" value={nextSendTime} delta={nextQueue?.next_send_at} />
      </div>

      {/* Search + filter */}
      {queues.length > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-800">Your Schedules</h2>
          <div className="flex gap-2">
            <input
              className="input w-56"
              placeholder="Search schedules…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="input w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
      )}

      {/* Empty state */}
      {queues.length === 0 && !showForm && (
        <div className="card text-center py-14 text-gray-400">
          <div className="text-5xl mb-3">📅</div>
          <p className="font-medium text-gray-600">No schedules yet</p>
          <p className="text-sm mt-1">Create a schedule to send products automatically every day</p>
        </div>
      )}

      {queues.length > 0 && filteredQueues.length === 0 && (
        <div className="card text-center py-10 text-gray-400">No schedules match your search/filter</div>
      )}

      {/* Queue cards */}
      <div className="space-y-4">
        {filteredQueues.map((q) => {
          const pids = JSON.parse(q.product_ids || '[]');
          const tids = JSON.parse(q.target_ids || '[]');
          const stimes = (() => { try { const a = JSON.parse(q.send_times || '[]'); return a.length ? a : [q.send_time || '09:00']; } catch (_) { return [q.send_time || '09:00']; } })();
          const total = pids.length;
          const cur = (q.current_index || 0) % (total || 1);

          return (
            <div key={q.id} className="card">
              <div className="flex items-start gap-4 flex-wrap">
                {/* Thumbnail */}
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-accent/80 to-indigo-700 flex items-center justify-center text-2xl text-white flex-shrink-0">
                  📦
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{q.name}</h3>
                      <span className={`chip text-xs font-medium ${q.status === 'active' ? 'bg-green-100 text-green-700' : q.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                        {q.status.charAt(0).toUpperCase() + q.status.slice(1)}
                      </span>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        className="w-8 h-8 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 flex items-center justify-center transition"
                        title="Edit"
                        onClick={() => startEdit(q)}
                      >
                        ✏️
                      </button>
                      <button
                        className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center transition"
                        title={q.status === 'active' ? 'Pause' : 'Resume'}
                        onClick={() => updateQueue.mutate({ id: q.id, status: q.status === 'active' ? 'paused' : 'active' })}
                      >
                        {q.status === 'active' ? '⏸️' : '▶️'}
                      </button>
                      <button
                        className="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center transition"
                        title="Delete"
                        onClick={() => { if (window.confirm('Delete this schedule?')) deleteQueue.mutate(q.id); }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    📱 {numberName(q.number_id)} · 🕐 {stimes.join(', ')} · every {q.frequency_days} day{q.frequency_days > 1 ? 's' : ''}
                  </div>
                  <div className="text-sm text-gray-500">
                    📦 {q.products_per_day}/day · 🎯 {tids.length || 1} target{(tids.length || 1) > 1 ? 's' : ''}
                  </div>
                  {tids.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tids.slice(0, 3).map((t) => (
                        <span key={t} className="chip bg-accent/10 text-accent text-[10px]">{t.substring(0, 15)}…</span>
                      ))}
                      {tids.length > 3 && <span className="chip bg-gray-100 text-gray-500 text-[10px]">+{tids.length - 3} more</span>}
                    </div>
                  )}
                  <div className="text-xs text-gray-400">📅 Next send: <span className="font-medium text-gray-600">{q.next_send_at || '—'}</span></div>
                  {/* Progress */}
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                      <span>Position in cycle: {cur}/{total}</span>
                      <span>{total ? Math.round((cur / total) * 100) : 0}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${total ? Math.round((cur / total) * 100) : 0}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={closeForm}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[94vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-lg">{editingId ? 'Edit Broadcast Schedule' : 'New Broadcast Schedule'}</h2>
                <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
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
                      Groups &amp; Channels <span className="text-accent font-semibold">({form.target_ids.length} selected)</span>
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
                            <label key={g.wa_id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${form.target_ids.includes(g.wa_id) ? 'bg-accent/10' : 'hover:bg-gray-50'}`}>
                              <input type="checkbox" checked={form.target_ids.includes(g.wa_id)} onChange={() => toggleArr('target_ids', g.wa_id)} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{g.name}</div>
                                <div className="text-xs text-gray-400">{g.member_count} members</div>
                              </div>
                              {form.target_ids.includes(g.wa_id) && <span className="text-accent text-sm">✓</span>}
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

                {/* Send Times: slots vs interval */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">Send Schedule (IST)</label>
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                      <button
                        type="button"
                        className={`text-xs font-medium px-3 py-1 rounded-md transition-colors ${form.schedule_mode === 'slots' ? 'bg-white shadow-sm text-accent' : 'text-gray-500'}`}
                        onClick={() => setForm((f) => ({ ...f, schedule_mode: 'slots' }))}
                      >
                        Specific Times
                      </button>
                      <button
                        type="button"
                        className={`text-xs font-medium px-3 py-1 rounded-md transition-colors ${form.schedule_mode === 'interval' ? 'bg-white shadow-sm text-accent' : 'text-gray-500'}`}
                        onClick={() => setForm((f) => ({ ...f, schedule_mode: 'interval' }))}
                      >
                        Interval
                      </button>
                    </div>
                  </div>

                  {form.schedule_mode === 'slots' ? (
                    <>
                      <div className="flex justify-end mb-2">
                        <button
                          type="button"
                          className="text-xs text-accent hover:underline font-medium"
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
                        1 product per time slot — {form.send_times.length} product{form.send_times.length > 1 ? 's' : ''}/day total.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-500">Start Time</label>
                          <input
                            type="time"
                            className="input"
                            value={form.interval_start}
                            onChange={(e) => setForm((f) => ({ ...f, interval_start: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Products per Day</label>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            className="input"
                            value={form.products_per_day}
                            onChange={(e) => setForm((f) => ({ ...f, products_per_day: Number(e.target.value) }))}
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        <label className="text-xs text-gray-500">Repeat Every</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            className="input !w-20 flex-shrink-0"
                            min={INTERVAL_UNITS.find((u) => u.value === form.interval_unit)?.min}
                            max={INTERVAL_UNITS.find((u) => u.value === form.interval_unit)?.max}
                            value={form.interval_val}
                            onChange={(e) => setForm((f) => ({ ...f, interval_val: Number(e.target.value) }))}
                          />
                          <select
                            className="input flex-1 min-w-0"
                            value={form.interval_unit}
                            onChange={(e) => setForm((f) => ({ ...f, interval_unit: e.target.value }))}
                          >
                            {INTERVAL_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-2">
                        {intervalPreviewTimes.length > 0
                          ? <>1 product per slot — computed times: <strong>{intervalPreviewTimes.join(', ')}</strong>{intervalPreviewTimes.length < form.products_per_day ? ` (only ${intervalPreviewTimes.length} of ${form.products_per_day} fit before midnight)` : ''}</>
                          : 'Adjust start time / interval — no valid times fit before midnight'}
                      </p>
                    </>
                  )}
                </div>

                {/* Products */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">
                      Products to Cycle Through <span className="text-accent font-semibold">({form.product_ids.length} selected)</span>
                    </label>
                    <div className="flex gap-3 text-xs">
                      <button type="button" className="text-accent hover:underline font-medium" onClick={selectAllProducts}>Select All</button>
                      {form.product_ids.length > 0 && (
                        <button type="button" className="text-red-500 hover:underline" onClick={() => setForm((f) => ({ ...f, product_ids: [] }))}>Clear</button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto border border-gray-200 rounded-lg p-2">
                    {products.map((p) => (
                      <label key={p.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors text-xs ${form.product_ids.includes(p.id) ? 'border-accent bg-accent/10' : 'border-gray-100 hover:bg-gray-50'}`}>
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
                      {form.product_ids.length} products · {effectiveProductsPerDay}/day → full cycle in {Math.ceil(form.product_ids.length / (effectiveProductsPerDay || 1))} days
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="button" className="btn-secondary flex-1" onClick={closeForm}>Cancel</button>
                  <button type="submit" className="btn-primary flex-1" disabled={createQueue.isPending || saveEdit.isPending}>
                    {editingId
                      ? (saveEdit.isPending ? 'Saving…' : '✅ Save Changes')
                      : (createQueue.isPending ? 'Creating…' : '✅ Create Schedule')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Feature highlights */}
      <div className="card grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: '🕐', color: 'text-accent', bg: 'bg-accent/10', title: 'Smart Scheduling', desc: 'Pick exact times or an interval — your call' },
          { icon: '🔀', color: 'text-blue-600', bg: 'bg-blue-50', title: 'Multi-Target', desc: 'Send to multiple groups & channels at once' },
          { icon: '📈', color: 'text-wagreen', bg: 'bg-green-50', title: 'Live Progress', desc: 'Track cycle position for every schedule' },
          { icon: '🔒', color: 'text-purple-600', bg: 'bg-purple-50', title: 'Secure & Reliable', desc: 'Runs safely against WhatsApp anti-ban limits' },
        ].map((f) => (
          <div key={f.title} className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${f.bg} ${f.color}`}>{f.icon}</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-800">{f.title}</div>
              <div className="text-xs text-gray-400 leading-tight">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
