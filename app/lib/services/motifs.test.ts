import { describe, expect, it } from 'vitest';
import { motifs } from '../../db/schema';
import { createTestDb, insertInstrument, insertTuning } from '../../test/test-db';
import { insertMotif } from './motifs';
import { findOrCreateSetup } from './setups';

describe('insertMotif setup-derived validation', () => {
  it('uses the setup string count when direct instrument and tuning IDs are omitted', () => {
    const { db } = createTestDb();
    insertInstrument(db);
    insertTuning(db);
    const { setup } = findOrCreateSetup(db, {
      instrumentId: 'inst-test-6',
      tuningId: 'tuning-test-std',
    });

    expect(() =>
      insertMotif(db, {
        setupId: setup.id,
        name: 'Invalid map',
        fretboardMap: [{ stringIndex: 6, fret: 0 }],
      })
    ).toThrow();
    expect(db.select().from(motifs).all()).toHaveLength(0);

    const valid = insertMotif(db, {
      setupId: setup.id,
      name: 'Valid map',
      fretboardMap: [{ stringIndex: 5, fret: 0 }],
    });
    expect(valid.setupId).toBe(setup.id);
    expect(db.select().from(motifs).all()).toHaveLength(1);
  });
});
