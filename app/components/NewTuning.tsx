'use client';
import { useState } from 'react';
import { isValidPitch } from '@/app/lib/music/pitch';
import { fetchJson } from '@/app/lib/api/client';
export default function NewTuning({ instrument, pitches, onCreated }: { instrument: { name: string; stringCount: number }; pitches: string[]; onCreated: (tuning: any) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [values, setValues] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <><button type="button" className="underline" onClick={() => { setValues(pitches.join(' ')); setName(''); setError(''); setOpen(true); }}>New tuning / Edit pitches</button>
    {open && <div role="dialog" aria-modal="true" aria-label="New tuning" className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white p-6 rounded space-y-3 w-full max-w-lg">
      <h2 className="font-bold">New tuning · {instrument.name} · {instrument.stringCount} strings</h2>
      <label className="block">Tuning name <input className="border w-full p-2" value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block">Pitches, bass side to treble side <input className="border w-full p-2" value={values} onChange={e => setValues(e.target.value)} /></label>
      <p>Enter one scientific pitch per string (E2, F#3, Bb3). Changed pitches are saved as a new named tuning.</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} className="border p-2" onClick={async () => {
        const notes = values.trim().split(/[\s,]+/);
        if (!name.trim() || notes.length !== instrument.stringCount || !notes.every(isValidPitch)) { setError(`Name required, with exactly ${instrument.stringCount} valid pitches.`); return; }
        setBusy(true); setError('');
        try { const tuning = await fetchJson('/api/tunings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), stringCount: instrument.stringCount, pitches: notes }) }); onCreated(tuning); setOpen(false); }
        catch (e) { setError(e instanceof Error ? e.message : 'Tuning failed'); } finally { setBusy(false); }
      }}>Save as new named tuning</button> <button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
    </div></div>}
  </>;
}
