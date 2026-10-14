import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { getStorageDirs } from '../lib/paths';
import { applyMigrations, getMigrationStatus, MigrationError, resolveMigrationsFolder } from './migrate';
import { claimOpenProcess } from './locks';

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqliteRaw: InstanceType<typeof Database> | null = null;

/**
 * Opens the notebook database given explicit storage paths. Extracted for testability;
 * production code should call getDatabase() which wraps this with the singleton pattern.
 *
 * Safety rules:
 *  - A fresh/empty database is initialized from migrations automatically.
 *  - An existing database with pending or legacy-unversioned migrations is NOT migrated
 *    automatically. Throws MigrationError so the caller can return 503 with clear instructions.
 *    Run `npm run db:migrate` (or `scripts/launch-app.sh`) to migrate safely with a backup.
 *  - The open-process marker is written BEFORE SQLite is opened so that any concurrent
 *    restore sees the marker and refuses (see app/db/locks.ts for the full protocol).
 *  - Every failure path after claimOpenProcess() releases the marker immediately so a
 *    failed open does not block a subsequent restore.
 */
export function openNotebookDatabase(opts: { dbPath: string; databaseDir: string; backupsDir: string }) {
  let releaseMarker: (() => void) | null = null;
  try {
    releaseMarker = claimOpenProcess(opts.databaseDir);
  } catch (err) {
    throw new MigrationError((err as Error).message);
  }

  // SQLite constructor is inside the try block so a failure (permissions, corrupt file,
  // dbPath is a directory, etc.) triggers the marker release in the catch handler.
  let sqlite: InstanceType<typeof Database> | null = null;
  try {
    sqlite = new Database(opts.dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('busy_timeout = 5000');

    const migFolder = resolveMigrationsFolder();
    const status = getMigrationStatus(sqlite, migFolder);

    // Refuse to silently migrate an existing database. A fresh/empty one is safe to init.
    if (status.state !== 'empty' && (status.pending.length > 0 || status.state === 'legacy-unversioned')) {
      throw new MigrationError(
        'This database has pending schema migrations. ' +
          'Run `npm run db:migrate` (or use `scripts/launch-app.sh`) to apply them safely with a backup first. ' +
          `(${status.pending.length} migration(s) pending${status.state === 'legacy-unversioned' ? '; legacy database adoption required' : ''})`
      );
    }

    const result = applyMigrations(sqlite, migFolder, {
      backupDir: opts.backupsDir,
      log: (msg) => console.log(`[db] ${msg}`),
    });
    if (result.applied.length > 0 || result.adoptedLegacy) {
      console.log(`[db] Schema up to date${result.backupPath ? ' (pre-migration backup saved in backups/)' : ''}.`);
    }
  } catch (err) {
    sqlite?.close();
    releaseMarker?.(); // Remove the marker — open failed, this process is not using the DB.
    releaseMarker = null;
    if (err instanceof MigrationError) console.error(`[db] ${err.message}`);
    throw err;
  }

  // Marker stays for the lifetime of the process (exit handler registered by claimOpenProcess).
  return { db: drizzle(sqlite!, { schema }), sqlite: sqlite! };
}

/** Returns the process-wide singleton database connection, opening it on first call. */
export function getDatabase() {
  if (dbInstance) {
    return { db: dbInstance, sqlite: sqliteRaw! };
  }

  const { dbPath, databaseDir, backupsDir } = getStorageDirs();
  const result = openNotebookDatabase({ dbPath, databaseDir, backupsDir });
  sqliteRaw = result.sqlite;
  dbInstance = result.db;
  return { db: dbInstance, sqlite: sqliteRaw };
}
