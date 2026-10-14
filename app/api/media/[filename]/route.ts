import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { getStorageDirs } from '@/app/lib/paths';
import { getDatabase } from '@/app/db/client';
import { getAttachmentByFilename, MEDIA_FILENAME_RE } from '@/app/lib/services/attachments';

export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = {
  // Personal recordings: never cache in shared/public caches or on disk.
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

function plain(status: number, message: string) {
  return new NextResponse(message, { status, headers: { ...PRIVATE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } });
}

function contentDisposition(kind: 'inline' | 'attachment', name: string) {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Streams a registered attachment. Only files that have an attachment record are served.
 * Supports single byte ranges (needed for audio seeking in Safari/iOS).
 */
export async function GET(req: Request, { params }: { params: { filename: string } }) {
  try {
    const filename = params.filename;
    if (!MEDIA_FILENAME_RE.test(filename)) return plain(400, 'Invalid filename');

    const { db } = getDatabase();
    const record = getAttachmentByFilename(db, filename);
    if (!record) return plain(404, 'File not found');

    const { mediaDir } = getStorageDirs();
    const filePath = path.join(mediaDir, filename);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return plain(404, 'File not found');
    }

    const download = new URL(req.url).searchParams.get('download') === '1';
    const headers: Record<string, string> = {
      ...PRIVATE_HEADERS,
      'Content-Type': record.mimeType,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': contentDisposition(download ? 'attachment' : 'inline', record.displayName),
    };

    const range = req.headers.get('range');
    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!m || (m[1] === '' && m[2] === '')) {
        return new NextResponse(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${stat.size}` } });
      }
      if (m[1] === '') {
        start = Math.max(0, stat.size - Number(m[2]));
      } else {
        start = Number(m[1]);
        end = m[2] === '' ? end : Math.min(Number(m[2]), end);
      }
      if (start > end || start >= stat.size) {
        return new NextResponse(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${stat.size}` } });
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = String(end - start + 1);

    const nodeStream = fs.createReadStream(filePath, { start, end });
    const body = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(body, { status, headers });
  } catch (error) {
    console.error('[api:media.GET] unexpected error', error);
    return plain(500, 'Could not read the media file.');
  }
}
