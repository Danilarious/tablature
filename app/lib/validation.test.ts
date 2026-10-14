import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import {
  assertCapoFretsMatch,
  assertInstrumentTuningCompatible,
  assertStringAssignmentsMatch,
  assertTabMatchesStringCount,
  capoFretsSchema,
  CompatibilityError,
  instrumentInputSchema,
  parseStoredJson,
  positionInputSchema,
  storedPitchesSchema,
  stringAssignmentsSchema,
  tabDataSchema,
  tuningInputSchema,
} from './validation/schemas';
import { buildCapoFrets, filterCompatibleTunings, pickCompatibleTuningId, tabHasNotes } from './music/compatibility';
import { buildSetupRecord, findOrCreateCapo, findOrCreateSetup, inferCapoType } from './services/setups';
import { createTestDb, insertInstrument, insertTuning } from '../test/test-db';

describe('runtime validation schemas', () => {
  it('validates instruments: string count, positive scale, per-string length count', () => {
    expect(instrumentInputSchema.parse({ name: 'G', stringCount: 6, defaultScaleLength: 25.5 }).stringCount).toBe(6);
    expect(() => instrumentInputSchema.parse({ name: 'G', stringCount: 0 })).toThrow();
    expect(() => instrumentInputSchema.parse({ name: 'G', stringCount: 6, defaultScaleLength: -1 })).toThrow();
    expect(() => instrumentInputSchema.parse({ name: 'G', stringCount: 'abc' })).toThrow();
    expect(() => instrumentInputSchema.parse({ name: 'B', stringCount: 5, perStringSpeakingLengths: [26.25, 26.25] })).toThrow(/exactly 5/);
  });

  it('never yields NaN from numeric strings', () => {
    expect(() => instrumentInputSchema.parse({ name: 'G', stringCount: 'NaN' })).toThrow();
    expect(() => instrumentInputSchema.parse({ name: 'G', stringCount: 6, defaultScaleLength: 'NaN' })).toThrow();
    expect(instrumentInputSchema.parse({ name: 'G', stringCount: '7', defaultScaleLength: '25.5' })).toMatchObject({ stringCount: 7, defaultScaleLength: 25.5 });
  });

  it('validates tunings: pitch count = string count, scientific pitch notation', () => {
    expect(tuningInputSchema.parse({ name: 'Std', stringCount: 6, pitches: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] }).pitches).toHaveLength(6);
    expect(() => tuningInputSchema.parse({ name: 'Bad', stringCount: 6, pitches: ['E2', 'A2'] })).toThrow(/6 strings but has 2/);
    expect(() => tuningInputSchema.parse({ name: 'Bad', pitches: ['E2', 'H2'] })).toThrow(/Invalid scientific pitch/);
    expect(() => tuningInputSchema.parse({ name: 'Bad', pitches: ['E'] })).toThrow();
    expect(tuningInputSchema.parse({ name: 'Banjo', pitches: ['G4', 'D3', 'G3', 'B3', 'D4'] }).pitches[0]).toBe('G4');
  });

  it('validates capo frets: null or non-negative integer frets only', () => {
    expect(capoFretsSchema.parse([null, 2, 2, 2, 2, 2])).toHaveLength(6);
    expect(() => capoFretsSchema.parse([null, -1])).toThrow();
    expect(() => capoFretsSchema.parse([1.5])).toThrow();
    expect(() => capoFretsSchema.parse(['2'])).toThrow();
  });

  it('validates position fret arrays against string count', () => {
    expect(() => positionInputSchema.parse({ stringCount: 6, frets: [0, 2, 2] })).toThrow(/Expected 6 fret entries/);
    expect(positionInputSchema.parse({ stringCount: 6, frets: ['x', 0, 2, 2, 1, 0] }).frets[0]).toBe('x');
  });

  it('validates TAB string indexes and fret values', () => {
    expect(tabDataSchema.parse([{ id: 'c1', notes: [{ stringIndex: 0, fret: 'x' }], rest: false, duration: '1/8' }])).toHaveLength(1);
    expect(() => tabDataSchema.parse([{ id: 'c1', notes: [{ stringIndex: 0, fret: 37 }] }])).toThrow();
    expect(() => tabDataSchema.parse([{ id: 'c1', notes: [{ stringIndex: -1, fret: 0 }] }])).toThrow();
    expect(() => tabDataSchema.parse([{ id: 'c1', notes: [{ stringIndex: 0, fret: 'o' }] }])).toThrow();
  });

  it('parses stored JSON safely', () => {
    expect(parseStoredJson('["E2","A2"]', storedPitchesSchema)).toEqual(['E2', 'A2']);
    expect(parseStoredJson('not json', storedPitchesSchema)).toBeNull();
    expect(parseStoredJson('["Q9"]', storedPitchesSchema)).toBeNull();
    expect(parseStoredJson(null, storedPitchesSchema)).toBeNull();
  });
});

