import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema';
import { applyMigrations, resolveMigrationsFolder } from '../../db/migrate';
import { acquireMaintenanceLock, claimOpenProcess, readMaintenanceLock } from '../../db/locks';
import { saveAttachment } from '../services/attachments';
import { createBackup, listBackups, pruneBackups, sha256File, verifyBackup } from './backup';
import { restoreBackup } from './restore';

let base: string;
let dirs: { baseDir: string; dbPath: string; mediaDir: string; backupsDir: string; databaseDir: string };

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'bxb-backup-test-'));
  dirs = {
    baseDir: base,
    databaseDir: path.join(base, 'database'),
    dbPath: path.join(base, 'database', 'notebook.db'),
    mediaDir: path.join(base, 'media'),
    backupsDir: path.join(base, 'backups'),
  };
  for (const d of [dirs.databaseDir, dirs.mediaDir, dirs.backupsDir]) fs.mkdirSync(d, { recursive: true });
});
afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

/** Live WAL-mode database with automatic checkpoints disabled, so recent commits live only in -wal. */
function openLive() {
  const sqlite = new Database(dirs.dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('wal_autocheckpoint = 0');
  sqlite.pragma('foreign_keys = ON');
  applyMigrations(sqlite, resolveMigrationsFolder());
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

function insertMotif(db: ReturnType<typeof openLive>['db'], id: string, humanId: string, name: string) {
  db.insert(schema.motifs).values({ id, humanId, name, function: 'riff', tabData: '[]', createdAt: 1, updatedAt: 1 }).run();
}

const AUDIO = Buffer.from('RIFF....WAVEfmt fake audio payload 0123456789');

describe('backup → restore round trip (live WAL database + media)', () => {
  it('captures the latest committed rows and media, and restores them exactly', async () => {
    const live = openLive();
    insertMotif(live.db, 'motif-a', 'M-001', 'Before backup');
    const att = await saveAttachment({
      db: live.db,
      mediaDir: dirs.mediaDir,
      parentType: 'motif',
      parentId: 'motif-a',
      file: { name: 'take1.wav', type: 'audio/wav', size: AUDIO.length, stream: Readable.from([AUDIO]) },
    });
    // The newest commits are still only in the WAL file (not checkpointed into notebook.db).
    expect(fs.statSync(`${dirs.dbPath}-wal`).size).toBeGreaterThan(0);

    const { dir, manifest } = await createBackup({ ...dirs });
    expect(path.basename(dir)).toMatch(/^bxb-backup-/);
    expect(manifest.schema.latestMigration).toBe('0002_canonical_banjo_string_order');
    expect(manifest.database.integrityCheck).toBe('ok');
    expect(manifest.database.tableCounts.motifs).toBe(1);
    expect(manifest.media.files.map((f) => f.path)).toEqual([`media/${att.filePath}`]);
    expect(fs.existsSync(path.join(dir, 'database', 'notebook.db-wal'))).toBe(false);
    expect((await verifyBackup(dir)).ok).toBe(true);
    expect(fs.readdirSync(dirs.backupsDir).some((d) => d.endsWith('.partial'))).toBe(false);

    // Changes after the backup must NOT come back on restore (but are kept in the safety backup).
    insertMotif(live.db, 'motif-b', 'M-002', 'After backup');
    fs.writeFileSync(path.join(dirs.mediaDir, att.filePath), 'corrupted later');
    live.sqlite.close();

    const result = await restoreBackup({ backupDir: dir, ...dirs });
    expect(result.safetyBackupDir).toBeTruthy();

    const restored = new Database(dirs.dbPath, { readonly: true });
    const names = restored.prepare('SELECT human_id, name FROM motifs ORDER BY human_id').all();
    const attRows = restored.prepare('SELECT id, parent_id, file_path FROM attachments').all();
    restored.close();
    expect(names).toEqual([{ human_id: 'M-001', name: 'Before backup' }]);
    expect(attRows).toEqual([{ id: att.id, parent_id: 'motif-a', file_path: att.filePath }]);
    expect(fs.readFileSync(path.join(dirs.mediaDir, att.filePath))).toEqual(AUDIO);

    // Safety backup holds the pre-restore state, including the post-backup row.
    const safety = new Database(path.join(result.safetyBackupDir!, 'database', 'notebook.db'), { readonly: true });
    expect(safety.prepare('SELECT COUNT(*) n FROM motifs').get()).toEqual({ n: 2 });
    safety.close();
    // Replaced live files are kept, not deleted.
    expect(fs.existsSync(path.join(result.replacedDir, 'notebook.db'))).toBe(true);
    expect(readMaintenanceLock(dirs.databaseDir)).toBeNull();
  });

  it('backs up a closed (checkpointed) database too', async () => {
    const live = openLive();
    insertMotif(live.db, 'motif-a', 'M-001', 'x');
    live.sqlite.close();
    const { manifest } = await createBackup({ ...dirs });
    expect(manifest.database.tableCounts.motifs).toBe(1);
  });
});

describe('restore safety checks', () => {
  async function makeBackup() {
    const live = openLive();
    insertMotif(live.db, 'motif-a', 'M-001', 'x');
    live.sqlite.close();
    return (await createBackup({ ...dirs })).dir;
  }

  it('refuses a backup whose files fail checksum verification, changing nothing', async () => {
    const dir = await makeBackup();
    fs.appendFileSync(path.join(dir, 'database', 'notebook.db'), 'tamper');
    const before = await sha256File(dirs.dbPath);
    await expect(restoreBackup({ backupDir: dir, ...dirs })).rejects.toThrow(/not restorable/);
    expect(await sha256File(dirs.dbPath)).toBe(before);
  });

  it('refuses while another live process has the database open', async () => {
    const dir = await makeBackup();
    fs.writeFileSync(path.join(dirs.databaseDir, `.open-${process.ppid}`), 'x');
    await expect(restoreBackup({ backupDir: dir, ...dirs })).rejects.toThrow(/open in another process/);
    expect(listBackups(dirs.backupsDir)).toHaveLength(1); // no safety backup taken, nothing swapped
  });

  it('ignores stale open markers from dead processes', async () => {
    const dir = await makeBackup();
    fs.writeFileSync(path.join(dirs.databaseDir, '.open-999999'), 'x');
    await expect(restoreBackup({ backupDir: dir, ...dirs })).resolves.toBeTruthy();
  });

  it('maintenance lock is exclusive', () => {
    const release = acquireMaintenanceLock(dirs.databaseDir, 'test');
    expect(() => acquireMaintenanceLock(dirs.databaseDir, 'second')).toThrow();
    release();
    expect(readMaintenanceLock(dirs.databaseDir)).toBeNull();
  });
});

describe('retention', () => {
  it('deletes nothing by default and only prunes complete backups when asked', async () => {
    const live = openLive();
    live.sqlite.close();
    let t = Date.UTC(2026, 0, 1);
    const now = () => new Date((t += 1000));
    for (let i = 0; i < 3; i++) await createBackup({ ...dirs, now });
    fs.mkdirSync(path.join(dirs.backupsDir, 'unrelated-folder'));
    expect(listBackups(dirs.backupsDir)).toHaveLength(3);
    expect(pruneBackups(dirs.backupsDir, 2, true)).toHaveLength(1);
    expect(listBackups(dirs.backupsDir)).toHaveLength(3);
    const removed = pruneBackups(dirs.backupsDir, 2);
    expect(removed).toHaveLength(1);
    expect(listBackups(dirs.backupsDir)).toHaveLength(2);
    expect(fs.existsSync(path.join(dirs.backupsDir, 'unrelated-folder'))).toBe(true);
    expect(() => pruneBackups(dirs.backupsDir, 0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// listBackups / pruneBackups strict validation (fix: backup pruning safety)
// ---------------------------------------------------------------------------

describe('listBackups strict manifest validation', () => {
  function makeValidManifest(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      format: 'bxb-notebook-backup',
      formatVersion: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      label: null,
      app: { name: 'bxb-music-notebook', version: '0.1.0' },
      schema: { appliedMigrations: [], latestMigration: null },
      database: { path: 'database/notebook.db', bytes: 100, sha256: 'abc', integrityCheck: 'ok', tableCounts: {} },
      media: { fileCount: 0, totalBytes: 0, files: [] },
      warnings: [],
      ...overrides,
    });
  }

  function makeDir(name: string, manifestContent?: string | null) {
    const d = path.join(dirs.backupsDir, name);
    fs.mkdirSync(d, { recursive: true });
    if (manifestContent !== undefined && manifestContent !== null) {
      fs.writeFileSync(path.join(d, 'manifest.json'), manifestContent);
    }
    return d;
  }

  it('includes a directory with a valid BxB manifest', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest());
    expect(listBackups(dirs.backupsDir)).toHaveLength(1);
  });

  it('excludes a directory with malformed (non-JSON) manifest', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', '{ not valid json');
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with no manifest.json at all', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z'); // no manifest
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with a missing required field (no app.name)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ app: { version: '0.1.0' } }));
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with the wrong format identifier (foreign app)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ format: 'other-backup-tool' }));
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with an unsupported format version (too new)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ formatVersion: 999 }));
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with formatVersion 0 (below minimum)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ formatVersion: 0 }));
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a lookalike directory (only manifest.json, no database or media fields)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', JSON.stringify({ format: 'bxb-notebook-backup', formatVersion: 1 }));
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a symlinked directory', () => {
    const realDir = path.join(base, 'real-backup');
    fs.mkdirSync(realDir, { recursive: true });
    fs.writeFileSync(path.join(realDir, 'manifest.json'), makeValidManifest());
    const symlinkDir = path.join(dirs.backupsDir, 'bxb-backup-2026-01-01T00-00-01-000Z');
    fs.symlinkSync(realDir, symlinkDir);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('dry-run pruning deletes nothing', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest());
    makeDir('bxb-backup-2026-01-01T00-00-02-000Z', makeValidManifest());
    expect(listBackups(dirs.backupsDir)).toHaveLength(2);
    pruneBackups(dirs.backupsDir, 1, true); // dry run: keep 1, but delete nothing
    expect(listBackups(dirs.backupsDir)).toHaveLength(2);
  });

  it('never targets a path outside backupsDir via directory name traversal', () => {
    // A directory named '../../outside' should NOT appear in listBackups.
    const escapeDir = path.join(dirs.backupsDir, 'bxb-backup-../../outside');
    try {
      fs.mkdirSync(escapeDir, { recursive: true });
    } catch {
      return; // OS won't create it — good
    }
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('unrelated files and directories in backupsDir remain untouched after pruning', async () => {
    const unrelated = path.join(dirs.backupsDir, 'my-notes.txt');
    fs.writeFileSync(unrelated, 'keep me');
    const unrelatedDir = path.join(dirs.backupsDir, 'unrelated-folder');
    fs.mkdirSync(unrelatedDir);
    // Create two valid backups.
    const live = openLive();
    live.sqlite.close();
    let t = Date.UTC(2026, 0, 1);
    const now = () => new Date((t += 1000));
    for (let i = 0; i < 2; i++) await createBackup({ ...dirs, now });
    pruneBackups(dirs.backupsDir, 1); // removes the older of the two
    expect(fs.existsSync(unrelated)).toBe(true);
    expect(fs.existsSync(unrelatedDir)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Atomic restore/open coordination (fix A)
// ---------------------------------------------------------------------------

describe('restore/open atomic coordination', () => {
  async function makeBackup() {
    const live = openLive();
    insertMotif(live.db, 'motif-a', 'M-001', 'x');
    live.sqlite.close();
    return (await createBackup({ ...dirs })).dir;
  }

  it('restoreBackup refuses when a live open marker exists and releases the maintenance lock (race ordering 1: app before restore)', async () => {
    const dir = await makeBackup();
    // Simulate the app having already claimed its open marker (it registered before restore checked).
    fs.writeFileSync(path.join(dirs.databaseDir, `.open-${process.ppid}`), 'x');
    await expect(restoreBackup({ backupDir: dir, ...dirs })).rejects.toThrow(/open in another process/);
    // Maintenance lock must be released regardless of whether the refusal happened before or
    // after lock acquisition.
    expect(readMaintenanceLock(dirs.databaseDir)).toBeNull();
  });

  it('claimOpenProcess removes its own marker and throws when a maintenance lock is held (race ordering 2: restore before app)', () => {
    // Simulate restore having already acquired the maintenance lock.
    const releaseLock = acquireMaintenanceLock(dirs.databaseDir, 'test-restore');
    try {
      // The app now tries to open: it writes its marker, then sees the lock and must refuse.
      expect(() => claimOpenProcess(dirs.databaseDir)).toThrow(/maintenance/);
      // The open marker for this process must NOT be left behind.
      expect(fs.existsSync(path.join(dirs.databaseDir, `.open-${process.pid}`))).toBe(false);
    } finally {
      releaseLock();
    }
  });

  it('restoreBackup ignores stale open markers from dead processes', async () => {
    const dir = await makeBackup();
    fs.writeFileSync(path.join(dirs.databaseDir, '.open-999999'), 'x');
    await expect(restoreBackup({ backupDir: dir, ...dirs })).resolves.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Attachment/media consistency in backups (fix B)
// ---------------------------------------------------------------------------

describe('attachment and media consistency', () => {
  it('backup fails (not just warns) when a DB-referenced attachment file is absent from media', async () => {
    const live = openLive();
    insertMotif(live.db, 'motif-a', 'M-001', 'x');
    const att = await saveAttachment({
      db: live.db,
      mediaDir: dirs.mediaDir,
      parentType: 'motif',
      parentId: 'motif-a',
      file: { name: 'take1.wav', type: 'audio/wav', size: 4, stream: Readable.from([Buffer.from('fake')]) },
    });
    // Simulate file deleted (or moved to trash) after the DB row was written.
    fs.unlinkSync(path.join(dirs.mediaDir, att.filePath));
    live.sqlite.close();

    await expect(createBackup({ ...dirs })).rejects.toThrow(/absent from media/);
    // No .partial directory should remain after the failure.
    expect(fs.readdirSync(dirs.backupsDir).some((d) => d.endsWith('.partial'))).toBe(false);
  });

  it('verifyBackup rejects a backup whose database references an attachment absent from the manifest media', async () => {
    // Create a valid backup with an attachment.
    const live = openLive();
    insertMotif(live.db, 'motif-a', 'M-001', 'x');
    const att = await saveAttachment({
      db: live.db,
      mediaDir: dirs.mediaDir,
      parentType: 'motif',
      parentId: 'motif-a',
      file: { name: 'take1.wav', type: 'audio/wav', size: 4, stream: Readable.from([Buffer.from('fake')]) },
    });
    live.sqlite.close();
    const { dir } = await createBackup({ ...dirs });

    // Tamper: remove the media file entry from manifest.json (but keep the DB and file intact).
    // This simulates a backup created without the attachment media (e.g., by an older version).
    const manifestPath = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.media.files = manifest.media.files.filter((f: { path: string }) => !f.path.includes(att.filePath));
    manifest.media.fileCount = manifest.media.files.length;
    manifest.media.totalBytes = manifest.media.files.reduce((s: number, f: { bytes: number }) => s + f.bytes, 0);
    // Also remove the physical file so the existing per-file checksum check doesn't interfere.
    fs.rmSync(path.join(dir, 'media', att.filePath));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = await verifyBackup(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes(att.filePath))).toBe(true);
  });

  it('backup succeeds and verifies when all attachment files are present', async () => {
    const live = openLive();
    insertMotif(live.db, 'motif-a', 'M-001', 'x');
    await saveAttachment({
      db: live.db,
      mediaDir: dirs.mediaDir,
      parentType: 'motif',
      parentId: 'motif-a',
      file: { name: 'take1.wav', type: 'audio/wav', size: 4, stream: Readable.from([Buffer.from('fake')]) },
    });
    live.sqlite.close();
    const { dir, manifest } = await createBackup({ ...dirs });
    expect(manifest.media.fileCount).toBe(1);
    expect((await verifyBackup(dir)).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Restore swap fault-injection tests (fix A)
// ---------------------------------------------------------------------------

describe('restore swap rollback (fault injection)', () => {

  let renameSpy: ReturnType<typeof vi.spyOn<any, any>> | null = null;

  afterEach(() => {
    renameSpy?.mockRestore();
    renameSpy = null;
  });

  /** Sets up a live database with one motif plus a valid backup, then returns the backup dir. */
  async function setupLiveAndBackup(): Promise<string> {
    const live = openLive();
    insertMotif(live.db, 'motif-orig', 'M-001', 'original-data');
    live.sqlite.close();
    return (await createBackup({ ...dirs })).dir;
  }

  /** Verifies that the live layout (original database + media) is intact and usable. */
  function assertLiveIntact() {
    // Database must exist and have the original data.
    expect(fs.existsSync(dirs.dbPath)).toBe(true);
    const db = new Database(dirs.dbPath, { readonly: true, fileMustExist: true });
    const rows = db.prepare('SELECT name FROM motifs WHERE id = ?').all('motif-orig') as { name: string }[];
    db.close();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('original-data');
    // Media directory must exist.
    expect(fs.existsSync(dirs.mediaDir)).toBe(true);
  }

  // Identify swap-phase renames by source path: they live under base/ but NOT under base/backups/
  // (the safety-backup createBackup rename has src inside backups/, so it is excluded).
  function isSwapRename(src: string): boolean {
    return src.startsWith(base) && !src.includes(`${path.sep}backups`) && !src.includes('/backups');
  }

  function injectRenameFailureAt(failOnSwapStep: number) {
    const origRename: (...args: any[]) => void = fs.renameSync.bind(fs);
    let swapCallCount = 0;
    renameSpy = vi.spyOn(fs as any, 'renameSync').mockImplementation((...args: any[]) => {
      const src = String(args[0]);
      if (isSwapRename(src)) {
        swapCallCount++;
        if (swapCallCount === failOnSwapStep) {
          throw Object.assign(new Error(`mock swap failure at step ${failOnSwapStep}`), { code: 'EXDEV' });
        }
      }
      origRename(...args);
    });
  }

  it('rolls back when the live-DB rename fails (first swap step)', async () => {
    const dir = await setupLiveAndBackup();
    injectRenameFailureAt(1);
    await expect(restoreBackup({ backupDir: dir, ...dirs })).rejects.toThrow(/rolled back/i);
    assertLiveIntact();
  });

  it('rolls back when the live-media rename fails (second swap step)', async () => {
    const dir = await setupLiveAndBackup();
    injectRenameFailureAt(2);
    await expect(restoreBackup({ backupDir: dir, ...dirs })).rejects.toThrow(/rolled back/i);
    assertLiveIntact();
  });

  it('rolls back when the staged-DB placement fails (third swap step)', async () => {
    const dir = await setupLiveAndBackup();
    injectRenameFailureAt(3);
    await expect(restoreBackup({ backupDir: dir, ...dirs })).rejects.toThrow(/rolled back/i);
    assertLiveIntact();
  });

  it('rolls back when the staged-media placement fails (fourth swap step)', async () => {
    const dir = await setupLiveAndBackup();
    injectRenameFailureAt(4);
    await expect(restoreBackup({ backupDir: dir, ...dirs })).rejects.toThrow(/rolled back/i);
    assertLiveIntact();
  });

  it('reports all unrecoverable paths when rollback itself fails', async () => {
    const dir = await setupLiveAndBackup();
    const origRename: (...args: any[]) => void = fs.renameSync.bind(fs);
    let swapCallCount = 0;
    renameSpy = vi.spyOn(fs as any, 'renameSync').mockImplementation((...args: any[]) => {
      const src = String(args[0]);
      if (isSwapRename(src)) swapCallCount++;
      if (swapCallCount === 3) throw Object.assign(new Error('mock swap failure'), { code: 'EXDEV' }); // step 3 fails
      if (swapCallCount >= 4) throw Object.assign(new Error('mock rollback failure'), { code: 'EXDEV' }); // rollback calls also fail
      origRename(...args);
    });
    await expect(restoreBackup({ backupDir: dir, ...dirs })).rejects.toThrow(/manual recovery/i);
  });
});
