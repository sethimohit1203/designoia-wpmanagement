import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';
import StatCard from '../components/StatCard';
import * as Icons from '../components/Icons';

export default function Numbers() {
  const [name, setName] = useState('');
  const [qrFor, setQrFor] = useState(null);
  const qc = useQueryClient();

  const { data: numbers = [] } = useQuery({
    queryKey: ['numbers'],
    queryFn: () => api.get('/numbers').then((r) => r.data),
    refetchInterval: 3000,
  });

  const onErr = (e) => toast.error(e?.response?.data?.error || e?.message || 'Request failed — is the backend running on :5000?');

  const addNumber = useMutation({
    mutationFn: () => api.post('/numbers', { name }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['numbers'] });
      toast.success('Number added — click Connect to scan QR');
    },
    onError: onErr,
  });

  const connect = useMutation({
    mutationFn: (id) => api.post(`/numbers/${id}/connect`),
    onSuccess: (_, id) => {
      setQrFor(id);
      qc.invalidateQueries({ queryKey: ['numbers'] });
    },
    onError: onErr,
  });

  const disconnect = useMutation({
    mutationFn: (id) => api.post(`/numbers/${id}/disconnect`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['numbers'] }),
    onError: onErr,
  });

  const updateLimits = useMutation({
    mutationFn: ({ id, daily_limit, cooldown_minutes }) =>
      api.put(`/numbers/${id}/limits`, { daily_limit, cooldown_minutes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['numbers'] });
      toast.success('Limits updated');
    },
    onError: onErr,
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/numbers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['numbers'] }),
    onError: onErr,
  });

  const toggleWarmup = useMutation({
    mutationFn: ({ id, warmup_enabled }) => api.put(`/numbers/${id}/warmup`, { warmup_enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['numbers'] }),
    onError: onErr,
  });

  const resetSession = useMutation({
    mutationFn: (id) => api.post(`/numbers/${id}/reset-session`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['numbers'] });
      toast.success('Session cleared — click Connect / Show QR for a fresh scan');
    },
    onError: onErr,
  });

  const diagnose = useMutation({
    mutationFn: (id) => api.get(`/numbers/${id}/diagnose`),
    onSuccess: (res) => {
      const d = res.data;
      toast(`Status: ${d.entryStatus || 'no session'} · WS: ${d.wsReadyState ?? 'n/a'} · User: ${d.user?.id || 'none'}`, { icon: '🔍', duration: 6000 });
    },
    onError: onErr,
  });

  const connectedCount = numbers.filter((n) => n.runtimeStatus === 'connected').length;
  const sentToday = numbers.reduce((sum, n) => sum + (n.messages_sent_today || 0), 0);
  const avgBanRisk = numbers.length ? Math.round(numbers.reduce((sum, n) => sum + (n.ban_risk_score || 0), 0) / numbers.length) : 0;

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'connected':
        return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-950/20';
      case 'qr':
        return 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-950/20';
      default:
        return 'bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Title block */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800/40 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Multi-Number Management</h1>
            <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold tracking-wider bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
              MULTI-WA
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 font-medium">
            Connect and rotate multiple WhatsApp numbers for high-volume outreach
          </p>
        </div>
      </div>

      {/* Stats counter row */}
      {numbers.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<Icons.NumbersIcon className="w-6 h-6 text-indigo-500" />} iconBg="bg-indigo-50 dark:bg-indigo-950/40" iconColor="text-indigo-500" label="Total Numbers" value={numbers.length} />
          <StatCard icon={<Icons.DoubleCheckIcon className="w-6 h-6 text-emerald-500" />} iconBg="bg-emerald-50 dark:bg-emerald-950/40" iconColor="text-emerald-500" label="Connected" value={connectedCount} />
          <StatCard icon={<Icons.BulkSenderIcon className="w-6 h-6 text-sky-500" />} iconBg="bg-sky-50 dark:bg-sky-950/40" iconColor="text-sky-500" label="Sent Today" value={sentToday} />
          <StatCard icon={<Icons.DeleteIcon className="w-6 h-6 text-rose-500" />} iconBg="bg-rose-50 dark:bg-rose-950/40" iconColor="text-rose-500" label="Avg Ban Risk" value={`${avgBanRisk}%`} />
        </div>
      )}

      {/* Add Number Form */}
      <div className="card flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 mb-1.5 uppercase">Add a new WhatsApp number</label>
          <input className="input" placeholder="e.g. Number 1 - Sales Team" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button
          className="btn-primary py-2.5 px-5 flex items-center justify-center gap-2 text-xs font-bold"
          disabled={!name || addNumber.isPending}
          onClick={() => addNumber.mutate()}
        >
          <Icons.PlusIcon className="w-5 h-5" />
          <span>Add Number</span>
        </button>
      </div>

      {/* Numbers Grid list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {numbers.map((n) => {
          const isConn = n.runtimeStatus === 'connected';
          return (
            <div key={n.id} className="card space-y-4 flex flex-col justify-between">
              <div className="space-y-3.5">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-850 dark:text-white text-base leading-snug truncate">{n.name}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 font-semibold">
                      {n.phone ? `+${n.phone.replace('+', '')}` : 'Session not initialized'}
                    </div>
                  </div>
                  <span className={`chip px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${getStatusBadgeClass(n.runtimeStatus)}`}>
                    {n.runtimeStatus || 'Offline'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs font-semibold border-t border-gray-50 dark:border-gray-800/40 pt-3">
                  <div className="text-slate-500 dark:text-slate-450">
                    Sent today: <b className="text-slate-800 dark:text-slate-100 font-extrabold">{n.messages_sent_today || 0}</b> / {n.effective_daily_limit ?? n.daily_limit}
                  </div>
                  <div className="text-slate-500 dark:text-slate-450">
                    Ban risk score: <b className={`font-extrabold ${n.ban_risk_score > 70 ? 'text-rose-500' : n.ban_risk_score > 40 ? 'text-amber-500' : 'text-emerald-500'}`}>{n.ban_risk_score || 0}%</b>
                  </div>
                </div>

                {/* Warmup Status Box */}
                {n.warmup_enabled ? (
                  <div className="text-xs bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-450 rounded-xl px-4 py-3 border border-amber-100/60 dark:border-amber-950/10 leading-relaxed">
                    🌱 <strong>Warm-up active:</strong> today's safe limit is <b>{n.effective_daily_limit}</b>/day, ramping toward your {n.daily_limit}/day limit. New accounts ban easily if pushed too hard.
                  </div>
                ) : (
                  <div className="text-xs bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-450 rounded-xl px-4 py-3 border border-rose-100/60 dark:border-rose-950/10 leading-relaxed">
                    ⚠️ <strong>Warm-up disabled:</strong> sending at full {n.daily_limit}/day from start. Highly risky for newer accounts.
                  </div>
                )}

                {/* Configurations Inputs */}
                <div className="grid grid-cols-2 gap-3 text-xs font-semibold pt-1">
                  <div>
                    <label className="block text-[10px] text-slate-400 dark:text-slate-500 mb-1 uppercase font-bold">Daily limit ceiling</label>
                    <input
                      type="number"
                      defaultValue={n.daily_limit}
                      className="input !py-1.5 text-xs font-bold"
                      onBlur={(e) => updateLimits.mutate({ id: n.id, daily_limit: Number(e.target.value), cooldown_minutes: n.cooldown_minutes })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 dark:text-slate-500 mb-1 uppercase font-bold">Cooldown (min)</label>
                    <input
                      type="number"
                      defaultValue={n.cooldown_minutes}
                      className="input !py-1.5 text-xs font-bold"
                      onBlur={(e) => updateLimits.mutate({ id: n.id, daily_limit: n.daily_limit, cooldown_minutes: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!n.warmup_enabled}
                    className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500 bg-transparent w-4 h-4"
                    onChange={(e) => toggleWarmup.mutate({ id: n.id, warmup_enabled: e.target.checked })}
                  />
                  <span>Warm-up ramp (highly recommended)</span>
                </label>
              </div>

              {/* Action Buttons row */}
              <div className="flex gap-2 pt-4 border-t border-gray-50 dark:border-gray-800/40">
                {!isConn ? (
                  <button
                    className="flex-1 btn-primary py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95"
                    onClick={() => connect.mutate(n.id)}
                    disabled={connect.isPending}
                  >
                    <Icons.PlayIcon className="w-4 h-4 text-white" />
                    <span>Connect / Show QR</span>
                  </button>
                ) : (
                  <button
                    className="flex-1 btn-secondary py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 border border-slate-200 dark:border-slate-800"
                    onClick={() => disconnect.mutate(n.id)}
                    disabled={disconnect.isPending}
                  >
                    <Icons.PauseIcon className="w-4 h-4" />
                    <span>Disconnect</span>
                  </button>
                )}
                
                {/* Reset session button */}
                <button
                  className="w-9 h-9 rounded-xl border border-amber-100 dark:border-amber-950/40 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
                  title="Reset session — use this if QR scan fails silently"
                  onClick={() => { if (confirm('Reset session for this number? You will need to scan a fresh QR.')) resetSession.mutate(n.id); }}
                >
                  <Icons.AutoRecurrenceIcon className="w-5 h-5" />
                </button>

                {/* Diagnose button */}
                <button
                  className="w-9 h-9 rounded-xl border border-sky-100 dark:border-sky-950/40 bg-sky-50 dark:bg-sky-950/20 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/30 flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
                  title="Diagnose connection status"
                  onClick={() => diagnose.mutate(n.id)}
                >
                  <Icons.SearchIcon className="w-5 h-5" />
                </button>

                {/* Delete button */}
                <button
                  className="w-9 h-9 rounded-xl border border-rose-100 dark:border-rose-950/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-455 hover:bg-rose-100 dark:hover:bg-rose-900/30 flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
                  title="Remove number permanently"
                  onClick={() => { if (window.confirm(`Remove "${n.name}"? This deletes its saved session.`)) remove.mutate(n.id); }}
                >
                  <Icons.DeleteIcon className="w-5 h-5" />
                </button>
              </div>

              {/* QR Image rendering */}
              {qrFor === n.id && n.qr && (
                <div className="border-t border-gray-100 dark:border-gray-800/40 pt-4 text-center space-y-2 bg-slate-50/50 dark:bg-[#1a1c29]/20 rounded-xl p-3.5">
                  <div className="bg-white p-2.5 inline-block rounded-2xl shadow-sm border border-slate-100">
                    <img src={n.qr} alt="Scan QR Code" className="w-44 h-44" />
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                    WhatsApp → Linked Devices → Link a Device
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
