import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { getStorageDirs } from '../lib/paths';
import { applyMigrations, MigrationError, resolveMigrationsFolder } from './migrate';
import { MAINTENANCE_LOCK, readMaintenanceLock, registerOpenProcess } from './locks';

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqliteRaw: InstanceType<typeof Database> | null = null;

/**
 * Opens the notebook database. Schema comes ONLY from Drizzle migrations in `drizzle/`
 * (app/db/schema.ts is the single source; there is no runtime CREATE TABLE). Pending
 * migrations are applied at first open after a WAL-safe pre-migration backup; if that fails
 * the database is left unchanged and a MigrationError explains how to recover.
 */
export function getDatabase() {
  if (dbInstance) {
    return { db: dbInstance, sqlite: sqliteRaw! };
  }

  const { dbPath, databaseDir, backupsDir } = getStorageDirs();
  const lock = readMaintenanceLock(databaseDir);
  if (lock) {
    throw new MigrationError(`The notebook is in maintenance (${lock.reason}, since ${lock.since}). Wait for it to finish, or remove database/${MAINTENANCE_LOCK} if that process is no longer running.`);
  }

  const sqlite = new Database(dbPath);
  try {
    // Pragmas for reliability and performance
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('busy_timeout = 5000');

    const result = applyMigrations(sqlite, resolveMigrationsFolder(), {
      backupDir: backupsDir,
      log: (msg) => console.log(`[db] ${msg}`),
    });
    if (result.applied.length > 0 || result.adoptedLegacy) {
      console.log(`[db] Schema up to date${result.backupPath ? ' (pre-migration backup saved in backups/)' : ''}.`);
    }
  } catch (err) {
    sqlite.close();
    if (err instanceof MigrationError) console.error(`[db] ${err.message}`);
    throw err;
  }

  registerOpenProcess(databaseDir);
  sqliteRaw = sqlite;
  dbInstance = drizzle(sqlite, { schema });
  return { db: dbInstance, sqlite: sqliteRaw };
}
