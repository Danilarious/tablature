import { describe, expect, it } from 'vitest';
import { capoConfigurations, motifs, setups } from '../../db/schema';
import { createTestDb, insertInstrument, insertTuning } from '../../test/test-db';
import { createQuickCapture } from './quick-capture';

function counts(db: ReturnType<typeof createTestDb>['db']) {
  return {
    capos: db.select().from(capoConfigurations).all().length,
    setups: db.select().from(setups).all().length,
    motifs: db.select().from(motifs).all().length,
  };
}

function seed() {
  const t = createTestDb();
  insertInstrument(t.db);
  insertTuning(t.db);
  insertInstrument(t.db, { id: 'inst-test-7', name: 'Test Seven', stringCount: 7 });
  return t;
}

const validInput = {
  instrumentId: 'inst-test-6',
  tuningId: 'tuning-test-std',
  capoFrets: [2, 2, 2, 2, 2, 2],
  motif: { name: 'Idea', function: 'riff', tabData: [{ id: 'c1', notes: [{ stringIndex: 5, fret: 0 }] }], tags: ['Inbox'] },
};

describe('createQuickCapture (single transaction)', () => {
  it('creates capo, setup and motif together and returns the real motif ID', () => {
    const { db } = seed();
    const result = createQuickCapture(db, validInput);
    expect(result.motif.id).toBeTruthy();
    expect(result.motif.id.startsWith('temp')).toBe(false);
    expect(result.motif.humanId).toMatch(/^M-\d{3,}$/);
    expect(result.capoConfigId).toBeTruthy();
    expect(counts(db)).toEqual({ capos: 1, setups: 1, motifs: 1 });
    const stored = db.select().from(motifs).all()[0];
    expect(stored.setupId).toBe(result.setupId);
  });

  it('reuses an identical capo configuration and setup instead of duplicating them', () => {
    const { db } = seed();
    const first = createQuickCapture(db, validInput);
    const second = createQuickCapture(db, { ...validInput, motif: { ...validInput.motif, name: 'Second' } });
    expect(second.capoConfigId).toBe(first.capoConfigId);
    expect(second.setupId).toBe(first.setupId);
    expect(second.setupReused).toBe(true);
    expect(counts(db)).toEqual({ capos: 1, setups: 1, motifs: 2 });
  });

  it('creates no capo row when no capo is used', () => {
    const { db } = seed();
    const result = createQuickCapture(db, { ...validInput, capoFrets: null });
    expect(result.capoConfigId).toBeNull();
    expect(counts(db)).toEqual({ capos: 0, setups: 1, motifs: 1 });
  });

  it('rolls back capo and setup when the motif TAB is invalid for the instrument', () => {
    const { db } = seed();
    const bad = { ...validInput, motif: { ...validInput.motif, tabData: [{ id: 'c1', notes: [{ stringIndex: 6, fret: 1 }] }] } };
    expect(() => createQuickCapture(db, bad)).toThrow();
    expect(counts(db)).toEqual({ capos: 0, setups: 0, motifs: 0 });
  });

  it('rolls back the whole chain when the motif insert fails at the database level', () => {
    const { db, sqlite } = seed();
    sqlite.exec(`CREATE TRIGGER fail_motif BEFORE INSERT ON motifs BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;`);
    expect(() => createQuickCapture(db, validInput)).toThrow(/simulated failure/);
    expect(counts(db)).toEqual({ capos: 0, setups: 0, motifs: 0 });
  });

  it('writes nothing when instrument and tuning string counts differ', () => {
    const { db } = seed();
    expect(() => createQuickCapture(db, { ...validInput, instrumentId: 'inst-test-7', capoFrets: Array(7).fill(2) })).toThrow();
    expect(counts(db)).toEqual({ capos: 0, setups: 0, motifs: 0 });
  });

  it('writes nothing when capo frets do not match the instrument string count', () => {
    const { db } = seed();
    expect(() => createQuickCapture(db, { ...validInput, capoFrets: [2, 2, 2, 2, 2] })).toThrow();
    expect(counts(db)).toEqual({ capos: 0, setups: 0, motifs: 0 });
  });

  it('writes nothing for unknown references', () => {
    const { db } = seed();
    expect(() => createQuickCapture(db, { ...validInput, instrumentId: 'missing' })).toThrow();
    expect(counts(db)).toEqual({ capos: 0, setups: 0, motifs: 0 });
  });
});