describe('compatibility assertions', () => {
  it('rejects instrument/tuning string-count mismatch', () => {
    expect(() => assertInstrumentTuningCompatible(6, 6, 6)).not.toThrow();
    expect(() => assertInstrumentTuningCompatible(7, 6)).toThrow(CompatibilityError);
    expect(() => assertInstrumentTuningCompatible(5, 6)).toThrow(/5 strings but tuning has 6/);
    expect(() => assertInstrumentTuningCompatible(6, 6, 5)).toThrow(/inconsistent/);
  });

  it('rejects capo arrays and string-set assignments of the wrong length', () => {
    expect(() => assertCapoFretsMatch([null, 2, 2, 2, 2, 2], 6)).not.toThrow();
    expect(() => assertCapoFretsMatch([null, 2, 2, 2, 2, 2], 7)).toThrow(CompatibilityError);
    const six = stringAssignmentsSchema.parse(Array.from({ length: 6 }, (_, i) => ({ stringIndex: i })));
    expect(() => assertStringAssignmentsMatch(six, 6)).not.toThrow();
    expect(() => assertStringAssignmentsMatch(six, 5)).toThrow(CompatibilityError);
    const dup = stringAssignmentsSchema.parse([0, 1, 2, 3, 4, 4].map((i) => ({ stringIndex: i })));
    expect(() => assertStringAssignmentsMatch(dup, 6)).toThrow(/duplicate/);
  });

  it('rejects TAB that references strings the instrument does not have', () => {
    const tab = tabDataSchema.parse([{ id: 'c1', notes: [{ stringIndex: 6, fret: 0 }] }]);
    expect(() => assertTabMatchesStringCount(tab, 7)).not.toThrow();
    expect(() => assertTabMatchesStringCount(tab, 6)).toThrow(CompatibilityError);
    const twoOnOne = tabDataSchema.parse([{ id: 'c1', notes: [{ stringIndex: 0, fret: 0 }, { stringIndex: 0, fret: 2 }] }]);
    expect(() => assertTabMatchesStringCount(twoOnOne, 6)).toThrow(/two notes/);
  });
});

describe('instrument/tuning selection helpers', () => {
  const tunings = [
    { id: 't5', stringCount: 5 },
    { id: 't6a', stringCount: 6 },
    { id: 't6b', stringCount: 6 },
    { id: 't7', stringCount: 7 },
  ];

  it('switching among 5-, 6- and 7-string instruments never leaves an incompatible tuning selected', () => {
    let selected = pickCompatibleTuningId(tunings, 6, null);
    expect(selected).toBe('t6a');
    selected = pickCompatibleTuningId(tunings, 6, 't6b');
    expect(selected).toBe('t6b'); // compatible selection retained
    selected = pickCompatibleTuningId(tunings, 7, selected);
    expect(selected).toBe('t7');
    selected = pickCompatibleTuningId(tunings, 5, selected);
    expect(selected).toBe('t5');
    expect(pickCompatibleTuningId(tunings, 8, selected)).toBe(''); // explicit "no selection"
    expect(filterCompatibleTunings(tunings, 6).map((t) => t.id)).toEqual(['t6a', 't6b']);
  });

  it('capo presets match the instrument string count', () => {
    expect(buildCapoFrets('full', 7, 3)).toEqual([3, 3, 3, 3, 3, 3, 3]);
    expect(buildCapoFrets('partial-skip-bass', 6, 2)).toEqual([null, 2, 2, 2, 2, 2]);
    expect(buildCapoFrets('partial-skip-bass', 5, 2)).toEqual([null, 2, 2, 2, 2]);
    expect(buildCapoFrets('custom', 6, 0, [null, 2])).toEqual([null, null, null, null, null, null]);
    expect(buildCapoFrets('custom', 3, 0, [0, 2, null])).toEqual([null, 2, null]);
    expect(buildCapoFrets('none', 5, 2)).toEqual([null, null, null, null, null]);
    expect(tabHasNotes([{ notes: [] }, { notes: [{}] }])).toBe(true);
    expect(tabHasNotes([{ notes: [] }])).toBe(false);
  });
});

