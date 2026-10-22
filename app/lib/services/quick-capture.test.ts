import { describe, expect, it } from 'vitest';
import { capoConfigurations, compositions, compositionMotifs, compositionSetups, motifs, setups } from '../../db/schema';
import { createTestDb, insertInstrument, insertTuning } from '../../test/test-db';
import { createQuickCapture, placeMotif } from './quick-capture';

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

function insertComposition(db: ReturnType<typeof createTestDb>['db']) {
  db.insert(compositions).values({
    id: 'comp-test',
    humanId: 'C-900',
    title: 'Test Song',
    status: 'idea',
    createdAt: 1,
    updatedAt: 1,
  }).run();
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

  it('stores tempo, time signature and an independent multi-note fretboard map', () => {
    const { db } = seed();
    const result = createQuickCapture(db, {
      ...validInput,
      motif: {
        ...validInput.motif,
        tempo: 112,
        timeSignature: '6/8',
        fretboardMap: [
          { stringIndex: 0, fret: 0 },
          { stringIndex: 0, fret: 3 },
          { stringIndex: 5, fret: 5 },
        ],
      },
    });
    const row = db.select().from(motifs).all().find((m) => m.id === result.motif.id)!;
    expect(row.tempo).toBe(112);
    expect(row.timeSignature).toBe('6/8');
    expect(JSON.parse(row.fretboardMap!)).toHaveLength(3);
  });

  it('links the motif and setup to an existing composition in the same transaction', () => {
    const { db } = seed();
    insertComposition(db);
    const result = createQuickCapture(db, {
      ...validInput,
      destination: { kind: 'existing', compositionId: 'comp-test', sectionName: 'Verse idea' },
    });
    expect(result.composition).toMatchObject({ id: 'comp-test', humanId: 'C-900', title: 'Test Song' });
    expect(db.select().from(compositionMotifs).all()).toEqual([
      expect.objectContaining({ compositionId: 'comp-test', motifId: result.motif.id, sectionName: 'Verse idea', sortOrder: 0 }),
    ]);
    expect(db.select().from(compositionSetups).all()).toEqual([
      expect.objectContaining({ compositionId: 'comp-test', setupId: result.setupId }),
    ]);
  });

  it('creates a new composition and links the motif when requested', () => {
    const { db } = seed();
    const result = createQuickCapture(db, {
      ...validInput,
      motif: { ...validInput.motif, tempo: 90, timeSignature: '3/4' },
      destination: { kind: 'new', title: 'New Song', sectionName: 'Opening' },
    });
    expect(result.composition).toMatchObject({ humanId: 'C-001', title: 'New Song' });
    const comp = db.select().from(compositions).all()[0];
    expect(comp).toMatchObject({ tempo: 90, timeSignature: '3/4' });
    expect(db.select().from(compositionMotifs).all()[0]).toMatchObject({ motifId: result.motif.id, sectionName: 'Opening' });
  });

  it('rolls back motif, setup and capo when the requested composition does not exist', () => {
    const { db } = seed();
    expect(() => createQuickCapture(db, {
      ...validInput,
      destination: { kind: 'existing', compositionId: 'missing' },
    })).toThrow(/Composition not found/);
    expect(counts(db)).toEqual({ capos: 0, setups: 0, motifs: 0 });
    expect(db.select().from(compositionMotifs).all()).toHaveLength(0);
  });
});

describe('section and attachment transaction', () => {
  it('creates a real section and rolls everything back on attachment failure', () => {
    const { db, sqlite } = seed();
    const input = { ...validInput, destination: { kind: 'new', title: 'Song', sectionName: 'Verse' } };
    const file = { id: 'file-one', parentType: 'motif', parentId: '', displayName: 'take', filePath: 'take.wav', mimeType: 'audio/wav', fileSize: 8, description: 'Verse take', createdAt: 1 };
    sqlite.exec(`CREATE TRIGGER fail_attachment BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'attachment failed'); END;`);
    expect(() => createQuickCapture(db, input, [file])).toThrow(/attachment failed/);
    expect(counts(db)).toEqual({ capos: 0, setups: 0, motifs: 0 });
    expect(db.select().from(compositions).all()).toHaveLength(0);
    expect(db.select().from(compositionMotifs).all()).toHaveLength(0);
    expect(db.select().from(compositionSetups).all()).toHaveLength(0);
    sqlite.exec('DROP TRIGGER fail_attachment');
    const result = createQuickCapture(db, input, [file]);
    const comp = db.select().from(compositions).all()[0];
    expect(JSON.parse(comp.sections!)[0].name).toBe('Verse');
    expect(result.composition?.id).toBe(comp.id);
  });
});

it('places an inbox motif into existing and new compositions without duplication', () => {
  const { db } = seed();
  const capture = createQuickCapture(db, validInput);
  insertComposition(db);
  placeMotif(db, capture.motif.id, { kind: 'existing', compositionId: 'comp-test', sectionName: 'Bridge' });
  placeMotif(db, capture.motif.id, { kind: 'existing', compositionId: 'comp-test', sectionName: 'Bridge' });
  const other = placeMotif(db, capture.motif.id, { kind: 'new', title: 'Other song', sectionName: 'Intro' });
  expect(other.title).toBe('Other song');
  expect(db.select().from(compositionMotifs).all()).toHaveLength(2);
  expect(db.select().from(compositionSetups).all()).toHaveLength(2);
  expect(db.select().from(motifs).all()).toHaveLength(1);
  expect(() => placeMotif(db, capture.motif.id, { kind: 'existing', compositionId: 'missing' })).toThrow();
  expect(db.select().from(compositionMotifs).all()).toHaveLength(2);
});

it('reconciles a committed capture on retry without duplicating any records', () => {
  const { db } = seed();
  const input = { ...validInput, captureId: 'edddbbbb-9999-4444-8888-111111111111', destination: { kind: 'new', title: 'One song', sectionName: 'Verse' } };
  const first = createQuickCapture(db, input);
  const retry = createQuickCapture(db, input);
  expect(retry.motif.id).toBe(first.motif.id);
  expect(retry.composition?.id).toBe(first.composition?.id);
  expect(retry.replayed).toBe(true);
  expect(counts(db)).toEqual({ capos: 1, setups: 1, motifs: 1 });
  expect(db.select().from(compositions).all()).toHaveLength(1);
  expect(db.select().from(compositionMotifs).all()).toHaveLength(1);
});
it('treats legacy null and empty sections as the existing Unsectioned placement', () => {
  const { db } = seed();
  const capture = createQuickCapture(db, validInput);
  insertComposition(db);
  db.insert(compositionMotifs).values({id:'legacy-link', compositionId:'comp-test', motifId:capture.motif.id, sortOrder:0, sectionName:null}).run();
  placeMotif(db, capture.motif.id, {kind:'existing',compositionId:'comp-test',sectionName:''});
  expect(db.select().from(compositionMotifs).all()).toHaveLength(1);
});
