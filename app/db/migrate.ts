import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { readMigrationFiles } from 'drizzle-orm/migrator';

/**
 * Schema migrations (Drizzle Kit format, `drizzle/` folder, `__drizzle_migrations` table).
 *
 * Why a custom runner instead of drizzle's `migrate()`:
 *  - Databases created before migrations existed (runtime CREATE TABLE IF NOT EXISTS) are
 *    *adopted*: their schema is verified against the baseline snapshot and the baseline is
 *    recorded as applied, without re-creating or touching any table or row.
 *  - Pending migrations run inside one `BEGIN IMMEDIATE` transaction and the applied state is
 *    re-read inside that transaction, so two processes starting at once cannot double-apply.
 *  - A WAL-safe `VACUUM INTO` copy is written before any migration touches existing data.
 * The bookkeeping table format is identical to drizzle-orm's, so drizzle-kit stays compatible.
 */

export const MIGRATIONS_TABLE = '__drizzle_migrations';
export const BASELINE_TAG = '0000_baseline';

export class MigrationError extends Error {
  constructor(message: string, public readonly backupPath: string | null = null) {
    super(message);
    this.name = 'MigrationError';
  }
}

export function resolveMigrationsFolder(env: NodeJS.ProcessEnv = process.env): string {
  return env.MUSIC_NOTEBOOK_MIGRATIONS_DIR ? path.resolve(env.MUSIC_NOTEBOOK_MIGRATIONS_DIR) : path.resolve(process.cwd(), 'drizzle');
}

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

export interface MigrationFile {
  tag: string;
  when: number;
  hash: string;
  statements: string[];
}

