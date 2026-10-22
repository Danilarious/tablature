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
import { BACKUP_APP_NAME, BACKUP_DB_PATH, BACKUP_FORMAT, BACKUP_FORMAT_VERSION, createBackup, listBackups, pruneBackups, sha256File, verifyBackup } from './backup';
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
    expect(manifest.schema.latestMigration).toBe('0004_capture_receipts');
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
  // Valid sha256 shape (64 lowercase hex chars); content not verified at recognition time.
  const VALID_SHA256 = 'a'.repeat(64);

  function makeValidManifest(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: '2026-01-01T00:00:00.000Z',
      label: null,
      app: { name: BACKUP_APP_NAME, version: '0.1.0' },
      schema: { appliedMigrations: [], latestMigration: null },
      database: { path: BACKUP_DB_PATH, bytes: 100, sha256: VALID_SHA256, integrityCheck: 'ok', tableCounts: {} },
      media: { fileCount: 0, totalBytes: 0, files: [] },
      warnings: [],
      ...overrides,
    });
  }

  /** Creates a candidate backup directory. Pass withDbFile=true for a valid-format entry. */
  function makeDir(name: string, manifestContent?: string | null, withDbFile = false) {
    const d = path.join(dirs.backupsDir, name);
    fs.mkdirSync(d, { recursive: true });
    if (manifestContent !== undefined && manifestContent !== null) {
      fs.writeFileSync(path.join(d, 'manifest.json'), manifestContent);
    }
    if (withDbFile) {
      fs.mkdirSync(path.join(d, 'database'), { recursive: true });
      fs.writeFileSync(path.join(d, 'database', 'notebook.db'), 'fake-sqlite-data');
    }
    return d;
  }

  it('includes a directory with a valid BxB manifest and database file', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ createdAt: '2026-01-01T00:00:01.000Z' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(1);
  });

  it('excludes a directory with malformed (non-JSON) manifest', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', '{ not valid json');
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with no manifest.json at all', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z');
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with a missing required field (no app.name)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ app: { version: '0.1.0' } }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with the wrong format identifier (foreign app)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ format: 'other-backup-tool' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with an unsupported format version (too new)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ formatVersion: 999 }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with formatVersion 0 (below minimum)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ formatVersion: 0 }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a lookalike directory (matching format string but no required fields)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 1 }));
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with a foreign nonempty app.name', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ app: { name: 'foreign-app', version: '1.0.0' } }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with an invalid (non-ISO) createdAt', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ createdAt: 'not-a-date' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with an empty createdAt', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ createdAt: '' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with an unexpected database.path', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ database: { path: 'db/other.db', bytes: 100, sha256: VALID_SHA256, integrityCheck: 'ok', tableCounts: {} } }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory whose database file is missing', () => {
    // Manifest is otherwise valid but no database/notebook.db file exists.
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest());
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory whose database file is a symlink', () => {
    const targetFile = path.join(base, 'real.db');
    fs.writeFileSync(targetFile, 'fake-sqlite-data');
    const d = makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest());
    fs.mkdirSync(path.join(d, 'database'), { recursive: true });
    fs.symlinkSync(targetFile, path.join(d, 'database', 'notebook.db'));
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with invalid database.bytes (negative)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ database: { path: BACKUP_DB_PATH, bytes: -1, sha256: VALID_SHA256, integrityCheck: 'ok', tableCounts: {} } }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with an invalid sha256 in database (wrong length)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ database: { path: BACKUP_DB_PATH, bytes: 100, sha256: 'abc', integrityCheck: 'ok', tableCounts: {} } }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with an unsafe media file path (path traversal)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({
      media: { fileCount: 1, totalBytes: 4, files: [{ path: 'media/../../escape.db', bytes: 4, sha256: VALID_SHA256 }] },
    }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a media entry with a non-media/ path prefix', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({
      media: { fileCount: 1, totalBytes: 4, files: [{ path: 'other/file.wav', bytes: 4, sha256: VALID_SHA256 }] },
    }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a media entry with an invalid sha256', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({
      media: { fileCount: 1, totalBytes: 4, files: [{ path: 'media/audio.wav', bytes: 4, sha256: 'notasha256' }] },
    }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with an invalid media bytes value (negative)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({
      media: { fileCount: 1, totalBytes: 4, files: [{ path: 'media/audio.wav', bytes: -1, sha256: VALID_SHA256 }] },
    }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a symlinked directory', () => {
    const realDir = path.join(base, 'real-backup');
    fs.mkdirSync(path.join(realDir, 'database'), { recursive: true });
    fs.writeFileSync(path.join(realDir, 'database', 'notebook.db'), 'fake');
    fs.writeFileSync(path.join(realDir, 'manifest.json'), makeValidManifest());
    const symlinkDir = path.join(dirs.backupsDir, 'bxb-backup-2026-01-01T00-00-01-000Z');
    fs.symlinkSync(realDir, symlinkDir);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('dry-run pruning deletes nothing', () => {
    makeDir('bxb-backup-2026-01-01T00-00-01-000Z', makeValidManifest({ createdAt: '2026-01-01T00:00:01.000Z' }), true);
    makeDir('bxb-backup-2026-01-01T00-00-02-000Z', makeValidManifest({ createdAt: '2026-01-01T00:00:02.000Z' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(2);
    pruneBackups(dirs.backupsDir, 1, true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(2);
  });

  it('never targets a path outside backupsDir via directory name traversal', () => {
    const escapeDir = path.join(dirs.backupsDir, 'bxb-backup-../../outside');
    try {
      fs.mkdirSync(escapeDir, { recursive: true });
    } catch {
      return; // OS won't create it — good
    }
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  // ── P2 regression: directory-name pattern is fully anchored ──────────────────────────

  it('excludes a lookalike directory whose name has a trailing .partial.saved suffix', () => {
    // The old regex had no end-anchor, so "…Z.partial.saved" slipped past the name check.
    makeDir('bxb-backup-2026-01-01T00-00-00-000Z.partial.saved', makeValidManifest(), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory whose timestamp has four millisecond digits instead of three', () => {
    // toISOString() always emits exactly 3 ms digits; 4 digits is a lookalike, not a real backup.
    makeDir('bxb-backup-2026-01-01T00-00-00-0000Z', makeValidManifest(), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('includes a directory whose name has a valid label suffix', () => {
    makeDir('bxb-backup-2026-01-01T00-00-00-000Z-my-label', makeValidManifest(), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(1);
  });

  it('excludes a directory whose label segment uses a bare "Z" without a preceding hyphen', () => {
    // "ZExtraStuff" must not be accepted as though it were a valid label separator.
    makeDir('bxb-backup-2026-01-01T00-00-00-000ZExtraStuff', makeValidManifest(), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  // ── P2 regression: canonical ISO timestamp validation ────────────────────────────────

  it('excludes a directory with a date-only createdAt (no time component)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-00-000Z', makeValidManifest({ createdAt: '2026-01-01' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with a calendar-invalid createdAt (Feb 30)', () => {
    makeDir('bxb-backup-2026-01-01T00-00-00-000Z', makeValidManifest({ createdAt: '2026-02-30T00:00:00.000Z' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with a createdAt missing the millisecond field', () => {
    makeDir('bxb-backup-2026-01-01T00-00-00-000Z', makeValidManifest({ createdAt: '2026-01-01T00:00:00Z' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a directory with a createdAt using forward slashes instead of hyphens', () => {
    makeDir('bxb-backup-2026-01-01T00-00-00-000Z', makeValidManifest({ createdAt: '2026/01/01T00:00:00.000Z' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  // ── P2 regression: media path must stay strictly inside media/ subdirectory ─────────

  it('excludes a media entry whose path traverses out of media/ via ..', () => {
    // media/../database/notebook.db starts with "media/" but resolves to database/notebook.db.
    makeDir('bxb-backup-2026-01-01T00-00-00-000Z', makeValidManifest({
      media: { fileCount: 1, totalBytes: 4, files: [{ path: 'media/../database/notebook.db', bytes: 4, sha256: VALID_SHA256 }] },
    }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('excludes a media entry that navigates above the backup directory root', () => {
    makeDir('bxb-backup-2026-01-01T00-00-00-000Z', makeValidManifest({
      media: { fileCount: 1, totalBytes: 4, files: [{ path: 'media/../../outside.db', bytes: 4, sha256: VALID_SHA256 }] },
    }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  // ── P2 regression: folder timestamp must match manifest createdAt ────────────────────

  it('rejects a directory whose folder timestamp differs from manifest createdAt', () => {
    // A valid manifest with createdAt 2026-01-01 placed in a directory claiming 2025-01-01.
    makeDir('bxb-backup-2025-01-01T00-00-00-000Z', makeValidManifest({ createdAt: '2026-01-01T00:00:00.000Z' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('rejects a far-future lookalike whose folder timestamp does not match the manifest', () => {
    // 9999-12-31 is structurally valid but the manifest has a real timestamp.
    makeDir('bxb-backup-9999-12-31T23-59-59-999Z', makeValidManifest({ createdAt: '2026-01-01T00:00:00.000Z' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('rejects a directory with a calendar-impossible folder timestamp', () => {
    // Month 13 passes digit regex but fails the manifest round-trip check.
    // The manifest must also carry a calendar-impossible createdAt to match the dir name;
    // isCanonicalISOTimestamp rejects it via round-trip comparison.
    makeDir('bxb-backup-2026-13-01T00-00-00-000Z', makeValidManifest({ createdAt: '2026-13-01T00:00:00.000Z' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('accepts a valid directory whose folder timestamp exactly matches manifest createdAt', () => {
    makeDir('bxb-backup-2026-01-01T00-00-00-000Z', makeValidManifest({ createdAt: '2026-01-01T00:00:00.000Z' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(1);
  });

  it('accepts a labeled directory whose timestamp matches createdAt and label is valid', () => {
    makeDir('bxb-backup-2026-01-01T00-00-00-000Z-pre-migrate', makeValidManifest({ createdAt: '2026-01-01T00:00:00.000Z', label: 'pre-migrate' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(1);
  });

  it('rejects a lookalike with matching timestamp but invalid chars after the timestamp', () => {
    // "ZExtraStuff" is caught by BACKUP_DIR_NAME_RE end-anchor (from P2-1 fix).
    makeDir('bxb-backup-2026-01-01T00-00-00-000ZExtraStuff', makeValidManifest({ createdAt: '2026-01-01T00:00:00.000Z' }), true);
    expect(listBackups(dirs.backupsDir)).toHaveLength(0);
  });

  it('pruneBackups never removes a genuine backup in favor of a lookalike', async () => {
    // Create a real backup, then place a structurally valid lookalike with a future timestamp.
    const live = openLive();
    live.sqlite.close();
    const realNow = () => new Date(Date.UTC(2026, 0, 1, 0, 0, 1));
    await createBackup({ ...dirs, now: realNow });
    // Lookalike: valid dir name and manifest, but timestamp mismatch (future dir, past manifest).
    makeDir('bxb-backup-9999-12-31T23-59-59-999Z', makeValidManifest({ createdAt: '2026-01-01T00:00:00.000Z' }), true);
    // Only the real backup is recognized; the lookalike is invisible to retention.
    expect(listBackups(dirs.backupsDir)).toHaveLength(1);
    pruneBackups(dirs.backupsDir, 1);
    expect(listBackups(dirs.backupsDir)).toHaveLength(1);
  });

  it('real backup produced by createBackup() is recognized', async () => {
    const live = openLive();
    insertMotif(live.db, 'motif-a', 'M-001', 'test');
    live.sqlite.close();
    await createBackup({ ...dirs });
    expect(listBackups(dirs.backupsDir)).toHaveLength(1);
  });

  it('unrelated files and directories in backupsDir remain untouched after pruning', async () => {
    const unrelated = path.join(dirs.backupsDir, 'my-notes.txt');
    fs.writeFileSync(unrelated, 'keep me');
    const unrelatedDir = path.join(dirs.backupsDir, 'unrelated-folder');
    fs.mkdirSync(unrelatedDir);
    const live = openLive();
    live.sqlite.close();
    let t = Date.UTC(2026, 0, 1);
    const now = () => new Date((t += 1000));
    for (let i = 0; i < 2; i++) await createBackup({ ...dirs, now });
    pruneBackups(dirs.backupsDir, 1);
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
