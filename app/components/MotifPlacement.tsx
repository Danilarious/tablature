'use client';
import { useEffect, useState } from 'react';
import { fetchJson } from '@/app/lib/api/client';

export default function MotifPlacement({ motifId, onPlaced }: { motifId: string; onPlaced?: () => void }) {
  const [open, setOpen] = useState(false);
  const [compositions, setCompositions] = useState<any[]>([]);
  const [kind, setKind] = useState('existing');
  const [compositionId, setCompositionId] = useState('');
  const [title, setTitle] = useState('');
  const [section, setSection] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) fetchJson<any[]>('/api/compositions').then(rows => { setCompositions(rows); setCompositionId(rows[0]?.id || ''); }).catch(e => setError(e.message)); }, [open]);
  const selected = compositions.find(c => c.id === compositionId);
  return <div className="text-xs space-y-2 print:hidden">
    <button className="underline font-bold" onClick={() => setOpen(!open)}>Add to composition / Create composition from motif</button>
    {open && <form className="border p-3 space-y-2 bg-white" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('');
      try {
        const comp = await fetchJson<any>(`/api/motifs/${motifId}/composition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kind === 'new' ? { kind, title, sectionName: section } : { kind, compositionId, sectionName: section }) });
        setOpen(false); onPlaced?.(); window.location.href = `/compositions#composition-${comp.id}`;
      } catch (e) { setError(e instanceof Error ? e.message : 'Placement failed'); } finally { setBusy(false); }
    }}>
      <label className="block">Destination <select value={kind} onChange={e => setKind(e.target.value)}><option value="existing">Add to Existing Composition</option><option value="new">Create a New Composition</option></select></label>
      {kind === 'existing' ? <label className="block">Composition <select required value={compositionId} onChange={e => setCompositionId(e.target.value)}><option value="">Choose composition</option>{compositions.map(c => <option key={c.id} value={c.id}>{c.humanId} · {c.title}</option>)}</select></label> : <label className="block">New composition title <input required maxLength={300} value={title} onChange={e => setTitle(e.target.value)} /></label>}
      <label className="block">Section <input list={`sections-${motifId}`} placeholder="Choose or name a section" maxLength={200} value={section} onChange={e => setSection(e.target.value)} /></label>
      <datalist id={`sections-${motifId}`}>{(selected?.sections ? JSON.parse(selected.sections) : []).map((s: any) => <option key={s.id} value={s.name} />)}</datalist>
      <p>{error}</p><button disabled={busy} className="border p-2">{busy ? 'Saving...' : 'Place motif'}</button>
    </form>}
  </div>;
}
