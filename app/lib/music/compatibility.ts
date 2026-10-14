/**
 * Pure helpers that keep instrument / tuning / capo selections mutually compatible.
 * All arrays follow the canonical invariant in ./string-order.ts (index 0 = bass-side).
 */

export interface TuningLike {
  id: string;
  stringCount: number;
}

export function filterCompatibleTunings<T extends TuningLike>(tunings: readonly T[], stringCount: number): T[] {
  return tunings.filter((t) => t.stringCount === stringCount);
}

/**
 * Returns the current tuning ID when it is compatible with `stringCount`; otherwise the
 * first compatible tuning; otherwise '' (no selection). Never returns a stale hidden value.
 */
export function pickCompatibleTuningId(tunings: readonly TuningLike[], stringCount: number | null | undefined, currentId: string | null | undefined): string {
  if (!stringCount) return '';
  const compatible = filterCompatibleTunings(tunings, stringCount);
  if (currentId && compatible.some((t) => t.id === currentId)) return currentId;
  return compatible[0]?.id ?? '';
}

export type CapoMode = 'none' | 'full' | 'partial-skip-bass' | 'custom';

/**
 * Per-string capo frets (null = string not capoed) for a capo mode.
 *  - full: every string at `fret`
 *  - partial-skip-bass: every string except the bass-side string (index 0) at `fret`
 *    (the classic "drop-D style" partial capo, generic for any string count)
 *  - custom: `custom` when it has exactly `stringCount` entries, otherwise all open
 */
export function buildCapoFrets(mode: CapoMode, stringCount: number, fret: number, custom: readonly (number | null)[] = []): (number | null)[] {
  switch (mode) {
    case 'full':
      return Array.from({ length: stringCount }, () => fret);
    case 'partial-skip-bass':
      return Array.from({ length: stringCount }, (_, i) => (i === 0 ? null : fret));
    case 'custom':
      return custom.length === stringCount ? custom.map((f) => (typeof f === 'number' && f > 0 ? f : null)) : Array(stringCount).fill(null);
    case 'none':
    default:
      return Array(stringCount).fill(null);
  }
}

/** True when any TAB column contains a note (used to confirm destructive string-count changes). */
export function tabHasNotes(columns: readonly { notes: readonly unknown[] }[]): boolean {
  return columns.some((c) => c.notes.length > 0);
}
