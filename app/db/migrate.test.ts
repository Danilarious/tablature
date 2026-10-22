import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_RUNTIME_SCHEMA_SQL } from '../test/fixtures/legacy-schema';
import { LEGACY_BANJO_INSTRUMENT, LEGACY_BANJO_TUNING } from '../lib/music/string-order';
import { applyMigrations, getMigrationStatus, loadMigrations, MigrationError, resolveMigrationsFolder, verifyLegacySchema } from './migrate';

const MIGRATIONS = resolveMigrationsFolder();
let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bxb-migrate-test-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A database exactly as the pre-migration app created it, populated with representative records. */
function legacyFixture(file = path.join(tmp, 'legacy.db'), opts: { banjoDependent?: boolean } = {}) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(LEGACY_RUNTIME_SCHEMA_SQL);
  const ins = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
  ins(`INSERT INTO instruments (id,name,family,string_count,default_scale_length,per_string_speaking_lengths,created_at,updated_at) VALUES ('inst-banjo-5','5-string banjo','banjo',5,26.25,?,111,222)`, LEGACY_BANJO_INSTRUMENT.legacySpeakingLengthsJson);
  ins(`INSERT INTO instruments (id,name,family,string_count,default_scale_length,created_at,updated_at) VALUES ('inst-scgc-1','Santa Cruz #1','steel_string_acoustic',6,25.375,111,222)`);
  ins(`INSERT INTO instruments (id,name,family,string_count,default_scale_length,per_string_speaking_lengths,created_at,updated_at) VALUES ('user-fanned','My fanned-fret','other',6,25.5,'[25.5,25.4,25.3,25.2,25.1,25.0]',333,444)`);
  ins(`INSERT INTO tunings (id,human_id,name,string_count,pitches,created_at,updated_at) VALUES ('tuning-t001','T-001','Standard',6,'["E2","A2","D3","G3","B3","E4"]',1,2)`);
  ins(`INSERT INTO tunings (id,human_id,name,string_count,pitches,created_at,updated_at) VALUES (?, 'T-007','Open G banjo',5,?,1,2)`, LEGACY_BANJO_TUNING.id, LEGACY_BANJO_TUNING.legacyPitchesJson);
  ins(`INSERT INTO tunings (id,human_id,name,string_count,pitches,created_at,updated_at) VALUES ('user-5str','T-012','My double C',5,'["D4","C4","G3","C3","g4"]',5,6)`);
  ins(`INSERT INTO motifs (id,human_id,name,tuning_id,instrument_id,function,tab_data,tags,created_at,updated_at) VALUES ('m-uuid-1','M-001','Riff','tuning-t001','inst-scgc-1','riff','[{"id":"c1","notes":[{"stringIndex":0,"fret":3}]}]','["x"]',7,8)`);
  ins(`INSERT INTO compositions (id,human_id,title,created_at,updated_at) VALUES ('c-uuid-1','C-001','Song',9,10)`);
  ins(`INSERT INTO composition_motifs (id,composition_id,motif_id,sort_order) VALUES ('cm-1','c-uuid-1','m-uuid-1',0)`);
  ins(`INSERT INTO positions (id,human_id,tuning_id,string_count,frets,created_at,updated_at) VALUES ('p-uuid-1','P-001','tuning-t001',6,'[0,2,2,1,0,0]',11,12)`);
  ins(`INSERT INTO string_products (id,manufacturer,nominal_gauge,unit_weight,created_at) VALUES ('sp-1','Acme',0.012,NULL,13)`);
  ins(`INSERT INTO attachments (id,parent_type,parent_id,display_name,file_path,mime_type,file_size,created_at) VALUES ('a-1','motif','m-uuid-1','memo','a-1-memo.webm','audio/webm',3,14)`);
  if (opts.banjoDependent) {
    ins(`INSERT INTO motifs (id,human_id,name,tuning_id,instrument_id,function,tab_data,created_at,updated_at) VALUES ('m-banjo','M-002','Banjo roll',?, 'inst-banjo-5','riff','[{"id":"c1","notes":[{"stringIndex":0,"fret":0}]}]',1,1)`, LEGACY_BANJO_TUNING.id);
  }
  return db;
}

function dumpTable(db: Database.Database, table: string) {
  return db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
}

