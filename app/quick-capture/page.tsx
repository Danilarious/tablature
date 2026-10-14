'use client';

import React, { useState, useEffect, useRef } from 'react';
import FretboardEditor from '@/app/components/FretboardEditor';
import TabGrid, { TabColumn } from '@/app/components/TabGrid';
import AudioRecorder, { CapturedMedia } from '@/app/components/AudioRecorder';
import { Check, AlertCircle, Save, Guitar, Radio, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { fetchJson, uploadAttachmentFile } from '@/app/lib/api/client';
import { buildCapoFrets, CapoMode, pickCompatibleTuningId, tabHasNotes } from '@/app/lib/music/compatibility';
import {
  clearDraft,
  draftHasContent,
  loadDraft,
  QuickCaptureDraft,
  resolveDraftRestore,
  saveDraft,
} from '@/app/lib/drafts/quick-capture-draft';
import { hasUnuploadedMedia, PendingMediaItem, uploadPendingMedia } from '@/app/lib/media/pending-media';

const EMPTY_COLUMNS = (): TabColumn[] => [
  { id: 'c1', notes: [] },
  { id: 'c2', notes: [] },
  { id: 'c3', notes: [] },
  { id: 'c4', notes: [] },
];

function browserStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

interface SavedCapture {
  motif: { id: string; humanId: string; name: string };
  setupReused: boolean;
}

function safePitchArray(raw: unknown): string[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default function QuickCapturePage() {
  const [instruments, setInstruments] = useState<any[]>([]);
  const [tunings, setTunings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected Instrument & Tuning
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string>('');
  const [selectedTuningId, setSelectedTuningId] = useState<string>('');

  // Capo selection (canonical per-string frets; index 0 = bass-side string)
  const [capoType, setCapoType] = useState<CapoMode>('none');
  const [fullCapoFret, setFullCapoFret] = useState<number>(2);
  const [customCapoFrets, setCustomCapoFrets] = useState<(number | null)[]>([]);

  // Motif / Idea details
  const [motifName, setMotifName] = useState<string>('');
  const [motifFunction, setMotifFunction] = useState<string>('riff');
  const [motifTags, setMotifTags] = useState<string>('');
  const [motifNotes, setMotifNotes] = useState<string>('');

  // Tab & Fretboard state
  const [tabColumns, setTabColumns] = useState<TabColumn[]>(EMPTY_COLUMNS);
  const [activeColumnIndex, setActiveColumnIndex] = useState<number>(0);

  // Saved result feedback
  const [savedCapture, setSavedCapture] = useState<SavedCapture | null>(null);
  const savedMotif = savedCapture?.motif ?? null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Media recorded/selected before the motif exists; uploaded only against the real motif ID.
  const [pendingMedia, setPendingMedia] = useState<PendingMediaItem[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Draft recovery (localStorage). Autosave starts only after the initial restore attempt.
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftNotice, setDraftNotice] = useState<{ savedAt: number; warnings: string[] } | null>(null);
  const lastPersistedDraft = useRef<string | null>(null);

  // Initial load
  useEffect(() => {
    async function loadData() {
      try {
        const [instData, tunData] = await Promise.all([
          fetchJson<any[]>('/api/instruments'),
          fetchJson<any[]>('/api/tunings'),
        ]);

        setInstruments(instData);
        setTunings(tunData);

        if (instData.length > 0) {
          setSelectedInstrumentId(instData[0].id);
          setSelectedTuningId(pickCompatibleTuningId(tunData, instData[0].stringCount, null));
        }

        // Restore an unsaved draft, mapped onto instruments/tunings that exist now.
        const draft = loadDraft(browserStorage());
        const plan = draft ? resolveDraftRestore(draft, instData, tunData) : null;
        if (draft && plan) {
          setSelectedInstrumentId(plan.instrumentId);
          setSelectedTuningId(plan.tuningId);
          setCapoType(draft.capoMode === 'custom' && plan.customCapoFrets.length === 0 ? 'none' : draft.capoMode);
          setFullCapoFret(draft.capoFret);
          setCustomCapoFrets(plan.customCapoFrets);
          if (plan.tabColumns && plan.tabColumns.length > 0) {
            setTabColumns(plan.tabColumns as TabColumn[]);
            setActiveColumnIndex(Math.min(draft.activeColumnIndex, plan.tabColumns.length - 1));
          }
          setMotifName(draft.title);
          setMotifFunction(draft.motifFunction);
          setMotifTags(draft.tags);
          setMotifNotes(draft.notes);
          setDraftNotice({ savedAt: draft.savedAt, warnings: plan.warnings });
          // If anything could not be restored, leave the stored draft untouched until the user acts.
          lastPersistedDraft.current = plan.warnings.length > 0 ? 'locked' : null;
        }
      } catch (err) {
        setError(`Failed to load initial data: ${err instanceof Error ? err.message : 'unknown error'}`);
      } finally {
        setDraftHydrated(true);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const currentInstrument = instruments.find(i => i.id === selectedInstrumentId);
  const stringCount: number = currentInstrument?.stringCount || 6;
  // Only a tuning whose string count matches the instrument is ever treated as selected.
  const currentTuning = tunings.find(t => t.id === selectedTuningId && t.stringCount === stringCount);
  const tuningPitches = safePitchArray(currentTuning?.pitches);
  const rawPitches = tuningPitches.length === stringCount ? tuningPitches : Array(stringCount).fill('?');

  const handleInstrumentChange = (instrumentId: string) => {
    const nextInst = instruments.find(i => i.id === instrumentId);
    if (!nextInst) return;
    if (nextInst.stringCount !== stringCount && tabHasNotes(tabColumns)) {
      const ok = window.confirm(
        `Switching to a ${nextInst.stringCount}-string instrument clears the TAB entered for ${stringCount} strings (string indexes would no longer refer to the same physical strings). Continue?`
      );
      if (!ok) return;
      setTabColumns(tabColumns.map(c => ({ ...c, notes: [] })));
    }
    setSelectedInstrumentId(instrumentId);
    setSelectedTuningId(pickCompatibleTuningId(tunings, nextInst.stringCount, selectedTuningId));
  };

  // Calculate effective capo frets array
  const effectiveCapoFrets: (number | null)[] = buildCapoFrets(capoType, stringCount, fullCapoFret, customCapoFrets);

  const currentDraft: QuickCaptureDraft = {
    version: 1,
    savedAt: 0,
    instrumentId: selectedInstrumentId,
    tuningId: currentTuning?.id ?? '',
    capoMode: capoType,
    capoFret: fullCapoFret,
    customCapoFrets,
    tabColumns,
    activeColumnIndex,
    title: motifName,
    motifFunction,
    tags: motifTags,
    notes: motifNotes,
  };
  const draftKey = JSON.stringify({ ...currentDraft, savedAt: 0 });
  const hasUnsavedDraft = !savedCapture && draftHasContent(currentDraft);

  // Debounced autosave of the unsaved draft. Never clears; only save/discard clear it.
  useEffect(() => {
    if (!draftHydrated || savedCapture) return;
    if (lastPersistedDraft.current === 'locked') {
      // A partially-restorable draft stays untouched until the user edits something.
      lastPersistedDraft.current = draftKey;
      return;
    }
    if (lastPersistedDraft.current === draftKey) return;
    const handle = window.setTimeout(() => {
      if (saveDraft(browserStorage(), { ...(JSON.parse(draftKey) as QuickCaptureDraft), savedAt: Date.now() })) {
        lastPersistedDraft.current = draftKey;
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [draftKey, draftHydrated, savedCapture]);

  // Warn before leaving with unsaved work or media that has not reached the server.
  const needsLeaveWarning = hasUnsavedDraft || hasUnuploadedMedia(pendingMedia);
  useEffect(() => {
    if (!needsLeaveWarning) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [needsLeaveWarning]);

  const handleCapturedMedia = (media: CapturedMedia) => {
    setPendingMedia((prev) => [
      ...prev,
      { localId: `pm-${Date.now()}-${prev.length}`, blob: media.blob, filename: media.filename, description: media.description, status: 'pending' },
    ]);
  };

  const uploadMediaFor = async (motifId: string, items: PendingMediaItem[]) => {
    if (items.length === 0) return;
    setUploadingMedia(true);
    try {
      const result = await uploadPendingMedia(
        items,
        { parentType: 'motif', parentId: motifId },
        (item, target) => uploadAttachmentFile(item.blob, item.filename, target.parentType, target.parentId, item.description),
        setPendingMedia
      );
      setPendingMedia(result);
    } finally {
      setUploadingMedia(false);
    }
  };

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
    if (savedCapture) return; // already saved; use "Capture Next Idea" to start another
    if (!selectedInstrumentId || !currentTuning) {
      setError(`Please select an instrument and a ${stringCount}-string tuning.`);
      return;
    }

    setSaving(true);
    setError(null);

    let saved: SavedCapture;
    try {
      // One server-side SQLite transaction creates/reuses the capo + setup and inserts the motif.
      const tagArray = motifTags.split(',').map((t) => t.trim()).filter(Boolean);
      saved = await fetchJson<SavedCapture>('/api/quick-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrumentId: selectedInstrumentId,
          tuningId: currentTuning.id,
          capoFrets: capoType === 'none' ? null : effectiveCapoFrets,
          motif: {
            name: motifName.trim() || 'Untitled Quick Capture Idea',
            function: motifFunction,
            tabData: tabColumns,
            tags: tagArray.length > 0 ? tagArray : ['Quick Capture', 'Inbox'],
            notes: motifNotes.trim() || 'Captured via Quick Capture mobile/desktop interface.',
          },
        }),
      });
    } catch (err) {
      // Nothing was written; the draft and any pending media are kept.
      setError(`Save failed — nothing was saved and your draft is kept: ${err instanceof Error ? err.message : 'unknown error'}`);
      setSaving(false);
      return;
    }

    setSavedCapture(saved);
    clearDraft(browserStorage());
    lastPersistedDraft.current = null;
    setDraftNotice(null);
    setSaving(false);
    await uploadMediaFor(saved.motif.id, pendingMedia);
  };

  const handleRetryMedia = async () => {
    if (!savedMotif) return;
    await uploadMediaFor(savedMotif.id, pendingMedia);
  };

  const handleDiscardDraft = () => {
    if (!window.confirm('Discard this unsaved Quick Capture draft (TAB, title, tags, notes and kept recordings)?')) return;
    clearDraft(browserStorage());
    lastPersistedDraft.current = null;
    setDraftNotice(null);
    resetCaptureFields();
    setPendingMedia([]);
  };

  const resetCaptureFields = () => {
    setMotifName('');
    setMotifNotes('');
    setMotifTags('');
    setTabColumns(EMPTY_COLUMNS());
    setActiveColumnIndex(0);
  };

  const handleStartNewCapture = () => {
    if (hasUnuploadedMedia(pendingMedia)) {
      const ok = window.confirm('Some media has not been attached to the saved idea yet. Starting a new capture will drop it. Continue?');
      if (!ok) return;
    }
    setSavedCapture(null);
    setPendingMedia([]);
    resetCaptureFields();
  };

  const failedMedia = pendingMedia.filter((m) => m.status === 'failed');

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
            disabled={saving || !!savedCapture}
            onClick={handleSaveCapture}
            className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-stone-50 font-mono text-xs font-bold rounded shadow hover:bg-stone-800 disabled:opacity-50 transition-all"
          >
            <Save className="w-4 h-4 text-editorial-amber" />
            <span>{saving ? 'SAVING...' : 'SAVE TO INBOX'}</span>
          </button>
        </div>
      </div>

      {/* Restored draft banner */}
      {draftNotice && !savedCapture && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-mono text-amber-900">
          <div className="flex items-start gap-2">
            <RotateCcw className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <div>Restored unsaved draft from {new Date(draftNotice.savedAt).toLocaleString()}.</div>
              {draftNotice.warnings.map((w) => (
                <div key={w} className="text-amber-800">{w}</div>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={handleDiscardDraft}
            className="flex items-center gap-1 px-2.5 py-1 border border-amber-400 bg-white rounded hover:bg-amber-100"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Discard draft
          </button>
        </div>
      )}

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

      {/* Pending / failed media status (motif is already saved when uploads run) */}
      {pendingMedia.length > 0 && (
        <div className="p-3 bg-paper-100 border border-stone-300 rounded text-xs font-mono text-stone-800 space-y-1.5">
          <div className="font-bold tracking-wider uppercase text-stone-900">
            {savedMotif ? 'Media for ' + savedMotif.humanId : 'Media kept — attached when the idea is saved'}
          </div>
          {pendingMedia.map((m) => (
            <div key={m.localId} className="flex items-center justify-between gap-2">
              <span className="truncate">{m.filename}</span>
              <span className={m.status === 'failed' ? 'text-red-700' : m.status === 'uploaded' ? 'text-emerald-700' : 'text-stone-500'}>
                {m.status === 'failed' ? `failed: ${m.error ?? 'unknown error'}` : m.status}
              </span>
              {!savedMotif && (
                <button
                  type="button"
                  onClick={() => setPendingMedia((prev) => prev.filter((p) => p.localId !== m.localId))}
                  className="text-stone-500 hover:text-stone-900"
                >
                  remove
                </button>
              )}
            </div>
          ))}
          {savedMotif && failedMedia.length > 0 && (
            <div className="flex items-center justify-between gap-2 pt-1 text-red-800">
              <span>The idea is saved, but {failedMedia.length} file(s) could not be attached. They are still held here.</span>
              <button
                type="button"
                disabled={uploadingMedia}
                onClick={handleRetryMedia}
                className="px-2.5 py-1 bg-stone-900 text-white rounded font-bold hover:bg-stone-800 disabled:opacity-50"
              >
                {uploadingMedia ? 'RETRYING...' : 'RETRY'}
              </button>
            </div>
          )}
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
            onChange={(e) => handleInstrumentChange(e.target.value)}
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
            value={currentTuning ? selectedTuningId : ''}
            onChange={(e) => setSelectedTuningId(e.target.value)}
            className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 text-xs text-stone-900 focus:outline-none focus:border-stone-800"
          >
            {!currentTuning && <option value="">— No {stringCount}-string tuning selected —</option>}
            {tunings
              .filter((t) => t.stringCount === stringCount)
              .map((tun) => (
                <option key={tun.id} value={tun.id}>
                  {tun.humanId} — {tun.name} ({safePitchArray(tun.pitches).join(' ')})
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
              onChange={(e) => setCapoType(e.target.value as CapoMode)}
              className="flex-1 bg-white border border-stone-300 rounded px-2.5 py-1.5 text-xs text-stone-900"
            >
              <option value="none">Open (No Capo)</option>
              <option value="full">Full Capo</option>
              <option value="partial-skip-bass">Partial: all but bass-side string (S{stringCount} open)</option>
            </select>
            {(capoType === 'full' || capoType === 'partial-skip-bass') && (
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
          {savedMotif ? (
            // After saving, new recordings attach directly to the real motif.
            <AudioRecorder parentType="motif" parentId={savedMotif.id} />
          ) : (
            // Before saving, recordings stay pending in the browser until the motif exists.
            <AudioRecorder parentType="motif" onCapture={handleCapturedMedia} />
          )}
        </div>
      </div>
    </div>
  );
}
