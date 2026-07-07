import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function Contacts() {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('All');
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', group_name: 'All', tags: '' });
  const [sheetUrl, setSheetUrl] = useState('');
  const [showSheetInput, setShowSheetInput] = useState(false);
  const qc = useQueryClient();

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', search, group],
    queryFn: () => api.get('/contacts', { params: { search, group } }).then((r) => r.data),
  });
  const { data: groups = [] } = useQuery({
    queryKey: ['contact-groups'],
    queryFn: () => api.get('/contacts/groups').then((r) => r.data),
  });

  const onErr = (e) => toast.error(e?.response?.data?.error || e?.message || 'Request failed — is the backend running on :5000?');

  const addContact = useMutation({
    mutationFn: () => api.post('/contacts', form),
    onSuccess: () => {
      setForm({ name: '', phone: '', group_name: 'All', tags: '' });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact-groups'] });
      toast.success('Contact added');
    },
    onError: onErr,
  });

  const bulkDelete = useMutation({
    mutationFn: () => api.post('/contacts/bulk-delete', { ids: selected }),
    onSuccess: () => {
      setSelected([]);
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Deleted');
    },
    onError: onErr,
  });

  const importCsv = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/contacts/import-csv', fd);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact-groups'] });
      toast.success(`Imported ${res.data.imported} contacts`);
    },
    onError: onErr,
  });

  const importSheet = useMutation({
    mutationFn: () => api.post('/contacts/import-sheet', { url: sheetUrl }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact-groups'] });
      toast.success(`Imported ${res.data.imported} contacts from sheet`);
      setSheetUrl('');
      setShowSheetInput(false);
    },
    onError: onErr,
  });

  const toggleSelect = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Contact Manager <span className="chip bg-teal-50 text-teal-700 ml-2">CRM</span></h1>

      <div className="card grid sm:grid-cols-5 gap-2">
        <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input" placeholder="+91..." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="input" placeholder="Group" value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} />
        <input className="input" placeholder="tags (hot, vip)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        <button className="btn-primary" onClick={() => addContact.mutate()}>+ Add</button>
      </div>

      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setGroup('All')} className={`chip ${group === 'All' ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600'}`}>All ({contacts.length})</button>
          {groups.map((g) => (
            <button key={g.group_name} onClick={() => setGroup(g.group_name)} className={`chip ${group === g.group_name ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600'}`}>
              {g.group_name} ({g.count})
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input className="input" placeholder="Search name/phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          <label className="btn-secondary cursor-pointer whitespace-nowrap">
            📂 Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files[0] && importCsv.mutate(e.target.files[0])} />
          </label>
          <button className="btn-secondary whitespace-nowrap" onClick={() => setShowSheetInput((v) => !v)}>
            📊 From Google Sheet
          </button>
          {selected.length > 0 && (
            <button className="btn-secondary text-red-600" onClick={() => bulkDelete.mutate()}>Delete ({selected.length})</button>
          )}
        </div>
      </div>

      {/* Google Sheet import panel */}
      {showSheetInput && (
        <div className="card space-y-2">
          <p className="text-sm font-medium">Import from Google Sheet</p>
          <p className="text-xs text-gray-500">
            Make sure the sheet is shared as <strong>"Anyone with the link can view"</strong>.
            Columns needed: <code className="bg-gray-100 px-1 rounded">Name</code>, <code className="bg-gray-100 px-1 rounded">Phone</code> (or Mobile/Number), optionally <code className="bg-gray-100 px-1 rounded">Group</code>, <code className="bg-gray-100 px-1 rounded">Tags</code>.
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
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 w-8"></th>
              <th>Name</th><th>Phone</th><th>Group</th><th>Tags</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                <td className="py-2">{c.name}</td>
                <td>{c.phone}</td>
                <td>{c.group_name}</td>
                <td>{c.tags}</td>
                <td><span className={`chip ${c.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{c.status}</span></td>
              </tr>
            ))}
            {!contacts.length && <tr><td colSpan={6} className="text-center text-gray-400 py-6">No contacts yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
