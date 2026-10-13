import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { stringSets } from '@/app/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: Request) {
  try {
    const { db } = getDatabase();
    const { searchParams } = new URL(req.url);
    const instrumentId = searchParams.get('instrumentId');

    let rows;
    if (instrumentId) {
      rows = await db.select().from(stringSets).where(eq(stringSets.instrumentId, instrumentId));
    } else {
      rows = await db.select().from(stringSets);
    }
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = await req.json();

    if (!body.name || !body.stringAssignments) {
      return NextResponse.json(
        { error: 'Name and string assignments are required.' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const newSet = {
      id: body.id || uuidv4(),
      instrumentId: body.instrumentId || null,
      name: body.name.trim(),
      installedDate: body.installedDate || null,
      stringAssignments: typeof body.stringAssignments === 'string'
        ? body.stringAssignments
        : JSON.stringify(body.stringAssignments),
      notes: body.notes ? body.notes.trim() : null,
      isActive: body.isActive !== undefined ? (body.isActive ? 1 : 0) : 1,
      createdAt: now,
    };

    await db.insert(stringSets).values(newSet);
    return NextResponse.json(newSet, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
