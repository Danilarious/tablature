import fs from 'fs';
import path from 'path';

/**
 * Process coordination for maintenance tasks (restore) on a single-user local database.
 *
 *  - Every process that opens the database through getDatabase() leaves a marker file
 *    `database/.open-<pid>` (removed on exit). Restore refuses while a live marker exists.
 *  - Restore holds `database/maintenance.lock`; getDatabase() refuses to open while it exists.
 * Stale markers from crashed processes are detected with a liveness check and ignored.
 */

export const MAINTENANCE_LOCK = 'maintenance.lock';
const OPEN_PREFIX = '.open-';

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function maintenanceLockPath(databaseDir: string): string {
  return path.join(databaseDir, MAINTENANCE_LOCK);
}

export function readMaintenanceLock(databaseDir: string): { pid: number; reason: string; since: string } | null {
  try {
    return JSON.parse(fs.readFileSync(maintenanceLockPath(databaseDir), 'utf8'));
  } catch {
    return null;
  }
}

/** Acquires the maintenance lock atomically. Throws if another maintenance task holds it. */
export function acquireMaintenanceLock(databaseDir: string, reason: string): () => void {
  const lockPath = maintenanceLockPath(databaseDir);
  const existing = readMaintenanceLock(databaseDir);
  if (existing && !isProcessAlive(existing.pid)) fs.rmSync(lockPath, { force: true }); // stale
  try {
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, reason, since: new Date().toISOString() }), { flag: 'wx' });
  } catch {
    throw new Error(`Another maintenance task holds ${MAINTENANCE_LOCK}. Wait for it to finish.`);
  }
  return () => fs.rmSync(lockPath, { force: true });
}

const registered = new Set<string>();

/** Records that this process has the database open (used by restore to refuse unsafe swaps). */
export function registerOpenProcess(databaseDir: string): void {
  const marker = path.join(databaseDir, `${OPEN_PREFIX}${process.pid}`);
  if (registered.has(marker)) return;
  try {
    fs.writeFileSync(marker, new Date().toISOString());
    registered.add(marker);
    process.once('exit', () => {
      try {
        fs.rmSync(marker, { force: true });
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* read-only filesystem: restore will fall back to the maintenance lock only */
  }
}

/** Other live processes that currently have the database open. */
export function liveOpenProcesses(databaseDir: string): number[] {
  if (!fs.existsSync(databaseDir)) return [];
  return fs
    .readdirSync(databaseDir)
    .filter((f) => f.startsWith(OPEN_PREFIX))
    .map((f) => Number(f.slice(OPEN_PREFIX.length)))
    .filter((pid) => pid !== process.pid && isProcessAlive(pid));
}
