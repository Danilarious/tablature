import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachments, motifs } from '../../db/schema';
import { createTestDb } from '../../test/test-db';
import { deleteAttachment, getAttachment, resolveMediaType, saveAttachment, scanMediaOrphans, updateAttachment } from './attachments';

let mediaDir: string;
let t: ReturnType<typeof createTestDb>;

beforeEach(() => {
  mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bxb-media-test-'));
  t = createTestDb();
  t.db.insert(motifs).values({ id: 'motif-1', humanId: 'M-001', name: 'Idea', function: 'riff', tabData: '[]', createdAt: 1, updatedAt: 1 }).run();
});

afterEach(() => {
  t.sqlite.close();
  fs.rmSync(mediaDir, { recursive: true, force: true });
});

const fileOf = (name: string, bytes: Buffer | string, type = 'audio/webm') => ({
  name,
  type,
  size: Buffer.byteLength(bytes),
  stream: Readable.from([Buffer.from(bytes)]),
});

const visibleFiles = () => fs.readdirSync(mediaDir).filter((f) => f !== '.trash');

describe('saveAttachment', () => {
  it('streams the file to disk and records it against an existing parent', async () => {
    const rec = await saveAttachment({ db: t.db, mediaDir, file: fileOf('memo.webm', 'abc'), parentType: 'motif', parentId: 'motif-1' });
    expect(rec.parentId).toBe('motif-1');
    expect(rec.mimeType).toBe('audio/webm');
    expect(rec.fileSize).toBe(3);
    expect(fs.readFileSync(path.join(mediaDir, rec.filePath), 'utf8')).toBe('abc');
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
    expect(visibleFiles()).toEqual([rec.filePath]);
  });

  it('rejects an unknown parent type', async () => {
    await expect(saveAttachment({ db: t.db, mediaDir, file: fileOf('a.webm', 'x'), parentType: 'setup', parentId: 'motif-1' })).rejects.toMatchObject({ status: 400 });
    expect(visibleFiles()).toEqual([]);
  });

  it('rejects a temporary or missing parent (never persists temp-quick-capture)', async () => {
    await expect(saveAttachment({ db: t.db, mediaDir, file: fileOf('a.webm', 'x'), parentType: 'motif', parentId: 'temp-quick-capture' })).rejects.toMatchObject({ status: 404 });
    expect(t.db.select().from(attachments).all()).toHaveLength(0);
    expect(visibleFiles()).toEqual([]);
  });

  it('rejects disallowed extensions and mismatched MIME types', async () => {
    await expect(saveAttachment({ db: t.db, mediaDir, file: fileOf('evil.html', 'x', 'text/html'), parentType: 'motif', parentId: 'motif-1' })).rejects.toMatchObject({ status: 415 });
    await expect(saveAttachment({ db: t.db, mediaDir, file: fileOf('a.webm', 'x', 'text/html'), parentType: 'motif', parentId: 'motif-1' })).rejects.toMatchObject({ status: 415 });
    expect(visibleFiles()).toEqual([]);
  });

  it('enforces the size limit while streaming and leaves no temp file', async () => {
    const big = Buffer.alloc(2048, 1);
    const file = { name: 'big.wav', type: 'audio/wav', size: null, stream: Readable.from([big.subarray(0, 1024), big.subarray(1024)]) };
    await expect(saveAttachment({ db: t.db, mediaDir, file, parentType: 'motif', parentId: 'motif-1', maxBytes: 1500 })).rejects.toMatchObject({ status: 413 });
    expect(visibleFiles()).toEqual([]);
    expect(t.db.select().from(attachments).all()).toHaveLength(0);
  });

  it('rejects empty files', async () => {
    await expect(saveAttachment({ db: t.db, mediaDir, file: fileOf('a.webm', ''), parentType: 'motif', parentId: 'motif-1' })).rejects.toMatchObject({ status: 400 });
    expect(visibleFiles()).toEqual([]);
  });

  it('removes the written file when the database insert fails', async () => {
    t.sqlite.exec(`CREATE TRIGGER fail_att BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'simulated insert failure'); END;`);
    await expect(saveAttachment({ db: t.db, mediaDir, file: fileOf('memo.webm', 'abc'), parentType: 'motif', parentId: 'motif-1' })).rejects.toThrow(/simulated insert failure/);
    expect(visibleFiles()).toEqual([]);
  });

  it('sanitizes path-like filenames', async () => {
    const rec = await saveAttachment({ db: t.db, mediaDir, file: fileOf('../../etc/passwd.mp3', 'x', 'audio/mpeg'), parentType: 'motif', parentId: 'motif-1' });
    expect(rec.filePath).not.toContain('/');
    expect(rec.filePath).not.toContain('..');
    expect(fs.existsSync(path.join(mediaDir, rec.filePath))).toBe(true);
  });
});

