'use client';

import React, { useState, useEffect } from 'react';
import FretboardEditor from '@/app/components/FretboardEditor';
import TabGrid, { TabColumn } from '@/app/components/TabGrid';
import AudioRecorder from '@/app/components/AudioRecorder';
import { Zap, Check, AlertCircle, Save, Plus, ArrowRight, Guitar, Radio } from 'lucide-react';
import Link from 'next/link';

export default function QuickCapturePage() {
  const [instruments, setInstruments] = useState<any[]>([]);
  const [tunings, setTunings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected Instrument & Tuning
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string>('');
  const [selectedTuningId, setSelectedTuningId] = useState<string>('');

  // Capo selection: 'none' | 'full-2' | 'custom'
  const [capoType, setCapoType] = useState<string>('none');
  const [fullCapoFret, setFullCapoFret] = useState<number>(2);
  const [customCapoFrets, setCustomCapoFrets] = useState<(number | null)[]>([]);

  // Motif / Idea details
  const [motifName, setMotifName] = useState<string>('');
  const [motifFunction, setMotifFunction] = useState<string>('riff');
  const [motifTags, setMotifTags] = useState<string>('');
  const [motifNotes, setMotifNotes] = useState<string>('');

  // Tab & Fretboard state
  const [tabColumns, setTabColumns] = useState<TabColumn[]>([
    { id: 'c1', notes: [] },
    { id: 'c2', notes: [] },
    { id: 'c3', notes: [] },
    { id: 'c4', notes: [] },
  ]);
  const [activeColumnIndex, setActiveColumnIndex] = useState<number>(0);

  // Saved result feedback
  const [savedMotif, setSavedMotif] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    async function loadData() {
      try {
        const [instRes, tunRes] = await Promise.all([
          fetch('/api/instruments'),
          fetch('/api/tunings'),
        ]);
        const instData = await instRes.json();
        const tunData = await tunRes.json();

        setInstruments(instData);
        setTunings(tunData);

        if (instData.length > 0) {
          setSelectedInstrumentId(instData[0].id);
        }
        if (tunData.length > 0) {
          setSelectedTuningId(tunData[0].id);
        }
      } catch (err: any) {
        setError('Failed to load initial data.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const currentInstrument = instruments.find(i => i.id === selectedInstrumentId);
  const currentTuning = tunings.find(t => t.id === selectedTuningId);

  const stringCount = currentInstrument?.stringCount || currentTuning?.stringCount || 6;
  const rawPitches = currentTuning?.pitches ? JSON.parse(currentTuning.pitches) : ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];

  // Calculate effective capo frets array
  const effectiveCapoFrets: (number | null)[] = (() => {
    if (capoType === 'none') {
      return Array(stringCount).fill(null);
    }
    if (capoType === 'full') {
      return Array(stringCount).fill(fullCapoFret);
    }
    if (capoType === 'drop-d') {
      // Partial capo on strings 1 to 5 (leaving 6th low string open)
      return Array.from({ length: stringCount }, (_, i) => (i === 0 ? null : 2));
    }
    return customCapoFrets.length === stringCount ? customCapoFrets : Array(stringCount).fill(null);
  })();

  // Synchronized click on fretboard: toggles note in active TAB column
  const handleFretboardNoteClick = (strIdx: number, fret: number) => {
    const activeCol = tabColumns[activeColumnIndex];
    if (!activeCol) return;

    let newNotes = [...activeCol.notes];
    const existingIdx = newNotes.findIndex(n => n.stringIndex === strIdx);

    if (existingIdx !== -1) {
      if (newNotes[existingIdx].fret === fret) {
        // Toggle off
        newNotes.splice(existingIdx, 1);
      } else {
        // Update fret
        newNotes[existingIdx] = { stringIndex: strIdx, fret };
      }
    } else {
      // Add note
      newNotes.push({ stringIndex: strIdx, fret });
    }

    const updatedCols = [...tabColumns];
    updatedCols[activeColumnIndex] = { ...activeCol, notes: newNotes };
    setTabColumns(updatedCols);
  };

  const handleSaveCapture = async () => {
    if (!selectedInstrumentId || !selectedTuningId) {
      setError('Please select an instrument and tuning.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Create Capo record if capo is active
      let capoConfigId = null;
      if (capoType !== 'none') {
        const capoRes = await fetch('/api/capos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: capoType === 'full' ? `Full Capo Fret ${fullCapoFret}` : 'Partial Capo',
            type: capoType,
            stringFrets: effectiveCapoFrets,
          }),
        });
        const capoData = await capoRes.json();
        capoConfigId = capoData.id;
      }

      // 2. Create physical Setup snapshot
      const setupRes = await fetch('/api/setups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrumentId: selectedInstrumentId,
          tuningId: selectedTuningId,
          capoConfigId,
          name: `${currentInstrument?.name} in ${currentTuning?.name} (${capoType !== 'none' ? 'Capo' : 'Open'})`,
        }),
      });
      const setupData = await setupRes.json();

      // 3. Create Motif record
      const tagArray = motifTags.split(',').map(t => t.trim()).filter(Boolean);
      const motifRes = await fetch('/api/motifs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: motifName.trim() || 'Untitled Quick Capture Idea',
          setupId: setupData.id,
          tuningId: selectedTuningId,
          instrumentId: selectedInstrumentId,
          function: motifFunction,
          tabData: tabColumns,
          tags: tagArray.length > 0 ? tagArray : ['Quick Capture', 'Inbox'],
          notes: motifNotes.trim() || 'Captured via Quick Capture mobile/desktop interface.',
        }),
      });

      const motifData = await motifRes.json();
      setSavedMotif(motifData);
    } catch (err: any) {
      setError(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleStartNewCapture = () => {
    setSavedMotif(null);
    setMotifName('');
    setMotifNotes('');
    setMotifTags('');
    setTabColumns([
      { id: 'c1', notes: [] },
      { id: 'c2', notes: [] },
      { id: 'c3', notes: [] },
      { id: 'c4', notes: [] },
    ]);
    setActiveColumnIndex(0);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 font-mono text-sm text-stone-600">
        Loading Quick Capture environment...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner & Mode indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-stone-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-editorial-amber rounded-full animate-pulse" />
            <h1 className="font-mono text-sm tracking-widest uppercase font-bold text-stone-900">
              QUICK CAPTURE WORKFLOW
            </h1>
          </div>
          <p className="text-xs text-stone-500 font-serif italic mt-0.5">
            Low-friction capture for instrument in hand. Incomplete ideas safely enter the Archive Inbox.
          </p>
        </div>

        {/* Quick Save Trigger */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveCapture}
            className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-stone-50 font-mono text-xs font-bold rounded shadow hover:bg-stone-800 disabled:opacity-50 transition-all"
          >
            <Save className="w-4 h-4 text-editorial-amber" />
            <span>{saving ? 'SAVING...' : 'SAVE TO INBOX'}</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {savedMotif && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono text-emerald-900">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <div>
              <span className="font-bold">{savedMotif.humanId} ({savedMotif.name})</span> saved to archive!
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/print/motif/${savedMotif.id}`}
              className="underline text-emerald-800 hover:text-emerald-950 font-semibold"
            >
              Print Record
            </Link>
            <button
              type="button"
              onClick={handleStartNewCapture}
              className="px-2.5 py-1 bg-emerald-800 text-white rounded font-bold hover:bg-emerald-900"
            >
              Capture Next Idea
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-300 rounded flex items-center gap-2 text-xs font-mono text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Physical Setup Bar: Instrument, Tuning, Capo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-paper-100 border border-stone-300 rounded font-mono text-xs">
        {/* Instrument Selector */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold tracking-wider text-stone-600 uppercase flex items-center gap-1.5">
            <Guitar className="w-3.5 h-3.5" />
            <span>1. INSTRUMENT</span>
          </label>
          <select
            value={selectedInstrumentId}
            onChange={(e) => setSelectedInstrumentId(e.target.value)}
            className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 text-xs text-stone-900 focus:outline-none focus:border-stone-800"
          >
            {instruments.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name} ({inst.stringCount}-Str{inst.defaultScaleLength ? `, ${inst.defaultScaleLength}"` : ''})
              </option>
            ))}
          </select>
        </div>

        {/* Tuning Selector */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold tracking-wider text-stone-600 uppercase flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5" />
            <span>2. TUNING</span>
          </label>
          <select
            value={selectedTuningId}
            onChange={(e) => setSelectedTuningId(e.target.value)}
            className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 text-xs text-stone-900 focus:outline-none focus:border-stone-800"
          >
            {tunings
              .filter((t) => t.stringCount === stringCount)
              .map((tun) => (
                <option key={tun.id} value={tun.id}>
                  {tun.humanId} — {tun.name} ({JSON.parse(tun.pitches).join(' ')})
                </option>
              ))}
          </select>
        </div>

        {/* Capo Setup */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold tracking-wider text-stone-600 uppercase">
            3. CAPO CONFIGURATION
          </label>
          <div className="flex items-center gap-2">
            <select
              value={capoType}
              onChange={(e) => setCapoType(e.target.value)}
              className="flex-1 bg-white border border-stone-300 rounded px-2.5 py-1.5 text-xs text-stone-900"
            >
              <option value="none">Open (No Capo)</option>
              <option value="full">Full Capo</option>
              <option value="drop-d">Drop D Partial (Strings 1-5)</option>
            </select>
            {capoType === 'full' && (
              <select
                value={fullCapoFret}
                onChange={(e) => setFullCapoFret(parseInt(e.target.value, 10))}
                className="w-20 bg-white border border-stone-300 rounded px-2 py-1.5 text-xs font-bold"
              >
                {[1, 2, 3, 4, 5, 7].map((f) => (
                  <option key={f} value={f}>
                    Fret {f}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Synchronized TAB and Fretboard Editors */}
      <div className="space-y-4">
        {/* Tab Grid */}
        <TabGrid
          stringCount={stringCount}
          pitches={rawPitches}
          columns={tabColumns}
          activeColumnIndex={activeColumnIndex}
          onSelectColumn={setActiveColumnIndex}
          onUpdateColumn={(idx, col) => {
            const next = [...tabColumns];
            next[idx] = col;
            setTabColumns(next);
          }}
          onAddColumn={() => {
            const next = [...tabColumns, { id: `c-${Date.now()}`, notes: [] }];
            setTabColumns(next);
            setActiveColumnIndex(next.length - 1);
          }}
          onDeleteColumn={(idx) => {
            if (tabColumns.length <= 1) return;
            const next = tabColumns.filter((_, i) => i !== idx);
            setTabColumns(next);
            setActiveColumnIndex(Math.max(0, idx - 1));
          }}
        />

        {/* Interactive Fretboard */}
        <FretboardEditor
          stringCount={stringCount}
          pitches={rawPitches}
          capoFrets={effectiveCapoFrets}
          activeNotes={tabColumns[activeColumnIndex]?.notes || []}
          onNoteClick={handleFretboardNoteClick}
        />
      </div>

      {/* Metadata & Audio Memo Attachment Zone */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Descriptive details */}
        <div className="border border-stone-300 rounded p-4 bg-paper-100 font-mono text-xs space-y-3">
          <div className="font-bold tracking-wider text-stone-900 uppercase">
            IDEA ANNOTATIONS
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-stone-600">WORKING TITLE / LABEL</label>
            <input
              type="text"
              value={motifName}
              onChange={(e) => setMotifName(e.target.value)}
              placeholder="e.g. 6/8 Riff in Open D or Morning Noodle"
              className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 text-xs text-stone-900 focus:outline-none focus:border-stone-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-stone-600">FUNCTION</label>
              <select
                value={motifFunction}
                onChange={(e) => setMotifFunction(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded px-2 py-1.5 text-xs text-stone-900"
              >
                <option value="riff">Riff / Phrase</option>
                <option value="intro">Intro</option>
                <option value="transition">Transition</option>
                <option value="ostinato">Ostinato / Drone</option>
                <option value="ending">Ending</option>
                <option value="texture">Texture / Harmony</option>
                <option value="other">Other / Noodle</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-stone-600">TAGS (COMMA-SEPARATED)</label>
              <input
                type="text"
                value={motifTags}
                onChange={(e) => setMotifTags(e.target.value)}
                placeholder="fingerstyle, slide, modal"
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 text-xs text-stone-900"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-stone-600">PERFORMANCE NOTES</label>
            <textarea
              rows={2}
              value={motifNotes}
              onChange={(e) => setMotifNotes(e.target.value)}
              placeholder="Sympathetic resonance note, thumb pick angle, emotional feel..."
              className="w-full bg-white border border-stone-300 rounded p-2 text-xs text-stone-900 font-sans"
            />
          </div>
        </div>

        {/* Browser Audio Recording Memo */}
        <div>
          <AudioRecorder
            parentType="motif"
            parentId={savedMotif?.id || 'temp-quick-capture'}
            onUploaded={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