export function loadMigrations(folder: string): MigrationFile[] {
  const journalPath = path.join(folder, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) {
    throw new MigrationError(`Migration journal not found (expected drizzle/meta/_journal.json). Is the "drizzle" folder deployed next to the app?`);
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as { entries: JournalEntry[] };
  const files = readMigrationFiles({ migrationsFolder: folder });
  return journal.entries.map((e, i) => ({
    tag: e.tag,
    when: e.when,
    hash: files[i].hash,
    statements: files[i].sql.map((s) => s.trim()).filter((s) => s.replace(/^\s*--.*$/gm, '').trim().length > 0),
  }));
}

type Sqlite = Database.Database;

function tableExists(sqlite: Sqlite, name: string): boolean {
  return !!sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
}

function userTables(sqlite: Sqlite): string[] {
  return (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> ?`).all(MIGRATIONS_TABLE) as { name: string }[]).map((r) => r.name);
}

export type DatabaseState = 'empty' | 'legacy-unversioned' | 'versioned';

export interface AppliedMigration {
  tag: string | null;
  hash: string;
  createdAt: number;
  /** false when the migration file on disk was edited after being applied */
  hashMatches: boolean;
}

export interface MigrationStatus {
  state: DatabaseState;
  applied: AppliedMigration[];
  pending: { tag: string; when: number }[];
  /** Applied rows newer than any local migration: DB comes from a newer app version. */
  newerThanApp: boolean;
}

export function getMigrationStatus(sqlite: Sqlite, folder: string = resolveMigrationsFolder()): MigrationStatus {
  const migrations = loadMigrations(folder);
  const hasTable = tableExists(sqlite, MIGRATIONS_TABLE);
  const tables = userTables(sqlite);
  const state: DatabaseState = hasTable ? 'versioned' : tables.length === 0 ? 'empty' : 'legacy-unversioned';
  const rows = hasTable ? (sqlite.prepare(`SELECT hash, created_at FROM ${MIGRATIONS_TABLE} ORDER BY created_at ASC`).all() as { hash: string; created_at: number }[]) : [];
  const applied = rows.map((r) => {
    const m = migrations.find((x) => x.when === Number(r.created_at));
    return { tag: m?.tag ?? null, hash: r.hash, createdAt: Number(r.created_at), hashMatches: m ? m.hash === r.hash : false };
  });
  const last = rows.length > 0 ? Number(rows[rows.length - 1].created_at) : null;
  // Legacy databases already contain the baseline schema; only later migrations are pending.
  const pending = migrations
    .filter((m) => (state === 'legacy-unversioned' ? m.tag !== BASELINE_TAG : last === null || m.when > last))
    .map((m) => ({ tag: m.tag, when: m.when }));
  const newestLocal = migrations.length > 0 ? migrations[migrations.length - 1].when : 0;
  return { state, applied, pending, newerThanApp: last !== null && last > newestLocal };
}

/** Expected columns per table from the baseline snapshot (single source: drizzle-kit output). */
function baselineColumns(folder: string): Record<string, string[]> {
  const snapPath = path.join(folder, 'meta', '0000_snapshot.json');
  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8')) as { tables: Record<string, { name: string; columns: Record<string, { name: string }> }> };
  const out: Record<string, string[]> = {};
  for (const t of Object.values(snap.tables)) out[t.name] = Object.values(t.columns).map((c) => c.name).sort();
  return out;
}

/** Verifies a pre-migration database has exactly the baseline tables/columns. */
export function verifyLegacySchema(sqlite: Sqlite, folder: string = resolveMigrationsFolder()): string[] {
  const problems: string[] = [];
  for (const [table, expected] of Object.entries(baselineColumns(folder))) {
    if (!tableExists(sqlite, table)) {
      problems.push(`missing table "${table}"`);
      continue;
    }
    const actual = (sqlite.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as { name: string }[]).map((c) => c.name).sort();
    const missing = expected.filter((c) => !actual.includes(c));
    const extra = actual.filter((c) => !expected.includes(c));
    if (missing.length) problems.push(`table "${table}" is missing columns: ${missing.join(', ')}`);
    if (extra.length) problems.push(`table "${table}" has unexpected columns: ${extra.join(', ')}`);
  }
  return problems;
}

function timestampSlug(d: Date): string {
  return d.toISOString().replace(/[:.]/g, '-');
}

/** WAL-safe, transactionally consistent single-file copy of the live database. */
export function vacuumInto(sqlite: Sqlite, destPath: string): void {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  if (fs.existsSync(destPath)) throw new MigrationError(`Refusing to overwrite existing file ${path.basename(destPath)}.`);
  sqlite.prepare('VACUUM INTO ?').run(destPath);
}

export interface ApplyOptions {
  /** Directory for the automatic pre-migration backup. Omit only for empty/in-memory DBs. */
  backupDir?: string | null;
  now?: () => Date;
  log?: (msg: string) => void;
}

export interface ApplyResult {
  applied: string[];
  adoptedLegacy: boolean;
  backupPath: string | null;
}

/**
 * Returns a human-readable incompatibility reason if the database's applied migration
 * journal cannot be reconciled with the local migration files, or null if compatible.
 *
 * Incompatible conditions (fail-closed; the database must not be migrated or opened):
 *  - An applied row whose timestamp matches no local migration (divergent/unknown build).
 *  - The latest applied timestamp is newer than the newest local migration (app is behind).
 *  - An applied migration's file on disk was modified after it was applied.
 *
 * This is the single authoritative compatibility check, shared by applyMigrations() and the
 * read-only CLI status/pending paths so all callers enforce the same rules consistently.
 */
export function migrationCompatibilityError(status: MigrationStatus): string | null {
  const unmatched = status.applied.filter((a) => a.tag === null);
  if (unmatched.length > 0) {
    return (
      `Database has applied migration row(s) not found in this app's migration journal ` +
      `(timestamps: ${unmatched.map((a) => a.createdAt).join(', ')}). ` +
      `This database may have been written by a different or divergent build.`
    );
  }
  if (status.newerThanApp) {
    return 'This database was written by a newer version of BxB Music Notebook. Update the app first.';
  }
  const tampered = status.applied.filter((a) => a.tag !== null && !a.hashMatches);
  if (tampered.length > 0) {
    return `Applied migration file(s) were modified after being applied: ${tampered.map((t) => t.tag).join(', ')}. Restore the original files.`;
  }
  return null;
}

