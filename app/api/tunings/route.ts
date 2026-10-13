import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { tunings } from '@/app/db/schema';
import { apiErrorResponse, readJsonBody } from '@/app/lib/api/http';
import { tuningInputSchema } from '@/app/lib/validation/schemas';
import { generateNextHumanId } from '@/app/lib/services/human-ids';

export async function GET() {
  try {
    const { db } = getDatabase();
    const rows = await db.select().from(tunings).orderBy(tunings.humanId);
    return NextResponse.json(rows);
  } catch (error) {
    return apiErrorResponse(error, 'tunings.GET');
  }
}

export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = tuningInputSchema.parse(await readJsonBody(req));

    const created = db.transaction((tx) => {
      const allTunings = tx.select({ humanId: tunings.humanId }).from(tunings).all();
      const humanId = body.humanId || generateNextHumanId(allTunings.map((t) => t.humanId), 'T');
      const now = Date.now();
      const newTuning = {
        id: body.id || uuidv4(),
        humanId,
        name: body.name,
        stringCount: body.pitches.length,
        pitches: JSON.stringify(body.pitches),
        tonalCenter: body.tonalCenter ?? null,
        tags: body.tags && body.tags.length > 0 ? JSON.stringify(body.tags) : null,
        notes: body.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      tx.insert(tunings).values(newTuning).run();
      return newTuning;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, 'tunings.POST');
  }
}
