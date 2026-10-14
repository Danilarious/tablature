import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { applyMigrations, loadMigrations, resolveMigrationsFolder } from '../../db/migrate';
import { acquireMaintenanceLock, liveOpenProcesses } from '../../db/locks';
import { createBackup, verifyBackup } from './backup';

/**
 * Restores a complete backup created by createBackup().
 *
 * Safety sequence:
 *  1. Verify the backup (manifest, checksums, integrity) and that its schema is not newer
 *     than this app.
 *  2. Pre-check: refuse if any live open markers already exist (fast-fail).
 *  3. Acquire `database/maintenance.lock` exclusively.
 *  4. Post-lock recheck: refuse if a live open marker appeared between the pre-check and the
 *     lock acquisition (covers the race where the app claimed its marker just before we locked).
 *  5. Take a full pre-restore safety backup of the current data (always).
 *  6. Stage the backup in <dataDir>/.restore-<ts>/, apply pending migrations to the STAGED copy
 *     and re-check integrity, so an unusable backup never replaces live data.
 *  7. Swap: move live database+media aside; move staged copies into place.
 *     Every completed filesystem move is tracked. If any step fails, all completed moves are
 *     rolled back in reverse order so the original live layout is restored automatically.
 *     If rollback itself encounters errors, the error message names every affected path.
 */

export interface RestoreOptions {
  backupDir: string;
  baseDir: string;
  dbPath: string;
  mediaDir: string;
  backupsDir: string;
  migrationsFolder?: string;
  now?: () => Date;
  log?: (msg: string) => void;
}

export interface RestoreResult {
  safetyBackupDir: string | null;
  replacedDir: string;
  appliedToStaged: string[];
}

