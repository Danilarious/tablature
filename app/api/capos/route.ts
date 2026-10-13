import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { capoConfigurations } from '@/app/db/schema';

export async function GET() {
  try {
    const { db } = getDatabase();
    const rows = await db.select().from(capoConfigurations);
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = await req.json();

    if (!body.stringFrets || !Array.isArray(body.stringFrets)) {
      return NextResponse.json(
        { error: 'stringFrets array is required.' },
        { status: 400 }
      );
    }

    const type = body.type || 'partial';
    const now = Date.now();
    const newCapo = {
      id: body.id || uuidv4(),
      name: body.name ? body.name.trim() : `Capo (${type})`,
      type,
      stringFrets: JSON.stringify(body.stringFrets),
      createdAt: now,
    };

    await db.insert(capoConfigurations).values(newCapo);
    return NextResponse.json(newCapo, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
