import fs from 'fs';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { attachments, compositions, instruments, motifs, tunings } from '../../db/schema';
import { HttpError } from '../api/http';
import type { SyncDb } from './setups';

/**
 * Attachment storage rules (local-first, private media):
 *  - Only documented parent types; the parent record must exist.
 *  - Only documented extensions/MIME types; stored MIME is derived from the extension.
 *  - Size limit from MUSIC_NOTEBOOK_MAX_UPLOAD_MB (default 200 MB).
 *  - Files are streamed to a temp name, renamed, then the DB row is inserted. If the insert
 *    fails the written file is removed, so no orphan file is left behind.
 *  - Deleting an attachment moves its file to media/.trash/ (recoverable), never unlinks.
 */

export const ATTACHMENT_PARENT_TYPES = ['motif', 'composition', 'tuning', 'instrument'] as const;
export type AttachmentParentType = (typeof ATTACHMENT_PARENT_TYPES)[number];

/** Extension -> canonical MIME type plus accepted client-reported MIME aliases. */
export const ALLOWED_MEDIA: Record<string, { mime: string; aliases: string[] }> = {
  '.webm': { mime: 'audio/webm', aliases: ['audio/webm', 'video/webm'] },
  '.ogg': { mime: 'audio/ogg', aliases: ['audio/ogg', 'application/ogg'] },
  '.oga': { mime: 'audio/ogg', aliases: ['audio/ogg'] },
  '.opus': { mime: 'audio/ogg', aliases: ['audio/ogg', 'audio/opus'] },
  '.mp3': { mime: 'audio/mpeg', aliases: ['audio/mpeg', 'audio/mp3'] },
  '.m4a': { mime: 'audio/mp4', aliases: ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac'] },
  '.mp4': { mime: 'audio/mp4', aliases: ['audio/mp4', 'video/mp4'] },
  '.aac': { mime: 'audio/aac', aliases: ['audio/aac', 'audio/x-aac'] },
  '.wav': { mime: 'audio/wav', aliases: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'] },
  '.flac': { mime: 'audio/flac', aliases: ['audio/flac', 'audio/x-flac'] },
  '.aif': { mime: 'audio/aiff', aliases: ['audio/aiff', 'audio/x-aiff'] },
  '.aiff': { mime: 'audio/aiff', aliases: ['audio/aiff', 'audio/x-aiff'] },
  '.pdf': { mime: 'application/pdf', aliases: ['application/pdf'] },
  '.png': { mime: 'image/png', aliases: ['image/png'] },
  '.jpg': { mime: 'image/jpeg', aliases: ['image/jpeg'] },
  '.jpeg': { mime: 'image/jpeg', aliases: ['image/jpeg'] },
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_MEDIA);
export const DEFAULT_MAX_UPLOAD_MB = 200;

export function getMaxUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.MUSIC_NOTEBOOK_MAX_UPLOAD_MB);
  const mb = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_UPLOAD_MB;
  return Math.floor(mb * 1024 * 1024);
}

/** Safe on-disk / URL filename: no separators, no leading dot, bounded length. */
export const MEDIA_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

export function isAttachmentParentType(value: unknown): value is AttachmentParentType {
  return typeof value === 'string' && (ATTACHMENT_PARENT_TYPES as readonly string[]).includes(value);
}

/** Validates extension + reported MIME. Returns canonical MIME and normalized extension. */
export function resolveMediaType(originalName: string, reportedMime: string | null | undefined): { ext: string; mime: string } {
  const ext = path.extname(originalName || '').toLowerCase();
  const entry = ALLOWED_MEDIA[ext];
  if (!entry) {
    throw new HttpError(415, `File type "${ext || 'none'}" is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`);
  }
  const base = (reportedMime || '').split(';')[0].trim().toLowerCase();
  if (base && base !== 'application/octet-stream' && !entry.aliases.includes(base)) {
    throw new HttpError(415, `File content type "${base}" does not match extension "${ext}".`);
  }
  return { ext, mime: entry.mime };
}

