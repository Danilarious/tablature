'use client';

import React, { useState, useEffect, useRef } from 'react';
import { compositionSectionOptions } from '@/app/lib/music/composition-sections';
import NewTuning from '@/app/components/NewTuning';
import MotifPlacement from '@/app/components/MotifPlacement';
import { tempoTap } from '@/app/lib/music/tap-tempo';
import FretboardEditor, { FretboardMode, FretboardNote } from '@/app/components/FretboardEditor';
import TabGrid, { TabColumn } from '@/app/components/TabGrid';
import AudioRecorder, { CapturedMedia } from '@/app/components/AudioRecorder';
import { Check, AlertCircle, Save, Guitar, Radio, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { ApiRequestError, fetchJson, uploadAttachmentFile } from '@/app/lib/api/client';
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
  composition: { id: string; humanId: string; title: string } | null;
  setupReused: boolean;
}

type CompositionMode = 'inbox' | 'existing' | 'new';

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
  const [compositions, setCompositions] = useState<any[]>([]);
  const [compositionLoadWarning, setCompositionLoadWarning] = useState<string | null>(null);
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
  const [tempo, setTempo] = useState<number | ''>('');
  const [timeSignature, setTimeSignature] = useState<string>('free');

  // Composition destination can be selected before saving.
  const [compositionMode, setCompositionMode] = useState<CompositionMode>('inbox');
  const [selectedCompositionId, setSelectedCompositionId] = useState<string>('');
  const [newCompositionTitle, setNewCompositionTitle] = useState<string>('');
  const [sectionName, setSectionName] = useState<string>('');

  // TAB event entry and an independent, multi-position fretboard map.
  const [tabColumns, setTabColumns] = useState<TabColumn[]>(EMPTY_COLUMNS);
  const [activeColumnIndex, setActiveColumnIndex] = useState<number>(0);
  const [fretboardMode, setFretboardMode] = useState<FretboardMode>('map');
  const [fretboardMap, setFretboardMap] = useState<FretboardNote[]>([]);
  const tapTimes = useRef<number[]>([]);
  const [tapBpm, setTapBpm] = useState<number | null>(null);
  const [captureConflict, setCaptureConflict] = useState(false);
  const [saveUncertain, setSaveUncertain] = useState(false);
  const [captureId, setCaptureId] = useState('');
  const [mapExtent, setMapExtent] = useState(24);
  const [tapActive, setTapActive] = useState(false);

  // Saved result feedback
  const [savedCapture, setSavedCapture] = useState<SavedCapture | null>(null);
  const savedMotif = savedCapture?.motif ?? null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Media recorded/selected before the motif exists; uploaded only against the real motif ID.
  const [pendingMedia, setPendingMedia] = useState<PendingMediaItem[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [recorderHasTransientMedia, setRecorderHasTransientMedia] = useState(false);
  const [recorderSessionKey, setRecorderSessionKey] = useState(0);

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
        let compData: any[] = [];
        let compositionLoadFailed = false;
        try {
          compData = await fetchJson<any[]>('/api/compositions');
        } catch (compositionError) {
          compositionLoadFailed = true;
          setCompositionLoadWarning(`Compositions could not be loaded. Motif Inbox and New Song remain available: ${compositionError instanceof Error ? compositionError.message : 'unknown error'}`);
        }

        setInstruments(instData);
        setTunings(tunData);
        setCompositions(compData);
        if (compData.length > 0) setSelectedCompositionId(compData[0].id);

        if (instData.length > 0) {
          setSelectedInstrumentId(instData[0].id);
          setSelectedTuningId(pickCompatibleTuningId(tunData, instData[0].stringCount, null));
        }

        // Restore an unsaved draft, mapped onto instruments/tunings that exist now.
        const draft = loadDraft(browserStorage());
        setSaveUncertain(draft?.saveUncertain || false);
        setCaptureId(draft?.captureId || crypto.randomUUID());
        setMapExtent(draft?.mapExtent || 24);
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
          setFretboardMode(draft.fretboardMode);
          setFretboardMap(plan.fretboardMap);
          setTempo(draft.tempo ?? '');
          setTimeSignature(draft.timeSignature);
          const restoreWarnings = [...plan.warnings];
          if (draft.compositionMode === 'existing' && compositionLoadFailed) {
            setCompositionMode('inbox');
            restoreWarnings.push('The saved Existing Song destination could not be restored because compositions are temporarily unavailable.');
          } else {
            setCompositionMode(draft.compositionMode);
          }
          setSelectedCompositionId(draft.compositionId || compData[0]?.id || '');
          setNewCompositionTitle(draft.newCompositionTitle);
          setSectionName(draft.sectionName);
          setMotifName(draft.title);
          setMotifFunction(draft.motifFunction);
          setMotifTags(draft.tags);
          setMotifNotes(draft.notes);
          setDraftNotice({ savedAt: draft.savedAt, warnings: restoreWarnings });
          // If anything could not be restored, leave the stored draft untouched until the user acts.
          lastPersistedDraft.current = restoreWarnings.length > 0 ? 'locked' : null;
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
    if (nextInst.stringCount !== stringCount && (tabHasNotes(tabColumns) || fretboardMap.length > 0)) {
      const ok = window.confirm(
        `Switching to a ${nextInst.stringCount}-string instrument clears the TAB and fretboard map entered for ${stringCount} strings. Continue?`
      );
      if (!ok) return;
      setTabColumns(tabColumns.map(c => ({ ...c, notes: [] })));
      setFretboardMap([]);
    }
    setSelectedInstrumentId(instrumentId);
    setSelectedTuningId(pickCompatibleTuningId(tunings, nextInst.stringCount, selectedTuningId));
  };

  // Calculate effective capo frets array
  const effectiveCapoFrets: (number | null)[] = buildCapoFrets(capoType, stringCount, fullCapoFret, customCapoFrets);

  const currentDraft: QuickCaptureDraft = {
    version: 1,
    captureId: captureId || undefined,
    saveUncertain,
    mapExtent,
    savedAt: 0,
    instrumentId: selectedInstrumentId,
    tuningId: currentTuning?.id ?? '',
    capoMode: capoType,
    capoFret: fullCapoFret,
    customCapoFrets,
    tabColumns,
    activeColumnIndex,
    fretboardMode,
    fretboardMap,
    tempo: tempo === '' ? null : tempo,
    timeSignature,
    compositionMode,
    compositionId: selectedCompositionId,
    newCompositionTitle,
    sectionName,
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

  // Warn before leaving with unsaved work, a live/unkept recording, or media not yet on the server.
  const hasMediaAtRisk = recorderHasTransientMedia || hasUnuploadedMedia(pendingMedia);
  const needsLeaveWarning = hasUnsavedDraft || hasMediaAtRisk;
  useEffect(() => {
    if (!needsLeaveWarning) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [needsLeaveWarning]);

  // Next.js links do not trigger beforeunload, so capture all anchor navigation while media is memory-only.
  useEffect(() => {
    if (!hasMediaAtRisk) return;
    const handler = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      const anchor = target instanceof Element ? target.closest('a[href]') : null;
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      event.preventDefault();
      event.stopPropagation();
      window.alert('Keep or discard the current recording, wait for media to finish attaching, or retry the failed upload before leaving. The recording or file is still held only on this page.');
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [hasMediaAtRisk]);

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
    updatedCols[activeColumnIndex] = { ...activeCol, notes: newNotes, rest: newNotes.length > 0 ? false : activeCol.rest };
    setTabColumns(updatedCols);
  };

  const handleMapNoteClick = (stringIndex: number, fret: number) => {
    setFretboardMap((current) => {
      const exists = current.some((note) => note.stringIndex === stringIndex && note.fret === fret);
      return exists
        ? current.filter((note) => !(note.stringIndex === stringIndex && note.fret === fret))
        : [...current, { stringIndex, fret }];
    });
  };

  const registerTempoTap = () => {
    const result = tempoTap(tapTimes.current, performance.now());
    tapTimes.current = result.times;
    setTapBpm(result.bpm);
  };

  useEffect(() => {
    if (!tapActive) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, [contenteditable]')) return;
      event.preventDefault();
      registerTempoTap();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tapActive]);

  const handleSaveCapture = async () => {
    if (savedCapture) return; // already saved; use "Capture Another Part" to continue
    if (recorderHasTransientMedia) {
      setError('Keep or discard the current recording before saving this idea.');
      return;
    }
    if (!selectedInstrumentId || !currentTuning) {
      setError(`Please select an instrument and a ${stringCount}-string tuning.`);
      return;
    }
    if (compositionMode === 'existing' && !selectedCompositionId) {
      setError('Choose the composition this motif belongs to.');
      return;
    }
    if (compositionMode === 'new' && !newCompositionTitle.trim()) {
      setError('Enter a title for the new composition.');
      return;
    }

    setSaveUncertain(true);
    setSaving(true);
    setError(null);

    let saved: SavedCapture;
    try {
      // One server-side SQLite transaction creates/reuses the capo + setup and inserts the motif.
      const tagArray = motifTags.split(',').map((t) => t.trim()).filter(Boolean);
      const defaultTags = compositionMode === 'inbox' ? ['Quick Capture', 'Inbox'] : ['Quick Capture'];
      const destination = compositionMode === 'existing'
        ? { kind: 'existing', compositionId: selectedCompositionId, sectionName: sectionName.trim() || undefined }
        : compositionMode === 'new'
          ? { kind: 'new', title: newCompositionTitle.trim(), sectionName: sectionName.trim() || undefined }
          : { kind: 'inbox' };
      // Persist the retry identifier before sending, including for an otherwise blank idea.
      saveDraft(browserStorage(), { ...currentDraft, title: motifName.trim() || 'Untitled Quick Capture Idea', saveUncertain: true, savedAt: Date.now() });
      const capture = {
          captureId,
          instrumentId: selectedInstrumentId,
          tuningId: currentTuning.id,
          capoFrets: capoType === 'none' ? null : effectiveCapoFrets,
          motif: {
            name: motifName.trim() || 'Untitled Quick Capture Idea',
            function: motifFunction,
            tabData: tabColumns,
            fretboardMap,
            tempo: tempo === '' ? null : tempo,
            timeSignature,
            tags: tagArray.length > 0 ? tagArray : defaultTags,
            notes: motifNotes.trim() || 'Captured via Quick Capture mobile/desktop interface.',
          },
          destination,
      };
      const form = new FormData();
      form.set('capture', JSON.stringify(capture));
      for (const item of pendingMedia) { form.append('files', item.blob, item.filename); form.append('descriptions', item.description); }
      saved = await fetchJson<SavedCapture>('/api/quick-capture', { method: 'POST', body: form });
      setPendingMedia(items => items.map(item => ({ ...item, status: 'uploaded' })));
    } catch (err) {
      // A lost response may follow a commit. Freeze the draft until the stable-ID retry reconciles it.
      setSaveUncertain(err instanceof ApiRequestError && (err.status === 0 || err.status >= 500));
      setCaptureConflict(err instanceof ApiRequestError && err.status === 409);
      setError(`Save failed or could not be confirmed. Your draft is kept; retry safely to recover the same capture: ${err instanceof Error ? err.message : 'unknown error'}`);
      setSaving(false);
      return;
    }

    setCaptureConflict(false);
    setSaveUncertain(false);
    setSavedCapture(saved);
    if (saved.composition) {
      setCompositions((current) => current.some((composition) => composition.id === saved.composition!.id)
        ? current
        : [saved.composition, ...current]);
      setCompositionMode('existing');
      setSelectedCompositionId(saved.composition.id);
      setNewCompositionTitle('');
    }
    clearDraft(browserStorage());
    lastPersistedDraft.current = null;
    setDraftNotice(null);
    setSaving(false);

  };

  const handleRetryMedia = async () => {
    if (!savedMotif) return;
    await uploadMediaFor(savedMotif.id, pendingMedia);
  };

  const handleDiscardDraft = () => {
    if (saving || saveUncertain) { setError('Reconcile the pending save with Retry Save before discarding this draft.'); return; }
    if (!window.confirm('Discard this unsaved Quick Capture draft (TAB, title, tags, notes and kept recordings)?')) return;
    clearDraft(browserStorage());
    lastPersistedDraft.current = null;
    setDraftNotice(null);
    resetCaptureFields();
    setPendingMedia([]);
  };

  const resetCaptureFields = () => {
    setSaveUncertain(false);
    setCaptureId(crypto.randomUUID());
    setMapExtent(24);
    setMotifName('');
    setMotifNotes('');
    setMotifTags('');
    setTabColumns(EMPTY_COLUMNS());
    setActiveColumnIndex(0);
    setFretboardMap([]);
  };

  const handleStartNewCapture = () => {
    if (hasMediaAtRisk) {
      const ok = window.confirm('A recording or file has not been safely attached yet. Starting a new capture will drop it. Continue?');
      if (!ok) return;
    }
    setRecorderSessionKey((current) => current + 1);
    setRecorderHasTransientMedia(false);
    setSavedCapture(null);
    setPendingMedia([]);
    resetCaptureFields();
  };

  const guardPendingMediaNavigation = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!hasMediaAtRisk) return;
    event.preventDefault();
    window.alert('Keep or discard the current recording, wait for media to finish attaching, or retry the failed upload before leaving. The recording or file is still held only on this page.');
  };

  const handleTuningNavigation = (event: React.MouseEvent<HTMLAnchorElement>) => {
    guardPendingMediaNavigation(event);
    if (event.defaultPrevented) return;
    saveDraft(browserStorage(), { ...currentDraft, savedAt: Date.now() });
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
            Capture a motif, describe its musical context, and file it in the Inbox or a composition.
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
            <span>{saving ? 'SAVING...' : compositionMode === 'inbox' ? 'SAVE TO INBOX' : 'SAVE & CONNECT'}</span>
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
              <div><span className="font-bold">{savedMotif.humanId} ({savedMotif.name})</span> saved.</div>
              <div className="text-emerald-800">
                {savedCapture?.composition
                  ? `Connected to ${savedCapture.composition.humanId} (${savedCapture.composition.title}).`
                  : 'Filed in the Motif Inbox. You can connect it to a composition later.'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/library#motif-${savedMotif.id}`}
              onClick={guardPendingMediaNavigation}
              className="underline text-emerald-800 hover:text-emerald-950 font-semibold"
            >
              View motif
            </Link>
            {savedCapture?.composition && (
              <Link
                href={`/compositions#composition-${savedCapture.composition.id}`}
                onClick={guardPendingMediaNavigation}
                className="underline text-emerald-800 hover:text-emerald-950 font-semibold"
              >
                View composition
              </Link>
            )}
            <Link
              href={`/print/motif/${savedMotif.id}`}
              onClick={guardPendingMediaNavigation}
              className="underline text-emerald-800 hover:text-emerald-950 font-semibold"
            >
              Print Record
            </Link>
            <button
              type="button"
              onClick={handleStartNewCapture}
              className="px-2.5 py-1 bg-emerald-800 text-white rounded font-bold hover:bg-emerald-900"
            >
              Capture Another Part
            </button>
          </div>
        </div>
      )}

      {savedMotif && !savedCapture?.composition && <MotifPlacement motifId={savedMotif.id} />}

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
                  disabled={saveUncertain}
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

      {compositionLoadWarning && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded flex items-center gap-2 text-xs font-mono text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0" />
          <span>{compositionLoadWarning}</span>
        </div>
      )}

      {captureConflict && <div className="text-sm space-x-3"><a className="underline" href={`/library#motif-${captureId}`}>View already saved motif</a><button className="border p-2" type="button" onClick={() => { setCaptureId(crypto.randomUUID()); setSaveUncertain(false); setCaptureConflict(false); setError(null); }}>Save edited draft as a separate capture</button></div>}
      {saveUncertain && <p role="status" className="text-sm">The previous save may have completed. Retry Save to recover its result before changing this draft or its recordings.</p>}
      <fieldset disabled={saveUncertain} className="space-y-6 border-0 min-w-0">
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
          {currentInstrument && <NewTuning instrument={currentInstrument} pitches={rawPitches} onCreated={(tuning) => { setTunings(rows => [...rows, tuning]); setSelectedTuningId(tuning.id); }} />}
          <Link
            href="/tunings"
            onClick={handleTuningNavigation}
            className="inline-block text-[10px] text-stone-600 underline hover:text-stone-900"
          >
            Add or edit tunings (draft retained)
          </Link>
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

      {/* Musical context and filing destination */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 bg-paper-100 border border-stone-300 rounded font-mono text-xs">
        <div className="space-y-3">
          <div className="font-bold tracking-wider text-stone-900 uppercase">4. RHYTHM & TEMPO</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block text-[11px] text-stone-600">TIME SIGNATURE</span>
              <select
                value={timeSignature}
                onChange={(e) => setTimeSignature(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5"
              >
                <option value="free">Free rhythm</option>
                <option value="2/4">2/4</option>
                <option value="3/4">3/4</option>
                <option value="4/4">4/4</option>
                <option value="5/4">5/4</option>
                <option value="6/8">6/8</option>
                <option value="7/8">7/8</option>
                <option value="9/8">9/8</option>
                <option value="12/8">12/8</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] text-stone-600">TEMPO (BPM)</span>
              <input
                type="number"
                min={20}
                max={400}
                value={tempo}
                onChange={(e) => setTempo(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="optional"
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!tapActive) tapTimes.current = [];
                setTapActive((active) => !active);
              }}
              className={`px-3 py-2 border rounded font-bold ${tapActive ? 'bg-amber-200 border-amber-500' : 'bg-white border-stone-300'}`}
            >
              {tapActive ? 'TAP MODE ON' : 'ENABLE TAP TEMPO'}
            </button>
            <button
              type="button"
              disabled={!tapActive}
              onClick={registerTempoTap}
              className="px-3 py-2 bg-stone-900 text-white rounded font-bold"
            >
              TAP
            </button>
            {tapBpm && <button type="button" className="border p-2" onClick={() => { setTempo(tapBpm); setTapActive(false); }}>Use {tapBpm} BPM</button>}
            <span className="text-stone-500">
              {tapActive ? 'Tap here or press Space away from form fields.' : 'Enable to use the Space bar.'}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="font-bold tracking-wider text-stone-900 uppercase">5. FILE THIS MOTIF</div>
            <div className="text-[10px] text-stone-500 mt-0.5">
              Choose now so the motif and composition link are saved in one transaction.
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {([
              ['inbox', 'Save to Motif Inbox'],
              ['existing', 'Add to Existing Composition'],
              ['new', 'Create a New Composition'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={value === 'existing' && (compositionLoadWarning !== null || compositions.length === 0)}
                onClick={() => setCompositionMode(value)}
                className={`px-2 py-2 border rounded disabled:opacity-40 disabled:cursor-not-allowed ${compositionMode === value ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {compositionMode === 'inbox' && (
            <p className="text-stone-600">
              Saves as an independent motif. It will remain easy to find and connect later.
            </p>
          )}
          {compositionMode === 'existing' && (
            <label className="space-y-1 block">
              <span className="block text-[11px] text-stone-600">COMPOSITION</span>
              <select
                value={selectedCompositionId}
                onChange={(e) => setSelectedCompositionId(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5"
              >
                {compositions.length === 0 && <option value="">No compositions yet</option>}
                {compositions.map((composition) => (
                  <option key={composition.id} value={composition.id}>
                    {composition.humanId} · {composition.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {compositionMode === 'new' && (
            <label className="space-y-1 block">
              <span className="block text-[11px] text-stone-600">NEW COMPOSITION TITLE</span>
              <input
                value={newCompositionTitle}
                onChange={(e) => setNewCompositionTitle(e.target.value)}
                placeholder="Working song title"
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5"
              />
            </label>
          )}
          <datalist id="capture-sections">{(() => { const comp = compositions.find(c => c.id === selectedCompositionId); return compositionSectionOptions(comp?.sections).map((section) => <option key={section.id} value={section.name} />); })()}</datalist>
          {compositionMode !== 'inbox' && (
            <label className="space-y-1 block">
              <span className="block text-[11px] text-stone-600">PART / SECTION (OPTIONAL)</span>
              <input
                list="capture-sections"
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                placeholder="Intro, Verse 1, B section, transition..."
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5"
              />
            </label>
          )}
        </div>
      </div>

      {/* TAB event editor and independent fretboard map */}
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
        <label className="block text-xs">Available neck extent (frets) <input aria-label="Available neck extent" type="number" min={1} max={36} value={mapExtent} onChange={e => setMapExtent(Math.max(1, Math.min(36, Number(e.target.value) || 24)))} /></label>
        <FretboardEditor
          maxFret={Math.max(mapExtent, ...fretboardMap.map(n => n.fret + (effectiveCapoFrets[n.stringIndex] || 0)), ...tabColumns.flatMap(c => c.notes.map(n => typeof n.fret === 'number' ? n.fret + (effectiveCapoFrets[n.stringIndex] || 0) : 0)))}
          stringCount={stringCount}
          pitches={rawPitches}
          capoFrets={effectiveCapoFrets}
          mode={fretboardMode}
          onModeChange={setFretboardMode}
          activeNotes={tabColumns[activeColumnIndex]?.notes || []}
          mapNotes={fretboardMap}
          onNoteClick={handleFretboardNoteClick}
          onMapNoteClick={handleMapNoteClick}
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
            <AudioRecorder
              key={recorderSessionKey}
              parentType="motif"
              parentId={savedMotif.id}
              onTransientMediaChange={setRecorderHasTransientMedia}
            />
          ) : (
            // Before saving, recordings stay pending in the browser until the motif exists.
            <AudioRecorder
              key={recorderSessionKey}
              parentType="motif"
              onCapture={handleCapturedMedia}
              onTransientMediaChange={setRecorderHasTransientMedia}
            />
          )}
        </div>
      </div>
      </fieldset>
    </div>
  );
}
