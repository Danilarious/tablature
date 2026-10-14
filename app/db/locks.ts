import fs from 'fs';
import path from 'path';

/**
 * Process coordination for maintenance tasks (restore) on a single-user local database.
 *
 * Protocol (covers both race orderings atomically):
 *
 *  App side:
 *    1. Write `.open-<pid>` FIRST (fail closed — throws if the marker cannot be created).
 *    2. Re-read `maintenance.lock` AFTER writing the marker.
 *    3. If the lock is held: remove the marker, throw.
 *
 *  Restore side:
 *    1. Pre-check markers (fast-fail if the app is obviously running).
 *    2. Acquire `maintenance.lock` exclusively.
 *    3. Re-check markers INSIDE the lock (catches the race where the app claimed its marker
 *       between the pre-check and the lock acquisition).
 *    4. If a live marker is found: release the lock, throw.
 *
 * This ensures that every concurrent pair of "app opens DB" / "restore runs" is serialised:
 * either the app sees the lock and refuses, or restore sees the marker and refuses.
 *
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

// Tracks whether the exit handler for a given marker has been registered.
const registered = new Set<string>();

/**
 * Claims this process's open-database marker BEFORE opening SQLite, then re-checks the
 * maintenance lock so that any concurrent restore that acquired the lock after our marker
 * appeared will see the marker and refuse.
 *
 * Throws (and removes the marker) if:
 *  - The marker file cannot be created (fail closed — no silent coordination failure).
 *  - A maintenance lock is already held.
 *
 * Returns a release function that removes the marker file immediately (e.g., on a failed
 * open). The process.once('exit') handler also removes it on normal/abnormal exit.
 */
export function claimOpenProcess(databaseDir: string): () => void {
  const marker = path.join(databaseDir, `${OPEN_PREFIX}${process.pid}`);

  // Step 1: Write the marker file first (fail closed on any I/O error).
  try {
    fs.mkdirSync(databaseDir, { recursive: true });
    fs.writeFileSync(marker, new Date().toISOString(), { flag: 'w' });
  } catch (err) {
    throw new Error(
      `Cannot create database coordination marker ${path.basename(marker)}: ` +
        `${(err as Error).message}. Check that ${databaseDir} is writable.`
    );
  }

  // Register the exit-time cleanup once per marker path.
  if (!registered.has(marker)) {
    registered.add(marker);
    process.once('exit', () => {
      try {
        fs.rmSync(marker, { force: true });
      } catch {
        /* ignore */
      }
    });
  }

  const release = () => {
    try {
      fs.rmSync(marker, { force: true });
    } catch {
      /* ignore */
    }
  };

  // Step 2: Re-read the maintenance lock AFTER writing the marker.
  // If a restore process already holds the lock, it will see our marker in its post-lock
  // recheck; our recheck here handles the other ordering.
  const lock = readMaintenanceLock(databaseDir);
  if (lock) {
    release();
    throw new Error(
      `The notebook is in maintenance (${lock.reason}, since ${lock.since}). ` +
        `Wait for it to finish, or remove database/${MAINTENANCE_LOCK} if that process is no longer running.`
    );
  }

  return release;
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
