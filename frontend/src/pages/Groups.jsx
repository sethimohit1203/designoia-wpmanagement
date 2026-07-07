import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function Groups() {
  const qc = useQueryClient();
  const [numberId, setNumberId] = useState('');
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');
  const [delay, setDelay] = useState(15);
  const [channelLink, setChannelLink] = useState('');

  const { data: numbers = [] } = useQuery({ queryKey: ['numbers'], queryFn: () => api.get('/numbers').then((r) => r.data) });
  const { data: groups = [] } = useQuery({
    queryKey: ['groups', numberId],
    queryFn: () => api.get('/groups', { params: numberId ? { number_id: numberId } : {} }).then((r) => r.data),
    enabled: true,
  });

  const refresh = useMutation({
    mutationFn: () => api.post(`/groups/refresh/${numberId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); toast.success('Groups refreshed'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed - connect number first'),
  });

  const addChannel = useMutation({
    mutationFn: () => api.post('/groups/add-channel', { number_id: Number(numberId), link_or_jid: channelLink.trim() }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      toast.success(`Channel "${r.data.name}" added!`);
      setChannelLink('');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to add channel'),
  });

  const send = useMutation({
    mutationFn: () => api.post('/groups/send', { number_id: Number(numberId), group_ids: selected, message, delay_seconds: delay }),
    onSuccess: () => { toast.success('Broadcast complete'); setSelected([]); setMessage(''); },
  });

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Groups, Communities & Channels <span className="chip bg-accent/10 text-accent ml-2">GROUPS</span></h1>

      <div className="card flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500">WA Number</label>
          <select className="input" value={numberId} onChange={(e) => setNumberId(e.target.value)}>
            <option value="">Select number</option>
            {numbers.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
        <button className="btn-secondary" disabled={!numberId} onClick={() => refresh.mutate()}>Refresh Groups</button>
      </div>

      {/* Add Channel manually */}
      <div className="card space-y-2">
        <h2 className="font-semibold text-sm">📢 Add WhatsApp Channel</h2>
        <p className="text-xs text-gray-500">Paste your WhatsApp Channel invite link (e.g. <span className="font-mono">https://whatsapp.com/channel/…</span>)</p>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="https://whatsapp.com/channel/0029Va..."
            value={channelLink}
            onChange={(e) => setChannelLink(e.target.value)}
          />
          <button
            className="btn-primary whitespace-nowrap"
            disabled={!numberId || !channelLink.trim() || addChannel.isPending}
            onClick={() => addChannel.mutate()}
          >
            {addChannel.isPending ? 'Adding…' : 'Add Channel'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2 text-sm">Select Groups / Channels</h2>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {groups.map((g) => (
            <label key={g.id} className="flex items-center gap-3 p-2 border rounded-lg text-sm">
              <input type="checkbox" checked={selected.includes(g.wa_id)} onChange={() => toggle(g.wa_id)} />
              <span className="flex-1">{g.name}</span>
              <span className="chip bg-gray-100 text-gray-500 text-[10px]">{g.type}</span>
              <span className="text-xs text-gray-400">{g.member_count} members</span>
            </label>
          ))}
          {!groups.length && <div className="text-sm text-gray-400">No groups loaded — connect the number and refresh.</div>}
        </div>
      </div>

      <div className="card space-y-3">
        <textarea className="input h-24" placeholder="Broadcast message…" value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500">Delay between sends (s)</label>
          <input type="number" min={10} max={30} className="input w-20" value={delay} onChange={(e) => setDelay(Number(e.target.value))} />
        </div>
        <button className="btn-primary" disabled={!selected.length || !message || !numberId} onClick={() => send.mutate()}>
          Send to {selected.length} group(s)
        </button>
      </div>
    </div>
  );
}
