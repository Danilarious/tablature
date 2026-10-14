import { NextResponse } from 'next/server';
import { getDatabase } from '@/app/db/client';
import { instruments } from '@/app/db/schema';
import { eq } from 'drizzle-orm';
import { apiErrorResponse, HttpError, readJsonBody } from '@/app/lib/api/http';
import { updateInstrument } from '@/app/lib/services/instruments';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { db } = getDatabase();
    const row = db.select().from(instruments).where(eq(instruments.id, params.id)).get();
    if (!row) throw new HttpError(404, 'Instrument not found.');
    return NextResponse.json(row);
  } catch (error) {
    return apiErrorResponse(error, 'instruments.id.GET');
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db } = getDatabase();
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    const { id: _ignored, ...rest } = body ?? {};
    return NextResponse.json(updateInstrument(db, params.id, rest));
  } catch (error) {
    return apiErrorResponse(error, 'instruments.id.PUT');
  }
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  return PUT(req, ctx);
}
