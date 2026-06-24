import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import PhoneMockup from '../components/PhoneMockup';
import toast from 'react-hot-toast';

const VARS = ['{name}', '{date}', '{vehicle}'];

export default function BulkSender() {
  const [groupName, setGroupName] = useState('All');
  const [message, setMessage] = useState('');
  const [numberId, setNumberId] = useState('');
  const [delay, setDelay] = useState(8);
  const [media, setMedia] = useState(null);
  const [progress, setProgress] = useState(null);
  const [sending, setSending] = useState(false);

  const { data: groups = [] } = useQuery({
    queryKey: ['contact-groups'],
    queryFn: () => api.get('/contacts/groups').then((r) => r.data),
  });
  const { data: numbers = [] } = useQuery({
    queryKey: ['numbers'],
    queryFn: () => api.get('/numbers').then((r) => r.data),
  });

  const insertVar = (v) => setMessage((m) => m + v);

  const startSend = async () => {
    if (!message.trim()) return toast.error('Write a message first');
    setSending(true);
    setProgress({ sent: 0, failed: 0, total: 0 });

    const form = new FormData();
    form.append('group_name', groupName);
    form.append('message', message);
    if (numberId) form.append('number_id', numberId);
    form.append('delay_seconds', delay);
    if (media) form.append('media', media);

    const res = await fetch('/api/bulk/send', { method: 'POST', body: form });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value);
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const part of parts) {
        if (!part.startsWith('data: ')) continue;
        const data = JSON.parse(part.slice(6));
        setProgress(data);
        if (data.done) {
          setSending(false);
          toast.success(`Done — ${data.sent} sent, ${data.failed} failed`);
        }
      }
    }
    setSending(false);
  };

  const charCount = message.length;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <h1 className="text-xl font-bold">Bulk Message Sender <span className="chip bg-accent/10 text-accent ml-2">CORE</span></h1>

        <div className="card space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Recipients</label>
              <select className="input" value={groupName} onChange={(e) => setGroupName(e.target.value)}>
                <option value="All">All Contacts</option>
                {groups.map((g) => (
                  <option key={g.group_name} value={g.group_name}>{g.group_name} ({g.count})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Send from (WA number)</label>
              <select className="input" value={numberId} onChange={(e) => setNumberId(e.target.value)}>
                <option value="">Auto-rotate</option>
                {numbers.map((n) => (
                  <option key={n.id} value={n.id}>{n.name} ({n.runtimeStatus})</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500">Message</label>
            <textarea
              className="input h-32"
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hi {name}, ..."
            />
            <div className="flex justify-between mt-1">
              <div className="flex gap-1">
                {VARS.map((v) => (
                  <button key={v} onClick={() => insertVar(v)} className="chip bg-gray-100 hover:bg-gray-200 text-gray-600">{v}</button>
                ))}
              </div>
              <span className={`text-xs ${charCount > 900 ? 'text-red-600 font-bold' : 'text-gray-400'}`}>{charCount}/1000</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500">Attach media (image / PDF / video)</label>
            <input type="file" className="block text-sm" onChange={(e) => setMedia(e.target.files[0])} />
          </div>

          <div>
            <label className="text-xs text-gray-500">Anti-ban delay: {delay}s between messages</label>
            <input type="range" min={3} max={30} value={delay} onChange={(e) => setDelay(Number(e.target.value))} className="w-full" />
          </div>

          <button className="btn-primary w-full" disabled={sending} onClick={startSend}>
            {sending ? 'Sending…' : 'Start Bulk Send'}
          </button>

          {progress && (
            <div className="space-y-1">
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-accent h-3 transition-all"
                  style={{ width: `${progress.total ? ((progress.sent + progress.failed) / progress.total) * 100 : 0}%` }}
                />
              </div>
              <div className="text-xs text-gray-500">
                {progress.sent + progress.failed}/{progress.total} · sent {progress.sent} · failed {progress.failed}
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-2">Live Preview</h2>
        <PhoneMockup message={message} mediaPreview={media ? URL.createObjectURL(media) : null} />
      </div>
    </div>
  );
}