const PRESERVED_TABLES = ['motifs', 'compositions', 'composition_motifs', 'positions', 'attachments', 'setups', 'string_sets', 'capo_configurations'];

describe('migrations on a fresh database', () => {
  it('creates the full schema from migrations only', () => {
    const db = new Database(':memory:');
    const result = applyMigrations(db, MIGRATIONS);
    expect(result.applied).toEqual(['0000_baseline', '0001_review_flags_string_provenance', '0002_canonical_banjo_string_order', '0003_quick_capture_v1_1', '0004_capture_receipts']);
    expect(result.backupPath).toBeNull();
    const cols = (db.prepare(`PRAGMA table_info(string_products)`).all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['catalog_id', 'unit_weight_source', 'source_note', 'source_url', 'verified_at', 'unit_weight']));
    expect(getMigrationStatus(db, MIGRATIONS)).toMatchObject({ state: 'versioned', pending: [] });
    // join tables keep ON DELETE CASCADE, matching the legacy runtime schema
    const fks = db.prepare(`PRAGMA foreign_key_list(composition_motifs)`).all() as { on_delete: string }[];
    expect(fks.every((f) => f.on_delete === 'CASCADE')).toBe(true);
  });

  it('is idempotent', () => {
    const db = new Database(':memory:');
    applyMigrations(db, MIGRATIONS);
    expect(applyMigrations(db, MIGRATIONS)).toEqual({ applied: [], adoptedLegacy: false, backupPath: null });
  });
});

