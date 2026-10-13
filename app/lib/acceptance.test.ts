import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { calculateSoundingPitch, calculateStringTension } from './music/pitch';
import { calculateStringLabTensions } from './music/string-lab';

describe('BxB Music Notebook Acceptance Tests', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    // In-memory SQLite database for clean isolated acceptance tests
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    sqlite.exec(`
      CREATE TABLE instruments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        maker TEXT,
        model TEXT,
        family TEXT NOT NULL,
        string_count INTEGER NOT NULL,
        default_scale_length REAL,
        scale_length_unit TEXT DEFAULT 'in' NOT NULL,
        per_string_speaking_lengths TEXT,
        notes TEXT,
        is_archived INTEGER DEFAULT 0 NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE tunings (
        id TEXT PRIMARY KEY,
        human_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        string_count INTEGER NOT NULL,
        pitches TEXT NOT NULL,
        tonal_center TEXT,
        tags TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE capo_configurations (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT NOT NULL,
        string_frets TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE string_sets (
        id TEXT PRIMARY KEY,
        instrument_id TEXT,
        name TEXT NOT NULL,
        installed_date TEXT,
        string_assignments TEXT NOT NULL,
        notes TEXT,
        is_active INTEGER DEFAULT 1 NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE setups (
        id TEXT PRIMARY KEY,
        instrument_id TEXT,
        tuning_id TEXT,
        string_set_id TEXT,
        capo_config_id TEXT,
        name TEXT,
        effective_pitches TEXT NOT NULL,
        per_string_tension TEXT,
        total_tension REAL,
        snapshot TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE motifs (
        id TEXT PRIMARY KEY,
        human_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        setup_id TEXT,
        tuning_id TEXT,
        instrument_id TEXT,
        function TEXT,
        tab_data TEXT NOT NULL,
        variations TEXT,
        tags TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE compositions (
        id TEXT PRIMARY KEY,
        human_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'idea' NOT NULL,
        tonal_center TEXT,
        tempo INTEGER,
        tempo_notes TEXT,
        piece_map TEXT,
        sections TEXT,
        notes TEXT,
        lyrics TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE composition_motifs (
        id TEXT PRIMARY KEY,
        composition_id TEXT NOT NULL,
        motif_id TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0 NOT NULL,
        section_name TEXT
      );
      CREATE TABLE composition_setups (
        id TEXT PRIMARY KEY,
        composition_id TEXT NOT NULL,
        setup_id TEXT NOT NULL,
        instrument_role TEXT
      );
    `);

    db = drizzle(sqlite, { schema });
  });

  it('preserves reentrant tuning order for 5-string banjo', async () => {
    const banjoTuning = {
      id: 't-banjo',
      humanId: 'T-007',
      name: 'Banjo Open G',
      stringCount: 5,
      // String 5 is high g4 on the short peg
      pitches: JSON.stringify(['D4', 'B3', 'G3', 'D3', 'g4']),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.insert(schema.tunings).values(banjoTuning);
    const [fetched] = await db.select().from(schema.tunings);
    const pitches: string[] = JSON.parse(fetched.pitches);

    expect(pitches.length).toBe(5);
    expect(pitches[4]).toBe('g4'); // Reentrant pitch preserved at exact position
  });

  it('applies full capo uniformly and partial capo selectively', () => {
    const fullCapo = [2, 2, 2, 2, 2, 2];
    const partialCapo = [null, 2, 2, 2, null, null]; // Spider or partial on middle strings

    const openTuning = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];

    const fullSounding = openTuning.map((pitch, idx) => calculateSoundingPitch(pitch, fullCapo[idx], 0));
    expect(fullSounding).toEqual(['F#2', 'B2', 'E3', 'A3', 'C#4', 'F#4']);

    const partialSounding = openTuning.map((pitch, idx) => calculateSoundingPitch(pitch, partialCapo[idx], 0));
    expect(partialSounding[0]).toBe('E2'); // String 6 unaffected
    expect(partialSounding[1]).toBe('B2'); // String 5 capo 2
    expect(partialSounding[2]).toBe('E3'); // String 4 capo 2
    expect(partialSounding[3]).toBe('A3'); // String 3 capo 2
    expect(partialSounding[4]).toBe('B3'); // String 2 unaffected
    expect(partialSounding[5]).toBe('E4'); // String 1 unaffected
  });

  it('supports per-string scale-length override for 5-string banjo short 5th string', () => {
    const perStringLengths = [26.25, 26.25, 26.25, 26.25, 19.75];
    const pitches = ['D4', 'B3', 'G3', 'D3', 'G4'];
    const banjoUnitWeights = [0.0000178, 0.0000242, 0.0000350, 0.0000780, 0.0000178];

    const calc = calculateStringLabTensions(
      pitches.map((p, idx) => ({
        stringIndex: idx,
        openPitch: p,
        capoFret: null,
        scaleLength: perStringLengths[idx],
        unitWeight: banjoUnitWeights[idx],
      }))
    );

    expect(calc.hasIncompleteData).toBe(false);
    expect(calc.strings[4].scaleLength).toBe(19.75); // Shorter speaking length
    expect(calc.strings[4].tension.tensionLbs).toBeGreaterThan(9.0);
    expect(calc.strings[4].tension.tensionLbs).toBeLessThan(15.0);
  });

  it('guarantees setup snapshot immutability when instrument or strings are modified later', async () => {
    // 1. Create original instrument and setup
    const instId = 'inst-1';
    await db.insert(schema.instruments).values({
      id: instId,
      name: 'Santa Cruz Original',
      family: 'steel_string_acoustic',
      stringCount: 6,
      defaultScaleLength: 25.5,
      createdAt: 1000,
      updatedAt: 1000,
    });

    const setupId = 'setup-1';
    const originalSnapshot = {
      instrumentName: 'Santa Cruz Original',
      scaleLength: 25.5,
      tuningPitches: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'],
    };

    await db.insert(schema.setups).values({
      id: setupId,
      instrumentId: instId,
      name: 'Original Setup',
      effectivePitches: JSON.stringify(['D2', 'A2', 'D3', 'G3', 'A3', 'D4']),
      snapshot: JSON.stringify(originalSnapshot),
      createdAt: 1000,
    });

    // 2. Instrument gets modified a year later
    await db.update(schema.instruments)
      .set({ name: 'Santa Cruz Refretted & Modified', defaultScaleLength: 25.0 })
      .where(eq(schema.instruments.id, instId));

    // 3. Verify that the historical setup snapshot remains unchanged!
    const [fetchedSetup] = await db.select().from(schema.setups).where(eq(schema.setups.id, setupId));
    const decodedSnapshot = JSON.parse(fetchedSetup.snapshot);

    expect(decodedSnapshot.instrumentName).toBe('Santa Cruz Original');
    expect(decodedSnapshot.scaleLength).toBe(25.5);
  });

  it('allows a Motif to be reused in multiple Compositions', async () => {
    const motifId = 'motif-riff-1';
    await db.insert(schema.motifs).values({
      id: motifId,
      humanId: 'M-010',
      name: 'Celtic Hook',
      tabData: JSON.stringify([{ notes: [{ stringIndex: 0, fret: 2 }] }]),
      createdAt: 1000,
      updatedAt: 1000,
    });

    // Composition 1
    await db.insert(schema.compositions).values({
      id: 'comp-1',
      humanId: 'C-001',
      title: 'First Piece',
      createdAt: 1000,
      updatedAt: 1000,
    });
    await db.insert(schema.compositionMotifs).values({
      id: 'cm-1',
      compositionId: 'comp-1',
      motifId,
      sortOrder: 0,
      sectionName: 'Intro',
    });

    // Composition 2 (reusing same motif)
    await db.insert(schema.compositions).values({
      id: 'comp-2',
      humanId: 'C-002',
      title: 'Second Suite',
      createdAt: 2000,
      updatedAt: 2000,
    });
    await db.insert(schema.compositionMotifs).values({
      id: 'cm-2',
      compositionId: 'comp-2',
      motifId,
      sortOrder: 0,
      sectionName: 'Theme B',
    });

    const appearances = await db.select().from(schema.compositionMotifs).where(eq(schema.compositionMotifs.motifId, motifId));
    expect(appearances.length).toBe(2);
  });

  it('allows a Composition to reference multiple Instruments and Setups', async () => {
    const compId = 'comp-multi-inst';
    await db.insert(schema.compositions).values({
      id: compId,
      humanId: 'C-003',
      title: 'Duo for 6-String and 7-String',
      createdAt: 1000,
      updatedAt: 1000,
    });

    await db.insert(schema.compositionSetups).values({
      id: 'cs-1',
      compositionId: compId,
      setupId: 'setup-6-string',
      instrumentRole: 'Lead Guitar',
    });

    await db.insert(schema.compositionSetups).values({
      id: 'cs-2',
      compositionId: compId,
      setupId: 'setup-7-string',
      instrumentRole: 'Bass & Rhythm 7-String',
    });

    const setupsUsed = await db.select().from(schema.compositionSetups).where(eq(schema.compositionSetups.compositionId, compId));
    expect(setupsUsed.length).toBe(2);
    expect(setupsUsed[0].instrumentRole).toBe('Lead Guitar');
    expect(setupsUsed[1].instrumentRole).toBe('Bass & Rhythm 7-String');
  });
});
