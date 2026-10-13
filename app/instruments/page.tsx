'use client';

import React, { useState, useEffect } from 'react';
import { Guitar, Plus, AlertTriangle, Check, X, Sliders, Pencil } from 'lucide-react';
import Link from 'next/link';

export default function InstrumentsPage() {
  const [instruments, setInstruments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal create/edit state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [maker, setMaker] = useState('');
  const [model, setModel] = useState('');
  const [family, setFamily] = useState('steel_string_acoustic');
  const [stringCount, setStringCount] = useState(6);
  const [defaultScaleLength, setDefaultScaleLength] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchInstruments = async () => {
    try {
      const res = await fetch('/api/instruments');
      const data = await res.json();
      setInstruments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstruments();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setName('');
    setMaker('');
    setModel('');
    setFamily('steel_string_acoustic');
    setStringCount(6);
    setDefaultScaleLength('');
    setNotes('');
    setShowModal(true);
  };

  const openEditModal = (inst: any) => {
    setEditingId(inst.id);
    setName(inst.name || '');
    setMaker(inst.maker || '');
    setModel(inst.model || '');
    setFamily(inst.family || 'steel_string_acoustic');
    setStringCount(inst.stringCount || 6);
    setDefaultScaleLength(inst.defaultScaleLength !== null && inst.defaultScaleLength !== undefined ? inst.defaultScaleLength : '');
    setNotes(inst.notes || '');
    setShowModal(true);
  };

  const handleSaveInstrument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      const payload = {
        id: editingId || undefined,
        name: name.trim(),
        maker: maker.trim() || null,
        model: model.trim() || null,
        family,
        stringCount,
        defaultScaleLength: defaultScaleLength !== '' ? defaultScaleLength : null,
        notes: notes.trim() || null,
      };

      const res = await fetch('/api/instruments', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowModal(false);
        setEditingId(null);
        setName('');
        setMaker('');
        setModel('');
        setDefaultScaleLength('');
        setNotes('');
        await fetchInstruments();
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
            <Guitar className="w-4 h-4 text-stone-900" />
            <h1 className="font-mono text-sm tracking-widest uppercase font-bold text-stone-900">
              INSTRUMENTS & HARDWARE
            </h1>
          </div>
          <p className="text-xs text-stone-500 font-serif italic mt-0.5">
            Primary speaking scale lengths, string count, and physical hardware records. Incomplete specifications clearly flagged.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-stone-50 font-mono text-xs font-bold rounded hover:bg-stone-800 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>ADD INSTRUMENT</span>
        </button>
      </div>

      {/* Instruments Grid */}
      {loading ? (
        <div className="p-8 text-center font-mono text-sm text-stone-500">Loading instruments...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {instruments.map((inst) => {
            return (
              <div
                key={inst.id}
                className="border border-stone-300 bg-white p-5 rounded hover:border-stone-800 transition-colors shadow-sm flex flex-col justify-between font-mono text-xs space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-stone-200 text-[11px]">
                    <span className="text-stone-500 uppercase tracking-wider">
                      {inst.family.replace(/_/g, ' ')}
                    </span>
                    <span className="font-bold text-stone-900">
                      {inst.stringCount} STRINGS
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-2 mt-2 mb-1">
                    <h3 className="font-serif font-bold text-base text-stone-900">
                      {inst.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => openEditModal(inst)}
                      title="Edit instrument details"
                      className="text-stone-400 hover:text-stone-900 p-1 hover:bg-stone-100 rounded transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1.5 text-stone-700 text-xs my-2">
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">SCALE LENGTH:</span>
                      {inst.defaultScaleLength ? (
                        <span className="font-bold text-stone-900">{inst.defaultScaleLength} inches</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openEditModal(inst)}
                          className="flex items-center gap-1 text-amber-700 font-bold bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 text-[11px] transition-colors"
                          title="Click to edit and add scale length"
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>Incomplete / Unknown (Click to Edit)</span>
                        </button>
                      )}
                    </div>

                    {inst.perStringSpeakingLengths && (
                      <div className="text-[10px] text-stone-500 bg-stone-50 p-1.5 rounded border border-stone-200">
                        Per-string speaking lengths configured (e.g. Banjo 5th string offset).
                      </div>
                    )}

                    {inst.maker && (
                      <div className="flex items-center justify-between">
                        <span className="text-stone-400">MAKER:</span>
                        <span>{inst.maker}</span>
                      </div>
                    )}

                    {inst.model && (
                      <div className="flex items-center justify-between">
                        <span className="text-stone-400">MODEL:</span>
                        <span>{inst.model}</span>
                      </div>
                    )}
                  </div>

                  {inst.notes && (
                    <p className="font-sans text-xs text-stone-500 italic pt-1 border-t border-stone-100">
                      "{inst.notes}"
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-stone-200 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => openEditModal(inst)}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded transition-colors text-[11px]"
                  >
                    <Pencil className="w-3 h-3 text-stone-600" />
                    <span>EDIT</span>
                  </button>

                  <Link
                    href={`/string-lab?instrumentId=${inst.id}`}
                    className="flex items-center gap-1 text-stone-700 hover:text-stone-950 font-semibold text-[11px]"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>STRING LAB TENSION</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for Add / Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-stone-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-stone-300 rounded shadow-2xl max-w-lg w-full p-6 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <span className="font-bold tracking-wider text-stone-900 uppercase">
                {editingId ? 'EDIT INSTRUMENT RECORD' : 'ADD INSTRUMENT RECORD'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setEditingId(null);
                }}
                className="text-stone-400 hover:text-stone-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInstrument} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] text-stone-600 font-bold">NAME / IDENTIFIER</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Santa Cruz OM Custom"
                  className="w-full border border-stone-300 rounded px-2.5 py-1.5 text-xs text-stone-900 focus:outline-none focus:border-stone-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-600 font-bold">MAKER / LUTHIER</label>
                  <input
                    type="text"
                    value={maker}
                    onChange={(e) => setMaker(e.target.value)}
                    placeholder="e.g. Santa Cruz, Guild, etc."
                    className="w-full border border-stone-300 rounded px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-600 font-bold">MODEL</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. Custom 00, Requinto"
                    className="w-full border border-stone-300 rounded px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-600 font-bold">FAMILY</label>
                  <select
                    value={family}
                    onChange={(e) => setFamily(e.target.value)}
                    className="w-full border border-stone-300 rounded px-2 py-1.5 text-xs"
                  >
                    <option value="steel_string_acoustic">Steel String Acoustic</option>
                    <option value="classical">Classical</option>
                    <option value="electric_archtop">Electric Archtop</option>
                    <option value="baritone_acoustic">Baritone Acoustic</option>
                    <option value="banjo">Banjo</option>
                    <option value="resonator">Resonator / Dobro</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-stone-600 font-bold">STRINGS</label>
                  <select
                    value={stringCount}
                    onChange={(e) => setStringCount(parseInt(e.target.value, 10))}
                    className="w-full border border-stone-300 rounded px-2 py-1.5 text-xs"
                  >
                    <option value={5}>5 Strings</option>
                    <option value={6}>6 Strings</option>
                    <option value={7}>7 Strings</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-stone-600 font-bold">SCALE LENGTH (IN)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={defaultScaleLength}
                    onChange={(e) => setDefaultScaleLength(e.target.value ? parseFloat(e.target.value) : '')}
                    placeholder="e.g. 25.0"
                    className="w-full border border-stone-300 rounded px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-stone-600 font-bold">SETUP / PROVENANCE NOTES</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Physical condition, nut width, action preferences..."
                  className="w-full border border-stone-300 rounded p-2 text-xs font-sans"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingId(null);
                  }}
                  className="px-3 py-1.5 border border-stone-300 rounded text-stone-700 hover:bg-stone-100"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-stone-900 text-stone-50 font-bold rounded hover:bg-stone-800 disabled:opacity-50"
                >
                  {saving ? 'SAVING...' : (editingId ? 'SAVE CHANGES' : 'SAVE RECORD')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
