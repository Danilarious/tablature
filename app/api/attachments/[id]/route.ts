import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStorageDirs } from '@/app/lib/paths';
import { getDatabase } from '@/app/db/client';
import { apiErrorResponse, HttpError, readJsonBody } from '@/app/lib/api/http';
import { deleteAttachment, getAttachment, updateAttachment } from '@/app/lib/services/attachments';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  displayName: z.string().max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { db } = getDatabase();
    const row = getAttachment(db, params.id);
    if (!row) throw new HttpError(404, 'Attachment not found.');
    return NextResponse.json(row, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiErrorResponse(error, 'attachments.id.GET');
  }
}

/** Rename / describe an attachment. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db } = getDatabase();
    const body = patchSchema.parse(await readJsonBody(req));
    return NextResponse.json(updateAttachment(db, params.id, body));
  } catch (error) {
    return apiErrorResponse(error, 'attachments.id.PATCH');
  }
}

/** Removes the attachment record; the file is moved to media/.trash/ (recoverable). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { db } = getDatabase();
    const { mediaDir } = getStorageDirs();
    const result = deleteAttachment(db, mediaDir, params.id);
    return NextResponse.json({ ok: true, movedToTrash: result.trashedPath !== null });
  } catch (error) {
    return apiErrorResponse(error, 'attachments.id.DELETE');
  }
}
