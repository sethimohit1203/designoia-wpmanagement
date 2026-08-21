import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function NumberSwitcher({ numbers }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const qc = useQueryClient();
  const active = numbers.find((n) => n.is_active) || numbers[0];

  const activate = useMutation({
    mutationFn: (id) => api.post(`/numbers/${id}/activate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['numbers'] });
      toast.success('Active sender switched');
      setOpen(false);
    },
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!numbers.length) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-800/50 bg-slate-50 dark:bg-[#151824] text-[10px] font-bold text-slate-400">
        <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
        No WhatsApp connected
      </div>
    );
  }

  const isConnected = active?.runtimeStatus === 'connected';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-100 dark:border-gray-800/50 bg-slate-50 dark:bg-[#151824] text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-[#1c2030] transition-all active:scale-98"
      >
        <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
        <span>{active?.phone || active?.name || 'Select sender'}</span>
        <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded-md font-extrabold ${isConnected ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'}`}>
          {active?.runtimeStatus || 'offline'}
        </span>
        <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#131520] border border-gray-100 dark:border-gray-800/80 rounded-xl shadow-xl z-50 py-1.5 overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase border-b border-gray-50 dark:border-gray-800/40 mb-1">
            Switch Active Sender
          </div>
          {numbers.map((n) => {
            const isConn = n.runtimeStatus === 'connected';
            const isActive = n.id === active.id;
            return (
              <button
                key={n.id}
                onClick={() => activate.mutate(n.id)}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                  isActive
                    ? 'bg-slate-50 dark:bg-slate-800/40 font-semibold'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isConn ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <span className="truncate text-slate-700 dark:text-slate-200">{n.name} ({n.phone || 'Offline'})</span>
                </div>
                {isActive && <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
