import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_RUNTIME_SCHEMA_SQL } from '../test/fixtures/legacy-schema';
import { applyMigrations, MigrationError, resolveMigrationsFolder } from './migrate';
import { openNotebookDatabase } from './client';

const MIGRATIONS = resolveMigrationsFolder();

let tmpDir: string;
let opts: { dbPath: string; databaseDir: string; backupsDir: string };

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bxb-client-test-'));
  opts = {
    databaseDir: path.join(tmpDir, 'database'),
    dbPath: path.join(tmpDir, 'database', 'notebook.db'),
    backupsDir: path.join(tmpDir, 'backups'),
  };
  fs.mkdirSync(opts.databaseDir, { recursive: true });
  fs.mkdirSync(opts.backupsDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('openNotebookDatabase (getDatabase integration)', () => {
  it('auto-initializes a fresh empty database from migrations', () => {
    const { sqlite } = openNotebookDatabase(opts);
    const tables = (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as { name: string }[]).map((r) => r.name);
    expect(tables).toContain('motifs');
    expect(tables).toContain('review_flags');
    expect(tables).toContain('__drizzle_migrations');
    sqlite.close();
  });

  it('refuses a legacy (pre-migration) database and releases the open marker', () => {
    const legacy = new Database(opts.dbPath);
    legacy.exec(LEGACY_RUNTIME_SCHEMA_SQL);
    legacy.close();

    expect(() => openNotebookDatabase(opts)).toThrow(MigrationError);
    expect(() => openNotebookDatabase(opts)).toThrow(/pending schema migrations/);
    // Marker must be cleaned up after each refused open.
    expect(fs.existsSync(path.join(opts.databaseDir, `.open-${process.pid}`))).toBe(false);
  });

  it('refuses a versioned database with pending migrations and releases the marker', () => {
    // Build a DB that has only the baseline migration applied, leaving later ones pending.
    const partialDir = path.join(tmpDir, 'partial-drizzle');
    fs.cpSync(MIGRATIONS, partialDir, { recursive: true });
    const journalPath = path.join(partialDir, 'meta', '_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.entries = [journal.entries[0]]; // keep only the baseline
    fs.writeFileSync(journalPath, JSON.stringify(journal));

    const db = new Database(opts.dbPath);
    applyMigrations(db, partialDir); // applies only baseline with truncated journal
    db.close();

    // Now open with the full migrations folder — 2 migrations are pending.
    expect(() => openNotebookDatabase(opts)).toThrow(MigrationError);
    expect(fs.existsSync(path.join(opts.databaseDir, `.open-${process.pid}`))).toBe(false);
  });

  it('releases the open marker when the SQLite constructor fails (dbPath is a directory)', () => {
    // Force the Database constructor to throw: make dbPath a directory, not a file.
    fs.mkdirSync(opts.dbPath, { recursive: true });

    expect(() => openNotebookDatabase(opts)).toThrow();
    // The marker must be removed even though the error came from inside the constructor.
    expect(fs.existsSync(path.join(opts.databaseDir, `.open-${process.pid}`))).toBe(false);
  });
});
