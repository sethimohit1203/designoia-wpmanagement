import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function Contacts() {
  const [search, setSearch]           = useState('');
  const [group, setGroup]             = useState('All');
  const [page, setPage]               = useState(1);
  const [selected, setSelected]       = useState([]);
  const [form, setForm]               = useState({ name: '', phone: '', group_name: 'All', tags: '' });
  const [sheetUrl, setSheetUrl]       = useState('');
  const [showSheetInput, setShowSheetInput] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search, group, page],
    queryFn: () => api.get('/contacts', { params: { search, group, page, limit: 100 } }).then((r) => r.data),
    keepPreviousData: true,
  });

  const contacts = data?.rows || [];
  const total    = data?.total || 0;
  const pages    = data?.pages || 1;

  const { data: groups = [] } = useQuery({
    queryKey: ['contact-groups'],
    queryFn: () => api.get('/contacts/groups').then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contacts'] });
    qc.invalidateQueries({ queryKey: ['contact-groups'] });
  };

  const onErr = (e) => toast.error(e?.response?.data?.error || e?.message || 'Request failed — is the backend running on :5000?');

  const addContact = useMutation({
    mutationFn: () => api.post('/contacts', form),
    onSuccess: () => { setForm({ name: '', phone: '', group_name: 'All', tags: '' }); invalidate(); toast.success('Contact added'); },
    onError: onErr,
  });

  const bulkDelete = useMutation({
    mutationFn: () => api.post('/contacts/bulk-delete', { ids: selected }),
    onSuccess: () => { setSelected([]); invalidate(); toast.success('Deleted'); },
    onError: onErr,
  });

  const importCsv = useMutation({
    mutationFn: (file) => { const fd = new FormData(); fd.append('file', file); return api.post('/contacts/import-csv', fd); },
    onSuccess: (res) => { invalidate(); toast.success(`Imported ${res.data.imported} contacts`); },
    onError: onErr,
  });

  const importSheet = useMutation({
    mutationFn: () => api.post('/contacts/import-sheet', { url: sheetUrl }),
    onSuccess: (res) => { invalidate(); toast.success(`Imported ${res.data.imported} contacts from sheet`); setSheetUrl(''); setShowSheetInput(false); },
    onError: onErr,
  });

  const toggleSelect = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  function handleSearch(val) { setSearch(val); setPage(1); }
  function handleGroup(val)  { setGroup(val);  setPage(1); }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">
        Contact Manager <span className="chip bg-teal-50 text-teal-700 ml-2">CRM</span>
        {total > 0 && <span className="text-sm font-normal text-gray-400 ml-3">{total.toLocaleString()} contacts</span>}
      </h1>

      {/* Add contact row */}
      <div className="card grid sm:grid-cols-5 gap-2">
        <input className="input" placeholder="Name"          value={form.name}       onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input" placeholder="+91..."        value={form.phone}      onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="input" placeholder="Group"        value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} />
        <input className="input" placeholder="tags (hot,vip)" value={form.tags}     onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        <button className="btn-primary" onClick={() => addContact.mutate()}>+ Add</button>
      </div>

      {/* Filters + actions */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => handleGroup('All')} className={`chip ${group === 'All' ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600'}`}>
            All ({total.toLocaleString()})
          </button>
          {groups.map((g) => (
            <button key={g.group_name} onClick={() => handleGroup(g.group_name)}
              className={`chip ${group === g.group_name ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600'}`}>
              {g.group_name} ({g.count})
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input className="input" placeholder="Search name/phone" value={search} onChange={(e) => handleSearch(e.target.value)} />
          <label className="btn-secondary cursor-pointer whitespace-nowrap">
            📂 Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files[0] && importCsv.mutate(e.target.files[0])} />
          </label>
          <button className="btn-secondary whitespace-nowrap" onClick={() => setShowSheetInput((v) => !v)}>
            📊 From Google Sheet
          </button>
          {selected.length > 0 && (
            <button className="btn-secondary text-red-600" onClick={() => bulkDelete.mutate()}>
              Delete ({selected.length})
            </button>
          )}
        </div>
      </div>

      {/* Google Sheet import panel */}
      {showSheetInput && (
        <div className="card space-y-2">
          <p className="text-sm font-medium">Import from Google Sheet</p>
          <p className="text-xs text-gray-500">
            Share the sheet as <strong>"Anyone with the link can view"</strong>.
            Supported columns: <code className="bg-gray-100 px-1 rounded">name / fname / mname</code>, <code className="bg-gray-100 px-1 rounded">phone1 / mobile1 / smobile / phone / mobile</code>, optionally <code className="bg-gray-100 px-1 rounded">group</code>, <code className="bg-gray-100 px-1 rounded">tags</code>.
          </p>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
            />
            <button
              className="btn-primary whitespace-nowrap"
              disabled={!sheetUrl.trim() || importSheet.isPending}
              onClick={() => importSheet.mutate()}
            >
              {importSheet.isPending ? 'Importing…' : 'Import'}
            </button>
          </div>
          {importSheet.isPending && (
            <p className="text-xs text-gray-400 animate-pulse">Importing large sheet — this may take 30–60 seconds for 60k+ rows…</p>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 w-8"></th>
              <th>Name</th><th>Phone</th><th>Group</th><th>Tags</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="text-center text-gray-400 py-6">Loading…</td></tr>
            )}
            {!isLoading && contacts.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                <td className="py-2">{c.name}</td>
                <td>{c.phone}</td>
                <td>{c.group_name}</td>
                <td>{c.tags}</td>
                <td><span className={`chip ${c.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{c.status}</span></td>
              </tr>
            ))}
            {!isLoading && !contacts.length && (
              <tr><td colSpan={6} className="text-center text-gray-400 py-6">No contacts yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button className="btn-secondary text-xs px-3 py-1" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
          <button className="btn-secondary text-xs px-3 py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
          <span className="text-sm text-gray-500">Page {page} of {pages}</span>
          <button className="btn-secondary text-xs px-3 py-1" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
          <button className="btn-secondary text-xs px-3 py-1" disabled={page >= pages} onClick={() => setPage(pages)}>»</button>
        </div>
      )}
    </div>
  );
}
