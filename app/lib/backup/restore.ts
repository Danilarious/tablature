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
 *  7. Move the current database (+ -wal/-shm) and media aside, then move staged copies into
 *     place. Nothing is deleted; replaced files remain on disk.
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

function moveIfExists(src: string, dest: string) {
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
  }
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

    // 7. Swap: move current files aside (never delete), then move staged files into place.
    const replacedDir = path.join(stagingDir, 'replaced');
    try {
      for (const suffix of ['', '-wal', '-shm']) moveIfExists(`${opts.dbPath}${suffix}`, path.join(replacedDir, `notebook.db${suffix}`));
      moveIfExists(opts.mediaDir, path.join(replacedDir, 'media'));
      fs.renameSync(stagedDb, opts.dbPath);
      for (const suffix of ['-wal', '-shm']) moveIfExists(`${stagedDb}${suffix}`, `${opts.dbPath}${suffix}`);
      fs.renameSync(stagedMedia, opts.mediaDir);
    } catch (err) {
      throw new Error(
        `Restore swap failed (${err instanceof Error ? err.message : String(err)}). Nothing was deleted: previous files are in ${path.relative(opts.baseDir, replacedDir)}, ` +
          `staged files in ${path.relative(opts.baseDir, path.dirname(stagedDb))}${safetyBackupDir ? `, safety backup in backups/${path.basename(safetyBackupDir)}` : ''}.`
      );
    }
    log('Restore complete. Previous files kept in the .restore-* folder; remove it manually once satisfied.');
    return { safetyBackupDir, replacedDir, appliedToStaged };
  } finally {
    release();
  }
}
