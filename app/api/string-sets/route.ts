import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { instruments, stringSets } from '@/app/db/schema';
import { eq } from 'drizzle-orm';
import { apiErrorResponse, HttpError, readJsonBody } from '@/app/lib/api/http';
import { assertStringAssignmentsMatch, stringSetInputSchema } from '@/app/lib/validation/schemas';

export async function GET(req: Request) {
  try {
    const { db } = getDatabase();
    const { searchParams } = new URL(req.url);
    const instrumentId = searchParams.get('instrumentId');
    const rows = await db.select().from(stringSets).where(instrumentId ? eq(stringSets.instrumentId, instrumentId) : undefined);
    return NextResponse.json(rows);
  } catch (error) {
    return apiErrorResponse(error, 'string-sets.GET');
  }
}

export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = stringSetInputSchema.parse(await readJsonBody(req));
    const created = db.transaction((tx) => {
      if (body.instrumentId) {
        const inst = tx.select().from(instruments).where(eq(instruments.id, body.instrumentId)).get();
        if (!inst) throw new HttpError(404, 'Instrument not found.');
        assertStringAssignmentsMatch(body.stringAssignments, inst.stringCount);
      }
      const record = {
        id: body.id || uuidv4(),
        instrumentId: body.instrumentId ?? null,
        name: body.name,
        installedDate: body.installedDate ?? null,
        stringAssignments: JSON.stringify(body.stringAssignments),
        notes: body.notes ?? null,
        isActive: body.isActive === false ? 0 : 1,
        createdAt: Date.now(),
      };
      tx.insert(stringSets).values(record).run();
      return record;
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, 'string-sets.POST');
  }
}