export async function restoreBackup(opts: RestoreOptions): Promise<RestoreResult> {
  const log = opts.log ?? (() => {});
  const migrationsFolder = opts.migrationsFolder ?? resolveMigrationsFolder();
  const databaseDir = path.dirname(opts.dbPath);

  // 1. Validate the backup before touching anything.
  const verification = await verifyBackup(opts.backupDir, migrationsFolder);
  if (!verification.ok || !verification.manifest) {
    throw new Error(`Backup is not restorable: ${verification.errors.join('; ')}`);
  }
  const known = new Set(loadMigrations(migrationsFolder).map((m) => m.tag));
  const unknown = verification.manifest.schema.appliedMigrations.filter((t) => !known.has(t));
  if (unknown.length > 0) {
    throw new Error(`Backup was made by a newer app version (unknown migrations: ${unknown.join(', ')}). Update the app first.`);
  }
  log(`Backup verified (${verification.manifest.media.fileCount} media files).`);

  // 2. Pre-check: refuse if any process already has the database open.
  fs.mkdirSync(databaseDir, { recursive: true });
  const liveBefore = liveOpenProcesses(databaseDir);
  if (liveBefore.length > 0) {
    throw new Error(
      `The notebook database is open in another process (pid ${liveBefore.join(', ')}). Stop the app (and any dev server) before restoring.`
    );
  }

  // 3. Acquire the maintenance lock exclusively.
  const release = acquireMaintenanceLock(databaseDir, 'restore');
  try {
    // 4. Post-lock recheck: a new process may have written its open marker between the
    //    pre-check and our lock acquisition (the other race ordering).
    const liveAfterLock = liveOpenProcesses(databaseDir);
    if (liveAfterLock.length > 0) {
      throw new Error(
        `The notebook database was opened by another process (pid ${liveAfterLock.join(', ')}) just before the restore lock was acquired. ` +
          `Stop the app and try again.`
      );
    }

    // 5. Always keep a full safety backup of the current state.
    let safetyBackupDir: string | null = null;
    if (fs.existsSync(opts.dbPath)) {
      const safety = await createBackup({ dbPath: opts.dbPath, mediaDir: opts.mediaDir, backupsDir: opts.backupsDir, label: 'pre-restore', migrationsFolder, now: opts.now });
      safetyBackupDir = safety.dir;
      log(`Pre-restore safety backup: ${path.basename(safety.dir)}`);
    }

    // 6. Stage and validate.
    const stamp = (opts.now ?? (() => new Date()))().toISOString().replace(/[:.]/g, '-');
    const stagingDir = path.join(opts.baseDir, `.restore-${stamp}`);
    const stagedDb = path.join(stagingDir, 'staged', 'notebook.db');
    const stagedMedia = path.join(stagingDir, 'staged', 'media');
    fs.mkdirSync(path.dirname(stagedDb), { recursive: true });
    fs.copyFileSync(path.join(opts.backupDir, 'database', 'notebook.db'), stagedDb, fs.constants.COPYFILE_EXCL);
    fs.mkdirSync(stagedMedia, { recursive: true });
    for (const f of verification.manifest.media.files) {
      const rel = f.path.slice('media/'.length);
      const dest = path.join(stagedMedia, ...rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(opts.backupDir, ...f.path.split('/')), dest, fs.constants.COPYFILE_EXCL);
    }

    const staged = new Database(stagedDb);
    let appliedToStaged: string[] = [];
    try {
      staged.pragma('foreign_keys = ON');
      appliedToStaged = applyMigrations(staged, migrationsFolder, { backupDir: null }).applied;
      const integrity = (staged.pragma('integrity_check') as { integrity_check: string }[]).map((r) => r.integrity_check).join('; ');
      if (integrity !== 'ok') throw new Error(`Staged database failed integrity_check: ${integrity}`);
      staged.pragma('journal_mode = WAL');
    } finally {
      staged.close();
    }
    log(`Staged copy validated${appliedToStaged.length ? ` (upgraded: ${appliedToStaged.join(', ')})` : ''}.`);

    // 7. Swap with rollback tracking.
    //
    // Every completed filesystem move is recorded. If any later step fails, all completed
    // moves are reversed so the original live database and media remain paired and usable.
    //
    // Preflight: assert staged files exist before touching the live layout.
    if (!fs.existsSync(stagedDb)) {
      throw new Error('Internal error: staged database file vanished before swap (aborting without touching live data).');
    }

    const replacedDir = path.join(stagingDir, 'replaced');
    type CompletedMove = { src: string; dest: string };
    const completed: CompletedMove[] = [];

    const safeMove = (src: string, dest: string): void => {
      if (!fs.existsSync(src)) return; // file/dir is optional (e.g. -wal/-shm may not exist)
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(src, dest);
      completed.push({ src, dest });
    };

    const rollbackCompleted = (): string[] => {
      const errors: string[] = [];
      for (const { src, dest } of [...completed].reverse()) {
        try {
          fs.renameSync(dest, src);
        } catch (e) {
          errors.push(`could not restore ${path.relative(opts.baseDir, src)}: ${(e as Error).message}`);
        }
      }
      completed.length = 0;
      return errors;
    };

    const recoveryHint =
      `Recovery artifacts remain in ${path.relative(opts.baseDir, stagingDir)}` +
      (safetyBackupDir ? `; safety backup at backups/${path.basename(safetyBackupDir)}` : '') +
      '.';

    try {
      // Move live database (+ WAL/SHM) aside.
      for (const suffix of ['', '-wal', '-shm']) {
        safeMove(`${opts.dbPath}${suffix}`, path.join(replacedDir, `notebook.db${suffix}`));
      }
      // Move live media aside.
      safeMove(opts.mediaDir, path.join(replacedDir, 'media'));
      // Move staged database (+ WAL/SHM) into place.
      safeMove(stagedDb, opts.dbPath);
      for (const suffix of ['-wal', '-shm']) {
        safeMove(`${stagedDb}${suffix}`, `${opts.dbPath}${suffix}`);
      }
      // Move staged media into place.
      safeMove(stagedMedia, opts.mediaDir);
    } catch (swapErr) {
      const swapDetail = swapErr instanceof Error ? swapErr.message : String(swapErr);
      const rollbackErrors = rollbackCompleted();
      if (rollbackErrors.length > 0) {
        throw new Error(
          `Restore swap failed and rollback also encountered errors — manual recovery required. ` +
            `Swap error: ${swapDetail}. ` +
            `Rollback errors: ${rollbackErrors.join('; ')}. ` +
            recoveryHint
        );
      }
      throw new Error(
        `Restore swap failed and was rolled back; the original database and media are in their original locations. ` +
          `Reason: ${swapDetail}. ` +
          recoveryHint
      );
    }

    log('Restore complete. Previous files kept in the .restore-* folder; remove it manually once satisfied.');
    return { safetyBackupDir, replacedDir, appliedToStaged };
  } finally {
    release();
  }
}
