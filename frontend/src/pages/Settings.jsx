import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function Settings() {
  const qc = useQueryClient();
  const [form, setForm] = useState(null);

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings').then((r) => r.data) });
  const { data: checklist = [] } = useQuery({ queryKey: ['checklist'], queryFn: () => api.get('/settings/checklist').then((r) => r.data), refetchInterval: 5000 });
  const { data: numbers = [] } = useQuery({ queryKey: ['numbers'], queryFn: () => api.get('/numbers').then((r) => r.data) });

  useEffect(() => { if (settings && !form) setForm(settings); }, [settings]);

  const save = useMutation({
    mutationFn: () => api.put('/settings', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['checklist'] });
      toast.success('Settings saved');
    },
  });

  if (!form) return <div>Loading…</div>;

  const toggle = (key) => setForm({ ...form, [key]: form[key] === 'true' ? 'false' : 'true' });

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <h1 className="text-xl font-bold">Settings & Anti-Ban <span className="chip bg-green-50 text-green-700 ml-2">SAFE</span></h1>

        <div className="card space-y-3">
          <h2 className="font-semibold text-sm">Business Profile</h2>
          <input className="input" placeholder="Business name" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
          <select className="input" value={form.default_number_id} onChange={(e) => setForm({ ...form, default_number_id: e.target.value })}>
            <option value="">No default</option>
            {numbers.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          <input className="input" placeholder="Message signature" value={form.signature} onChange={(e) => setForm({ ...form, signature: e.target.value })} />
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold text-sm">Delays & Limits</h2>
          <div>
            <label className="text-xs text-gray-500">Default delay: {form.default_delay_seconds}s</label>
            <input type="range" min={3} max={30} value={form.default_delay_seconds} onChange={(e) => setForm({ ...form, default_delay_seconds: e.target.value })} className="w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Max messages per hour: {form.max_messages_per_hour}</label>
            <input type="range" min={10} max={200} value={form.max_messages_per_hour} onChange={(e) => setForm({ ...form, max_messages_per_hour: e.target.value })} className="w-full" />
          </div>
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold text-sm">Broadcast Message Footer</h2>
          <p className="text-xs text-gray-500">Appended to every product broadcast message (Sheets, Broadcast tab). Leave blank to omit a line.</p>
          <input className="input" placeholder="DM numbers e.g. 8800245974 / 8860103557" value={form.broadcast_dm_numbers} onChange={(e) => setForm({ ...form, broadcast_dm_numbers: e.target.value })} />
          <input className="input" placeholder="WhatsApp Channel link" value={form.broadcast_whatsapp_channel} onChange={(e) => setForm({ ...form, broadcast_whatsapp_channel: e.target.value })} />
          <input className="input" placeholder="Telegram Channel link" value={form.broadcast_telegram_channel} onChange={(e) => setForm({ ...form, broadcast_telegram_channel: e.target.value })} />
          <textarea className="input h-20" placeholder="Footer note (delivery/COD/returns info)" value={form.broadcast_footer_note} onChange={(e) => setForm({ ...form, broadcast_footer_note: e.target.value })} />
        </div>

        <div className="card space-y-2">
          <h2 className="font-semibold text-sm">Toggles</h2>
          {[
            ['anti_spam_mode', 'Anti-Spam Mode'],
            ['typing_indicator', 'Typing Indicator'],
            ['random_variation', 'Random Variation'],
            ['auto_reply', 'Auto-Reply'],
            ['auto_rotate', 'Auto-Rotate (multi-number)'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-sm border-b last:border-0 py-2">
              {label}
              <input type="checkbox" checked={form[key] === 'true'} onChange={() => toggle(key)} />
            </label>
          ))}
        </div>

        <button className="btn-primary" onClick={() => save.mutate()}>Save Settings</button>
      </div>

      <div className="card space-y-2 h-fit">
        <h2 className="font-semibold text-sm">Live Ban Protection Checklist</h2>
        {checklist.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span>{c.ok ? '✅' : '⚠️'}</span>
            <span className={c.ok ? 'text-gray-700' : 'text-amber-700'}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
