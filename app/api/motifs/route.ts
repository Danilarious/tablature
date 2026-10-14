import { NextResponse } from 'next/server';
import { getDatabase } from '@/app/db/client';
import { motifs } from '@/app/db/schema';
import { eq, desc } from 'drizzle-orm';
import { apiErrorResponse, readJsonBody } from '@/app/lib/api/http';
import { insertMotif } from '@/app/lib/services/motifs';

export async function GET(req: Request) {
  try {
    const { db } = getDatabase();
    const { searchParams } = new URL(req.url);
    const setupId = searchParams.get('setupId');
    const tuningId = searchParams.get('tuningId');
    const instrumentId = searchParams.get('instrumentId');

    const filter = setupId
      ? eq(motifs.setupId, setupId)
      : tuningId
        ? eq(motifs.tuningId, tuningId)
        : instrumentId
          ? eq(motifs.instrumentId, instrumentId)
          : undefined;
    const rows = await db.select().from(motifs).where(filter).orderBy(desc(motifs.createdAt));
    return NextResponse.json(rows);
  } catch (error) {
    return apiErrorResponse(error, 'motifs.GET');
  }
}

export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = await readJsonBody(req);
    const record = db.transaction((tx) => insertMotif(tx, body));
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, 'motifs.POST');
  }
}