export function assertAttachmentParentExists(db: SyncDb, parentType: string, parentId: string): AttachmentParentType {
  if (!isAttachmentParentType(parentType)) {
    throw new HttpError(400, `parentType must be one of: ${ATTACHMENT_PARENT_TYPES.join(', ')}.`);
  }
  if (!parentId || typeof parentId !== 'string') throw new HttpError(400, 'parentId is required.');
  const table = { motif: motifs, composition: compositions, tuning: tunings, instrument: instruments }[parentType];
  const found = db.select({ id: table.id }).from(table).where(eq(table.id, parentId)).get();
  if (!found) throw new HttpError(404, `The ${parentType} this file should attach to does not exist (save the record first).`);
  return parentType;
}

function sanitizeBaseName(name: string): string {
  const base = path.basename(name || 'file', path.extname(name || ''));
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[._-]+/, '').slice(0, 80);
  return cleaned || 'file';
}

export interface IncomingFile {
  name: string;
  type?: string | null;
  /** Declared size when known (pre-check only; the stream is also counted). */
  size?: number | null;
  stream: Readable | AsyncIterable<Uint8Array>;
}

export interface SaveAttachmentOptions {
  db: SyncDb;
  mediaDir: string;
  file: IncomingFile;
  parentType: string;
  parentId: string;
  description?: string | null;
  maxBytes?: number;
}

export type AttachmentRecord = typeof attachments.$inferSelect;

/** Streams a file to disk and records it. Never leaves an orphan file on failure. */
export async function saveAttachment(opts: SaveAttachmentOptions): Promise<AttachmentRecord> {
  const { db, mediaDir, file } = opts;
  const maxBytes = opts.maxBytes ?? getMaxUploadBytes();
  const parentType = assertAttachmentParentExists(db, opts.parentType, opts.parentId);
  const { ext, mime } = resolveMediaType(file.name, file.type);
  if (typeof file.size === 'number' && file.size > maxBytes) {
    throw new HttpError(413, `File is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB upload limit.`);
  }
  const description = typeof opts.description === 'string' ? opts.description.trim().slice(0, 2000) || null : null;

  fs.mkdirSync(mediaDir, { recursive: true });
  const id = uuidv4();
  const diskFilename = `${id}-${sanitizeBaseName(file.name)}${ext}`;
  const tempPath = path.join(mediaDir, `.incoming-${id}`);
  const finalPath = path.join(mediaDir, diskFilename);

  let written = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      written += chunk.length;
      if (written > maxBytes) cb(new HttpError(413, `File is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB upload limit.`));
      else cb(null, chunk);
    },
  });

  try {
    const source = file.stream instanceof Readable ? file.stream : Readable.from(file.stream);
    await pipeline(source, limiter, fs.createWriteStream(tempPath, { flags: 'wx' }));
    if (written === 0) throw new HttpError(400, 'The uploaded file is empty.');
    fs.renameSync(tempPath, finalPath);
  } catch (err) {
    safeUnlink(tempPath);
    throw err;
  }

  const record: AttachmentRecord = {
    id,
    parentType,
    parentId: opts.parentId,
    displayName: (file.name || diskFilename).slice(0, 255),
    filePath: diskFilename,
    mimeType: mime,
    fileSize: written,
    description,
    createdAt: Date.now(),
  };

  try {
    db.transaction((tx) => {
      // Re-check inside the transaction so a concurrently removed parent cannot be referenced.
      assertAttachmentParentExists(tx, parentType, opts.parentId);
      tx.insert(attachments).values(record).run();
    });
  } catch (err) {
    safeUnlink(finalPath);
    throw err;
  }
  return record;
}

function safeUnlink(p: string) {
  try {
    fs.unlinkSync(p);
  } catch {
    /* already gone */
  }
}

