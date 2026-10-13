import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { instruments } from '@/app/db/schema';
import { apiErrorResponse, HttpError, readJsonBody } from '@/app/lib/api/http';
import { instrumentInputSchema } from '@/app/lib/validation/schemas';
import { updateInstrument } from '@/app/lib/services/instruments';

export async function GET() {
  try {
    const { db } = getDatabase();
    const rows = await db.select().from(instruments).orderBy(instruments.name);
    return NextResponse.json(rows);
  } catch (error) {
    return apiErrorResponse(error, 'instruments.GET');
  }
}

export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = instrumentInputSchema.parse(await readJsonBody(req));
    const now = Date.now();
    const newInstrument = {
      id: body.id || uuidv4(),
      name: body.name,
      maker: body.maker ?? null,
      model: body.model ?? null,
      family: body.family,
      stringCount: body.stringCount,
      defaultScaleLength: body.defaultScaleLength ?? null,
      scaleLengthUnit: 'in',
      perStringSpeakingLengths: body.perStringSpeakingLengths ? JSON.stringify(body.perStringSpeakingLengths) : null,
      notes: body.notes ?? null,
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(instruments).values(newInstrument);
    return NextResponse.json(newInstrument, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, 'instruments.POST');
  }
}

/** Legacy body-addressed update kept for compatibility; prefer PUT /api/instruments/[id]. */
export async function PUT(req: Request) {
  try {
    const { db } = getDatabase();
    const body = (await readJsonBody(req)) as { id?: unknown } & Record<string, unknown>;
    if (typeof body?.id !== 'string' || !body.id) throw new HttpError(400, 'Instrument ID is required for update.');
    const { id, ...rest } = body;
    return NextResponse.json(updateInstrument(db, id as string, rest));
  } catch (error) {
    return apiErrorResponse(error, 'instruments.PUT');
  }
}
