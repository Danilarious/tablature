import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { positions } from '@/app/db/schema';
import { eq, desc } from 'drizzle-orm';

function generateNextHumanId(existing: string[], prefix: string): string {
  let maxNum = 0;
  for (const id of existing) {
    if (!id) continue;
    const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
}

export async function GET(req: Request) {
  try {
    const { db } = getDatabase();
    const { searchParams } = new URL(req.url);
    const tuningId = searchParams.get('tuningId');
    const setupId = searchParams.get('setupId');

    let rows;
    if (tuningId) {
      rows = await db.select().from(positions).where(eq(positions.tuningId, tuningId)).orderBy(positions.humanId);
    } else if (setupId) {
      rows = await db.select().from(positions).where(eq(positions.setupId, setupId)).orderBy(positions.humanId);
    } else {
      rows = await db.select().from(positions).orderBy(positions.humanId);
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

    if (!body.frets || !Array.isArray(body.frets) || !body.stringCount) {
      return NextResponse.json(
        { error: 'frets array and stringCount are required.' },
        { status: 400 }
      );
    }

    const allPositions = await db.select({ humanId: positions.humanId }).from(positions);
    const existingIds = allPositions.map(p => p.humanId).filter(Boolean) as string[];
    const humanId = body.humanId?.trim() || generateNextHumanId(existingIds, 'P');

    const now = Date.now();
    const newPosition = {
      id: body.id || uuidv4(),
      humanId,
      name: body.name ? body.name.trim() : null,
      tuningId: body.tuningId || null,
      setupId: body.setupId || null,
      stringCount: parseInt(body.stringCount, 10),
      baseFret: body.baseFret ? parseInt(body.baseFret, 10) : 1,
      frets: JSON.stringify(body.frets),
      fingers: body.fingers ? JSON.stringify(body.fingers) : null,
      tags: body.tags ? JSON.stringify(body.tags) : null,
      notes: body.notes ? body.notes.trim() : null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(positions).values(newPosition);
    return NextResponse.json(newPosition, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