export function listAttachments(db: SyncDb, filter: { parentType?: string | null; parentId?: string | null } = {}): AttachmentRecord[] {
  const rows = db.select().from(attachments).all();
  return rows
    .filter((r) => (!filter.parentType || r.parentType === filter.parentType) && (!filter.parentId || r.parentId === filter.parentId))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getAttachment(db: SyncDb, id: string): AttachmentRecord | undefined {
  return db.select().from(attachments).where(eq(attachments.id, id)).get();
}

export function getAttachmentByFilename(db: SyncDb, filename: string): AttachmentRecord | undefined {
  return db.select().from(attachments).where(eq(attachments.filePath, filename)).get();
}

export function updateAttachment(db: SyncDb, id: string, patch: { displayName?: string | null; description?: string | null }): AttachmentRecord {
  const existing = getAttachment(db, id);
  if (!existing) throw new HttpError(404, 'Attachment not found.');
  const next: Partial<AttachmentRecord> = {};
  if (patch.displayName !== undefined) {
    const name = (patch.displayName ?? '').trim();
    if (!name) throw new HttpError(400, 'Display name cannot be empty.');
    next.displayName = name.slice(0, 255);
  }
  if (patch.description !== undefined) next.description = (patch.description ?? '').trim().slice(0, 2000) || null;
  if (Object.keys(next).length > 0) db.update(attachments).set(next).where(eq(attachments.id, id)).run();
  return { ...existing, ...next };
}

/**
 * Deletes an attachment row and moves its file to media/.trash/ (recoverable).
 *
 * Ordering is fail-safe:
 *  1. Move the file to .trash/ FIRST. If this fails the row is untouched and the
 *     attachment remains fully usable.
 *  2. Delete the DB row AFTER a successful move. If the row deletion fails the file
 *     is moved back to its original location so the attachment is consistent again.
 *
 * An already-absent file (missing from media but present in the DB, e.g. left from a
 * prior failed operation) is treated as if it were already trashed: the row is deleted
 * directly without any file operation, so the dangling reference is cleaned up safely.
 *
 * An invalid filePath (fails MEDIA_FILENAME_RE) indicates the row has no safe file path;
 * the row is deleted directly.
 */
export function deleteAttachment(db: SyncDb, mediaDir: string, id: string): { trashedPath: string | null } {
  const existing = getAttachment(db, id);
  if (!existing) throw new HttpError(404, 'Attachment not found.');

  // No file to manage: invalid path or already-absent file — delete the row directly.
  if (!MEDIA_FILENAME_RE.test(existing.filePath)) {
    db.delete(attachments).where(eq(attachments.id, id)).run();
    return { trashedPath: null };
  }
  const src = path.join(mediaDir, existing.filePath);
  if (!fs.existsSync(src)) {
    db.delete(attachments).where(eq(attachments.id, id)).run();
    return { trashedPath: null };
  }

  // Step 1: Move the file first. Failure here leaves the attachment fully intact.
  const trashDir = path.join(mediaDir, '.trash');
  fs.mkdirSync(trashDir, { recursive: true });
  const dest = path.join(trashDir, `${Date.now()}-${existing.filePath}`);
  fs.renameSync(src, dest);

  // Step 2: Delete the DB row. On failure, move the file back so nothing is lost.
  try {
    db.delete(attachments).where(eq(attachments.id, id)).run();
  } catch (err) {
    try {
      fs.renameSync(dest, src);
    } catch {
      /* rollback failed: file is in .trash/, row is still in DB — orphan report will surface this */
    }
    throw err;
  }

  return { trashedPath: dest };
}

export interface OrphanReport {
  /** Files in media/ with no attachment row (excludes dotfiles and .trash/). */
  unreferencedFiles: string[];
  /** Interrupted uploads (.incoming-*). */
  incompleteUploads: string[];
  /** Attachment rows whose file is missing on disk. */
  missingFiles: { id: string; filePath: string }[];
  /** Attachment rows whose parent record no longer exists (e.g. legacy temp parents). */
  danglingParents: { id: string; parentType: string; parentId: string }[];
}

/** Read-only scan. Never deletes anything. */
export function scanMediaOrphans(db: SyncDb, mediaDir: string): OrphanReport {
  const rows = db.select().from(attachments).all();
  const referenced = new Set(rows.map((r) => r.filePath));
  const entries = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir, { withFileTypes: true }) : [];
  const unreferencedFiles: string[] = [];
  const incompleteUploads: string[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (e.name.startsWith('.incoming-')) incompleteUploads.push(e.name);
    else if (!e.name.startsWith('.') && !referenced.has(e.name)) unreferencedFiles.push(e.name);
  }
  const missingFiles = rows.filter((r) => !fs.existsSync(path.join(mediaDir, r.filePath))).map((r) => ({ id: r.id, filePath: r.filePath }));
  const danglingParents = rows
    .filter((r) => {
      try {
        assertAttachmentParentExists(db, r.parentType, r.parentId);
        return false;
      } catch {
        return true;
      }
    })
    .map((r) => ({ id: r.id, parentType: r.parentType, parentId: r.parentId }));
  return { unreferencedFiles, incompleteUploads, missingFiles, danglingParents };
}