describe('upgrading a pre-migration (legacy) database', () => {
  it('adopts the baseline, preserves every record and migrates only exact legacy seed values', () => {
    const db = legacyFixture();
    expect(verifyLegacySchema(db, MIGRATIONS)).toEqual([]);
    const before = Object.fromEntries(PRESERVED_TABLES.map((t) => [t, dumpTable(db, t)]));
    const tuningsBefore = dumpTable(db, 'tunings') as Record<string, unknown>[];
    const instrumentsBefore = dumpTable(db, 'instruments') as Record<string, unknown>[];

    const backupDir = path.join(tmp, 'backups');
    const result = applyMigrations(db, MIGRATIONS, { backupDir });
    expect(result.adoptedLegacy).toBe(true);
    expect(result.applied).toEqual(['0001_review_flags_string_provenance', '0002_canonical_banjo_string_order', '0003_quick_capture_v1_1', '0004_capture_receipts']);

    // Pre-migration backup holds the untouched original.
    expect(result.backupPath && fs.existsSync(result.backupPath)).toBe(true);
    const backup = new Database(result.backupPath!, { readonly: true });
    expect((backup.prepare(`SELECT pitches FROM tunings WHERE id='tuning-t007'`).get() as { pitches: string }).pitches).toBe(LEGACY_BANJO_TUNING.legacyPitchesJson);
    backup.close();

    // Every pre-existing column value is preserved. Additive migrations may append nullable columns.
    for (const table of PRESERVED_TABLES) {
      const beforeRows = before[table] as Record<string, unknown>[];
      const afterRows = dumpTable(db, table) as Record<string, unknown>[];
      expect(afterRows).toHaveLength(beforeRows.length);
      for (const beforeRow of beforeRows) {
        const afterRow = afterRows.find((row) => row.id === beforeRow.id)!;
        const preExistingValues = Object.fromEntries(Object.keys(beforeRow).map((key) => [key, afterRow[key]]));
        expect(preExistingValues).toEqual(beforeRow);
      }
    }

    // Tunings: only T-007 changed, only its pitches; IDs, human IDs and timestamps preserved.
    const tuningsAfter = dumpTable(db, 'tunings') as Record<string, unknown>[];
    for (const row of tuningsBefore) {
      const after = tuningsAfter.find((r) => r.id === row.id)!;
      if (row.id === 'tuning-t007') {
        expect(after).toEqual({ ...row, pitches: JSON.stringify(LEGACY_BANJO_TUNING.canonicalPitches) });
      } else {
        expect(after).toEqual(row);
      }
    }
    const instrumentsAfter = dumpTable(db, 'instruments') as Record<string, unknown>[];
    for (const row of instrumentsBefore) {
      const after = instrumentsAfter.find((r) => r.id === row.id)!;
      if (row.id === 'inst-banjo-5') {
        expect(after).toEqual({ ...row, per_string_speaking_lengths: JSON.stringify(LEGACY_BANJO_INSTRUMENT.canonicalSpeakingLengths) });
      } else {
        expect(after).toEqual(row);
      }
    }

    // Every rewrite is logged; ambiguous user records are flagged, not changed.
    const flags = db.prepare(`SELECT entity_type, entity_id, flag_type, status FROM review_flags ORDER BY id`).all();
    expect(flags).toEqual(
      expect.arrayContaining([
        { entity_type: 'tuning', entity_id: 'tuning-t007', flag_type: 'legacy_seed_migrated', status: 'info' },
        { entity_type: 'instrument', entity_id: 'inst-banjo-5', flag_type: 'legacy_seed_migrated', status: 'info' },
        { entity_type: 'tuning', entity_id: 'user-5str', flag_type: 'string_order_needs_review', status: 'open' },
        { entity_type: 'instrument', entity_id: 'user-fanned', flag_type: 'string_order_needs_review', status: 'open' },
      ])
    );
    expect(flags).toHaveLength(4);
    expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    db.close();
  });

  it('does not reorder the legacy banjo when other records depend on its string indexes', () => {
    const db = legacyFixture(undefined, { banjoDependent: true });
    applyMigrations(db, MIGRATIONS, { backupDir: path.join(tmp, 'backups') });
    expect((db.prepare(`SELECT pitches FROM tunings WHERE id='tuning-t007'`).get() as { pitches: string }).pitches).toBe(LEGACY_BANJO_TUNING.legacyPitchesJson);
    expect((db.prepare(`SELECT per_string_speaking_lengths p FROM instruments WHERE id='inst-banjo-5'`).get() as { p: string }).p).toBe(LEGACY_BANJO_INSTRUMENT.legacySpeakingLengthsJson);
    const open = db.prepare(`SELECT entity_id FROM review_flags WHERE status='open' AND flag_type='string_order_needs_review' ORDER BY entity_id`).all();
    expect(open).toEqual(expect.arrayContaining([{ entity_id: 'tuning-t007' }, { entity_id: 'inst-banjo-5' }]));
    db.close();
  });

  it('refuses an unrecognised schema without changing anything', () => {
    const db = new Database(path.join(tmp, 'odd.db'));
    db.exec(LEGACY_RUNTIME_SCHEMA_SQL.replace('lyrics TEXT,', ''));
    expect(() => applyMigrations(db, MIGRATIONS, { backupDir: path.join(tmp, 'b') })).toThrow(MigrationError);
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE name IN ('__drizzle_migrations','review_flags')`).all()).toEqual([]);
    expect(fs.existsSync(path.join(tmp, 'b'))).toBe(false);
    db.close();
  });

  it('rolls back every pending migration (and adoption) when one fails', () => {
    const folder = path.join(tmp, 'drizzle');
    fs.cpSync(MIGRATIONS, folder, { recursive: true });
    const journalPath = path.join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.entries.push({ idx: journal.entries.length, version: '6', when: journal.entries.at(-1).when + 1, tag: '0099_broken', breakpoints: true });
    fs.writeFileSync(journalPath, JSON.stringify(journal));
    fs.writeFileSync(path.join(folder, '0099_broken.sql'), 'CREATE TABLE `will_vanish` (`id` text);\n--> statement-breakpoint\nINSERT INTO `no_such_table` VALUES (1);');

    const db = legacyFixture();
    let error: unknown;
    try {
      applyMigrations(db, folder, { backupDir: path.join(tmp, 'backups') });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(MigrationError);
    expect((error as MigrationError).backupPath).toBeTruthy();
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE name IN ('__drizzle_migrations','review_flags','will_vanish')`).all()).toEqual([]);
    expect((db.prepare(`SELECT pitches FROM tunings WHERE id='tuning-t007'`).get() as { pitches: string }).pitches).toBe(LEGACY_BANJO_TUNING.legacyPitchesJson);
    db.close();
  });

  it('refuses when an applied migration file was edited afterwards', () => {
    const folder = path.join(tmp, 'drizzle');
    fs.cpSync(MIGRATIONS, folder, { recursive: true });
    const db = new Database(':memory:');
    applyMigrations(db, folder);
    fs.appendFileSync(path.join(folder, '0001_review_flags_string_provenance.sql'), '\n-- edited');
    expect(() => applyMigrations(db, folder)).toThrow(/modified after being applied/);
  });
});

