import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { tunings } from '@/app/db/schema';
import { desc } from 'drizzle-orm';

function generateNextHumanId(existing: string[], prefix: string): string {
  let maxNum = 0;
  for (const id of existing) {
    const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
}

export async function GET() {
  try {
    const { db } = getDatabase();
    const rows = await db.select().from(tunings).orderBy(tunings.humanId);
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = await req.json();

    if (!body.name || !body.pitches || !Array.isArray(body.pitches) || body.pitches.length === 0) {
      return NextResponse.json(
        { error: 'Name and non-empty pitches array are required.' },
        { status: 400 }
      );
    }

    const allTunings = await db.select({ humanId: tunings.humanId }).from(tunings);
    const humanId = body.humanId?.trim() || generateNextHumanId(allTunings.map(t => t.humanId), 'T');

    const now = Date.now();
    const newTuning = {
      id: body.id || uuidv4(),
      humanId,
      name: body.name.trim(),
      stringCount: body.pitches.length,
      pitches: JSON.stringify(body.pitches),
      tonalCenter: body.tonalCenter ? body.tonalCenter.trim() : null,
      tags: body.tags ? JSON.stringify(body.tags) : null,
      notes: body.notes ? body.notes.trim() : null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(tunings).values(newTuning);
    return NextResponse.json(newTuning, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
