import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { getDatabase } from '@/app/db/client';
import { getStorageDirs } from '@/app/lib/paths';
import { apiErrorResponse, readJsonBody, HttpError } from '@/app/lib/api/http';
import { createQuickCapture, quickCaptureInputSchema } from '@/app/lib/services/quick-capture';
import { stageAttachment, getMaxUploadBytes, type AttachmentRecord } from '@/app/lib/services/attachments';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const staged: AttachmentRecord[] = [];
  const { mediaDir } = getStorageDirs();
  try {
    let input: unknown;
    if (req.headers.get('content-type')?.startsWith('multipart/form-data')) {
      const limit = getMaxUploadBytes();
      if (Number(req.headers.get('content-length')) > limit + 1024 * 1024) throw new HttpError(413, 'Capture exceeds upload limit.');
      const form = await req.formData();
      input = quickCaptureInputSchema.parse(JSON.parse(String(form.get('capture'))));
      const files = form.getAll('files');
      const descriptions = form.getAll('descriptions');
      if (files.length > 20) throw new HttpError(400, 'At most 20 attachments per capture.');
      let total = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!(file instanceof File)) throw new HttpError(400, 'Expected attachment file.');
        total += file.size;
        if (total > limit) throw new HttpError(413, 'Capture exceeds upload limit.');
        staged.push(await stageAttachment({ mediaDir, parentType: 'motif', parentId: '', description: String(descriptions[i] || ''), file: { name: file.name, type: file.type, size: file.size, stream: Readable.from(Buffer.from(await file.arrayBuffer())) } }));
      }
    } else input = await readJsonBody(req);
    const { db } = getDatabase();
    const result = createQuickCapture(db, input, staged);
    if (result.replayed) for (const file of staged) fs.rmSync(path.join(mediaDir, file.filePath), { force: true });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    for (const file of staged) fs.rmSync(path.join(mediaDir, file.filePath), { force: true });
    return apiErrorResponse(error, 'quick-capture.POST');
  }
}
