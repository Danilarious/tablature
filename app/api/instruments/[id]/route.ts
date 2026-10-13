import { NextResponse } from 'next/server';
import { getDatabase } from '@/app/db/client';
import { instruments } from '@/app/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db } = getDatabase();
    const rows = await db.select().from(instruments).where(eq(instruments.id, params.id));
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Instrument not found' }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db } = getDatabase();
    const body = await req.json();
    const id = params.id || body.id;

    if (!id) {
      return NextResponse.json({ error: 'Instrument ID is required' }, { status: 400 });
    }

    const updateData: Record<string, any> = {
      updatedAt: Date.now(),
    };

    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.maker !== undefined) updateData.maker = body.maker ? body.maker.trim() : null;
    if (body.model !== undefined) updateData.model = body.model ? body.model.trim() : null;
    if (body.family !== undefined) updateData.family = body.family;
    if (body.stringCount !== undefined) updateData.stringCount = parseInt(body.stringCount, 10);
    if (body.defaultScaleLength !== undefined) {
      updateData.defaultScaleLength = body.defaultScaleLength !== null && body.defaultScaleLength !== '' ? parseFloat(body.defaultScaleLength) : null;
    }
    if (body.scaleLengthUnit !== undefined) updateData.scaleLengthUnit = body.scaleLengthUnit || 'in';
    if (body.perStringSpeakingLengths !== undefined) {
      updateData.perStringSpeakingLengths = body.perStringSpeakingLengths ? (typeof body.perStringSpeakingLengths === 'string' ? body.perStringSpeakingLengths : JSON.stringify(body.perStringSpeakingLengths)) : null;
    }
    if (body.notes !== undefined) updateData.notes = body.notes ? body.notes.trim() : null;
    if (body.isArchived !== undefined) updateData.isArchived = body.isArchived ? 1 : 0;

    await db.update(instruments).set(updateData).where(eq(instruments.id, id));
    const [updated] = await db.select().from(instruments).where(eq(instruments.id, id));
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return PUT(req, { params });
}
