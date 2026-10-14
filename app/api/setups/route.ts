import { NextResponse } from 'next/server';
import { getDatabase } from '@/app/db/client';
import { setups } from '@/app/db/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { apiErrorResponse, readJsonBody } from '@/app/lib/api/http';
import { buildSetupRecord } from '@/app/lib/services/setups';

export async function GET(req: Request) {
  try {
    const { db } = getDatabase();
    const { searchParams } = new URL(req.url);
    const instrumentId = searchParams.get('instrumentId');

    const rows = instrumentId
      ? await db.select().from(setups).where(eq(setups.instrumentId, instrumentId)).orderBy(desc(setups.createdAt))
      : await db.select().from(setups).orderBy(desc(setups.createdAt));
    return NextResponse.json(rows);
  } catch (error) {
    return apiErrorResponse(error, 'setups.GET');
  }
}

const setupRequestSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  instrumentId: z.string().min(1, 'instrumentId is required'),
  tuningId: z.string().min(1, 'tuningId is required'),
  stringSetId: z.string().min(1).nullable().optional(),
  capoConfigId: z.string().min(1).nullable().optional(),
  name: z.string().max(300).nullable().optional(),
});

/** Creates a NEW immutable setup snapshot (setups are never edited in place). */
export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = setupRequestSchema.parse(await readJsonBody(req));
    const record = db.transaction((tx) => {
      const built = buildSetupRecord(tx, body);
      tx.insert(setups).values(built).run();
      return built;
    });
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, 'setups.POST');
  }
}
