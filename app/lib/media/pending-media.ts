/**
 * Media recorded or selected BEFORE the motif exists is held in memory as "pending" and only
 * uploaded once the real motif ID is known. Failed uploads stay pending so the user can retry.
 */

export type PendingMediaStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

export interface PendingMediaItem {
  localId: string;
  blob: Blob;
  filename: string;
  description: string;
  status: PendingMediaStatus;
  error?: string;
  attachmentId?: string;
}

export interface UploadTarget {
  parentType: 'motif';
  parentId: string;
}

export type Uploader = (item: PendingMediaItem, target: UploadTarget) => Promise<{ id: string }>;

/** Extension that matches what MediaRecorder actually produced (Safari records MP4/AAC). */
export function extensionForMime(mime: string | null | undefined): string {
  const base = (mime || '').split(';')[0].trim().toLowerCase();
  if (base === 'audio/mp4' || base === 'audio/x-m4a' || base === 'audio/aac') return '.m4a';
  if (base === 'audio/ogg') return '.ogg';
  if (base === 'audio/mpeg') return '.mp3';
  if (base === 'audio/wav' || base === 'audio/x-wav') return '.wav';
  return '.webm';
}

/** Preferred recorder MIME type supported by this browser, or undefined to use the default. */
export function pickRecorderMimeType(isTypeSupported: (t: string) => boolean): string | undefined {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    try {
      if (isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

/**
 * Uploads every not-yet-uploaded item against the real parent. Never throws; returns the
 * updated item list (uploaded items marked, failures retained with an error message).
 */
export async function uploadPendingMedia(items: PendingMediaItem[], target: UploadTarget, upload: Uploader, onProgress?: (items: PendingMediaItem[]) => void): Promise<PendingMediaItem[]> {
  if (!target.parentId || target.parentId.startsWith('temp')) {
    throw new Error('Pending media can only be uploaded to a saved record.');
  }
  let current = items.map((i) => ({ ...i }));
  for (const item of items) {
    if (item.status === 'uploaded') continue;
    current = current.map((i) => (i.localId === item.localId ? { ...i, status: 'uploading' as const, error: undefined } : i));
    onProgress?.(current);
    try {
      const res = await upload(item, target);
      current = current.map((i) => (i.localId === item.localId ? { ...i, status: 'uploaded' as const, attachmentId: res.id } : i));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      current = current.map((i) => (i.localId === item.localId ? { ...i, status: 'failed' as const, error: message } : i));
    }
    onProgress?.(current);
  }
  return current;
}

export function hasUnuploadedMedia(items: PendingMediaItem[]): boolean {
  return items.some((i) => i.status !== 'uploaded');
}