describe('attachment management', () => {
  it('updates display name and description', async () => {
    const rec = await saveAttachment({ db: t.db, mediaDir, file: fileOf('memo.webm', 'abc'), parentType: 'motif', parentId: 'motif-1' });
    const updated = updateAttachment(t.db, rec.id, { displayName: 'Take 2', description: 'better' });
    expect(updated.displayName).toBe('Take 2');
    expect(getAttachment(t.db, rec.id)?.description).toBe('better');
    expect(() => updateAttachment(t.db, rec.id, { displayName: '  ' })).toThrow();
  });

  it('delete moves the file to media/.trash instead of unlinking it', async () => {
    const rec = await saveAttachment({ db: t.db, mediaDir, file: fileOf('memo.webm', 'abc'), parentType: 'motif', parentId: 'motif-1' });
    const { trashedPath } = deleteAttachment(t.db, mediaDir, rec.id);
    expect(getAttachment(t.db, rec.id)).toBeUndefined();
    expect(trashedPath && fs.readFileSync(trashedPath, 'utf8')).toBe('abc');
    expect(visibleFiles()).toEqual([]);
  });

  it('delete: file is moved before row is removed (trash-move failure leaves attachment fully intact)', async () => {
    const rec = await saveAttachment({ db: t.db, mediaDir, file: fileOf('memo.webm', 'abc'), parentType: 'motif', parentId: 'motif-1' });
    // Make .trash a regular file so mkdirSync fails (simulates a write-permission failure).
    fs.writeFileSync(path.join(mediaDir, '.trash'), 'not-a-dir');
    expect(() => deleteAttachment(t.db, mediaDir, rec.id)).toThrow();
    // Attachment row must still exist (operation was rolled back before the DB delete).
    expect(getAttachment(t.db, rec.id)).toBeDefined();
    // Original file must still be in place.
    expect(fs.existsSync(path.join(mediaDir, rec.filePath))).toBe(true);
  });

  it('delete: row deletion failure after successful move rolls back the file to its original location', async () => {
    const rec = await saveAttachment({ db: t.db, mediaDir, file: fileOf('memo.webm', 'abc'), parentType: 'motif', parentId: 'motif-1' });
    // Install a trigger that rejects the DELETE so we can observe the rollback.
    t.sqlite.exec(`CREATE TRIGGER fail_del BEFORE DELETE ON attachments BEGIN SELECT RAISE(ABORT, 'simulated delete failure'); END;`);
    expect(() => deleteAttachment(t.db, mediaDir, rec.id)).toThrow(/simulated delete failure/);
    // Row must still exist.
    expect(getAttachment(t.db, rec.id)).toBeDefined();
    // File must be back at its original location (rollback succeeded).
    expect(fs.existsSync(path.join(mediaDir, rec.filePath))).toBe(true);
    // .trash/ should be empty (or just the directory, no file that was "moved" there).
    const trashFiles = fs.existsSync(path.join(mediaDir, '.trash')) ? fs.readdirSync(path.join(mediaDir, '.trash')) : [];
    expect(trashFiles).toHaveLength(0);
  });

  it('delete: cleans up a dangling row whose file is already absent', async () => {
    const rec = await saveAttachment({ db: t.db, mediaDir, file: fileOf('memo.webm', 'abc'), parentType: 'motif', parentId: 'motif-1' });
    // Simulate file already gone (e.g., manual deletion or prior failed delete).
    fs.unlinkSync(path.join(mediaDir, rec.filePath));
    const { trashedPath } = deleteAttachment(t.db, mediaDir, rec.id);
    expect(trashedPath).toBeNull();
    expect(getAttachment(t.db, rec.id)).toBeUndefined();
    expect(visibleFiles()).toHaveLength(0);
  });

  it('orphan scan reports without modifying anything', async () => {
    const rec = await saveAttachment({ db: t.db, mediaDir, file: fileOf('memo.webm', 'abc'), parentType: 'motif', parentId: 'motif-1' });
    fs.writeFileSync(path.join(mediaDir, 'stray.mp3'), 'x');
    fs.writeFileSync(path.join(mediaDir, '.incoming-abc'), 'x');
    t.sqlite.prepare(`INSERT INTO attachments (id,parent_type,parent_id,display_name,file_path,mime_type,file_size,created_at) VALUES ('legacy','motif','temp-quick-capture','old','gone.webm','audio/webm',1,1)`).run();
    const report = scanMediaOrphans(t.db, mediaDir);
    expect(report.unreferencedFiles).toEqual(['stray.mp3']);
    expect(report.incompleteUploads).toEqual(['.incoming-abc']);
    expect(report.missingFiles).toEqual([{ id: 'legacy', filePath: 'gone.webm' }]);
    expect(report.danglingParents).toEqual([{ id: 'legacy', parentType: 'motif', parentId: 'temp-quick-capture' }]);
    expect(fs.existsSync(path.join(mediaDir, rec.filePath))).toBe(true);
    expect(fs.existsSync(path.join(mediaDir, 'stray.mp3'))).toBe(true);
    expect(t.db.select().from(attachments).all()).toHaveLength(2);
  });
});

describe('resolveMediaType', () => {
  it('derives the stored MIME type from the extension and accepts recorder aliases', () => {
    expect(resolveMediaType('memo.m4a', 'audio/x-m4a')).toEqual({ ext: '.m4a', mime: 'audio/mp4' });
    expect(resolveMediaType('memo.webm', 'audio/webm;codecs=opus')).toEqual({ ext: '.webm', mime: 'audio/webm' });
    expect(resolveMediaType('memo.wav', '')).toEqual({ ext: '.wav', mime: 'audio/wav' });
  });
});
