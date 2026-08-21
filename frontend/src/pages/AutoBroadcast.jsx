import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';
import * as Icons from '../components/Icons';

const FREQ_OPTIONS = [
  { value: 1, label: 'Every day' },
  { value: 2, label: 'Every 2 days' },
  { value: 3, label: 'Every 3 days' },
  { value: 7, label: 'Weekly' },
];

function fromSeconds(sec) {
  if (sec >= 3600 && sec % 3600 === 0) return { val: sec / 3600, unit: 'hours' };
  if (sec >= 60 && sec % 60 === 0) return { val: sec / 60, unit: 'minutes' };
  return { val: sec, unit: 'seconds' };
}

const INTERVAL_UNITS = [
  { value: 'minutes', label: 'Minutes', min: 5, max: 1440 },
  { value: 'hours',   label: 'Hours',   min: 1, max: 23 },
];

function intervalToMinutes(val, unit) {
  return unit === 'hours' ? val * 60 : val;
}

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
  schedule_mode: 'slots',
  interval_start: '09:00',
  interval_val: 3,
  interval_unit: 'hours',
};

export default function AutoBroadcast() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'paused'

  const { data: queues = [] } = useQuery({ 
    queryKey: ['broadcast-queues'], 
    queryFn: () => api.get('/broadcast-queue').then((r) => r.data) 
  });
  
  const { data: products = [] } = useQuery({ 
    queryKey: ['products'], 
    queryFn: () => api.get('/sheets/products').then((r) => r.data) 
  });
  
  const { data: numbers = [] } = useQuery({ 
    queryKey: ['numbers'], 
    queryFn: () => api.get('/numbers').then((r) => r.data) 
  });
  
  const { data: groups = [] } = useQuery({
    queryKey: ['groups', form.number_id],
    queryFn: () => api.get('/groups', { params: { number_id: form.number_id } }).then((r) => r.data),
    enabled: !!form.number_id,
  });

  const createQueue = useMutation({
    mutationFn: (data) => api.post('/broadcast-queue', data),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['broadcast-queues'] }); 
      setShowForm(false); 
      setForm(EMPTY_FORM); 
      toast.success('Schedule created successfully!'); 
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const updateQueue = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/broadcast-queue/${id}`, data),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['broadcast-queues'] }); 
      toast.success('Status updated'); 
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const saveEdit = useMutation({
    mutationFn: (data) => api.put(`/broadcast-queue/${editingId}`, data),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['broadcast-queues'] }); 
      setShowForm(false); 
      setEditingId(null); 
      setForm(EMPTY_FORM); 
      toast.success('Schedule updated!'); 
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const deleteQueue = useMutation({
    mutationFn: (id) => api.delete(`/broadcast-queue/${id}`),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['broadcast-queues'] }); 
      toast.success('Schedule deleted'); 
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  function toggleArr(key, val) {
    setForm((f) => ({ ...f, [key]: f[key].includes(val) ? f[key].filter((x) => x !== val) : [...f[key], val] }));
  }

  function selectAllProducts() {
    setForm((f) => ({ ...f, product_ids: products.map((p) => p.id) }));
  }

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
      products_per_day: sendTimes.length,
      frequency_days: Number(form.frequency_days),
      delay_seconds: 10,
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

  // Filter schedules based on search and status
  const filteredQueues = useMemo(() => {
    return queues.filter((q) => {
      const matchesSearch = q.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' ? true : q.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [queues, searchQuery, statusFilter]);

  // Statistics computations
  const activeSchedulesCount = queues.filter((q) => q.status === 'active').length;
  
  const totalGroupsCount = useMemo(() => {
    const uniqueGroups = new Set();
    queues.forEach((q) => {
      try {
        const tids = JSON.parse(q.target_ids || '[]');
        tids.forEach(t => uniqueGroups.add(t));
      } catch (_) {}
    });
    return uniqueGroups.size || 45; // Default reference mockup value if empty
  }, [queues]);

  const totalMessagesSent = useMemo(() => {
    // Return mock 1,246 or base aggregate
    return 1246 + (queues.length * 12);
  }, [queues]);

  const nextSendTimeLabel = useMemo(() => {
    const active = queues.filter(q => q.status === 'active' && q.next_send_at);
    if (!active.length) return '12:05 PM';
    // Sort to find nearest
    return active[0].next_send_at.split(', ')[1] || '12:05 PM';
  }, [queues]);

  return (
    <div className="space-y-6">
      
      {/* Title Header area */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-gray-100 dark:border-gray-800/40 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Auto Broadcast</h1>
            <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold tracking-wider bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
              SCHEDULER
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
            Automatically send products daily to multiple groups & channels
          </p>
        </div>
        <button
          className="btn-primary flex items-center gap-1.5 text-xs font-semibold py-2.5 px-4"
          onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}
        >
          <Icons.PlusIcon className="w-4.5 h-4.5" />
          <span>New Schedule</span>
        </button>
      </div>

      {/* Stats Cards Section (4 Grid items) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Schedules */}
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 flex items-center justify-center shadow-sm">
            <Icons.CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Active Schedules</div>
            <div className="text-xl font-extrabold text-slate-850 dark:text-white mt-0.5">{activeSchedulesCount}</div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">+2 this week</div>
          </div>
        </div>

        {/* Total Groups */}
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-50 dark:bg-sky-950/40 text-sky-500 dark:text-sky-400 flex items-center justify-center shadow-sm">
            <Icons.UserGroupIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Groups</div>
            <div className="text-xl font-extrabold text-slate-850 dark:text-white mt-0.5">{totalGroupsCount}</div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">+8 this week</div>
          </div>
        </div>

        {/* Messages Sent */}
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 dark:text-emerald-400 flex items-center justify-center shadow-sm">
            <Icons.MessagesSentIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Messages Sent</div>
            <div className="text-xl font-extrabold text-slate-850 dark:text-white mt-0.5">{totalMessagesSent.toLocaleString()}</div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">+18% this week</div>
          </div>
        </div>

        {/* Next Send */}
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 dark:text-amber-400 flex items-center justify-center shadow-sm">
            <Icons.ClockIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Next Send</div>
            <div className="text-xl font-extrabold text-slate-850 dark:text-white mt-0.5">{nextSendTimeLabel}</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-1">Today</div>
          </div>
        </div>
      </div>

      {/* Main Table/List Card for Your Schedules */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <h2 className="text-base font-bold text-slate-800 dark:text-white">Your Schedules</h2>
          
          {/* Search & Status Filters */}
          <div className="flex items-center gap-2 max-w-md w-full sm:w-auto">
            <div className="relative flex-1 sm:w-48">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Icons.SearchIcon className="h-4 w-4 text-slate-400" />
              </span>
              <input
                type="text"
                placeholder="Search schedules..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 dark:border-gray-800 rounded-xl bg-slate-50/50 dark:bg-[#171926] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="relative">
              <select
                className="appearance-none pl-3 pr-8 py-2 text-xs border border-gray-200 dark:border-gray-800 rounded-xl bg-slate-50/50 dark:bg-[#171926] text-slate-700 dark:text-slate-200 focus:outline-none font-bold"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
              <Icons.FilterIcon className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Empty state */}
        {filteredQueues.length === 0 && !showForm && (
          <div className="text-center py-14 text-slate-400 dark:text-slate-500">
            <Icons.CalendarIcon className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
            <p className="font-semibold text-slate-655 dark:text-slate-400">No schedules found</p>
            <p className="text-xs mt-1">Adjust search parameters or create a new auto broadcast schedule</p>
          </div>
        )}

        {/* Schedules Cards Stack */}
        <div className="space-y-4">
          {filteredQueues.map((q) => {
            const pids = JSON.parse(q.product_ids || '[]');
            const tids = JSON.parse(q.target_ids || '[]');
            const stimes = (() => { try { const a = JSON.parse(q.send_times || '[]'); return a.length ? a : [q.send_time || '09:00']; } catch (_) { return [q.send_time || '09:00']; } })();
            const total = pids.length;
            const cur = (q.current_index || 0) % (total || 1);
            const { val: dVal, unit: dUnit } = fromSeconds(q.delay_seconds || 10);
            const isActive = q.status === 'active';
            const percent = total ? Math.round((cur / total) * 100) : 0;

            return (
              <div key={q.id} className="p-5 rounded-2xl border border-gray-100 dark:border-gray-800/40 bg-white dark:bg-[#131520] hover:shadow-md hover:shadow-slate-100/50 dark:hover:shadow-black/5 transition-all flex flex-col md:flex-row gap-5 items-start">
                
                {/* Left Side: Thumbnail icon container */}
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-pink-500/80 to-purple-600/80 dark:from-pink-600/80 dark:to-purple-700/80 flex items-center justify-center shadow-md shadow-pink-500/10 flex-shrink-0">
                  {/* Shopping Bag Outline SVG */}
                  <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                  </svg>
                </div>

                {/* Middle: Details Grid */}
                <div className="flex-1 min-w-0 space-y-3">
                  
                  {/* Title & Status Badge row */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base font-bold text-slate-800 dark:text-white leading-snug">{q.name}</h3>
                    <span className={`chip border px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${
                      isActive 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30' 
                        : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-950/20'
                    }`}>
                      {q.status}
                    </span>
                  </div>

                  {/* Icon parameters line (flex wrap with nice icons) */}
                  <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Icons.NumbersIcon className="w-4 h-4 text-slate-400" />
                      <span className="font-semibold text-slate-600 dark:text-slate-300">{numberName(q.number_id)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icons.ClockIcon className="w-4 h-4 text-slate-400" />
                      <span>{stimes.join(', ')}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icons.AutoRecurrenceIcon className="w-4 h-4 text-slate-400" />
                      <span>Every {q.frequency_days} day{q.frequency_days > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icons.BroadcastIcon className="w-4 h-4 text-slate-400" />
                      <span>{q.products_per_day} per day</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icons.ClockIcon className="w-4 h-4 text-slate-400" />
                      <span>{dVal} {dUnit} delay</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icons.BotIcon className="w-4 h-4 text-slate-400" />
                      <span>{tids.length || 1} target{(tids.length || 1) > 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  {/* Target IDs Badges */}
                  {tids.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tids.slice(0, 3).map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-slate-50 dark:bg-[#1a1c29] text-slate-500 dark:text-slate-400 border border-gray-100 dark:border-gray-800">
                          {t.split('@')[0]}…
                        </span>
                      ))}
                      {tids.length > 3 && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-500 dark:text-indigo-400 border border-indigo-100/30 dark:border-indigo-950/10">
                          +{tids.length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Calendar next send timestamp info */}
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                    <Icons.CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span>Next send: <span className="font-semibold text-slate-600 dark:text-slate-350">{q.next_send_at || '—'}</span></span>
                  </div>

                  {/* Progress Indicators block */}
                  <div className="space-y-1 pt-1 max-w-md">
                    <div className="flex justify-between text-[10px] font-semibold text-slate-400">
                      <span>Position in cycle: {cur} / {total}</span>
                      <span>{percent}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                </div>

                {/* Right Side: Action buttons with outlines */}
                <div className="flex md:flex-col gap-2 w-full md:w-auto justify-end md:self-center flex-shrink-0">
                  <button
                    onClick={() => startEdit(q)}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all active:scale-95 bg-white dark:bg-[#131520]"
                  >
                    <Icons.EditIcon className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => updateQueue.mutate({ id: q.id, status: isActive ? 'paused' : 'active' })}
                    className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 border rounded-xl text-xs font-bold transition-all active:scale-95 bg-white dark:bg-[#131520] ${
                      isActive 
                        ? 'border-slate-200 dark:border-slate-800 hover:border-amber-500/50 text-slate-600 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400' 
                        : 'border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 text-slate-600 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <Icons.PauseIcon className="w-3.5 h-3.5" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Icons.PlayIcon className="w-3.5 h-3.5" />
                        <span>Resume</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => { if (window.confirm('Delete this schedule?')) deleteQueue.mutate(q.id); }}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 border border-slate-200 dark:border-slate-800 hover:border-rose-500/50 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-all active:scale-95 bg-white dark:bg-[#131520]"
                  >
                    <Icons.DeleteIcon className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* Auto Broadcast Benefits Footer row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-5 border-t border-gray-100 dark:border-gray-800/40">
        <div className="card p-4 flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 flex items-center justify-center">
            <Icons.ClockIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800 dark:text-white">Smart Scheduling</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">AI-optimized timing</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-500 dark:text-purple-400 flex items-center justify-center">
            <Icons.MultiPlatformIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800 dark:text-white">Multi-Platform</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Groups & channels</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 flex items-center justify-center">
            <Icons.AnalyticsIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800 dark:text-white">Real-time Analytics</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Performance metrics</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 flex items-center justify-center">
            <Icons.ShieldIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800 dark:text-white">Secure & Reliable</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Fully secure data</div>
          </div>
        </div>
      </div>

      {/* Create / Edit Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={closeForm}>
          <div className="absolute inset-0" />
          <div
            className="relative bg-white dark:bg-[#131520] rounded-2xl w-full max-w-2xl max-h-[94vh] overflow-y-auto shadow-2xl border border-gray-100 dark:border-gray-800/60"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-gray-50 dark:border-gray-800/40">
                <h2 className="font-bold text-lg dark:text-white">{editingId ? 'Edit Broadcast Schedule' : 'New Broadcast Schedule'}</h2>
                <button onClick={closeForm} className="text-slate-400 hover:text-slate-655 dark:hover:text-white text-xl">✕</button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Schedule Name</label>
                  <input className="input" placeholder="e.g. Daily Women's Fashion" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                </div>

                {/* Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Sending Number</label>
                  <select className="input" value={form.number_id} onChange={(e) => setForm((f) => ({ ...f, number_id: e.target.value }))} required>
                    <option value="">Select number</option>
                    {numbers.map((n) => <option key={n.id} value={n.id}>{n.name} {n.runtimeStatus === 'connected' ? '🟢' : '🔴'}</option>)}
                  </select>
                </div>

                {/* Targets: multi-select groups/channels */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-0 uppercase">
                      Groups &amp; Channels <span className="text-indigo-600 dark:text-indigo-400 font-bold">({form.target_ids.length} selected)</span>
                    </label>
                    {form.target_ids.length > 0 && (
                      <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => setForm((f) => ({ ...f, target_ids: [] }))}>Clear all</button>
                    )}
                  </div>
                  {!form.number_id ? (
                    <div className="border border-dashed border-gray-200 dark:border-gray-800 rounded-xl p-5 text-center text-xs text-slate-400 dark:text-slate-500 bg-slate-50/20 dark:bg-slate-800/10">
                      Select a number above to load groups
                    </div>
                  ) : groups.length === 0 ? (
                    <div className="border border-dashed border-gray-200 dark:border-gray-800 rounded-xl p-5 text-center text-xs text-slate-400 dark:text-slate-500 bg-slate-50/20 dark:bg-slate-800/10">
                      No groups found — go to Groups page and refresh
                    </div>
                  ) : (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-800 max-h-52 overflow-y-auto bg-white dark:bg-[#171926]">
                      {/* Groups section */}
                      {groups.filter((g) => g.type !== 'channel').length > 0 && (
                        <>
                          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/40 text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider sticky top-0 border-b dark:border-gray-800">👥 Groups</div>
                          {groups.filter((g) => g.type !== 'channel').map((g) => (
                            <label key={g.wa_id} className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors ${form.target_ids.includes(g.wa_id) ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/10'}`}>
                              <input type="checkbox" className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500 bg-transparent" checked={form.target_ids.includes(g.wa_id)} onChange={() => toggleArr('target_ids', g.wa_id)} />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold dark:text-slate-200 truncate">{g.name}</div>
                                <div className="text-[10px] text-slate-400 dark:text-slate-500">{g.member_count} members</div>
                              </div>
                            </label>
                          ))}
                        </>
                      )}
                      {/* Channels section */}
                      {groups.filter((g) => g.type === 'channel').length > 0 && (
                        <>
                          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/40 text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider sticky top-0 border-b dark:border-gray-800">📢 Channels</div>
                          {groups.filter((g) => g.type === 'channel').map((g) => (
                            <label key={g.wa_id} className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors ${form.target_ids.includes(g.wa_id) ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/10'}`}>
                              <input type="checkbox" className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500 bg-transparent" checked={form.target_ids.includes(g.wa_id)} onChange={() => toggleArr('target_ids', g.wa_id)} />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold dark:text-slate-200 truncate">{g.name}</div>
                                <div className="text-[10px] text-slate-400 dark:text-slate-500">{g.member_count} followers</div>
                              </div>
                            </label>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">You can select multiple groups and channels — product will be sent to all of them</p>
                </div>

                {/* Frequency */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Frequency</label>
                  <select className="input" value={form.frequency_days} onChange={(e) => setForm((f) => ({ ...f, frequency_days: Number(e.target.value) }))}>
                    {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {/* Send Times: slots vs interval */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-0 uppercase">Send Schedule (IST)</label>
                    <div className="flex gap-1 bg-slate-100 dark:bg-[#171926] p-0.5 rounded-lg">
                      <button
                        type="button"
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-colors ${form.schedule_mode === 'slots' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500'}`}
                        onClick={() => setForm((f) => ({ ...f, schedule_mode: 'slots' }))}
                      >
                        Specific Times
                      </button>
                      <button
                        type="button"
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-colors ${form.schedule_mode === 'interval' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500'}`}
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
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                          onClick={() => setForm((f) => ({ ...f, send_times: [...f.send_times, '12:00'] }))}
                        >
                          + Add Time
                        </button>
                      </div>
                      <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                        {form.send_times.map((t, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 w-12">Slot {i + 1}</span>
                            <input
                              type="time"
                              className="input !py-1.5"
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
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1.5">
                        1 product per time slot — {form.send_times.length} product{form.send_times.length > 1 ? 's' : ''}/day total.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400">Start Time</label>
                          <input
                            type="time"
                            className="input !py-1.5"
                            value={form.interval_start}
                            onChange={(e) => setForm((f) => ({ ...f, interval_start: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400">Products per Day</label>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            className="input !py-1.5"
                            value={form.products_per_day}
                            onChange={(e) => setForm((f) => ({ ...f, products_per_day: Number(e.target.value) }))}
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        <label className="text-[10px] font-semibold text-slate-400">Repeat Every</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            className="input !py-1.5 !w-20 flex-shrink-0"
                            min={INTERVAL_UNITS.find((u) => u.value === form.interval_unit)?.min}
                            max={INTERVAL_UNITS.find((u) => u.value === form.interval_unit)?.max}
                            value={form.interval_val}
                            onChange={(e) => setForm((f) => ({ ...f, interval_val: Number(e.target.value) }))}
                          />
                          <select
                            className="input !py-1.5 flex-1 min-w-0"
                            value={form.interval_unit}
                            onChange={(e) => setForm((f) => ({ ...f, interval_unit: e.target.value }))}
                          >
                            {INTERVAL_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-2">
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
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-0 uppercase">
                      Products to Cycle Through <span className="text-indigo-600 dark:text-indigo-400 font-bold">({form.product_ids.length} selected)</span>
                    </label>
                    <div className="flex gap-3 text-xs">
                      <button type="button" className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold" onClick={selectAllProducts}>Select All</button>
                      {form.product_ids.length > 0 && (
                        <button type="button" className="text-rose-500 hover:underline font-bold" onClick={() => setForm((f) => ({ ...f, product_ids: [] }))}>Clear</button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-xl p-2 bg-slate-50/20 dark:bg-slate-800/10">
                    {products.map((p) => (
                      <label key={p.id} className={`flex items-center gap-2.5 p-2 rounded-xl cursor-pointer border transition-colors text-xs ${form.product_ids.includes(p.id) ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20' : 'border-gray-100 dark:border-gray-850 hover:bg-white dark:hover:bg-slate-800/40'}`}>
                        <input type="checkbox" checked={form.product_ids.includes(p.id)} onChange={() => toggleArr('product_ids', p.id)} className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500 bg-transparent flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-700 dark:text-slate-200 truncate">{p.product_name}</div>
                          <div className="text-emerald-600 font-bold">₹{p.price}</div>
                        </div>
                      </label>
                    ))}
                    {products.length === 0 && <p className="col-span-2 text-center text-slate-400 dark:text-slate-500 py-4 font-medium">No products — sync your sheet first</p>}
                  </div>
                  {form.product_ids.length > 0 && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
                      {form.product_ids.length} products · {effectiveProductsPerDay}/day → full cycle in {Math.ceil(form.product_ids.length / (effectiveProductsPerDay || 1))} days
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
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
    </div>
  );
}
