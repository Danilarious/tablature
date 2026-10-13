'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Music, Plus, Printer, Download, Save, X, Layers, Clock } from 'lucide-react';

export default function CompositionsPage() {
  const [compositions, setCompositions] = useState<any[]>([]);
  const [motifs, setMotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / Creator State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('idea');
  const [tonalCenter, setTonalCenter] = useState('');
  const [tempo, setTempo] = useState<number | ''>(90);
  const [pieceMap, setPieceMap] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedMotifIds, setSelectedMotifIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchCompositions = async () => {
    try {
      const [compRes, motRes] = await Promise.all([
        fetch('/api/compositions'),
        fetch('/api/motifs'),
      ]);
      const compData = await compRes.json();
      const motData = await motRes.json();
      setCompositions(compData);
      setMotifs(motData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompositions();
  }, []);

  const handleCreateComposition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    try {
      const res = await fetch('/api/compositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          status,
          tonalCenter: tonalCenter.trim() || null,
          tempo: tempo !== '' ? tempo : null,
          pieceMap: pieceMap.trim() || null,
          notes: notes.trim() || null,
          motifIds: selectedMotifIds,
        }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setTitle('');
        setPieceMap('');
        setNotes('');
        setSelectedMotifIds([]);
        await fetchCompositions();
      }
    } catch (err) {
      console.error(err);
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
            <Music className="w-4 h-4 text-stone-900" />
            <h1 className="font-mono text-sm tracking-widest uppercase font-bold text-stone-900">
              COMPOSITIONS ARCHIVE
            </h1>
          </div>
          <p className="text-xs text-stone-500 font-serif italic mt-0.5">
            Durable master overview records (C-###), piece maps, tonal centers, and multi-instrument arrangements.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-stone-50 font-mono text-xs font-bold rounded hover:bg-stone-800 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>NEW COMPOSITION (C-###)</span>
        </button>
      </div>

      {/* Compositions List */}
      {loading ? (
        <div className="p-8 text-center font-mono text-sm text-stone-500">Loading compositions...</div>
      ) : compositions.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-stone-300 rounded font-mono text-xs text-stone-500">
          No compositions recorded yet. Click "New Composition" above or capture ideas from Quick Capture.
        </div>
      ) : (
        <div className="space-y-4">
          {compositions.map((comp) => (
            <div
              key={comp.id}
              className="border border-stone-300 bg-white rounded p-5 hover:border-stone-800 transition-colors shadow-sm space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-stone-900 px-2 py-0.5 bg-stone-100 border border-stone-300 rounded">
                    {comp.humanId}
                  </span>
                  <h2 className="font-serif font-bold text-lg text-stone-900">
                    {comp.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="px-2 py-0.5 border border-stone-300 rounded text-stone-600 uppercase text-[11px]">
                    {comp.status}
                  </span>
                  <Link
                    href={`/print/composition/${comp.id}`}
                    className="flex items-center gap-1 px-2.5 py-1 bg-stone-100 text-stone-900 border border-stone-300 rounded hover:bg-stone-200"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>PRINT OVERVIEW</span>
                  </Link>
                  <a
                    href={`/api/export?type=composition&id=${comp.id}`}
                    className="p-1 text-stone-500 hover:text-stone-900"
                    title="Export Record JSON"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Core Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs text-stone-700 bg-stone-50 p-3 rounded border border-stone-200">
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase font-bold">TONAL CENTER / HOME</span>
                  <span className="font-bold text-stone-900">{comp.tonalCenter || '—'}</span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase font-bold">TEMPO & FEEL</span>
                  <span className="font-bold text-stone-900">
                    {comp.tempo ? `${comp.tempo} BPM` : 'Rubato'} {comp.tempoNotes ? `(${comp.tempoNotes})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase font-bold">LAST UPDATED</span>
                  <span>{new Date(comp.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Piece Map */}
              {comp.pieceMap && (
                <div className="space-y-1">
                  <span className="font-mono text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                    PIECE MAP (STRUCTURE)
                  </span>
                  <div className="font-mono text-xs text-stone-800 bg-paper-100 border border-stone-300 p-2.5 rounded font-medium">
                    {comp.pieceMap}
                  </div>
                </div>
              )}

              {/* Notes */}
              {comp.notes && (
                <div className="font-sans text-xs text-stone-600 italic">
                  "{comp.notes}"
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-stone-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-stone-300 rounded shadow-2xl max-w-lg w-full p-6 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <span className="font-bold tracking-wider text-stone-900 uppercase">
                CREATE NEW COMPOSITION RECORD
              </span>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-stone-400 hover:text-stone-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateComposition} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] text-stone-600 font-bold">WORKING TITLE</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Canyon Suite in Open D"
                  className="w-full border border-stone-300 rounded px-2.5 py-1.5 text-xs text-stone-900 focus:outline-none focus:border-stone-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-600 font-bold">STATUS</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full border border-stone-300 rounded px-2 py-1.5 text-xs"
                  >
                    <option value="idea">Idea Sketch</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed / Polished</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-600 font-bold">TONAL CENTER / HOME</label>
                  <input
                    type="text"
                    value={tonalCenter}
                    onChange={(e) => setTonalCenter(e.target.value)}
                    placeholder="e.g. D Modal or B Minor"
                    className="w-full border border-stone-300 rounded px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-stone-600 font-bold">TEMPO (BPM)</label>
                <input
                  type="number"
                  value={tempo}
                  onChange={(e) => setTempo(e.target.value ? parseInt(e.target.value, 10) : '')}
                  placeholder="e.g. 96"
                  className="w-full border border-stone-300 rounded px-2.5 py-1.5 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-stone-600 font-bold">PIECE MAP (STRUCTURE)</label>
                <input
                  type="text"
                  value={pieceMap}
                  onChange={(e) => setPieceMap(e.target.value)}
                  placeholder="e.g. Intro -> Section A -> Ostinato Reprise -> Outro"
                  className="w-full border border-stone-300 rounded px-2.5 py-1.5 text-xs"
                />
              </div>

              {/* Link Motifs */}
              {motifs.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-600 font-bold">LINK MOTIFS</label>
                  <div className="max-h-24 overflow-y-auto border border-stone-300 rounded p-2 space-y-1 bg-stone-50">
                    {motifs.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedMotifIds.includes(m.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMotifIds([...selectedMotifIds, m.id]);
                            } else {
                              setSelectedMotifIds(selectedMotifIds.filter((id) => id !== m.id));
                            }
                          }}
                        />
                        <span className="font-bold">{m.humanId}</span>
                        <span className="text-stone-600 truncate">{m.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] text-stone-600 font-bold">JOURNAL NOTES</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Compositional intentions, backstory, performance guidelines..."
                  className="w-full border border-stone-300 rounded p-2 text-xs font-sans"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 border border-stone-300 rounded text-stone-700 hover:bg-stone-100"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-stone-900 text-stone-50 font-bold rounded hover:bg-stone-800 disabled:opacity-50"
                >
                  {saving ? 'SAVING...' : 'SAVE RECORD'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