describe('auto-migration guard (distinguishes fresh from existing databases)', () => {
  it('allows auto-migration for an empty database (no user data at risk)', () => {
    const fresh = new Database(':memory:');
    const status = getMigrationStatus(fresh, MIGRATIONS);
    expect(status.state).toBe('empty');
    // Fresh databases may be initialized automatically.
    const needsExplicit = status.state !== 'empty' && (status.pending.length > 0 || status.state === 'legacy-unversioned');
    expect(needsExplicit).toBe(false);
    fresh.close();
  });

  it('requires explicit migration for a legacy (pre-migration) database', () => {
    const db = legacyFixture(path.join(tmp, 'legacy-guard.db'));
    const status = getMigrationStatus(db, MIGRATIONS);
    expect(status.state).toBe('legacy-unversioned');
    const needsExplicit = status.state !== 'empty' && (status.pending.length > 0 || status.state === 'legacy-unversioned');
    expect(needsExplicit).toBe(true);
    db.close();
  });

  it('requires explicit migration for a versioned database with pending migrations', () => {
    const db = new Database(':memory:');
    // Apply only the baseline, leaving later migrations pending.
    const baseline = path.join(tmp, 'partial-drizzle');
    fs.cpSync(MIGRATIONS, baseline, { recursive: true });
    const journal = JSON.parse(fs.readFileSync(path.join(baseline, 'meta', '_journal.json'), 'utf8'));
    journal.entries = [journal.entries[0]]; // keep only baseline
    fs.writeFileSync(path.join(baseline, 'meta', '_journal.json'), JSON.stringify(journal));
    applyMigrations(db, baseline);
    // Now check against the FULL migrations folder (2 pending).
    const status = getMigrationStatus(db, MIGRATIONS);
    expect(status.state).toBe('versioned');
    expect(status.pending.length).toBeGreaterThan(0);
    const needsExplicit = status.state !== 'empty' && (status.pending.length > 0 || status.state === 'legacy-unversioned');
    expect(needsExplicit).toBe(true);
    db.close();
  });

  it('does not require explicit migration for a fully-up-to-date versioned database', () => {
    const db = new Database(':memory:');
    applyMigrations(db, MIGRATIONS);
    const status = getMigrationStatus(db, MIGRATIONS);
    expect(status.state).toBe('versioned');
    expect(status.pending).toHaveLength(0);
    const needsExplicit = status.state !== 'empty' && (status.pending.length > 0 || status.state === 'legacy-unversioned');
    expect(needsExplicit).toBe(false);
    db.close();
  });
});

