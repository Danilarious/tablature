import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { instruments } from '@/app/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  try {
    const { db } = getDatabase();
    const rows = await db.select().from(instruments).orderBy(instruments.name);
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = await req.json();

    if (!body.name || !body.stringCount) {
      return NextResponse.json(
        { error: 'Name and string count are required.' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const newInstrument = {
      id: body.id || uuidv4(),
      name: body.name.trim(),
      maker: body.maker ? body.maker.trim() : null,
      model: body.model ? body.model.trim() : null,
      family: body.family || 'steel_string_acoustic',
      stringCount: parseInt(body.stringCount, 10),
      defaultScaleLength: body.defaultScaleLength ? parseFloat(body.defaultScaleLength) : null,
      scaleLengthUnit: body.scaleLengthUnit || 'in',
      perStringSpeakingLengths: body.perStringSpeakingLengths ? JSON.stringify(body.perStringSpeakingLengths) : null,
      notes: body.notes ? body.notes.trim() : null,
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(instruments).values(newInstrument);
    return NextResponse.json(newInstrument, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { db } = getDatabase();
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json(
        { error: 'Instrument ID is required for update.' },
        { status: 400 }
      );
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
      updateData.defaultScaleLength =
        body.defaultScaleLength !== null && body.defaultScaleLength !== ''
          ? parseFloat(body.defaultScaleLength)
          : null;
    }
    if (body.scaleLengthUnit !== undefined) updateData.scaleLengthUnit = body.scaleLengthUnit || 'in';
    if (body.perStringSpeakingLengths !== undefined) {
      updateData.perStringSpeakingLengths = body.perStringSpeakingLengths
        ? typeof body.perStringSpeakingLengths === 'string'
          ? body.perStringSpeakingLengths
          : JSON.stringify(body.perStringSpeakingLengths)
        : null;
    }
    if (body.notes !== undefined) updateData.notes = body.notes ? body.notes.trim() : null;
    if (body.isArchived !== undefined) updateData.isArchived = body.isArchived ? 1 : 0;

    await db.update(instruments).set(updateData).where(eq(instruments.id, body.id));
    const [updated] = await db.select().from(instruments).where(eq(instruments.id, body.id));
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

