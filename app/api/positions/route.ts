import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { positions, tunings } from '@/app/db/schema';
import { eq } from 'drizzle-orm';
import { apiErrorResponse, HttpError, readJsonBody } from '@/app/lib/api/http';
import { assertInstrumentTuningCompatible, positionInputSchema } from '@/app/lib/validation/schemas';
import { generateNextHumanId } from '@/app/lib/services/human-ids';

export async function GET(req: Request) {
  try {
    const { db } = getDatabase();
    const { searchParams } = new URL(req.url);
    const tuningId = searchParams.get('tuningId');
    const setupId = searchParams.get('setupId');
    const filter = tuningId ? eq(positions.tuningId, tuningId) : setupId ? eq(positions.setupId, setupId) : undefined;
    const rows = await db.select().from(positions).where(filter).orderBy(positions.humanId);
    return NextResponse.json(rows);
  } catch (error) {
    return apiErrorResponse(error, 'positions.GET');
  }
}

export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = positionInputSchema.parse(await readJsonBody(req));
    const created = db.transaction((tx) => {
      if (body.tuningId) {
        const tun = tx.select().from(tunings).where(eq(tunings.id, body.tuningId)).get();
        if (!tun) throw new HttpError(404, 'Tuning not found.');
        assertInstrumentTuningCompatible(body.stringCount, tun.stringCount);
      }
      const existingIds = tx.select({ humanId: positions.humanId }).from(positions).all().map((p) => p.humanId);
      const now = Date.now();
      const record = {
        id: body.id || uuidv4(),
        humanId: body.humanId || generateNextHumanId(existingIds, 'P'),
        name: body.name ?? null,
        tuningId: body.tuningId ?? null,
        setupId: body.setupId ?? null,
        stringCount: body.stringCount,
        baseFret: body.baseFret ?? 1,
        frets: JSON.stringify(body.frets),
        fingers: body.fingers ? JSON.stringify(body.fingers) : null,
        tags: body.tags && body.tags.length > 0 ? JSON.stringify(body.tags) : null,
        notes: body.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      tx.insert(positions).values(record).run();
      return record;
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, 'positions.POST');
  }
}