describe('setup service', () => {
  it('infers capo type from per-string frets', () => {
    expect(inferCapoType([null, null])).toBe('none');
    expect(inferCapoType([2, 2, 2])).toBe('full');
    expect(inferCapoType([null, 2, 2])).toBe('partial');
    expect(inferCapoType([null, 2, 4])).toBe('spider');
  });

  it('reuses an identical capo configuration instead of duplicating it', () => {
    const { db } = createTestDb();
    const a = findOrCreateCapo(db, [null, 2, 2, 2, 2, 2]);
    const b = findOrCreateCapo(db, [0, 2, 2, 2, 2, 2]);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(findOrCreateCapo(db, [null, null, null])).toBeNull();
    expect(db.select().from(schema.capoConfigurations).all()).toHaveLength(1);
  });

  it('refuses to build a setup for an incompatible instrument/tuning pair', () => {
    const { db } = createTestDb();
    insertInstrument(db, { id: 'inst-7', stringCount: 7 });
    insertTuning(db);
    expect(() => buildSetupRecord(db, { instrumentId: 'inst-7', tuningId: 'tuning-test-std' })).toThrow(CompatibilityError);
  });

  it('refuses a capo whose string count does not match the instrument', () => {
    const { db } = createTestDb();
    insertInstrument(db);
    insertTuning(db);
    const capo7 = findOrCreateCapo(db, [2, 2, 2, 2, 2, 2, 2])!;
    expect(() => buildSetupRecord(db, { instrumentId: 'inst-test-6', tuningId: 'tuning-test-std', capoConfigId: capo7 })).toThrow(CompatibilityError);
  });

  it('stores sounding pitches with the capo and tension from open pitches; reuses identical setups', () => {
    const { db } = createTestDb();
    insertInstrument(db);
    insertTuning(db);
    const uw = [0.000401, 0.000254, 0.000141, 0.0000729, 0.0000386, 0.0000222];
    db.insert(schema.stringSets)
      .values({
        id: 'set-1',
        instrumentId: 'inst-test-6',
        name: 'Set',
        stringAssignments: JSON.stringify(uw.map((u, i) => ({ stringIndex: i, unitWeight: u }))),
        isActive: 1,
        createdAt: 1,
      })
      .run();
    const capo = findOrCreateCapo(db, [2, 2, 2, 2, 2, 2]);
    const open = buildSetupRecord(db, { instrumentId: 'inst-test-6', tuningId: 'tuning-test-std', stringSetId: 'set-1' });
    const capoed = findOrCreateSetup(db, { instrumentId: 'inst-test-6', tuningId: 'tuning-test-std', stringSetId: 'set-1', capoConfigId: capo });
    expect(JSON.parse(capoed.setup.effectivePitches)).toEqual(['F#2', 'B2', 'E3', 'A3', 'C#4', 'F#4']);
    expect(capoed.setup.perStringTension).toBe(open.perStringTension);
    expect(capoed.setup.totalTension).toBe(open.totalTension);
    expect(capoed.reused).toBe(false);

    const again = findOrCreateSetup(db, { instrumentId: 'inst-test-6', tuningId: 'tuning-test-std', stringSetId: 'set-1', capoConfigId: capo });
    expect(again.reused).toBe(true);
    expect(again.setup.id).toBe(capoed.setup.id);

    // Editing the live instrument later produces a NEW snapshot instead of reusing the old one.
    db.update(schema.instruments).set({ defaultScaleLength: 25.4 }).where(eq(schema.instruments.id, 'inst-test-6')).run();
    const afterEdit = findOrCreateSetup(db, { instrumentId: 'inst-test-6', tuningId: 'tuning-test-std', stringSetId: 'set-1', capoConfigId: capo });
    expect(afterEdit.reused).toBe(false);
    expect(afterEdit.setup.id).not.toBe(capoed.setup.id);
    const original = db.select().from(schema.setups).where(eq(schema.setups.id, capoed.setup.id)).get()!;
    expect(JSON.parse(original.snapshot).instrument.defaultScaleLength).toBe(25.5);
  });
});
