import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function Broadcast() {
  const qc = useQueryClient();
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [numberId, setNumberId] = useState('');
  const [targetType, setTargetType] = useState('contact');
  const [targetId, setTargetId] = useState('');
  const [caption, setCaption] = useState('');
  const [batchIds, setBatchIds] = useState([]);

  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => api.get('/sheets/products').then((r) => r.data) });
  const { data: numbers = [] } = useQuery({ queryKey: ['numbers'], queryFn: () => api.get('/numbers').then((r) => r.data) });
  const { data: contacts = [] } = useQuery({ queryKey: ['contacts', '', 'All'], queryFn: () => api.get('/contacts').then((r) => r.data) });
  const { data: groups = [] } = useQuery({ queryKey: ['groups', numberId], queryFn: () => api.get('/groups', { params: numberId ? { number_id: numberId } : {} }).then((r) => r.data) });

  const generateCaption = useMutation({
    mutationFn: (productId) => api.post(`/broadcast/caption/${productId}`),
    onSuccess: (res) => setCaption(res.data.caption),
    onError: (e) => toast.error(e.response?.data?.error || 'AI caption failed'),
  });

  const sendNow = useMutation({
    mutationFn: () => api.post('/broadcast/send-now', {
      product_id: selectedProduct.id, number_id: Number(numberId), target_type: targetType, target_id: targetType === 'contact' ? Number(targetId) : targetId, caption,
    }),
    onSuccess: () => toast.success('Sent!'),
    onError: (e) => toast.error(e.response?.data?.error || 'Send failed'),
  });

  const batchSend = useMutation({
    mutationFn: () => api.post('/broadcast/batch-send', {
      product_ids: batchIds, number_id: Number(numberId), target_type: targetType, target_id: targetType === 'contact' ? Number(targetId) : targetId,
    }),
    onSuccess: () => { toast.success('Batch sent'); setBatchIds([]); },
  });

  const toggleBatch = (id) => setBatchIds((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <h1 className="text-xl font-bold">Product Broadcast System <span className="chip bg-teal-50 text-teal-700 ml-2">BROADCAST</span></h1>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {products.map((p) => (
            <div
              key={p.id}
              className={`card cursor-pointer ${batchIds.includes(p.id) ? 'ring-2 ring-accent' : ''}`}
              onClick={() => { toggleBatch(p.id); setSelectedProduct(p); setCaption(''); }}
            >
              <label className="flex justify-between items-start" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={batchIds.includes(p.id)} onChange={() => { toggleBatch(p.id); setSelectedProduct(p); setCaption(''); }} />
                <span className="chip bg-gray-100 text-gray-500 text-[10px]">{p.status}</span>
              </label>
              {p.image_url && <img src={p.image_url} className="rounded-lg h-28 w-full object-cover my-2" />}
              <div className="font-medium text-sm">{p.product_name}</div>
              <div className="text-sm">Rs.{p.price} {p.discount ? <span className="text-red-600">({p.discount}% off)</span> : null}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card space-y-3 h-fit">
        <h2 className="font-semibold text-sm">Send Options</h2>
        <select className="input" value={numberId} onChange={(e) => setNumberId(e.target.value)}>
          <option value="">Select sending number</option>
          {numbers.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <select className="input" value={targetType} onChange={(e) => { setTargetType(e.target.value); setTargetId(''); }}>
          <option value="contact">Individual Contact</option>
          <option value="group">WA Group</option>
          <option value="channel">Community Channel</option>
        </select>
        {targetType === 'contact' ? (
          <select className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Select contact</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <select className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Select {targetType}</option>
            {groups.filter((g) => g.type === (targetType === 'channel' ? 'channel' : 'group')).map((g) => (
              <option key={g.wa_id} value={g.wa_id}>{g.name}</option>
            ))}
          </select>
        )}

        {selectedProduct && (
          <>
            <button className="btn-secondary w-full text-sm" onClick={() => generateCaption.mutate(selectedProduct.id)}>
              ✨ AI Generate Caption
            </button>
            <textarea className="input h-24" placeholder="Caption (or use default format)" value={caption} onChange={(e) => setCaption(e.target.value)} />
            <button className="btn-primary w-full" disabled={!numberId || !targetId} onClick={() => sendNow.mutate()}>Send Now</button>
          </>
        )}

        {batchIds.length > 0 && (
          <button className="btn-secondary w-full" disabled={!numberId || !targetId} onClick={() => batchSend.mutate()}>
            Batch Send ({batchIds.length} products)
          </button>
        )}
      </div>
    </div>
  );
}
