/**
 * Canonical string-order model for BxB Music Notebook.
 *
 * INVARIANT (applies to every per-string array in the app and database):
 *   - Array index 0 is the PHYSICAL BASS-SIDE string.
 *   - Indexes proceed across the instrument toward the treble-side string.
 *   - Applies to: tuning pitches, per-string speaking lengths, string-set assignments,
 *     capo string frets, position frets/fingers, and TAB note `stringIndex`.
 *   - Physical string number = stringCount - index (treble-side string is "String 1").
 *   - Standard TAB displays the array reversed so the treble-side string is on top.
 *   - Reentrant pitch NEVER changes physical order. A 5-string banjo is therefore
 *     [5th (short, high G4), 4th D3, 3rd G3, 2nd B3, 1st D4], and its speaking lengths
 *     are [short, full, full, full, full].
 */

export function assertValidStringCount(stringCount: number): void {
  if (!Number.isInteger(stringCount) || stringCount < 1 || stringCount > 24) {
    throw new RangeError(`Invalid string count: ${stringCount}`);
  }
}

/** Physical string number (1 = treble-side string) for a canonical index. */
export function physicalStringNumber(index: number, stringCount: number): number {
  assertValidStringCount(stringCount);
  if (!Number.isInteger(index) || index < 0 || index >= stringCount) {
    throw new RangeError(`String index ${index} out of range for ${stringCount} strings`);
  }
  return stringCount - index;
}

/** Canonical index for a physical string number (1 = treble-side string). */
export function indexFromPhysicalStringNumber(stringNumber: number, stringCount: number): number {
  assertValidStringCount(stringCount);
  if (!Number.isInteger(stringNumber) || stringNumber < 1 || stringNumber > stringCount) {
    throw new RangeError(`String number ${stringNumber} out of range for ${stringCount} strings`);
  }
  return stringCount - stringNumber;
}

export interface DisplayStringRow {
  /** Canonical array index (0 = bass side). Use this for all data reads/writes. */
  index: number;
  /** Physical string number shown to the player (1 = treble side). */
  stringNumber: number;
  /** Open pitch for this string, if supplied. */
  pitch: string | null;
}

/**
 * Rows for standard TAB / fretboard display, top to bottom (treble-side string first).
 * Both TabGrid and FretboardEditor render from this so a TAB cell and a fretboard click
 * on the same visual row always refer to the same canonical index.
 */
export function getStandardTabRows(stringCount: number, pitches: readonly string[] = []): DisplayStringRow[] {
  assertValidStringCount(stringCount);
  const rows: DisplayStringRow[] = [];
  for (let index = stringCount - 1; index >= 0; index--) {
    rows.push({ index, stringNumber: stringCount - index, pitch: pitches[index] ?? null });
  }
  return rows;
}

/** Human label such as "String 1 (E4)". */
export function describeString(index: number, stringCount: number, pitch?: string | null): string {
  const n = physicalStringNumber(index, stringCount);
  return pitch ? `String ${n} (${pitch})` : `String ${n}`;
}

// ---------------------------------------------------------------------------
// Capo-relative TAB convention
//   TAB fret numbers on a capoed string are RELATIVE TO THE CAPO (0 = capoed open string),
//   so sounding pitch = open pitch + capoFret + tabFret (see calculateSoundingPitch).
//   On strings the capo does not cover (partial / Spider capo), capoFret is 0 and TAB
//   frets equal physical neck frets.
// ---------------------------------------------------------------------------

function capoOffset(capoFret: number | null | undefined): number {
  return typeof capoFret === 'number' && capoFret > 0 ? capoFret : 0;
}

/** Physical neck fret for a capo-relative TAB fret. */
export function neckFretFromTabFret(tabFret: number, capoFret: number | null | undefined): number {
  return tabFret + capoOffset(capoFret);
}

/**
 * Capo-relative TAB fret for a physical neck fret, or null when the position is at or
 * behind the capo (unplayable as a fretted note; use TAB 0 for the capoed open string).
 */
export function tabFretFromNeckFret(neckFret: number, capoFret: number | null | undefined): number | null {
  const capo = capoOffset(capoFret);
  if (neckFret === 0) return 0;
  if (capo > 0 && neckFret <= capo) return null;
  return neckFret - capo;
}

/** Highest physical neck fret needed to display a capo-relative fretboard map. */
export function mappedFretboardExtent(
  notes: readonly { stringIndex: number; fret: number }[],
  capoFrets: readonly (number | null)[] = [],
  minimum = 15
): number {
  return notes.reduce((highest, note) => {
    const physicalFret = neckFretFromTabFret(note.fret, capoFrets[note.stringIndex] ?? null);
    return Math.max(highest, physicalFret);
  }, minimum);
}

// ---------------------------------------------------------------------------
// Known legacy values (from the initial seed) that used treble-first ordering.
// Only these EXACT stored values may be rewritten automatically by migration 0001.
// ---------------------------------------------------------------------------

export const LEGACY_BANJO_TUNING = {
  id: 'tuning-t007',
  legacyPitchesJson: '["D4","B3","G3","D3","g4"]',
  canonicalPitches: ['G4', 'D3', 'G3', 'B3', 'D4'] as const,
};

export const LEGACY_BANJO_INSTRUMENT = {
  id: 'inst-banjo-5',
  legacySpeakingLengthsJson: '[26.25,26.25,26.25,26.25,19.75]',
  canonicalSpeakingLengths: [19.75, 26.25, 26.25, 26.25, 26.25] as const,
};

export type LegacyCanonicalization =
  | { status: 'canonical'; value: string }
  | { status: 'migrated'; value: string }
  | { status: 'needs_review'; value: string; reason: string };

/**
 * Deterministic legacy-seed correction. Returns the stored value unchanged unless it
 * exactly matches a known legacy seed value for that exact record ID.
 */
export function canonicalizeLegacyTuningPitches(id: string, pitchesJson: string, stringCount: number): LegacyCanonicalization {
  if (id === LEGACY_BANJO_TUNING.id && pitchesJson === LEGACY_BANJO_TUNING.legacyPitchesJson) {
    return { status: 'migrated', value: JSON.stringify(LEGACY_BANJO_TUNING.canonicalPitches) };
  }
  if (stringCount === 5) {
    return {
      status: 'needs_review',
      value: pitchesJson,
      reason: '5-string tuning created before the canonical bass-first convention; verify order is [5th, 4th, 3rd, 2nd, 1st].',
    };
  }
  return { status: 'canonical', value: pitchesJson };
}

export function canonicalizeLegacySpeakingLengths(id: string, lengthsJson: string | null): LegacyCanonicalization | null {
  if (lengthsJson === null) return null;
  if (id === LEGACY_BANJO_INSTRUMENT.id && lengthsJson === LEGACY_BANJO_INSTRUMENT.legacySpeakingLengthsJson) {
    return { status: 'migrated', value: JSON.stringify(LEGACY_BANJO_INSTRUMENT.canonicalSpeakingLengths) };
  }
  return {
    status: 'needs_review',
    value: lengthsJson,
    reason: 'Per-string speaking lengths recorded before the canonical bass-first convention; verify index 0 is the bass-side string.',
  };
}
