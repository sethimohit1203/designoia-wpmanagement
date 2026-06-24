import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function NumberSwitcher({ numbers }) {
  const [open, setOpen] = useState(false);
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

  if (!numbers.length) {
    return <span className="chip bg-gray-100 text-gray-500">No numbers connected</span>;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="chip bg-wagreen/10 text-wagreen flex items-center gap-2"
      >
        🟢 {active?.name || 'Select number'} ({active?.runtimeStatus || active?.status})
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white border rounded-lg shadow-lg z-50">
          {numbers.map((n) => (
            <button
              key={n.id}
              onClick={() => activate.mutate(n.id)}
              className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex justify-between"
            >
              <span>{n.name}</span>
              <span className={n.runtimeStatus === 'connected' ? 'text-wagreen' : 'text-gray-400'}>
                {n.runtimeStatus}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
