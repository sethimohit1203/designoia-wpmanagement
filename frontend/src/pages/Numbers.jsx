import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';

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

  const activeNumber = numbers.find((n) => n.id === qrFor);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Multi-Number Management <span className="chip bg-accent/10 text-accent ml-2">MULTI-WA</span></h1>
      </div>

      <div className="card flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs text-gray-500">Add a new WhatsApp number</label>
          <input className="input" placeholder="e.g. Number 1 - Sales" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={!name} onClick={() => addNumber.mutate()}>+ Add Number</button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {numbers.map((n) => (
          <div key={n.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{n.name}</div>
                <div className="text-xs text-gray-500">{n.phone || 'Not connected'}</div>
              </div>
              <span className={`chip ${n.runtimeStatus === 'connected' ? 'bg-green-50 text-green-700' : n.runtimeStatus === 'qr' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                {n.runtimeStatus}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Sent today: <b>{n.messages_sent_today}</b>/{n.daily_limit}</div>
              <div>Ban risk: <b className={n.ban_risk_score > 70 ? 'text-red-600' : n.ban_risk_score > 40 ? 'text-amber-600' : 'text-green-600'}>{n.ban_risk_score}%</b></div>
            </div>

            <div className="flex gap-2 text-xs items-center">
              <label>Daily limit</label>
              <input
                type="number"
                defaultValue={n.daily_limit}
                className="input w-20 py-1"
                onBlur={(e) => updateLimits.mutate({ id: n.id, daily_limit: Number(e.target.value), cooldown_minutes: n.cooldown_minutes })}
              />
              <label>Cooldown (min)</label>
              <input
                type="number"
                defaultValue={n.cooldown_minutes}
                className="input w-20 py-1"
                onBlur={(e) => updateLimits.mutate({ id: n.id, daily_limit: n.daily_limit, cooldown_minutes: Number(e.target.value) })}
              />
            </div>

            <div className="flex gap-2">
              {n.runtimeStatus !== 'connected' ? (
                <button className="btn-primary text-sm" onClick={() => connect.mutate(n.id)}>Connect / Show QR</button>
              ) : (
                <button className="btn-secondary text-sm" onClick={() => disconnect.mutate(n.id)}>Disconnect</button>
              )}
              <button className="btn-secondary text-sm text-red-600" onClick={() => remove.mutate(n.id)}>Remove</button>
            </div>

            {qrFor === n.id && n.qr && (
              <div className="border-t pt-3 text-center">
                <img src={n.qr} alt="QR" className="mx-auto w-48 h-48" />
                <p className="text-xs text-gray-500 mt-2">WhatsApp → Linked Devices → Link a Device</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
