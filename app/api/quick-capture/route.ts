import { NextResponse } from 'next/server';
import { getDatabase } from '@/app/db/client';
import { apiErrorResponse, readJsonBody } from '@/app/lib/api/http';
import { createQuickCapture } from '@/app/lib/services/quick-capture';

export const dynamic = 'force-dynamic';

/**
 * POST /api/quick-capture — atomically creates/reuses capo + setup and creates the motif.
 * Responds with the final motif only after the transaction commits. Media is uploaded
 * separately by the client against the returned motif ID.
 */
export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const result = createQuickCapture(db, await readJsonBody(req));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, 'quick-capture.POST');
  }
}
