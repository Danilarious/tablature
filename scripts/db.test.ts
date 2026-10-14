/**
 * Integration tests for scripts/db.ts migration CLI commands.
 *
 * Tests the shared migrationCompatibilityError() path and verifies that db:pending exits
 * with the correct code for each database state (used by scripts/launch-app.sh). Each test
 * uses an isolated MUSIC_NOTEBOOK_DATA_DIR and never touches the real database.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_RUNTIME_SCHEMA_SQL } from '../app/test/fixtures/legacy-schema';
import { applyMigrations, getMigrationStatus, loadMigrations, migrationCompatibilityError, resolveMigrationsFolder, type MigrationStatus } from '../app/db/migrate';

const MIGRATIONS = resolveMigrationsFolder();

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bxb-db-cli-test-'));
  const databaseDir = path.join(tmpDir, 'database');
  fs.mkdirSync(databaseDir, { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'media'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'backups'), { recursive: true });
  dbPath = path.join(databaseDir, 'notebook.db');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Runs `npx tsx scripts/db.ts <cmd>` with the isolated data dir and returns { exitCode, stdout, stderr }. */
function runCli(cmd: string) {
  const result = spawnSync('npx', ['tsx', 'scripts/db.ts', cmd], {
    env: { ...process.env, MUSIC_NOTEBOOK_DATA_DIR: tmpDir },
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '..'),
    timeout: 30_000,
  });
  return { exitCode: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** Injects a row with an unrecognized timestamp into __drizzle_migrations. */
function injectUnknownRow(db: Database.Database, when: number) {
  db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`);
  db.prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`).run('deadbeef', when);
}

// ---------------------------------------------------------------------------
// migrationCompatibilityError — unit-level tests (no subprocess)
// ---------------------------------------------------------------------------

