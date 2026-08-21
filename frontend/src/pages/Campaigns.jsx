import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';
import * as Icons from '../components/Icons';

export default function Campaigns() {
  const qc = useQueryClient();
  
  // Form State
  const [form, setForm] = useState({
    name: '',
    group_name: 'All',
    template_id: '',
    number_id: '',
    message: '',
    scheduled_at: '',
    recurrence: 'none',
    delay_seconds: 8,
  });

  // Local/UI states for options and layout matching the design reference
  const [previewTab, setPreviewTab] = useState('whatsapp'); // 'whatsapp' | 'telegram'
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'scheduled' | 'sent' | 'failed' | 'cancelled'
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Advanced toggles matching screenshot
  const [randomDelay, setRandomDelay] = useState(true);
  const [smartTiming, setSmartTiming] = useState(true);
  const [autoRetry, setAutoRetry] = useState(true);
  const [timezone, setTimezone] = useState('(GMT+05:30) Asia/Kolkata');
  const [endDate, setEndDate] = useState('');

  // Fetch queries
  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/campaigns').then((r) => r.data),
    refetchInterval: 5000,
  });
  
  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get('/templates').then((r) => r.data)
  });
  
  const { data: numbers = [] } = useQuery({
    queryKey: ['numbers'],
    queryFn: () => api.get('/numbers').then((r) => r.data)
  });
  
  const { data: groups = [] } = useQuery({
    queryKey: ['contact-groups'],
    queryFn: () => api.get('/contacts/groups').then((r) => r.data)
  });

  // Mutations
  const create = useMutation({
    mutationFn: () => api.post('/campaigns', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign scheduled successfully');
      setForm({
        name: '',
        group_name: 'All',
        template_id: '',
        number_id: '',
        message: '',
        scheduled_at: '',
        recurrence: 'none',
        delay_seconds: 8,
      });
      setEndDate('');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to schedule campaign'),
  });

  const cancel = useMutation({
    mutationFn: (id) => api.post(`/campaigns/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign cancelled');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to cancel campaign'),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/campaigns/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign deleted');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to delete campaign'),
  });

  const onTemplateChange = (id) => {
    const t = templates.find((temp) => String(temp.id) === id);
    setForm({ ...form, template_id: id, message: t?.content || form.message });
  };

  const insertVariable = (variable) => {
    setForm((f) => ({ ...f, message: f.message + ` {${variable}}` }));
  };

  // Helper stats
  const scheduledCount = campaigns.filter((c) => c.status === 'scheduled').length;
  const sentCount = campaigns.filter((c) => c.status === 'sent').length;
  const failedCount = campaigns.filter((c) => c.status === 'failed').length;

  // Filter and Search Campaigns locally for instant UI interaction
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.message || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus =
        statusFilter === 'all' ? true : c.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [campaigns, searchQuery, statusFilter]);

  // Paginated Campaigns
  const paginatedCampaigns = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCampaigns.slice(start, start + pageSize);
  }, [filteredCampaigns, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredCampaigns.length / pageSize) || 1;

  // Format rich WhatsApp formatting in preview
  const formattedPreviewMessage = useMemo(() => {
    const text = form.message || 'Preview message text will appear here...';
    // Escape HTML & parse bold/italic/strikethrough
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    escaped = escaped.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/_(.*?)_/g, '<em>$1</em>');
    escaped = escaped.replace(/~(.*?)~/g, '<del>$1</del>');
    escaped = escaped.replace(/\n/g, '<br />');
    return escaped;
  }, [form.message]);

  const badgeColor = {
    scheduled: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-950/50',
    sent: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-950/50',
    active: 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-950/50',
    failed: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-950/50',
    cancelled: 'bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800',
  };

  const getRecurrenceLabel = (rec, hasEnd = false) => {
    const base = rec.charAt(0).toUpperCase() + rec.slice(1);
    if (rec === 'none') return 'Once';
    return base + (hasEnd ? ' (Recurring)' : '');
  };

  return (
    <div className="space-y-6">
      {/* Title Header block */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-100 dark:border-gray-800/40 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Campaign Scheduler</h1>
            <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold tracking-wider bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
              AUTO
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
            Schedule campaigns automatically across WhatsApp and Telegram
          </p>
        </div>

        {/* Feature Highlights badges in Header */}
        <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 bg-white dark:bg-[#131520] px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-800/40 shadow-sm">
            <Icons.SmartSchedulerIcon className="w-4 h-4 text-indigo-500" />
            <span>Smart Scheduler</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white dark:bg-[#131520] px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-800/40 shadow-sm">
            <Icons.MultiPlatformIcon className="w-4 h-4 text-purple-500" />
            <span>Multi-Platform</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white dark:bg-[#131520] px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-800/40 shadow-sm">
            <Icons.AutoRecurrenceIcon className="w-4 h-4 text-indigo-400" />
            <span>Auto Recurrence</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Campaign Scheduler Form + Scheduled Campaigns list (Col Span 2) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Create Campaign Scheduler Form Card */}
          <div className="card">
            <h2 className="text-base font-bold text-slate-800 dark:text-white mb-4">Create Campaign</h2>
            
            <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
              
              {/* Form Grid (Campaign Name, Select Contacts, Template, Sender) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Campaign Name</label>
                  <input
                    className="input"
                    placeholder="e.g. Group Invite Drive"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Select Contacts</label>
                  <div className="flex gap-2">
                    <select
                      className="input flex-1"
                      value={form.group_name}
                      onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                    >
                      <option value="All">All Contacts</option>
                      {groups.map((g) => <option key={g.group_name} value={g.group_name}>{g.group_name}</option>)}
                    </select>
                    <button
                      type="button"
                      className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all border border-indigo-100 dark:border-indigo-900/20 active:scale-95"
                      title="Manage Groups"
                    >
                      <Icons.PlusIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Template</label>
                  <select
                    className="input"
                    value={form.template_id}
                    onChange={(e) => onTemplateChange(e.target.value)}
                  >
                    <option value="">No template (write below)</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Sender Profile</label>
                  <select
                    className="input"
                    value={form.number_id}
                    onChange={(e) => setForm({ ...form, number_id: e.target.value })}
                  >
                    <option value="">Auto-rotate (All Connected)</option>
                    {numbers.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} {n.phone ? `(${n.phone})` : ''} {n.runtimeStatus === 'connected' ? '🟢' : '🔴'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Message Content Area */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Message</label>
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-accent bg-white dark:bg-[#171926] transition-all">
                  
                  {/* Toolbar inside textarea */}
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50/50 dark:bg-[#1d2133] border-b border-gray-100 dark:border-gray-800/40">
                    <div className="flex gap-2">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Insert Variables:</span>
                      <button type="button" onClick={() => insertVariable('name')} className="text-[10px] font-bold bg-white dark:bg-[#151824] px-2 py-0.5 rounded-md border dark:border-gray-800 text-indigo-600 dark:text-indigo-400">Name</button>
                      <button type="button" onClick={() => insertVariable('phone')} className="text-[10px] font-bold bg-white dark:bg-[#151824] px-2 py-0.5 rounded-md border dark:border-gray-800 text-indigo-600 dark:text-indigo-400">Phone</button>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                      {form.message.length}/1024
                    </span>
                  </div>

                  <textarea
                    className="w-full bg-transparent border-0 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none h-32 resize-none"
                    placeholder="Type your message content here..."
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value.slice(0, 1024) })}
                    required
                  />
                </div>
              </div>

              {/* Schedule Parameters Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Schedule Date & Time</label>
                  <div className="relative">
                    <input
                      type="datetime-local"
                      className="input pl-10"
                      value={form.scheduled_at}
                      onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                      required
                    />
                    <Icons.CalendarIcon className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Recurrence</label>
                  <select
                    className="input"
                    value={form.recurrence}
                    onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
                  >
                    <option value="none">Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">End Date (Optional)</label>
                  <div className="relative">
                    <input
                      type="date"
                      className="input pl-10"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                    <Icons.CalendarIcon className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Advanced Options Accordion */}
              <div className="border border-gray-100 dark:border-gray-800/40 rounded-xl overflow-hidden transition-all bg-slate-50/20 dark:bg-[#131520]/20">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all"
                >
                  <span className="flex items-center gap-1.5">
                    ⚙️ Advanced Options
                  </span>
                  <Icons.ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </button>

                {showAdvanced && (
                  <div className="p-4 border-t border-gray-100 dark:border-gray-800/40 grid grid-cols-1 sm:grid-cols-2 gap-5 bg-white dark:bg-[#131520]">
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-white">Random Delay</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">Add safety spacing between messages</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={randomDelay} onChange={() => setRandomDelay(!randomDelay)} className="sr-only peer" />
                          <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600 dark:peer-checked:bg-indigo-500"></div>
                        </label>
                      </div>

                      {randomDelay && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase">
                            Delay between contacts: {form.delay_seconds}s
                          </label>
                          <input
                            type="range"
                            min={3}
                            max={60}
                            value={form.delay_seconds}
                            onChange={(e) => setForm({ ...form, delay_seconds: Number(e.target.value) })}
                            className="w-full"
                          />
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Higher = safer, especially for large lists.</div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-white">Smart Timing</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">Optimal delivery hour engagement</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={smartTiming} onChange={() => setSmartTiming(!smartTiming)} className="sr-only peer" />
                          <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600 dark:peer-checked:bg-indigo-500"></div>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-white">Auto Retry</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">Retry sending failed messages automatically</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={autoRetry} onChange={() => setAutoRetry(!autoRetry)} className="sr-only peer" />
                          <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600 dark:peer-checked:bg-indigo-500"></div>
                        </label>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase">Time Zone</label>
                        <select
                          className="input !py-2"
                          value={timezone}
                          onChange={(e) => setTimezone(e.target.value)}
                        >
                          <option value="(GMT+05:30) Asia/Kolkata">(GMT+05:30) Asia/Kolkata</option>
                          <option value="(GMT+00:00) UTC">(GMT+00:00) UTC</option>
                          <option value="(GMT-05:00) America/New_York">(GMT-05:00) America/New_York</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Schedule Campaign Submit Button */}
              <button
                type="submit"
                className="w-full btn-primary py-3 rounded-xl flex items-center justify-center gap-2"
                disabled={!form.name || !form.scheduled_at || create.isPending}
              >
                <Icons.CalendarIcon className="w-5 h-5 text-white" />
                <span>{create.isPending ? 'Scheduling...' : 'Schedule Campaign'}</span>
              </button>

            </form>
          </div>

          {/* Scheduled Campaigns List Card */}
          <div className="card">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
              <h2 className="text-base font-bold text-slate-800 dark:text-white">Scheduled Campaigns</h2>
              
              {/* Search & Filter bar */}
              <div className="flex items-center gap-2 max-w-sm w-full sm:w-auto">
                <div className="relative flex-1 sm:w-48">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <Icons.SearchIcon className="h-4 w-4 text-slate-400" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search campaigns..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 dark:border-gray-800 rounded-xl bg-slate-50/50 dark:bg-[#171926] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  />
                </div>

                <div className="relative">
                  <select
                    className="appearance-none pl-3 pr-8 py-2 text-xs border border-gray-200 dark:border-gray-800 rounded-xl bg-slate-50/50 dark:bg-[#171926] text-slate-700 dark:text-slate-200 focus:outline-none font-bold"
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                  >
                    <option value="all">All Status</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="sent">Sent</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <Icons.FilterIcon className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Campaigns Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-gray-100 dark:border-gray-800/40 pb-2">
                    <th className="pb-3 pr-4 font-semibold">Name</th>
                    <th className="pb-3 pr-4 font-semibold">Message</th>
                    <th className="pb-3 pr-4 font-semibold text-center">Channels</th>
                    <th className="pb-3 pr-4 font-semibold">Scheduled</th>
                    <th className="pb-3 pr-4 font-semibold">Recurrence</th>
                    <th className="pb-3 pr-4 font-semibold">Status</th>
                    <th className="pb-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800/40">
                  {paginatedCampaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition-colors">
                      <td className="py-3.5 pr-4 font-bold text-slate-800 dark:text-white whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{c.name}</span>
                          <span className="px-1.5 py-0.2 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-500 dark:text-indigo-400 rounded text-[9px] font-extrabold uppercase scale-90">Auto</span>
                        </div>
                      </td>
                      <td className="py-3.5 pr-4 max-w-[150px] truncate text-slate-500 dark:text-slate-400" title={c.message}>
                        {c.message || '—'}
                      </td>
                      <td className="py-3.5 pr-4 text-center">
                        {/* Channels: render WhatsApp and a mock Telegram icon matching reference screenshot */}
                        <div className="flex items-center justify-center gap-1">
                          <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] text-white font-bold" title="WhatsApp">W</span>
                          <span className="w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center text-[10px] text-white font-bold" title="Telegram">T</span>
                        </div>
                      </td>
                      <td className="py-3.5 pr-4 text-slate-600 dark:text-slate-300 whitespace-nowrap text-xs">
                        {c.scheduled_at ? (
                          <div className="font-semibold">
                            {new Date(c.scheduled_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                            <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                              {new Date(c.scheduled_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="py-3.5 pr-4 text-slate-500 dark:text-slate-400 text-xs">
                        {getRecurrenceLabel(c.recurrence, c.recurrence !== 'none')}
                      </td>
                      <td className="py-3.5 pr-4 whitespace-nowrap">
                        <span className={`chip border px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase ${badgeColor[c.status] || 'bg-slate-100'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3.5 text-right whitespace-nowrap">
                        <div className="flex gap-2 justify-end">
                          {c.status === 'scheduled' && (
                            <button
                              className="p-1.5 rounded-lg border border-amber-100 dark:border-amber-950/40 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all active:scale-95"
                              title="Cancel Schedule"
                              onClick={() => cancel.mutate(c.id)}
                            >
                              <Icons.PauseIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            className="p-1.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#171926] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95"
                            title="Copy Campaign"
                            onClick={() => {
                              setForm({
                                ...form,
                                name: c.name + ' (Copy)',
                                group_name: c.group_name || 'All',
                                template_id: c.template_id || '',
                                number_id: c.number_id || '',
                                message: c.message || '',
                                recurrence: c.recurrence || 'none',
                              });
                              toast.success('Campaign details copied to form');
                            }}
                          >
                            <Icons.CopyIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded-lg border border-rose-100 dark:border-rose-950/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-all active:scale-95"
                            title="Delete Campaign"
                            onClick={() => { if (window.confirm(`Delete campaign "${c.name}"?`)) remove.mutate(c.id); }}
                          >
                            <Icons.DeleteIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredCampaigns.length && (
                    <tr>
                      <td colSpan={7} className="text-center text-slate-400 dark:text-slate-500 py-10 font-medium">
                        No campaigns found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredCampaigns.length > 0 && (
              <div className="flex items-center justify-between flex-wrap gap-4 pt-5 mt-4 border-t border-gray-50 dark:border-gray-800/40 text-xs">
                <div className="text-slate-500 dark:text-slate-400 font-medium">
                  Showing <span className="font-bold text-slate-800 dark:text-white">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                  <span className="font-bold text-slate-800 dark:text-white">
                    {Math.min(currentPage * pageSize, filteredCampaigns.length)}
                  </span>{' '}
                  of <span className="font-bold text-slate-800 dark:text-white">{filteredCampaigns.length}</span> campaigns
                </div>

                <div className="flex items-center gap-4">
                  {/* Page Size Selector */}
                  <div className="flex items-center gap-2">
                    <select
                      className="py-1 px-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-[#171926] text-slate-700 dark:text-slate-300 font-bold"
                      value={pageSize}
                      onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    >
                      <option value={5}>5 / page</option>
                      <option value={10}>10 / page</option>
                      <option value={20}>20 / page</option>
                    </select>
                  </div>

                  {/* Nav controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#171926] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors font-bold"
                    >
                      &lt;
                    </button>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i + 1)}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-extrabold transition-all ${
                          currentPage === i + 1
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                            : 'border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#171926] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#171926] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors font-bold"
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Channels Included + Message Preview + Stats + Quick Actions */}
        <div className="space-y-6">
          
          {/* Card 1: Channels Included */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Channels Included</h3>
              <button className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-lg border border-indigo-100 dark:border-indigo-900/20">Manage</button>
            </div>

            <div className="space-y-3">
              {/* WhatsApp Active status */}
              <div className="p-3 bg-slate-50/50 dark:bg-[#171926]/40 rounded-xl border border-gray-100/50 dark:border-gray-800/30 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">W</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-800 dark:text-white">WhatsApp Channel</div>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-md">Active</span>
                  </div>
                  <a
                    href="https://whatsapp.com/channel/0029Va5QIBF0QeaohFPKSt2e"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[9px] text-indigo-500 dark:text-indigo-400 hover:underline truncate block mt-1"
                  >
                    https://whatsapp.com/channel/0029Va5QIB...
                  </a>
                </div>
              </div>

              {/* Telegram Active status */}
              <div className="p-3 bg-slate-50/50 dark:bg-[#171926]/40 rounded-xl border border-gray-100/50 dark:border-gray-800/30 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">T</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-800 dark:text-white">Telegram Channel</div>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-md">Active</span>
                  </div>
                  <a
                    href="https://t.me/clikixpress"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[9px] text-indigo-500 dark:text-indigo-400 hover:underline truncate block mt-1"
                  >
                    https://t.me/clikixpress
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Live Message Preview */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Message Preview</h3>
              
              {/* WhatsApp / Telegram Tabs */}
              <div className="flex bg-slate-100 dark:bg-[#171926] p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPreviewTab('whatsapp')}
                  className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all ${
                    previewTab === 'whatsapp' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('telegram')}
                  className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all ${
                    previewTab === 'telegram' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Telegram
                </button>
              </div>
            </div>

            {/* Chat Bubble Phone Shell Mockup */}
            <div className="border border-gray-100 dark:border-gray-800/80 rounded-2xl p-4 bg-slate-50 dark:bg-[#0c0e17] min-h-[220px] flex flex-col justify-end">
              <div className={`p-3 rounded-2xl text-xs max-w-[85%] self-start shadow-sm border ${
                previewTab === 'whatsapp'
                  ? 'bg-emerald-500 dark:bg-[#0b3c2a] text-white border-emerald-600/20 dark:border-emerald-950/20'
                  : 'bg-indigo-500 dark:bg-[#18254c] text-white border-indigo-600/20 dark:border-indigo-950/20'
              }`}>
                {/* Dynamically parsed rich message content */}
                <div
                  className="break-words font-medium leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: formattedPreviewMessage }}
                />
                
                {/* Check status and timestamp indicator */}
                <div className="flex items-center justify-end gap-1 mt-2 text-[9px] opacity-75">
                  <span>10:00 AM</span>
                  <Icons.DoubleCheckIcon className="w-3.5 h-3.5 text-sky-300 dark:text-sky-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Campaigns Stats */}
          <div className="card">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">Campaign Stats</h3>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Stat 1: Total */}
              <div className="p-3 bg-slate-50/50 dark:bg-[#171926]/40 rounded-xl border border-gray-100/50 dark:border-gray-800/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 flex items-center justify-center">
                    <Icons.CampaignsIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Total</span>
                </div>
                <div className="text-lg font-extrabold text-slate-800 dark:text-white">{campaigns.length}</div>
              </div>

              {/* Stat 2: Scheduled */}
              <div className="p-3 bg-slate-50/50 dark:bg-[#171926]/40 rounded-xl border border-gray-100/50 dark:border-gray-800/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-500 dark:text-amber-400 flex items-center justify-center">
                    <Icons.ClockIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Scheduled</span>
                </div>
                <div className="text-lg font-extrabold text-slate-800 dark:text-white">{scheduledCount}</div>
              </div>

              {/* Stat 3: Sent */}
              <div className="p-3 bg-slate-50/50 dark:bg-[#171926]/40 rounded-xl border border-gray-100/50 dark:border-gray-800/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 dark:text-emerald-400 flex items-center justify-center">
                    <Icons.DoubleCheckIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Sent</span>
                </div>
                <div className="text-lg font-extrabold text-slate-800 dark:text-white">{sentCount}</div>
              </div>

              {/* Stat 4: Failed */}
              <div className="p-3 bg-slate-50/50 dark:bg-[#171926]/40 rounded-xl border border-gray-100/50 dark:border-gray-800/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-500 dark:text-rose-400 flex items-center justify-center">
                    <Icons.DeleteIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Failed</span>
                </div>
                <div className="text-lg font-extrabold text-slate-800 dark:text-white">{failedCount}</div>
              </div>
            </div>
          </div>

          {/* Card 4: Quick Actions */}
          <div className="card">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">Quick Actions</h3>
            
            <div className="space-y-2">
              <button className="w-full p-3 bg-slate-50/50 dark:bg-[#171926]/40 rounded-xl border border-gray-100/50 dark:border-gray-800/30 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 flex items-center justify-center">
                  <Icons.TemplatesIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-850 dark:text-white">Create Template</div>
                  <div className="text-[9px] text-slate-400 dark:text-slate-500">Save frequently used messages</div>
                </div>
              </button>

              <button className="w-full p-3 bg-slate-50/50 dark:bg-[#171926]/40 rounded-xl border border-gray-100/50 dark:border-gray-800/30 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-500 dark:text-purple-400 flex items-center justify-center">
                  <Icons.ContactsIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-850 dark:text-white">Import Contacts</div>
                  <div className="text-[9px] text-slate-400 dark:text-slate-500">Import from CSV or Excel</div>
                </div>
              </button>

              <button className="w-full p-3 bg-slate-50/50 dark:bg-[#171926]/40 rounded-xl border border-gray-100/50 dark:border-gray-800/30 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 flex items-center justify-center">
                  <Icons.AnalyticsIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-850 dark:text-white">View Reports</div>
                  <div className="text-[9px] text-slate-400 dark:text-slate-500">Detailed campaign analytics</div>
                </div>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
