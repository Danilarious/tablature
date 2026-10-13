'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Radio, Plus, Printer, X, Save } from 'lucide-react';
import { parsePitch } from '@/app/lib/music/pitch';
import { physicalStringNumber } from '@/app/lib/music/string-order';
import { describeApiError } from '@/app/lib/api/client';

function safePitchArray(raw: unknown): string[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default function TuningsPage() {
  const [tunings, setTunings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal create state
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [stringCount, setStringCount] = useState<number>(6);
  const [pitches, setPitches] = useState<string[]>(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  const [tonalCenter, setTonalCenter] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fetchTunings = async () => {
    try {
      const res = await fetch('/api/tunings');
      if (!res.ok) throw new Error(`Failed to load tunings (HTTP ${res.status})`);
      const data = await res.json();
      setTunings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTunings();
  }, []);

  const handleStringCountChange = (count: number) => {
    setStringCount(count);
    if (count === 5) {
      // 5-string banjo, canonical physical order: [5th (short, reentrant G4), 4th, 3rd, 2nd, 1st]
      setPitches(['G4', 'D3', 'G3', 'B3', 'D4']);
    } else if (count === 7) {
      // 7-string guitar default
      setPitches(['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    } else {
      // 6-string guitar default
      setPitches(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    }
  };

  const handleCreateTuning = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Validate pitches
    for (let i = 0; i < pitches.length; i++) {
      const parsed = parsePitch(pitches[i]);
      if (!parsed) {
        setValidationError(`Invalid pitch on String ${physicalStringNumber(i, pitches.length)}: "${pitches[i]}". Use format like E2, A2, D3, F#3.`);
        return;
      }
    }

    setSaving(true);
    try {
      const tagArray = tags.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await fetch('/api/tunings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          stringCount,
          pitches,
          tonalCenter: tonalCenter.trim() || null,
          tags: tagArray,
          notes: notes.trim() || null,
        }),
      });

      if (res.ok) {
        setShowModal(false);
        setName('');
        setTonalCenter('');
        setTags('');
        setNotes('');
        await fetchTunings();
      } else {
        const body = await res.json().catch(() => null);
        setValidationError(describeApiError(body, res.status));
      }
    } catch (err) {
      console.error(err);
      setValidationError('Save failed: could not reach the local server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-stone-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-stone-900" />
            <h1 className="font-mono text-sm tracking-widest uppercase font-bold text-stone-900">
              TUNINGS ARCHIVE
            </h1>
          </div>
          <p className="text-xs text-stone-500 font-serif italic mt-0.5">
            T-### identifiers, reentrant configurations, and discoveries across 5, 6, and 7 strings.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-stone-50 font-mono text-xs font-bold rounded hover:bg-stone-800 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>NEW TUNING (T-###)</span>
        </button>
      </div>

      {/* Grid of Tunings */}
      {loading ? (
        <div className="p-8 text-center font-mono text-sm text-stone-500">Loading tunings...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tunings.map((tun) => {
            const pitchArr: string[] = safePitchArray(tun.pitches);

            return (
              <div
                key={tun.id}
                className="border border-stone-300 bg-white p-5 rounded hover:border-stone-800 transition-colors shadow-sm flex flex-col justify-between font-mono text-xs space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-stone-200 text-[11px]">
                    <span className="font-bold text-stone-900 px-2 py-0.5 bg-stone-100 border border-stone-300 rounded">
                      {tun.humanId}
                    </span>
                    <span className="text-stone-500">{tun.stringCount} STRINGS</span>
                  </div>

                  <h3 className="font-serif font-bold text-base text-stone-900 mt-2 mb-1">
                    {tun.name}
                  </h3>

                  {/* Pitches Box */}
                  <div className="bg-stone-50 border border-stone-200 p-2.5 rounded my-2 flex items-center justify-between">
                    <span className="text-stone-400 text-[10px] uppercase font-bold" title="Listed bass-side string first">PITCHES (BASS→TREBLE)</span>
                    <span className="font-bold text-sm tracking-wider text-stone-950 font-mono">
                      {pitchArr.join('  ')}
                    </span>
                  </div>

                  {tun.tonalCenter && (
                    <div className="text-[11px] text-stone-600 mb-1">
                      <span className="text-stone-400">HOME:</span> {tun.tonalCenter}
                    </div>
                  )}

                  {tun.notes && (
                    <p className="font-sans text-xs text-stone-500 line-clamp-3 italic pt-1">
                      "{tun.notes}"
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-stone-200 flex items-center justify-between text-xs">
                  <Link
                    href={`/print/tuning/${tun.id}`}
                    className="flex items-center gap-1 text-stone-700 hover:text-stone-950 font-semibold"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>PRINT RECORD</span>
                  </Link>
                  <a
                    href={`/api/export?type=tuning&id=${tun.id}`}
                    className="text-stone-400 hover:text-stone-800 text-[10px]"
                  >
                    JSON
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-stone-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-stone-300 rounded shadow-2xl max-w-lg w-full p-6 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <span className="font-bold tracking-wider text-stone-900 uppercase">
                ADD NEW TUNING RECORD (T-###)
              </span>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-stone-400 hover:text-stone-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {validationError && (
              <div className="p-2 bg-red-50 border border-red-300 rounded text-red-800 text-[11px]">
                {validationError}
              </div>
            )}

            <form onSubmit={handleCreateTuning} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] text-stone-600 font-bold">TUNING NAME</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Open C Baritone or DADGAD"
                  className="w-full border border-stone-300 rounded px-2.5 py-1.5 text-xs text-stone-900 focus:outline-none focus:border-stone-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-600 font-bold">STRING COUNT</label>
                  <select
                    value={stringCount}
                    onChange={(e) => handleStringCountChange(parseInt(e.target.value, 10))}
                    className="w-full border border-stone-300 rounded px-2 py-1.5 text-xs"
                  >
                    <option value={5}>5 Strings (e.g. Banjo)</option>
                    <option value={6}>6 Strings (Guitar / Baritone)</option>
                    <option value={7}>7 Strings (7-String Extended)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-stone-600 font-bold">TONAL CENTER / HOME</label>
                  <input
                    type="text"
                    value={tonalCenter}
                    onChange={(e) => setTonalCenter(e.target.value)}
                    placeholder="e.g. D Modal"
                    className="w-full border border-stone-300 rounded px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>

              {/* String Pitch Inputs */}
              <div className="space-y-1">
                <label className="text-[11px] text-stone-600 font-bold">
                  PITCHES — BASS-SIDE STRING FIRST → TREBLE-SIDE (scientific pitch: E2, A2, ...)
                </label>
                <p className="text-[10px] text-stone-400">
                  Enter strings in physical order across the neck. Reentrant strings (e.g. banjo short 5th = G4) keep their physical position.
                </p>
                <div className="grid grid-cols-6 sm:grid-cols-7 gap-2">
                  {pitches.map((p, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                      <span className="text-[10px] text-stone-400 mb-0.5">S{physicalStringNumber(idx, pitches.length)}</span>
                      <input
                        type="text"
                        required
                        value={p}
                        onChange={(e) => {
                          const next = [...pitches];
                          next[idx] = e.target.value.trim();
                          setPitches(next);
                        }}
                        className="w-full text-center border border-stone-300 rounded py-1 text-xs font-bold text-stone-900 focus:outline-none focus:border-stone-800"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-stone-600 font-bold">TAGS</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Modal, Celtic, Open, Baritone"
                  className="w-full border border-stone-300 rounded px-2.5 py-1.5 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-stone-600 font-bold">HARMONIC DISCOVERY NOTES</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Practical characteristics, sympathetic drones, chord shapes discovered..."
                  className="w-full border border-stone-300 rounded p-2 text-xs font-sans"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 border border-stone-300 rounded text-stone-700 hover:bg-stone-100"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-stone-900 text-stone-50 font-bold rounded hover:bg-stone-800 disabled:opacity-50"
                >
                  {saving ? 'SAVING...' : 'SAVE TUNING'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