describe('migrationCompatibilityError', () => {
  it('returns null for an empty database (safe to auto-init)', () => {
    const db = new Database(':memory:');
    const status = getMigrationStatus(db, MIGRATIONS);
    expect(migrationCompatibilityError(status)).toBeNull();
    db.close();
  });

  it('returns null for a fully up-to-date versioned database', () => {
    const db = new Database(':memory:');
    applyMigrations(db, MIGRATIONS);
    const status = getMigrationStatus(db, MIGRATIONS);
    expect(migrationCompatibilityError(status)).toBeNull();
    db.close();
  });

  it('returns null for a legacy-unversioned database (compatible; needs adoption)', () => {
    const db = new Database(path.join(tmpDir, 'legacy.db'));
    db.exec(LEGACY_RUNTIME_SCHEMA_SQL);
    const status = getMigrationStatus(db, MIGRATIONS);
    expect(status.state).toBe('legacy-unversioned');
    expect(migrationCompatibilityError(status)).toBeNull();
    db.close();
  });

  it('returns null for a versioned database with pending migrations', () => {
    // Apply only the baseline, leaving later migrations pending.
    const partialDir = path.join(tmpDir, 'partial-drizzle');
    fs.cpSync(MIGRATIONS, partialDir, { recursive: true });
    const journalPath = path.join(partialDir, 'meta', '_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.entries = [journal.entries[0]];
    fs.writeFileSync(journalPath, JSON.stringify(journal));
    const db = new Database(':memory:');
    applyMigrations(db, partialDir);
    const status = getMigrationStatus(db, MIGRATIONS); // full journal has pending
    expect(status.pending.length).toBeGreaterThan(0);
    expect(migrationCompatibilityError(status)).toBeNull();
    db.close();
  });

  it('reports an unrecognized applied row (divergent build, older timestamp)', () => {
    const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as { entries: { when: number }[] };
    const midTimestamp = journal.entries[0].when + 1;
    const db = new Database(':memory:');
    injectUnknownRow(db, midTimestamp);
    const status = getMigrationStatus(db, MIGRATIONS);
    const err = migrationCompatibilityError(status);
    expect(err).toMatch(/not found in this app's migration journal/);
    expect(err).toContain(String(midTimestamp));
    db.close();
  });

  it('reports a newer-than-app timestamp (newerThanApp)', () => {
    const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as { entries: { when: number }[] };
    const newerTimestamp = journal.entries[journal.entries.length - 1].when + 999_999;
    const db = new Database(':memory:');
    injectUnknownRow(db, newerTimestamp);
    const status = getMigrationStatus(db, MIGRATIONS);
    const err = migrationCompatibilityError(status);
    expect(err).toBeTruthy(); // catches via unmatched (tag: null) or newerThanApp
    db.close();
  });

  it('reports a tampered migration hash (file modified after being applied)', () => {
    const partialDir = path.join(tmpDir, 'tampered-drizzle');
    fs.cpSync(MIGRATIONS, partialDir, { recursive: true });
    const db = new Database(':memory:');
    applyMigrations(db, partialDir);
    // Modify a migration file after applying it.
    fs.appendFileSync(path.join(partialDir, '0001_review_flags_string_provenance.sql'), '\n-- tampered');
    const status = getMigrationStatus(db, partialDir);
    const err = migrationCompatibilityError(status);
    expect(err).toMatch(/modified after being applied/);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// migrationCompatibilityError — journal-gap detection (P2 regression)
// ---------------------------------------------------------------------------

describe('migrationCompatibilityError gap detection', () => {
  /** Injects a specific local migration row (correct hash) by tag. */
  function injectMigrationRow(db: Database.Database, tag: string) {
    const migrations = loadMigrations(MIGRATIONS);
    const m = migrations.find((x) => x.tag === tag);
    if (!m) throw new Error(`migration not found: ${tag}`);
    db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`);
    db.prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`).run(m.hash, m.when);
  }

  it('returns null for an empty database (no rows, no gap)', () => {
    const db = new Database(':memory:');
    const status = getMigrationStatus(db, MIGRATIONS);
    expect(status.gapMigrations).toHaveLength(0);
    expect(migrationCompatibilityError(status)).toBeNull();
    db.close();
  });

  it('returns null for a valid first-migration-only prefix (only baseline applied)', () => {
    const db = new Database(':memory:');
    injectMigrationRow(db, '0000_baseline');
    const status = getMigrationStatus(db, MIGRATIONS);
    expect(status.gapMigrations).toHaveLength(0);
    expect(migrationCompatibilityError(status)).toBeNull();
    db.close();
  });

  it('returns null for a valid multi-migration prefix (baseline + 0001 applied)', () => {
    const db = new Database(':memory:');
    injectMigrationRow(db, '0000_baseline');
    injectMigrationRow(db, '0001_review_flags_string_provenance');
    const status = getMigrationStatus(db, MIGRATIONS);
    expect(status.gapMigrations).toHaveLength(0);
    expect(migrationCompatibilityError(status)).toBeNull();
    db.close();
  });

  it('returns null for a complete valid journal (all migrations applied)', () => {
    const db = new Database(':memory:');
    applyMigrations(db, MIGRATIONS);
    const status = getMigrationStatus(db, MIGRATIONS);
    expect(status.gapMigrations).toHaveLength(0);
    expect(migrationCompatibilityError(status)).toBeNull();
    db.close();
  });

  it('reports a gap when only 0001 is applied (baseline absent)', () => {
    const db = new Database(':memory:');
    injectMigrationRow(db, '0001_review_flags_string_provenance');
    const status = getMigrationStatus(db, MIGRATIONS);
    expect(status.gapMigrations.map((g) => g.tag)).toContain('0000_baseline');
    const err = migrationCompatibilityError(status);
    expect(err).toMatch(/gap/i);
    expect(err).toContain('0000_baseline');
    db.close();
  });

  it('reports a gap when only 0002 is applied (baseline and 0001 absent)', () => {
    // This is the exact reported example: correctly hashed later migration, earlier ones absent.
    const db = new Database(':memory:');
    injectMigrationRow(db, '0002_canonical_banjo_string_order');
    const status = getMigrationStatus(db, MIGRATIONS);
    expect(status.gapMigrations.map((g) => g.tag)).toContain('0000_baseline');
    expect(status.gapMigrations.map((g) => g.tag)).toContain('0001_review_flags_string_provenance');
    expect(status.pending).toHaveLength(0); // nothing after 0002 — the bug's symptom
    const err = migrationCompatibilityError(status);
    expect(err).toMatch(/gap/i);
    db.close();
  });

  it('reports a gap when baseline and 0002 are applied but 0001 is missing (middle gap)', () => {
    const db = new Database(':memory:');
    injectMigrationRow(db, '0000_baseline');
    injectMigrationRow(db, '0002_canonical_banjo_string_order');
    const status = getMigrationStatus(db, MIGRATIONS);
    expect(status.gapMigrations.map((g) => g.tag)).toEqual(['0001_review_flags_string_provenance']);
    const err = migrationCompatibilityError(status);
    expect(err).toMatch(/gap/i);
    expect(err).toContain('0001_review_flags_string_provenance');
    db.close();
  });

  it('db:pending exits 11 for a gapped journal', () => {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    injectMigrationRow(db, '0002_canonical_banjo_string_order');
    db.close();
    const r = runCli('pending');
    expect(r.exitCode).toBe(11);
    expect(r.stderr).toMatch(/incompatible/i);
  });

  it('db:migrate exits 1 without touching the database for a gapped journal', () => {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    injectMigrationRow(db, '0002_canonical_banjo_string_order');
    db.close();
    const r = runCli('migrate');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/incompatible/i);
    // No backup must have been created.
    expect(fs.readdirSync(path.join(tmpDir, 'backups'))).toHaveLength(0);
    // Database must be unchanged.
    const check = new Database(dbPath, { readonly: true });
    const rows = check.prepare(`SELECT created_at FROM __drizzle_migrations`).all() as { created_at: number }[];
    check.close();
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// db:pending exit codes — integration tests (subprocess)
// ---------------------------------------------------------------------------

describe('db:pending exit codes (used by launch-app.sh)', () => {
  it('exits 0 for a fresh (no database) case', () => {
    // No dbPath exists; the CLI script exits 0 with "No database yet" message.
    const r = runCli('pending');
    expect(r.exitCode).toBe(0);
  });

  it('exits 0 for a fully up-to-date versioned database', () => {
    const db = new Database(dbPath);
    applyMigrations(db, MIGRATIONS);
    db.close();
    const r = runCli('pending');
    expect(r.exitCode).toBe(0);
  });

  it('exits 10 for a legacy-unversioned database (needs adoption)', () => {
    const db = new Database(dbPath);
    db.exec(LEGACY_RUNTIME_SCHEMA_SQL);
    db.close();
    const r = runCli('pending');
    expect(r.exitCode).toBe(10);
  });

  it('exits 10 for a versioned database with pending migrations', () => {
    const partialDir = path.join(tmpDir, 'partial-drizzle');
    fs.cpSync(MIGRATIONS, partialDir, { recursive: true });
    const journal = JSON.parse(fs.readFileSync(path.join(partialDir, 'meta', '_journal.json'), 'utf8'));
    journal.entries = [journal.entries[0]];
    fs.writeFileSync(path.join(partialDir, 'meta', '_journal.json'), JSON.stringify(journal));
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    applyMigrations(db, partialDir);
    db.close();
    const r = runCli('pending');
    expect(r.exitCode).toBe(10);
  });

  it('exits 11 for a database with an unrecognized applied row (incompatible)', () => {
    const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as { entries: { when: number }[] };
    const midTimestamp = journal.entries[0].when + 1;
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    injectUnknownRow(db, midTimestamp);
    db.close();
    const r = runCli('pending');
    expect(r.exitCode).toBe(11);
    expect(r.stderr).toMatch(/incompatible/i);
    // Database must be unchanged after the incompatibility check.
    const check = new Database(dbPath, { readonly: true });
    const rows = check.prepare(`SELECT created_at FROM __drizzle_migrations`).all() as { created_at: number }[];
    check.close();
    expect(rows).toHaveLength(1); // only the injected row; no rows were added or removed
    expect(rows[0].created_at).toBe(midTimestamp);
  });

  it('exits 11 for a database with a tampered migration hash (incompatible)', () => {
    const partialDir = path.join(tmpDir, 'tampered-drizzle-pending');
    fs.cpSync(MIGRATIONS, partialDir, { recursive: true });
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    applyMigrations(db, partialDir);
    db.close();
    fs.appendFileSync(path.join(partialDir, '0001_review_flags_string_provenance.sql'), '\n-- tampered');
    // Run pending with the tampered drizzle folder.
    const r = spawnSync('npx', ['tsx', 'scripts/db.ts', 'pending'], {
      env: { ...process.env, MUSIC_NOTEBOOK_DATA_DIR: tmpDir, MUSIC_NOTEBOOK_MIGRATIONS_DIR: partialDir },
      encoding: 'utf8',
      cwd: path.resolve(__dirname, '..'),
      timeout: 30_000,
    });
    expect(r.status).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// db:migrate compatibility check — integration tests
// ---------------------------------------------------------------------------

describe('db:migrate compatibility validation', () => {
  it('exits 1 without touching the database when an unrecognized applied row exists', () => {
    const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as { entries: { when: number }[] };
    const midTimestamp = journal.entries[0].when + 1;
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    injectUnknownRow(db, midTimestamp);
    db.close();
    const r = runCli('migrate');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/incompatible/i);
    // No backup was created (we stopped before creating one).
    const backups = fs.readdirSync(path.join(tmpDir, 'backups'));
    expect(backups).toHaveLength(0);
    // Database must be unchanged.
    const check = new Database(dbPath, { readonly: true });
    const rows = check.prepare(`SELECT created_at FROM __drizzle_migrations`).all() as { created_at: number }[];
    check.close();
    expect(rows).toHaveLength(1);
  });

  it('reports "up to date" for a fully current compatible database without creating a backup', () => {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    applyMigrations(db, MIGRATIONS);
    db.close();
    const r = runCli('migrate');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/up to date/i);
    expect(fs.readdirSync(path.join(tmpDir, 'backups'))).toHaveLength(0);
  });
});
