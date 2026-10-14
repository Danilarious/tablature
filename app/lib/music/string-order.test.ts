import { describe, it, expect } from 'vitest';
import {
  canonicalizeLegacySpeakingLengths,
  canonicalizeLegacyTuningPitches,
  describeString,
  getStandardTabRows,
  indexFromPhysicalStringNumber,
  LEGACY_BANJO_INSTRUMENT,
  LEGACY_BANJO_TUNING,
  neckFretFromTabFret,
  physicalStringNumber,
  tabFretFromNeckFret,
} from './string-order';
import { calculateSoundingPitch } from './pitch';
import { resolveSpeakingLength } from './string-lab';

const STANDARD_6 = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
const STANDARD_7 = ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
const BANJO_OPEN_G = ['G4', 'D3', 'G3', 'B3', 'D4'];
const BANJO_LENGTHS = [19.75, 26.25, 26.25, 26.25, 26.25];

describe('canonical string order (index 0 = physical bass-side string)', () => {
  it('standard guitar TAB shows high E as String 1 on top and low E as String 6 at the bottom', () => {
    const rows = getStandardTabRows(6, STANDARD_6);
    expect(rows[0]).toEqual({ index: 5, stringNumber: 1, pitch: 'E4' });
    expect(rows[5]).toEqual({ index: 0, stringNumber: 6, pitch: 'E2' });
    expect(rows.map((r) => r.pitch)).toEqual(['E4', 'B3', 'G3', 'D3', 'A2', 'E2']);
    expect(rows.map((r) => r.stringNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('seven-string guitar numbering is correct (low B = String 7)', () => {
    const rows = getStandardTabRows(7, STANDARD_7);
    expect(rows[0]).toEqual({ index: 6, stringNumber: 1, pitch: 'E4' });
    expect(rows[6]).toEqual({ index: 0, stringNumber: 7, pitch: 'B1' });
    expect(physicalStringNumber(0, 7)).toBe(7);
    expect(physicalStringNumber(1, 7)).toBe(6);
    expect(describeString(0, 7, 'B1')).toBe('String 7 (B1)');
  });

  it('five-string banjo keeps the short reentrant 5th string at index 0 with its short speaking length', () => {
    const rows = getStandardTabRows(5, BANJO_OPEN_G);
    // Treble-side (1st string, D4) on top; physical 5th string (reentrant G4) at the bottom.
    expect(rows[0]).toEqual({ index: 4, stringNumber: 1, pitch: 'D4' });
    expect(rows[4]).toEqual({ index: 0, stringNumber: 5, pitch: 'G4' });
    // Reentrant pitch does not change physical order: G4 is higher than D3 yet stays at index 0.
    expect(BANJO_OPEN_G[0]).toBe('G4');
    // Speaking length aligned with the same canonical index.
    expect(resolveSpeakingLength(0, 26.25, BANJO_LENGTHS)).toBe(19.75);
    for (let i = 1; i < 5; i++) expect(resolveSpeakingLength(i, 26.25, BANJO_LENGTHS)).toBe(26.25);
  });

  it('round-trips index <-> physical string number for 5, 6 and 7 strings', () => {
    for (const n of [5, 6, 7]) {
      for (let i = 0; i < n; i++) {
        expect(indexFromPhysicalStringNumber(physicalStringNumber(i, n), n)).toBe(i);
      }
    }
  });

  it('rejects out-of-range indexes and string numbers', () => {
    expect(() => physicalStringNumber(6, 6)).toThrow(RangeError);
    expect(() => physicalStringNumber(-1, 6)).toThrow(RangeError);
    expect(() => indexFromPhysicalStringNumber(0, 6)).toThrow(RangeError);
    expect(() => getStandardTabRows(0)).toThrow(RangeError);
  });
});

describe('capo-relative TAB frets', () => {
  it('maps neck frets to TAB frets relative to the capo and back', () => {
    expect(tabFretFromNeckFret(5, 2)).toBe(3);
    expect(neckFretFromTabFret(3, 2)).toBe(5);
    expect(tabFretFromNeckFret(0, 2)).toBe(0);
    expect(tabFretFromNeckFret(2, 2)).toBeNull(); // at the capo
    expect(tabFretFromNeckFret(1, 2)).toBeNull(); // behind the capo
    expect(tabFretFromNeckFret(4, null)).toBe(4); // uncapoed string (partial capo)
  });

  it('a fretboard click and its TAB fret produce the same sounding pitch', () => {
    // Capo 2 on low E string: neck fret 5 sounds A2. TAB fret 3 + capo 2 must also sound A2.
    const tab = tabFretFromNeckFret(5, 2)!;
    expect(calculateSoundingPitch('E2', 2, tab)).toBe(calculateSoundingPitch('E2', 0, 5));
    expect(calculateSoundingPitch('E2', 0, 5)).toBe('A2');
  });
});

describe('deterministic legacy seed canonicalization', () => {
  it('migrates only the exact legacy banjo tuning value', () => {
    const result = canonicalizeLegacyTuningPitches(LEGACY_BANJO_TUNING.id, LEGACY_BANJO_TUNING.legacyPitchesJson, 5);
    expect(result).toEqual({ status: 'migrated', value: JSON.stringify(BANJO_OPEN_G) });
  });

  it('flags other 5-string tunings for review without changing them', () => {
    const custom = JSON.stringify(['D4', 'B3', 'G3', 'D3', 'G4']);
    const otherId = canonicalizeLegacyTuningPitches('user-tuning-1', LEGACY_BANJO_TUNING.legacyPitchesJson, 5);
    expect(otherId.status).toBe('needs_review');
    expect(otherId.value).toBe(LEGACY_BANJO_TUNING.legacyPitchesJson);
    const edited = canonicalizeLegacyTuningPitches(LEGACY_BANJO_TUNING.id, custom, 5);
    expect(edited.status).toBe('needs_review');
    expect(edited.value).toBe(custom);
  });

  it('leaves guitar tunings untouched', () => {
    const json = JSON.stringify(STANDARD_6);
    expect(canonicalizeLegacyTuningPitches('tuning-t001', json, 6)).toEqual({ status: 'canonical', value: json });
  });

  it('migrates only the exact legacy banjo speaking lengths', () => {
    expect(canonicalizeLegacySpeakingLengths(LEGACY_BANJO_INSTRUMENT.id, LEGACY_BANJO_INSTRUMENT.legacySpeakingLengthsJson)).toEqual({
      status: 'migrated',
      value: JSON.stringify(BANJO_LENGTHS),
    });
    const other = canonicalizeLegacySpeakingLengths('inst-user', '[25,25,25,25,25,24]');
    expect(other?.status).toBe('needs_review');
    expect(other?.value).toBe('[25,25,25,25,25,24]');
    expect(canonicalizeLegacySpeakingLengths('inst-user', null)).toBeNull();
  });
});
