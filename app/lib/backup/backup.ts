import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { getMigrationStatus, resolveMigrationsFolder } from '../../db/migrate';

/**
 * Complete disaster-recovery backup (database + every media file), distinct from the
 * portable JSON export. Layout of one backup directory:
 *
 *   bxb-backup-<UTC timestamp>[-label]/
 *     manifest.json         format/app/schema versions, sizes and SHA-256 of every file
 *     database/notebook.db  consistent snapshot via the SQLite online backup API (WAL-safe)
 *     media/...             byte-for-byte copies of storage/media (including .trash/)
 *
 * The backup is assembled in a `.partial` directory, verified, then renamed into place, so a
 * directory without `.partial` is always a complete, verified backup.
 */

export const BACKUP_FORMAT = 'bxb-notebook-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_DIR_PREFIX = 'bxb-backup-';

export interface ManifestFile {
  path: string; // relative, POSIX separators
  bytes: number;
  sha256: string;
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  createdAt: string;
  label: string | null;
  app: { name: string; version: string };
  schema: { appliedMigrations: string[]; latestMigration: string | null };
  database: ManifestFile & { integrityCheck: string; tableCounts: Record<string, number> };
  media: { fileCount: number; totalBytes: number; files: ManifestFile[] };
  warnings: string[];
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

function appInfo(): { name: string; version: string } {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    return { name: String(pkg.name ?? 'bxb-music-notebook'), version: String(pkg.version ?? 'unknown') };
  } catch {
    return { name: 'bxb-music-notebook', version: 'unknown' };
  }
}

function listFilesRecursive(root: string, rel = ''): string[] {
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFilesRecursive(root, childRel));
    else if (e.isFile()) out.push(childRel);
  }
  return out.sort();
}

function isBackupMediaCandidate(rel: string): boolean {
  const base = rel.split('/').pop() ?? '';
  return !base.startsWith('.incoming-') && base !== '.gitkeep' && base !== '.DS_Store';
}

export function inspectDatabaseFile(dbFile: string, migrationsFolder: string) {
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    const integrity = (db.pragma('integrity_check') as { integrity_check: string }[]).map((r) => r.integrity_check).join('; ');
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as { name: string }[]).map((r) => r.name);
    const tableCounts: Record<string, number> = {};
    for (const t of tables) tableCounts[t] = (db.prepare(`SELECT COUNT(*) AS n FROM ${JSON.stringify(t)}`).get() as { n: number }).n;
    const status = getMigrationStatus(db, migrationsFolder);
    const appliedMigrations = status.applied.map((a) => a.tag ?? `unknown@${a.createdAt}`);
    const attachmentPaths = tables.includes('attachments')
      ? (db.prepare('SELECT file_path FROM attachments').all() as { file_path: string }[]).map((r) => r.file_path)
      : [];
    return { integrity, tableCounts, appliedMigrations, state: status.state, attachmentPaths };
  } finally {
    db.close();
  }
}

export interface CreateBackupOptions {
  dbPath: string;
  mediaDir: string;
  backupsDir: string;
  label?: string | null;
  migrationsFolder?: string;
  now?: () => Date;
}

export interface CreateBackupResult {
  dir: string;
  manifest: BackupManifest;
}

function backupDirName(now: Date, label?: string | null): string {
  const ts = now.toISOString().replace(/[:.]/g, '-');
  const safeLabel = label ? `-${label.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40)}` : '';
  return `${BACKUP_DIR_PREFIX}${ts}${safeLabel}`;
}

