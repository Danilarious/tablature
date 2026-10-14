import { describe, expect, it, vi } from 'vitest';
import { extensionForMime, hasUnuploadedMedia, PendingMediaItem, pickRecorderMimeType, uploadPendingMedia } from './pending-media';

const item = (localId: string, status: PendingMediaItem['status'] = 'pending'): PendingMediaItem => ({
  localId,
  blob: new Blob(['x'], { type: 'audio/webm' }),
  filename: `${localId}.webm`,
  description: 'memo',
  status,
});

describe('uploadPendingMedia', () => {
  it('uploads against the real motif ID only', async () => {
    const upload = vi.fn(async () => ({ id: 'att-1' }));
    const result = await uploadPendingMedia([item('a')], { parentType: 'motif', parentId: 'motif-real' }, upload);
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ localId: 'a' }), { parentType: 'motif', parentId: 'motif-real' });
    expect(result[0]).toMatchObject({ status: 'uploaded', attachmentId: 'att-1' });
    expect(hasUnuploadedMedia(result)).toBe(false);
  });

  it('refuses temporary or empty parent IDs', async () => {
    const upload = vi.fn(async () => ({ id: 'x' }));
    await expect(uploadPendingMedia([item('a')], { parentType: 'motif', parentId: 'temp-quick-capture' }, upload)).rejects.toThrow();
    await expect(uploadPendingMedia([item('a')], { parentType: 'motif', parentId: '' }, upload)).rejects.toThrow();
    expect(upload).not.toHaveBeenCalled();
  });

  it('keeps failed items (with their blob) for retry and does not re-upload successes', async () => {
    const upload = vi
      .fn<(i: PendingMediaItem) => Promise<{ id: string }>>()
      .mockImplementationOnce(async () => ({ id: 'att-a' }))
      .mockImplementationOnce(async () => {
        throw new Error('disk full');
      });
    const first = await uploadPendingMedia([item('a'), item('b')], { parentType: 'motif', parentId: 'm1' }, upload);
    expect(first.map((i) => i.status)).toEqual(['uploaded', 'failed']);
    expect(first[1].error).toBe('disk full');
    expect(first[1].blob).toBeInstanceOf(Blob);
    expect(hasUnuploadedMedia(first)).toBe(true);

    upload.mockImplementationOnce(async () => ({ id: 'att-b' }));
    const retried = await uploadPendingMedia(first, { parentType: 'motif', parentId: 'm1' }, upload);
    expect(upload).toHaveBeenCalledTimes(3);
    expect(retried.map((i) => i.status)).toEqual(['uploaded', 'uploaded']);
  });

  it('reports progress', async () => {
    const progress: string[][] = [];
    await uploadPendingMedia([item('a')], { parentType: 'motif', parentId: 'm1' }, async () => ({ id: '1' }), (items) => progress.push(items.map((i) => i.status)));
    expect(progress).toEqual([['uploading'], ['uploaded']]);
  });
});

describe('recorder format helpers', () => {
  it('maps recorder MIME types to matching extensions', () => {
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('.webm');
    expect(extensionForMime('audio/mp4')).toBe('.m4a');
    expect(extensionForMime('audio/ogg;codecs=opus')).toBe('.ogg');
    expect(extensionForMime('')).toBe('.webm');
  });

  it('picks the first supported recorder type', () => {
    expect(pickRecorderMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4');
    expect(pickRecorderMimeType(() => false)).toBeUndefined();
  });
});
