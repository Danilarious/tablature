import { describe, it, expect } from 'vitest';
import { calculateEffectiveVibratingLength, calculateSoundingPitch, calculateStringTension, parsePitch } from './pitch';
import { calculateSetupTensions, calculateStringLabTensions, rankCandidatesForTargetTension, CatalogProduct } from './string-lab';

const STANDARD_6 = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
// Illustrative unit weights (lb/in) used only to exercise the formula in tests.
const UW = [0.000401, 0.000254, 0.000141, 0.0000729, 0.0000386, 0.0000222];

function tensions(capoFrets: (number | null)[]) {
  return calculateStringLabTensions(
    STANDARD_6.map((p, i) => ({ stringIndex: i, openPitch: p, capoFret: capoFrets[i], scaleLength: 25.5, unitWeight: UW[i] }))
  );
}

describe('capo and tension physics', () => {
  it('a full capo changes sounding pitch but not physical tension', () => {
    const open = tensions([null, null, null, null, null, null]);
    const capo2 = tensions([2, 2, 2, 2, 2, 2]);
    expect(capo2.strings.map((s) => s.soundingPitch)).toEqual(['F#2', 'B2', 'E3', 'A3', 'C#4', 'F#4']);
    expect(capo2.strings.map((s) => s.tension.tensionLbs)).toEqual(open.strings.map((s) => s.tension.tensionLbs));
    expect(capo2.totalTensionLbs).toBe(open.totalTensionLbs);
  });

  it('a partial capo changes only the capoed strings sounding pitch and no tension', () => {
    const open = tensions([null, null, null, null, null, null]);
    const partial = tensions([null, 2, 2, 2, 2, 2]);
    expect(partial.strings[0].soundingPitch).toBe('E2');
    expect(partial.strings[1].soundingPitch).toBe('B2');
    expect(partial.strings.map((s) => s.tension.tensionLbs)).toEqual(open.strings.map((s) => s.tension.tensionLbs));
  });

  it('a Spider capo (different fret per string) follows the same rule independently per string', () => {
    const open = tensions([null, null, null, null, null, null]);
    const spider = tensions([null, 2, 2, 4, null, 7]);
    expect(spider.strings.map((s) => s.soundingPitch)).toEqual(['E2', 'B2', 'E3', 'B3', 'B3', 'B4']);
    expect(spider.strings.map((s) => s.tension.tensionLbs)).toEqual(open.strings.map((s) => s.tension.tensionLbs));
  });

  it('effective vibrating length = L / 2^(capo/12), and L_eff with capo frequency gives the same tension', () => {
    const L = 25.5;
    for (const capo of [1, 2, 5, 7, 12]) {
      const leff = calculateEffectiveVibratingLength(L, capo)!;
      expect(leff).toBeCloseTo(L / Math.pow(2, capo / 12), 10);
      const physical = calculateStringTension('E2', L, UW[0]).tensionLbs!;
      const viaCapo = calculateStringTension(calculateSoundingPitch('E2', capo, 0), leff, UW[0]).tensionLbs!;
      expect(Math.abs(viaCapo - physical)).toBeLessThan(0.02); // rounding tolerance only
    }
    expect(calculateEffectiveVibratingLength(25.5, 12)).toBeCloseTo(12.75, 10);
    expect(calculateEffectiveVibratingLength(25.5, null)).toBe(25.5);
    expect(calculateEffectiveVibratingLength(null, 2)).toBeNull();
  });

  it('reports the effective vibrating length on each string result for display', () => {
    const capo2 = tensions([null, 2, 2, 2, 2, 2]);
    expect(capo2.strings[0].effectiveVibratingLength).toBe(25.5);
    expect(capo2.strings[1].effectiveVibratingLength).toBeCloseTo(25.5 / Math.pow(2, 2 / 12), 10);
    expect(capo2.strings[1].scaleLength).toBe(25.5);
  });

  it('setup tension calculation ignores the capo and uses per-string speaking lengths', () => {
    const base = { openPitches: STANDARD_6, defaultScaleLength: 25.5, perStringSpeakingLengths: null, unitWeights: UW };
    const open = calculateSetupTensions({ ...base, capoFrets: [null, null, null, null, null, null] });
    const capo = calculateSetupTensions({ ...base, capoFrets: [3, 3, 3, 3, 3, 3] });
    expect(capo.perStringTension).toEqual(open.perStringTension);
    expect(capo.totalTension).toBe(open.totalTension);
    expect(capo.effectivePitches).toEqual(['G2', 'C3', 'F3', 'A#3', 'D4', 'G4']);
  });

  it('candidate ranking depends on the intended open tuning and full scale, not the capo', () => {
    const catalog: CatalogProduct[] = [
      { id: 'a', manufacturer: 'Test', productFamily: null, nominalGauge: 0.053, gaugeUnit: 'in', material: null, windingConstruction: null, unitWeight: 0.000401 },
      { id: 'b', manufacturer: 'Test', productFamily: null, nominalGauge: 0.042, gaugeUnit: 'in', material: null, windingConstruction: null, unitWeight: 0.000254 },
    ];
    // E2 at 25.5": the heavier string is closer to ~18 lb. The ranking API takes only the
    // open pitch, so a capo cannot inflate the predicted tension.
    const ranked = rankCandidatesForTargetTension('E2', 25.5, 18, catalog);
    expect(ranked[0].product.id).toBe('a');
    expect(ranked[0].predictedTensionLbs).toBe(calculateStringTension('E2', 25.5, 0.000401).tensionLbs);
  });

  it('frequency sanity: A4 = 440 Hz', () => {
    expect(parsePitch('A4')?.frequency).toBeCloseTo(440, 6);
  });
});