/** Creates and verifies a complete backup. Never modifies the live database or media. */
export async function createBackup(opts: CreateBackupOptions): Promise<CreateBackupResult> {
  const migrationsFolder = opts.migrationsFolder ?? resolveMigrationsFolder();
  const now = (opts.now ?? (() => new Date()))();
  if (!fs.existsSync(opts.dbPath)) throw new Error('No database found to back up.');

  fs.mkdirSync(opts.backupsDir, { recursive: true });
  const finalDir = path.join(opts.backupsDir, backupDirName(now, opts.label));
  if (fs.existsSync(finalDir)) throw new Error(`Backup ${path.basename(finalDir)} already exists.`);
  const partialDir = `${finalDir}.partial`;
  fs.mkdirSync(path.join(partialDir, 'database'), { recursive: true });

  try {
    // 1. Database: SQLite online backup API reads a consistent snapshot, including WAL content.
    const dbOut = path.join(partialDir, 'database', 'notebook.db');
    const source = new Database(opts.dbPath, { readonly: true, fileMustExist: true });
    try {
      await source.backup(dbOut);
    } finally {
      source.close();
    }
    // The copy is a standalone file: switch it out of WAL so it carries no -wal/-shm sidecars.
    const copy = new Database(dbOut);
    copy.pragma('journal_mode = DELETE');
    copy.close();

    const info = inspectDatabaseFile(dbOut, migrationsFolder);
    if (info.integrity !== 'ok') throw new Error(`Backup database failed integrity_check: ${info.integrity}`);

    // 2. Media: copy every file (streamed), hashing source and destination.
    const warnings: string[] = [];
    const mediaFiles: ManifestFile[] = [];
    for (const rel of listFilesRecursive(opts.mediaDir).filter(isBackupMediaCandidate)) {
      const src = path.join(opts.mediaDir, ...rel.split('/'));
      const dest = path.join(partialDir, 'media', ...rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
      const [srcHash, destHash] = await Promise.all([sha256File(src), sha256File(dest)]);
      if (srcHash !== destHash) throw new Error(`Media file changed while copying: ${rel}`);
      mediaFiles.push({ path: `media/${rel}`, bytes: fs.statSync(dest).size, sha256: destHash });
    }
    const copied = new Set(mediaFiles.map((f) => f.path.slice('media/'.length)));
    for (const p of info.attachmentPaths) {
      if (!copied.has(p)) {
        throw new Error(
          `Attachment referenced in the database ("${p}") is absent from media — ` +
            `the file may have been deleted or moved to .trash/ after the database snapshot. ` +
            `The backup was not saved. Try again after the deletion has settled, or restore from an earlier backup.`
        );
      }
    }

    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: now.toISOString(),
      label: opts.label ?? null,
      app: appInfo(),
      schema: { appliedMigrations: info.appliedMigrations, latestMigration: info.appliedMigrations[info.appliedMigrations.length - 1] ?? null },
      database: {
        path: 'database/notebook.db',
        bytes: fs.statSync(dbOut).size,
        sha256: await sha256File(dbOut),
        integrityCheck: info.integrity,
        tableCounts: info.tableCounts,
      },
      media: { fileCount: mediaFiles.length, totalBytes: mediaFiles.reduce((s, f) => s + f.bytes, 0), files: mediaFiles },
      warnings,
    };
    fs.writeFileSync(path.join(partialDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    // 3. Verify the assembled backup exactly as a restore would, then publish it.
    const verification = await verifyBackup(partialDir, migrationsFolder);
    if (!verification.ok) throw new Error(`Backup verification failed: ${verification.errors.join('; ')}`);
    fs.renameSync(partialDir, finalDir);
    return { dir: finalDir, manifest };
  } catch (err) {
    // Leave nothing that could be mistaken for a complete backup.
    fs.rmSync(partialDir, { recursive: true, force: true });
    throw err;
  }
}

export interface VerifyResult {
  ok: boolean;
  errors: string[];
  manifest: BackupManifest | null;
}

/** Validates manifest, checksums, file sizes and database integrity of a backup directory. */
export async function verifyBackup(dir: string, migrationsFolder: string = resolveMigrationsFolder()): Promise<VerifyResult> {
  const errors: string[] = [];
  let manifest: BackupManifest | null = null;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as BackupManifest;
  } catch {
    return { ok: false, errors: ['manifest.json is missing or unreadable'], manifest: null };
  }
  if (manifest.format !== BACKUP_FORMAT) errors.push(`unknown backup format "${manifest.format}"`);
  if (manifest.formatVersion > BACKUP_FORMAT_VERSION) errors.push(`backup format v${manifest.formatVersion} is newer than this app supports`);

  const check = async (f: ManifestFile) => {
    const abs = path.join(dir, ...f.path.split('/'));
    if (!abs.startsWith(path.resolve(dir) + path.sep)) return errors.push(`unsafe path in manifest: ${f.path}`);
    if (!fs.existsSync(abs)) return errors.push(`missing file ${f.path}`);
    if (fs.statSync(abs).size !== f.bytes) return errors.push(`size mismatch for ${f.path}`);
    if ((await sha256File(abs)) !== f.sha256) errors.push(`checksum mismatch for ${f.path}`);
  };
  await check(manifest.database);
  for (const f of manifest.media.files) await check(f);

  if (errors.length === 0) {
    const info = inspectDatabaseFile(path.join(dir, 'database', 'notebook.db'), migrationsFolder);
    if (info.integrity !== 'ok') errors.push(`database integrity_check: ${info.integrity}`);
    for (const [t, n] of Object.entries(manifest.database.tableCounts)) {
      if (info.tableCounts[t] !== n) errors.push(`row count mismatch for ${t}`);
    }
    // Every attachment row in the backup database must have a corresponding media file in the
    // backup. A missing file means the backup is incomplete and would produce a broken restore.
    const manifestMediaPaths = new Set(manifest.media.files.map((f) => f.path.slice('media/'.length)));
    for (const p of info.attachmentPaths) {
      if (!manifestMediaPaths.has(p)) {
        errors.push(`backup database references attachment file "${p}" which has no corresponding entry in the backup media`);
      }
    }
  }
  return { ok: errors.length === 0, errors, manifest };
}

/** Complete backups in a directory, newest first (ignores .partial and foreign entries). */
export function listBackups(backupsDir: string): string[] {
  if (!fs.existsSync(backupsDir)) return [];
  return fs
    .readdirSync(backupsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith(BACKUP_DIR_PREFIX) && !e.name.endsWith('.partial'))
    .filter((e) => fs.existsSync(path.join(backupsDir, e.name, 'manifest.json')))
    .map((e) => path.join(backupsDir, e.name))
    .sort()
    .reverse();
}

/**
 * Opt-in retention: returns (and, unless dryRun, removes) complete backups beyond the newest
 * `keep`. Never touches anything except verified-format backup directories; keep must be >= 1.
 */
export function pruneBackups(backupsDir: string, keep: number, dryRun = false): string[] {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('--keep must be a whole number of at least 1.');
  const victims = listBackups(backupsDir).slice(keep);
  if (!dryRun) for (const dir of victims) fs.rmSync(dir, { recursive: true, force: true });
  return victims;
}
