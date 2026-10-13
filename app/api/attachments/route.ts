import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import type { ReadableStream as NodeWebReadableStream } from 'stream/web';
import { getStorageDirs } from '@/app/lib/paths';
import { getDatabase } from '@/app/db/client';
import { apiErrorResponse, HttpError } from '@/app/lib/api/http';
import { getMaxUploadBytes, listAttachments, saveAttachment } from '@/app/lib/services/attachments';

export const dynamic = 'force-dynamic';

/** GET /api/attachments?parentType=motif&parentId=... — list attachment metadata. */
export async function GET(req: Request) {
  try {
    const { db } = getDatabase();
    const { searchParams } = new URL(req.url);
    const rows = listAttachments(db, { parentType: searchParams.get('parentType'), parentId: searchParams.get('parentId') });
    return NextResponse.json(rows, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiErrorResponse(error, 'attachments.GET');
  }
}

/** POST multipart/form-data: file, parentType, parentId, description? */
export async function POST(req: Request) {
  try {
    const maxBytes = getMaxUploadBytes();
    // Reject obviously oversized requests before the body is parsed.
    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes + 1024 * 1024) {
      throw new HttpError(413, `Upload exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`);
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      throw new HttpError(400, 'Expected multipart/form-data with a file.');
    }
    const file = formData.get('file');
    const parentType = formData.get('parentType');
    const parentId = formData.get('parentId');
    const description = formData.get('description');

    if (!(file instanceof Blob) || typeof parentType !== 'string' || typeof parentId !== 'string') {
      throw new HttpError(400, 'file, parentType, and parentId are required.');
    }

    const { db } = getDatabase();
    const { mediaDir } = getStorageDirs();
    const name = (file as File).name || 'upload';
    const record = await saveAttachment({
      db,
      mediaDir,
      maxBytes,
      parentType,
      parentId,
      description: typeof description === 'string' ? description : null,
      file: {
        name,
        type: file.type,
        size: file.size,
        stream: Readable.fromWeb(file.stream() as unknown as NodeWebReadableStream<Uint8Array>),
      },
    });
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, 'attachments.POST');
  }
}
