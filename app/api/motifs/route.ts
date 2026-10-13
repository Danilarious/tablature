import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { motifs, motifPositions, setups, tunings, instruments } from '@/app/db/schema';
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
    const setupId = searchParams.get('setupId');
    const tuningId = searchParams.get('tuningId');
    const instrumentId = searchParams.get('instrumentId');

    let rows;
    if (setupId) {
      rows = await db.select().from(motifs).where(eq(motifs.setupId, setupId)).orderBy(desc(motifs.createdAt));
    } else if (tuningId) {
      rows = await db.select().from(motifs).where(eq(motifs.tuningId, tuningId)).orderBy(desc(motifs.createdAt));
    } else if (instrumentId) {
      rows = await db.select().from(motifs).where(eq(motifs.instrumentId, instrumentId)).orderBy(desc(motifs.createdAt));
    } else {
      rows = await db.select().from(motifs).orderBy(desc(motifs.createdAt));
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

    const name = body.name?.trim() || 'Untitled Motif';
    const tabData = body.tabData || [];

    const allMotifs = await db.select({ humanId: motifs.humanId }).from(motifs);
    const existingIds = allMotifs.map(m => m.humanId).filter(Boolean) as string[];
    const humanId = body.humanId?.trim() || generateNextHumanId(existingIds, 'M');

    const now = Date.now();
    const newMotifId = body.id || uuidv4();
    const newMotif = {
      id: newMotifId,
      humanId,
      name,
      setupId: body.setupId || null,
      tuningId: body.tuningId || null,
      instrumentId: body.instrumentId || null,
      function: body.function || 'riff',
      tabData: typeof tabData === 'string' ? tabData : JSON.stringify(tabData),
      variations: body.variations ? JSON.stringify(body.variations) : null,
      tags: body.tags ? JSON.stringify(body.tags) : null,
      notes: body.notes ? body.notes.trim() : null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(motifs).values(newMotif);

    // Link positions if supplied
    if (body.positionIds && Array.isArray(body.positionIds)) {
      for (const posId of body.positionIds) {
        await db.insert(motifPositions).values({
          id: uuidv4(),
          motifId: newMotifId,
          positionId: posId,
        });
      }
    }

    return NextResponse.json(newMotif, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
