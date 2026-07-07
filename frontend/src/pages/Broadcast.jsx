import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function Broadcast() {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [numberId, setNumberId] = useState('');
  const [targetType, setTargetType] = useState('group');
  const [targetId, setTargetId] = useState('');
  const [caption, setCaption] = useState('');
  const [batchIds, setBatchIds] = useState([]);
  const [showPanel, setShowPanel] = useState(false);

  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => api.get('/sheets/products').then((r) => r.data) });
  const { data: numbers = [] } = useQuery({ queryKey: ['numbers'], queryFn: () => api.get('/numbers').then((r) => r.data) });
  const { data: contacts = [] } = useQuery({ queryKey: ['contacts'], queryFn: () => api.get('/contacts').then((r) => r.data) });
  const { data: groups = [] } = useQuery({
    queryKey: ['groups', numberId],
    queryFn: () => api.get('/groups', { params: { number_id: numberId } }).then((r) => r.data),
    enabled: !!numberId,
  });

  const generateCaption = useMutation({
    mutationFn: (productId) => api.post(`/broadcast/caption/${productId}`),
    onSuccess: (res) => setCaption(res.data.caption),
    onError: (e) => toast.error(e.response?.data?.error || 'AI caption failed'),
  });

  const sendNow = useMutation({
    mutationFn: () => api.post('/broadcast/send-now', {
      product_id: selectedProduct.id,
      number_id: Number(numberId),
      target_type: targetType,
      target_id: targetType === 'contact' ? Number(targetId) : targetId,
      caption,
    }),
    onSuccess: () => { toast.success('Sent!'); setShowPanel(false); },
    onError: (e) => toast.error(e.response?.data?.error || 'Send failed'),
  });

  const batchSend = useMutation({
    mutationFn: () => api.post('/broadcast/batch-send', {
      product_ids: batchIds,
      number_id: Number(numberId),
      target_type: targetType,
      target_id: targetType === 'contact' ? Number(targetId) : targetId,
    }),
    onSuccess: () => { toast.success(`Sending ${batchIds.length} products in background…`); setBatchIds([]); setShowPanel(false); },
    onError: (e) => toast.error(e.response?.data?.error || 'Batch send failed'),
  });

  const toggleBatch = (id) => setBatchIds((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));
  const canSend = numberId && targetId;

  function SendPanel() {
    return (
      <div className="space-y-3">
        {/* Number */}
        <select className="input" value={numberId} onChange={(e) => { setNumberId(e.target.value); setTargetId(''); }}>
          <option value="">Select sending number</option>
          {numbers.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name} {n.runtimeStatus === 'connected' ? '🟢' : '🔴'}
            </option>
          ))}
        </select>

        {/* Target type */}
        <select className="input" value={targetType} onChange={(e) => { setTargetType(e.target.value); setTargetId(''); }}>
          <option value="group">WhatsApp Group</option>
          <option value="channel">Community Channel</option>
          <option value="contact">Individual Contact</option>
        </select>

        {/* Target selector */}
        {targetType === 'contact' ? (
          <select className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Select contact</option>
            {contacts.length === 0
              ? <option disabled>No contacts — add via Contacts page</option>
              : contacts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
          </select>
        ) : (
          <select className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">
              {!numberId ? '← Select a number first' : groups.length === 0 ? 'No groups found — refresh on Groups page' : 'Select group / channel'}
            </option>
            {groups.map((g) => (
              <option key={g.wa_id} value={g.wa_id}>
                {g.name} ({g.member_count} members)
              </option>
            ))}
          </select>
        )}

        {/* Selected product info */}
        {selectedProduct && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-2 text-xs text-teal-800">
            📦 <span className="font-medium">{selectedProduct.product_name}</span>
            {' — '}₹{selectedProduct.price}
          </div>
        )}

        {/* Caption + send-now (only for single product) */}
        {selectedProduct && (
          <>
            <button
              className="btn-secondary w-full text-sm"
              onClick={() => generateCaption.mutate(selectedProduct.id)}
              disabled={generateCaption.isPending}
            >
              {generateCaption.isPending ? '⏳ Generating…' : '✨ AI Generate Caption'}
            </button>
            <textarea
              className="input h-20 text-xs"
              placeholder="Caption (leave blank to use auto-format)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            <button
              className="btn-primary w-full"
              disabled={!canSend || sendNow.isPending}
              onClick={() => sendNow.mutate()}
            >
              {sendNow.isPending ? 'Sending…' : '📤 Send Now'}
            </button>
          </>
        )}

        {/* Batch send */}
        {batchIds.length > 0 && (
          <button
            className="btn-secondary w-full font-semibold"
            disabled={!canSend || batchSend.isPending}
            onClick={() => batchSend.mutate()}
          >
            {batchSend.isPending ? 'Queuing…' : `📦 Batch Send (${batchIds.length} products)`}
          </button>
        )}

        {!selectedProduct && batchIds.length === 0 && (
          <p className="text-xs text-gray-400 text-center pt-1">Tap a product card to select it</p>
        )}
      </div>
    );
  }

  return (
    <div className="pb-24 lg:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">
          Product Broadcast <span className="chip bg-teal-50 text-teal-700 ml-2">BROADCAST</span>
        </h1>
        {batchIds.length > 0 && (
          <span className="chip bg-accent text-white text-xs">{batchIds.length} selected</span>
        )}
      </div>

      {/* Desktop: grid with right panel */}
      <div className="hidden lg:grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ProductGrid products={products} batchIds={batchIds} toggleBatch={toggleBatch} setSelectedProduct={setSelectedProduct} setCaption={setCaption} />
        </div>
        <div className="card space-y-3 h-fit sticky top-4">
          <h2 className="font-semibold text-sm">Send Options</h2>
          <SendPanel />
        </div>
      </div>

      {/* Mobile: just product grid */}
      <div className="lg:hidden">
        <ProductGrid products={products} batchIds={batchIds} toggleBatch={toggleBatch} setSelectedProduct={setSelectedProduct} setCaption={setCaption} />
      </div>

      {/* Mobile FAB */}
      <button
        className="lg:hidden fixed bottom-20 right-4 z-40 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-full px-5 py-3.5 shadow-xl font-semibold text-sm flex items-center gap-2"
        onClick={() => setShowPanel(true)}
      >
        📤 Send
        {(batchIds.length > 0 || selectedProduct) && (
          <span className="bg-white text-teal-700 rounded-full w-5 h-5 text-xs font-bold flex items-center justify-center">
            {batchIds.length || 1}
          </span>
        )}
      </button>

      {/* Mobile bottom-sheet */}
      {showPanel && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setShowPanel(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Send Options</h2>
              <button onClick={() => setShowPanel(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <SendPanel />
          </div>
        </div>
      )}
    </div>
  );
}

function ProductGrid({ products, batchIds, toggleBatch, setSelectedProduct, setCaption }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {products.map((p) => (
        <div
          key={p.id}
          className={`card cursor-pointer transition-shadow ${batchIds.includes(p.id) ? 'ring-2 ring-accent' : ''}`}
          onClick={() => { toggleBatch(p.id); setSelectedProduct(p); setCaption(''); }}
        >
          <label className="flex justify-between items-start mb-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={batchIds.includes(p.id)}
              onChange={() => { toggleBatch(p.id); setSelectedProduct(p); setCaption(''); }}
            />
            <span className="chip bg-gray-100 text-gray-500 text-[10px]">{p.status}</span>
          </label>
          {p.image_url && (
            <img src={p.image_url} className="rounded-lg h-28 w-full object-cover mb-2" alt={p.product_name} />
          )}
          <div className="font-medium text-sm leading-tight">{p.product_name}</div>
          <div className="text-sm flex items-center gap-2 flex-wrap mt-1">
            <span className="font-semibold text-green-700">₹{p.price}</span>
            {p.mrp > 0 && p.mrp > p.price && (
              <span className="text-gray-400 line-through text-xs">₹{p.mrp}</span>
            )}
            {p.discount ? <span className="text-red-600 text-xs">({Math.round(p.discount)}% off)</span> : null}
          </div>
        </div>
      ))}
      {products.length === 0 && (
        <div className="col-span-full text-center py-12 text-gray-400 text-sm">
          No products yet — sync your Google Sheet first.
        </div>
      )}
    </div>
  );
}