export function applyMigrations(sqlite: Sqlite, folder: string = resolveMigrationsFolder(), opts: ApplyOptions = {}): ApplyResult {
  const log = opts.log ?? (() => {});
  const now = opts.now ?? (() => new Date());
  const migrations = loadMigrations(folder);
  const before = getMigrationStatus(sqlite, folder);

  // Reject every applied row that cannot be matched to a known local migration, regardless
  // of its timestamp. A null tag means the row came from a divergent or unknown build; the
  // pending-migration inference would otherwise silently open or migrate an unknown schema.
  const unmatched = before.applied.filter((a) => a.tag === null);
  if (unmatched.length > 0) {
    throw new MigrationError(
      `Database has applied migration row(s) not found in this app's migration journal ` +
        `(timestamps: ${unmatched.map((a) => a.createdAt).join(', ')}). ` +
        `This database may have been written by a different or divergent build; nothing was changed.`
    );
  }
  if (before.newerThanApp) {
    throw new MigrationError('This database was written by a newer version of BxB Music Notebook. Update the app; nothing was changed.');
  }
  const tampered = before.applied.filter((a) => a.tag && !a.hashMatches);
  if (tampered.length > 0) {
    throw new MigrationError(`Applied migration file(s) were modified after being applied: ${tampered.map((t) => t.tag).join(', ')}. Restore the original files; nothing was changed.`);
  }
  if (before.state === 'legacy-unversioned') {
    const problems = verifyLegacySchema(sqlite, folder);
    if (problems.length > 0) {
      throw new MigrationError(`Existing database schema is not the recognised pre-migration baseline (${problems.join('; ')}). Nothing was changed. Back up storage/ and ask for help before continuing.`);
    }
  }
  if (before.pending.length === 0 && before.state !== 'legacy-unversioned') {
    return { applied: [], adoptedLegacy: false, backupPath: null };
  }

  // Back up before touching a database that already holds data.
  let backupPath: string | null = null;
  if (before.state !== 'empty' && opts.backupDir) {
    const target = before.pending[before.pending.length - 1]?.tag ?? BASELINE_TAG;
    backupPath = path.join(opts.backupDir, `pre-migrate-${timestampSlug(now())}-to-${target}.db`);
    vacuumInto(sqlite, backupPath);
    log(`Pre-migration backup written: ${path.basename(backupPath)}`);
  }

  const applied: string[] = [];
  let adoptedLegacy = false;
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    // Re-read inside the write lock: another process may have migrated meanwhile.
    const inTx = getMigrationStatus(sqlite, folder);
    sqlite.exec(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`);
    const record = sqlite.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`);
    if (inTx.state === 'legacy-unversioned') {
      const baseline = migrations.find((m) => m.tag === BASELINE_TAG);
      if (!baseline) throw new MigrationError('Baseline migration 0000_baseline is missing.');
      record.run(baseline.hash, baseline.when);
      adoptedLegacy = true;
      log('Adopted existing pre-migration database at baseline (no tables or rows changed).');
    }
    for (const p of inTx.pending) {
      const m = migrations.find((x) => x.tag === p.tag)!;
      for (const stmt of m.statements) sqlite.prepare(stmt).run();
      record.run(m.hash, m.when);
      applied.push(m.tag);
      log(`Applied migration ${m.tag}`);
    }
    sqlite.exec('COMMIT');
  } catch (err) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {
      /* already rolled back */
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new MigrationError(
      `Database migration failed and was rolled back; the database is unchanged. ${backupPath ? `A pre-migration copy is at backups/${path.basename(backupPath)}. ` : ''}Reason: ${reason}`,
      backupPath
    );
  }

  const fkProblems = sqlite.prepare('PRAGMA foreign_key_check').all();
  if (fkProblems.length > 0) log(`Warning: ${fkProblems.length} pre-existing foreign key inconsistencies (reported, not changed).`);
  return { applied, adoptedLegacy, backupPath };
}
