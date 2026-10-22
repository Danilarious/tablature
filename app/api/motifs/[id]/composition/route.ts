import { NextResponse } from 'next/server';
import { getDatabase } from '@/app/db/client';
import { apiErrorResponse, readJsonBody } from '@/app/lib/api/http';
import { placeMotif } from '@/app/lib/services/quick-capture';
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try { return NextResponse.json(placeMotif(getDatabase().db, params.id, await readJsonBody(req)), { status: 201 }); }
  catch (error) { return apiErrorResponse(error, 'motif.place'); }
}
