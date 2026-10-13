import { describe, it, expect } from 'vitest';
import {
  parsePitch,
  transposePitch,
  calculateSoundingPitch,
  calculateStringTension,
} from './pitch';

describe('Pitch and Tension Domain Module', () => {
  it('parses standard guitar pitches accurately', () => {
    const e2 = parsePitch('E2');
    expect(e2).not.toBeNull();
    expect(e2?.midi).toBe(40);
    expect(Math.round(e2?.frequency || 0)).toBe(82);

    const a4 = parsePitch('A4');
    expect(a4).not.toBeNull();
    expect(a4?.midi).toBe(69);
    expect(a4?.frequency).toBe(440);

    const b1 = parsePitch('B1'); // 7th string on 7-string guitar
    expect(b1).not.toBeNull();
    expect(b1?.midi).toBe(35);
    expect(Math.round(b1?.frequency || 0)).toBe(62);
  });

  it('handles reentrant tunings like 5-string banjo high g4', () => {
    const g4 = parsePitch('g4');
    expect(g4).not.toBeNull();
    expect(g4?.octave).toBe(4);
    expect(g4?.midi).toBe(67);
    expect(Math.round(g4?.frequency || 0)).toBe(392);
  });

  it('calculates sounding pitch with full and partial capos', () => {
    // Open D string capo fret 2 should sound E
    expect(calculateSoundingPitch('D3', 2, 0)).toBe('E3');
    // Open E2 capo fret 0 fretted at 3 sounds G2
    expect(calculateSoundingPitch('E2', 0, 3)).toBe('G2');
    // Partial capo: null means open string unaffected
    expect(calculateSoundingPitch('E2', null, 0)).toBe('E2');
    // Spider/partial capo fret 4 on G3 sounds B3
    expect(calculateSoundingPitch('G3', 4, 0)).toBe('B3');
  });

  it('transposes pitches accurately across octaves', () => {
    expect(transposePitch('B3', 1)).toBe('C4');
    expect(transposePitch('C4', -1)).toBe('B3');
    expect(transposePitch('A2', 12)).toBe('A3');
  });

  it('calculates physical string tension matching standard physics', () => {
    // Test: 0.053 Phosphor Bronze on 25.5" scale tuned to E2 (82.41 Hz)
    // D'Addario EJ16 6th string UW ~ 0.0004117 lbs/in
    // T = (0.0004117 * (2 * 25.5 * 82.41)^2) / 386.4 = ~18.8 lbs
    const result = calculateStringTension('E2', 25.5, 0.0004117);
    expect(result.status).toBe('valid');
    expect(result.tensionLbs).toBeGreaterThan(18.0);
    expect(result.tensionLbs).toBeLessThan(19.5);
  });

  it('honestly reports missing unit weight rather than fabricating precision', () => {
    const result = calculateStringTension('E2', 25.5, null);
    expect(result.status).toBe('missing_unit_weight');
    expect(result.tensionLbs).toBeNull();
    expect(result.message).toContain('Unit weight unavailable');
  });

  it('handles missing or invalid scale lengths honestly', () => {
    const result = calculateStringTension('E2', null, 0.0004117);
    expect(result.status).toBe('invalid_length');
    expect(result.tensionLbs).toBeNull();
  });
});
