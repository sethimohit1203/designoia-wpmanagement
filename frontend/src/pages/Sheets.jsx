import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function Sheets() {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('connected') === '1') {
      toast.success('Google account connected');
      window.history.replaceState({}, '', '/sheets');
      qc.invalidateQueries({ queryKey: ['google-oauth-status'] });
    }
  }, []);

  const { data: oauthStatus } = useQuery({
    queryKey: ['google-oauth-status'],
    queryFn: () => api.get('/sheets/oauth/status').then((r) => r.data),
  });

  const { data: configs = [] } = useQuery({ queryKey: ['sheets-configs'], queryFn: () => api.get('/sheets/configs').then((r) => r.data) });
  const { data: numbers = [] } = useQuery({ queryKey: ['numbers'], queryFn: () => api.get('/numbers').then((r) => r.data) });
  const { data: products = [] } = useQuery({
    queryKey: ['products', statusFilter],
    queryFn: () => api.get('/sheets/products', { params: statusFilter ? { status: statusFilter } : {} }).then((r) => r.data),
    refetchInterval: 15000,
  });

  const connect = useMutation({
    mutationFn: () => api.post('/sheets/configs', { sheet_url: url }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['sheets-configs'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setUrl('');
      if (res.data.syncError) toast.error(res.data.syncError);
      else toast.success('Sheet connected and synced');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to connect sheet'),
  });

  const syncNow = useMutation({
    mutationFn: (id) => api.post(`/sheets/configs/${id}/sync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Synced');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Sync failed'),
  });

  const statusColor = { Pending: 'bg-amber-50 text-amber-700', Sent: 'bg-green-50 text-green-700', Failed: 'bg-red-50 text-red-700' };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Google Sheets Sync <span className="chip bg-orange-50 text-orange-700 ml-2">SHEETS</span></h1>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {oauthStatus?.connected
              ? '✅ Google account connected.'
              : 'Connect your Google account once, then paste any Sheet URL you own or can edit.'}
          </p>
          <a href="/api/sheets/oauth/start" className="btn-secondary text-sm whitespace-nowrap">
            {oauthStatus?.connected ? 'Reconnect Google' : 'Connect Google Account'}
          </a>
        </div>
        <div className="flex gap-2">
          <input className="input" placeholder="https://docs.google.com/spreadsheets/d/..." value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn-primary" disabled={!url || !oauthStatus?.connected} onClick={() => connect.mutate()}>Connect Sheet</button>
        </div>
      </div>

      <div className="space-y-2">
        {configs.map((c) => (
          <div key={c.id} className="card flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">{c.name}</div>
              <div className="text-xs text-gray-500">Last synced: {c.last_synced_at || 'never'}</div>
            </div>
            <button className="btn-secondary text-sm" onClick={() => syncNow.mutate(c.id)}>Sync Now</button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {['', 'Pending', 'Sent', 'Failed'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`chip ${statusFilter === s ? 'bg-accent text-white' : 'bg-gray-100'}`}>{s || 'All'}</button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {products.map((p) => (
          <div key={p.id} className="card">
            {p.image_url && <img src={p.image_url} alt={p.product_name} className="rounded-lg h-32 w-full object-cover mb-2" />}
            <div className="font-medium text-sm">{p.product_name}</div>
            <div className="text-xs text-gray-500">{p.brand}</div>
            <div className="text-sm mt-1">
              Rs.{p.price} {p.mrp ? <span className="line-through text-gray-400 ml-1">Rs.{p.mrp}</span> : null}
              {p.discount ? <span className="chip bg-red-50 text-red-600 ml-2">{p.discount}% off</span> : null}
            </div>
            <span className={`chip mt-2 ${statusColor[p.status]}`}>{p.status}</span>
          </div>
        ))}
        {!products.length && <div className="text-gray-400 text-sm">No products yet — connect a sheet above.</div>}
      </div>
    </div>
  );
}
