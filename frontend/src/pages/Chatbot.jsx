import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function Chatbot() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ keyword: '', reply: '', is_fallback: false });
  const [testMsg, setTestMsg] = useState('');
  const [testReply, setTestReply] = useState(null);

  const { data: flows = [] } = useQuery({ queryKey: ['chatbot'], queryFn: () => api.get('/chatbot').then((r) => r.data) });
  const { data: numbers = [] } = useQuery({ queryKey: ['numbers'], queryFn: () => api.get('/numbers').then((r) => r.data) });

  const create = useMutation({
    mutationFn: () => api.post('/chatbot', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chatbot'] });
      setForm({ keyword: '', reply: '', is_fallback: false });
      toast.success('Flow added');
    },
  });

  const toggle = useMutation({
    mutationFn: (flow) => api.put(`/chatbot/${flow.id}`, { ...flow, enabled: flow.enabled ? 0 : 1 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chatbot'] }),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/chatbot/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chatbot'] }),
  });

  const test = useMutation({
    mutationFn: () => api.post('/chatbot/test', { message: testMsg }),
    onSuccess: (res) => setTestReply(res.data.reply),
  });

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <h1 className="text-xl font-bold">Chatbot / Auto-Reply <span className="chip bg-teal-50 text-teal-700 ml-2">BOT</span></h1>

        <div className="card grid sm:grid-cols-2 gap-2">
          <input className="input" placeholder="Keyword (e.g. 1, price, hello)" value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} disabled={form.is_fallback} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_fallback} onChange={(e) => setForm({ ...form, is_fallback: e.target.checked, keyword: '' })} />
            Fallback reply (unmatched keywords)
          </label>
          <textarea className="input sm:col-span-2 h-20" placeholder="Reply message" value={form.reply} onChange={(e) => setForm({ ...form, reply: e.target.value })} />
          <button className="btn-primary sm:col-span-2" disabled={!form.reply} onClick={() => create.mutate()}>+ Add Flow</button>
        </div>

        <div className="space-y-2">
          {flows.map((f) => (
            <div key={f.id} className="card flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{f.is_fallback ? '(fallback)' : f.keyword}</div>
                <div className="text-xs text-gray-500">{f.reply}</div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => toggle.mutate(f)} className={`chip ${f.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {f.enabled ? 'ON' : 'OFF'}
                </button>
                <button className="text-red-600 text-xs" onClick={() => remove.mutate(f.id)}>Delete</button>
              </div>
            </div>
          ))}
          {!flows.length && <div className="text-sm text-gray-400">No flows yet</div>}
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold text-sm">Live Test Window</h2>
        <input className="input" placeholder="Type a customer message…" value={testMsg} onChange={(e) => setTestMsg(e.target.value)} />
        <button className="btn-primary w-full" onClick={() => test.mutate()}>Test Reply</button>
        {testReply !== null && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="text-xs text-gray-400 mb-1">Bot would reply:</div>
            {testReply || <span className="text-gray-400">No match found</span>}
          </div>
        )}
      </div>
    </div>
  );
}