describe('unrecognized applied migration rows (fix B)', () => {
  /** Injects a row with an unknown timestamp directly into __drizzle_migrations. */
  function injectUnknownRow(db: Database.Database, when: number) {
    db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`);
    db.prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`).run('abc123def456', when);
  }

  it('rejects an unrecognized row with an older timestamp (in-range, divergent build)', () => {
    const db = new Database(':memory:');
    const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as { entries: { when: number }[] };
    const midTimestamp = journal.entries[0].when + 1; // older than latest but not in journal
    injectUnknownRow(db, midTimestamp);
    expect(() => applyMigrations(db, MIGRATIONS)).toThrow(/not found in this app's migration journal/);
    // Database must be unchanged (review_flags table does not exist).
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='review_flags'`).get()).toBeUndefined();
    db.close();
  });

  it('rejects an unrecognized row with a newer timestamp (newerThanApp is not the only check)', () => {
    const db = new Database(':memory:');
    const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as { entries: { when: number }[] };
    const newerTimestamp = journal.entries[journal.entries.length - 1].when + 999_999;
    injectUnknownRow(db, newerTimestamp);
    // Both newerThanApp AND unmatched checks must fire; either is sufficient to reject.
    expect(() => applyMigrations(db, MIGRATIONS)).toThrow();
    db.close();
  });

  it('succeeds when all applied rows are recognized (fully up-to-date database)', () => {
    const db = new Database(':memory:');
    applyMigrations(db, MIGRATIONS); // apply all known migrations
    // Applying again must be a no-op (idempotent).
    const result = applyMigrations(db, MIGRATIONS);
    expect(result.applied).toHaveLength(0);
    db.close();
  });

  it('succeeds for the legacy-adoption path (no applied rows yet)', () => {
    const db = legacyFixture(path.join(tmp, 'unmatched-legacy.db'));
    const result = applyMigrations(db, MIGRATIONS, { backupDir: path.join(tmp, 'bkp-unmatched') });
    expect(result.adoptedLegacy).toBe(true);
    db.close();
  });
});

describe('applyMigrations journal-gap rejection (P2 regression)', () => {
  const allMigrations = loadMigrations(MIGRATIONS);

  /** Injects a migration row with the correct hash directly into __drizzle_migrations. */
  function injectMigrationRow(db: Database.Database, tag: string) {
    const m = allMigrations.find((x) => x.tag === tag);
    if (!m) throw new Error(`migration not found: ${tag}`);
    db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`);
    db.prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`).run(m.hash, m.when);
  }

  it('rejects a gapped journal (only 0002 applied; 0000 and 0001 absent)', () => {
    // This is the exact path that openNotebookDatabase() takes via applyMigrations().
    // Before this fix, the gapped journal had no pending migrations and applyMigrations()
    // returned success, allowing the application to open the inconsistent database.
    const db = new Database(':memory:');
    injectMigrationRow(db, '0002_canonical_banjo_string_order');
    expect(() => applyMigrations(db, MIGRATIONS)).toThrow(MigrationError);
    expect(() => applyMigrations(db, MIGRATIONS)).toThrow(/gap/i);
    // Database must be unchanged — no new rows added.
    const rows = db.prepare('SELECT created_at FROM __drizzle_migrations ORDER BY created_at').all() as { created_at: number }[];
    const when0002 = allMigrations.find((m) => m.tag === '0002_canonical_banjo_string_order')!.when;
    expect(rows).toHaveLength(1);
    expect(rows[0].created_at).toBe(when0002);
    db.close();
  });

  it('rejects a middle-gap journal (0000 + 0002 applied, 0001 absent)', () => {
    const db = new Database(':memory:');
    injectMigrationRow(db, '0000_baseline');
    injectMigrationRow(db, '0002_canonical_banjo_string_order');
    expect(() => applyMigrations(db, MIGRATIONS)).toThrow(MigrationError);
    expect(() => applyMigrations(db, MIGRATIONS)).toThrow(/gap/i);
    db.close();
  });

  it('accepts a valid contiguous prefix (only baseline actually applied)', () => {
    // Apply baseline via a partial migrations folder, then confirm applyMigrations() runs
    // the pending 0001+0002 without error — a valid prefix is not a gap.
    const partialDir = path.join(tmp, 'partial-gap-test');
    fs.cpSync(MIGRATIONS, partialDir, { recursive: true });
    const journalPath = path.join(partialDir, 'meta', '_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.entries = [journal.entries[0]]; // keep only 0000_baseline
    fs.writeFileSync(journalPath, JSON.stringify(journal));
    const db = new Database(':memory:');
    applyMigrations(db, partialDir); // actually applies baseline SQL + records journal row
    // Full journal sees 0001+0002 as pending; no gap in applied set.
    expect(() => applyMigrations(db, MIGRATIONS)).not.toThrow();
    const status = getMigrationStatus(db, MIGRATIONS);
    expect(status.gapMigrations).toHaveLength(0);
    expect(status.pending).toHaveLength(0);
    db.close();
  });
});

describe('0002 SQL matches the documented legacy constants', () => {
  it('uses exactly the legacy and canonical values from string-order.ts', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS, '0002_canonical_banjo_string_order.sql'), 'utf8');
    expect(sql).toContain(`'${LEGACY_BANJO_TUNING.legacyPitchesJson}'`);
    expect(sql).toContain(`'${JSON.stringify(LEGACY_BANJO_TUNING.canonicalPitches)}'`);
    expect(sql).toContain(`'${LEGACY_BANJO_INSTRUMENT.legacySpeakingLengthsJson}'`);
    expect(sql).toContain(`'${JSON.stringify(LEGACY_BANJO_INSTRUMENT.canonicalSpeakingLengths)}'`);
  });
});
