import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import PhoneMockup from '../components/PhoneMockup';
import toast from 'react-hot-toast';

const categories = ['Marketing', 'Transactional', 'Onboarding', 'Sales'];

export default function Templates() {
  const [category, setCategory] = useState('');
  const [preview, setPreview] = useState(null);
  const [useCase, setUseCase] = useState('');
  const [aiCategory, setAiCategory] = useState('Marketing');
  const [draft, setDraft] = useState({ name: '', category: 'Marketing', content: '' });
  const qc = useQueryClient();

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', category],
    queryFn: () => api.get('/templates', { params: category ? { category } : {} }).then((r) => r.data),
  });

  const aiGenerate = useMutation({
    mutationFn: () => api.post('/templates/ai-generate', { use_case: useCase, category: aiCategory }),
    onSuccess: (res) => setDraft({ name: useCase.slice(0, 40), category: aiCategory, content: res.data.content }),
    onError: (e) => toast.error(e.response?.data?.error || 'AI generation failed'),
  });

  const save = useMutation({
    mutationFn: () => api.post('/templates', draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template saved');
      setDraft({ name: '', category: 'Marketing', content: '' });
    },
  });

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <h1 className="text-xl font-bold">Template Builder (AI) <span className="chip bg-purple-50 text-purple-700 ml-2">AI</span></h1>

        <div className="card space-y-3">
          <h2 className="font-semibold text-sm">AI Generator</h2>
          <div className="grid sm:grid-cols-3 gap-2">
            <input className="input sm:col-span-2" placeholder="Describe use case e.g. 'Diwali offer for returning customers'" value={useCase} onChange={(e) => setUseCase(e.target.value)} />
            <select className="input" value={aiCategory} onChange={(e) => setAiCategory(e.target.value)}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <button className="btn-primary" disabled={!useCase || aiGenerate.isPending} onClick={() => aiGenerate.mutate()}>
            {aiGenerate.isPending ? 'Generating…' : 'Generate with Gemini'}
          </button>
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold text-sm">Edit / Save Template</h2>
          <input className="input" placeholder="Template name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <select className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <textarea className="input h-28" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Message content with {name}, {date}..." />
          <button className="btn-primary" disabled={!draft.name || !draft.content} onClick={() => save.mutate()}>Save Template</button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setCategory('')} className={`chip ${!category ? 'bg-accent text-white' : 'bg-gray-100'}`}>All</button>
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`chip ${category === c ? 'bg-accent text-white' : 'bg-gray-100'}`}>{c}</button>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {templates.map((t) => (
            <div key={t.id} className="card cursor-pointer" onClick={() => setPreview(t)}>
              <div className="flex justify-between items-start">
                <div className="font-medium text-sm">{t.name}</div>
                <span className="chip bg-gray-100 text-gray-600 text-[10px]">{t.category}</span>
              </div>
              <div className="text-xs text-gray-500 mt-1 line-clamp-3 whitespace-pre-wrap">{t.content}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-2">Live Preview</h2>
        <PhoneMockup message={preview?.content || draft.content} />
      </div>
    </div>
  );
}
