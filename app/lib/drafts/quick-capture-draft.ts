import { z } from 'zod';
import { fretboardMapSchema, tabDataSchema, timeSignatureSchema } from '../validation/schemas';

/**
 * Unsaved Quick Capture draft, persisted in localStorage so a refresh or accidental
 * navigation does not lose work. Cleared only after a successful save or explicit discard.
 * (Audio is NOT stored here; pending recordings live in memory until uploaded.)
 */
export const QUICK_CAPTURE_DRAFT_KEY = 'bxb.quickCapture.draft.v1';

export const quickCaptureDraftSchema = z.object({
  version: z.literal(1),
  savedAt: z.number(),
  instrumentId: z.string().max(100),
  tuningId: z.string().max(100),
  capoMode: z.enum(['none', 'full', 'partial-skip-bass', 'custom']),
  capoFret: z.number().int().min(1).max(24),
  customCapoFrets: z.array(z.number().int().min(0).max(24).nullable()).max(12),
  tabColumns: tabDataSchema,
  activeColumnIndex: z.number().int().min(0),
  fretboardMode: z.enum(['map', 'tab']).default('map'),
  fretboardMap: fretboardMapSchema.default([]),
  title: z.string().max(300),
  motifFunction: z.string().max(40),
  tags: z.string().max(2000),
  notes: z.string().max(10_000),
  tempo: z.number().int().min(20).max(400).nullable().default(null),
  timeSignature: timeSignatureSchema.default('free'),
  compositionMode: z.enum(['inbox', 'existing', 'new']).default('inbox'),
  compositionId: z.string().max(100).default(''),
  newCompositionTitle: z.string().max(300).default(''),
  sectionName: z.string().max(200).default(''),
});
export type QuickCaptureDraft = z.infer<typeof quickCaptureDraftSchema>;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A draft worth keeping has musical content or text (selection changes alone are not saved). */
export function draftHasContent(d: Pick<QuickCaptureDraft, 'tabColumns' | 'fretboardMap' | 'title' | 'tags' | 'notes'>): boolean {
  return d.title.trim() !== '' || d.tags.trim() !== '' || d.notes.trim() !== '' || d.fretboardMap.length > 0 || d.tabColumns.some((c) => c.notes.length > 0 || !!c.technique || !!c.duration || !!c.rest || !!c.barlineAfter || c.kind === 'grace');
}

export function parseDraft(raw: string | null | undefined): QuickCaptureDraft | null {
  if (!raw) return null;
  try {
    const result = quickCaptureDraftSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function loadDraft(storage: StorageLike | null | undefined): QuickCaptureDraft | null {
  if (!storage) return null;
  try {
    return parseDraft(storage.getItem(QUICK_CAPTURE_DRAFT_KEY));
  } catch {
    return null;
  }
}

/**
 * Persists the draft when it has content. Never removes an existing draft just because the
 * current state is empty (only clearDraft does that), so a transient empty state cannot wipe work.
 * Returns true when written.
 */
export function saveDraft(storage: StorageLike | null | undefined, draft: QuickCaptureDraft): boolean {
  if (!storage || !draftHasContent(draft)) return false;
  const valid = quickCaptureDraftSchema.safeParse(draft);
  if (!valid.success) return false;
  try {
    storage.setItem(QUICK_CAPTURE_DRAFT_KEY, JSON.stringify(valid.data));
    return true;
  } catch {
    return false; // quota or privacy mode
  }
}

export function clearDraft(storage: StorageLike | null | undefined): void {
  try {
    storage?.removeItem(QUICK_CAPTURE_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export interface DraftRestorePlan {
  instrumentId: string;
  tuningId: string;
  /** TAB is restored only when every note fits the restored instrument's string count. */
  tabColumns: QuickCaptureDraft['tabColumns'] | null;
  /** Custom capo frets are restored only when they match the restored string count. */
  customCapoFrets: (number | null)[];
  /** Independent fretboard-map notes are restored only when they fit the instrument. */
  fretboardMap: QuickCaptureDraft['fretboardMap'];
  warnings: string[];
}

/**
 * Maps a stored draft onto the instruments/tunings that exist now. Never selects a tuning
 * whose string count differs from the instrument, and never restores TAB that references
 * strings the instrument does not have.
 */
export function resolveDraftRestore(
  draft: QuickCaptureDraft,
  instruments: readonly { id: string; stringCount: number }[],
  tunings: readonly { id: string; stringCount: number }[]
): DraftRestorePlan | null {
  const warnings: string[] = [];
  let inst = instruments.find((i) => i.id === draft.instrumentId);
  if (!inst) {
    inst = instruments[0];
    if (!inst) return null;
    warnings.push('The instrument used in the draft no longer exists; the first instrument was selected instead.');
  }
  const compatible = tunings.filter((t) => t.stringCount === inst!.stringCount);
  const tuningId = compatible.some((t) => t.id === draft.tuningId) ? draft.tuningId : compatible[0]?.id ?? '';
  if (tuningId !== draft.tuningId) {
    warnings.push(tuningId ? 'The draft tuning is unavailable for this instrument; a compatible tuning was selected.' : `No ${inst.stringCount}-string tuning exists; choose one before saving.`);
  }
  const tabFits = draft.tabColumns.every((c) => c.notes.every((n) => n.stringIndex < inst!.stringCount));
  if (!tabFits) warnings.push('The draft TAB does not fit the selected instrument and was not restored.');
  const mapFits = draft.fretboardMap.every((n) => n.stringIndex < inst!.stringCount);
  if (!mapFits) warnings.push('The draft fretboard map does not fit the selected instrument and was not restored.');
  return {
    instrumentId: inst.id,
    tuningId,
    tabColumns: tabFits ? draft.tabColumns : null,
    customCapoFrets: draft.customCapoFrets.length === inst.stringCount ? draft.customCapoFrets : [],
    fretboardMap: mapFits ? draft.fretboardMap : [],
    warnings,
  };
}
