// Pitch and Musical Physics Domain Utilities

export interface ParsedPitch {
  note: string; // e.g. "C", "C#", "D", "Eb", "F#"
  accidental: '#' | 'b' | '';
  octave: number; // e.g. 2, 3, 4
  midi: number; // e.g. 60 for C4, 40 for E2
  frequency: number; // Hz (A4 = 440 Hz)
}

const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const NOTE_TO_SEMITONE: Record<string, number> = {
  'C': 0, 'B#': 0,
  'C#': 1, 'DB': 1, 'Db': 1,
  'D': 2,
  'D#': 3, 'EB': 3, 'Eb': 3,
  'E': 4, 'FB': 4, 'Fb': 4,
  'F': 5, 'E#': 5,
  'F#': 6, 'GB': 6, 'Gb': 6,
  'G': 7,
  'G#': 8, 'AB': 8, 'Ab': 8,
  'A': 9,
  'A#': 10, 'BB': 10, 'Bb': 10,
  'B': 11, 'CB': 11, 'Cb': 11,
};

/**
 * Parses scientific pitch notation like "E2", "C#4", "Bb3", "g4" (reentrant banjo)
 */
export function parsePitch(pitchStr: string): ParsedPitch | null {
  if (!pitchStr || typeof pitchStr !== 'string') return null;
  const trimmed = pitchStr.trim();
  const match = trimmed.match(/^([A-Ga-g])([#bB]?)(-?\d+)$/);
  if (!match) return null;

  const letter = match[1].toUpperCase();
  const rawAccidental = match[2];
  const accidental = rawAccidental.toLowerCase() === 'b' ? 'b' : (rawAccidental === '#' ? '#' : '');
  const octave = parseInt(match[3], 10);

  const noteKey = letter + (accidental === '#' ? '#' : (accidental === 'b' ? 'b' : ''));
  const semitoneInOctave = NOTE_TO_SEMITONE[noteKey];
  if (semitoneInOctave === undefined) return null;

  // MIDI note: C4 is 60. C-1 is 0. C0 is 12.
  const midi = (octave + 1) * 12 + semitoneInOctave;
  
  // Frequency in Hz: f = 440 * 2^((midi - 69) / 12)
  const frequency = 440 * Math.pow(2, (midi - 69) / 12);

  return {
    note: CHROMATIC_SCALE[semitoneInOctave],
    accidental: accidental as '#' | 'b' | '',
    octave,
    midi,
    frequency: Math.round(frequency * 100) / 100,
  };
}

/**
 * Transpose a pitch by a number of semitones
 */
export function transposePitch(pitchStr: string, semitones: number): string {
  const parsed = parsePitch(pitchStr);
  if (!parsed) return pitchStr;

  const newMidi = parsed.midi + semitones;
  const newOctave = Math.floor(newMidi / 12) - 1;
  const semitoneIndex = ((newMidi % 12) + 12) % 12;
  const noteName = CHROMATIC_SCALE[semitoneIndex];

  return `${noteName}${newOctave}`;
}

/**
 * Calculate effective sounding pitch with capo and fret
 * @param openPitch e.g. "D3"
 * @param capoFret capo position for this string (null or 0 means no capo)
 * @param fret optional fretted fret above capo (null or 0 means open capo note)
 */
export function calculateSoundingPitch(
  openPitch: string,
  capoFret: number | null | undefined,
  fret: number | null | undefined = 0
): string {
  const capoOffset = typeof capoFret === 'number' && capoFret > 0 ? capoFret : 0;
  const fretOffset = typeof fret === 'number' && fret > 0 ? fret : 0;
  return transposePitch(openPitch, capoOffset + fretOffset);
}

/** True when the string is valid scientific pitch notation (legacy lowercase letters accepted). */
export function isValidPitch(pitchStr: unknown): pitchStr is string {
  return typeof pitchStr === 'string' && parsePitch(pitchStr) !== null;
}

/**
 * Effective vibrating length between a capo and the saddle, for DISPLAY only:
 *   L_eff = L / 2^(capoFret / 12)
 * A capo does not change the physical tension of an un-retuned string, because
 * T ∝ (L·f)² and L_eff·f_capo = L·f_open. Tension must therefore always be computed
 * from the open pitch at the full physical scale length (see calculateStringTension).
 */
export function calculateEffectiveVibratingLength(
  scaleLengthInches: number | null | undefined,
  capoFret: number | null | undefined
): number | null {
  if (!scaleLengthInches || scaleLengthInches <= 0) return null;
  const capo = typeof capoFret === 'number' && capoFret > 0 ? capoFret : 0;
  return scaleLengthInches / Math.pow(2, capo / 12);
}

/**
 * String Tension Physics:
 * Formula: T = (UW * (2 * L * F)^2) / 386.4
 * - T: Tension in pounds (lbs)
 * - UW: Unit Weight in lbs/inch
 * - L: Speaking string length in inches
 * - F: Frequency in Hz
 * 
 * Returns tension in pounds rounded to 2 decimal places.
 * If unitWeight is missing or <= 0, returns null with status 'missing_unit_weight'.
 */
export interface TensionResult {
  tensionLbs: number | null;
  status: 'valid' | 'missing_unit_weight' | 'invalid_pitch' | 'invalid_length';
  frequencyHz?: number;
  message?: string;
}

export function calculateStringTension(
  pitchStr: string,
  scaleLengthInches: number | null | undefined,
  unitWeightLbsPerInch: number | null | undefined
): TensionResult {
  if (!scaleLengthInches || scaleLengthInches <= 0) {
    return {
      tensionLbs: null,
      status: 'invalid_length',
      message: 'Scale length is unknown or incomplete.',
    };
  }

  const parsed = parsePitch(pitchStr);
  if (!parsed) {
    return {
      tensionLbs: null,
      status: 'invalid_pitch',
      message: `Invalid pitch: ${pitchStr}`,
    };
  }

  if (unitWeightLbsPerInch === null || unitWeightLbsPerInch === undefined || unitWeightLbsPerInch <= 0) {
    return {
      tensionLbs: null,
      status: 'missing_unit_weight',
      frequencyHz: parsed.frequency,
      message: 'Unit weight unavailable for this gauge/material. Tension cannot be honestly calculated.',
    };
  }

  // T = (UW * (2 * L * F)^2) / 386.4
  const doubleLF = 2 * scaleLengthInches * parsed.frequency;
  const tension = (unitWeightLbsPerInch * Math.pow(doubleLF, 2)) / 386.4;

  return {
    tensionLbs: Math.round(tension * 100) / 100,
    status: 'valid',
    frequencyHz: parsed.frequency,
  };
}
