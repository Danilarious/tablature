import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { capoConfigurations } from '@/app/db/schema';
import { apiErrorResponse, readJsonBody } from '@/app/lib/api/http';
import { capoInputSchema } from '@/app/lib/validation/schemas';
import { inferCapoType, normalizeCapoFrets } from '@/app/lib/services/setups';

export async function GET() {
  try {
    const { db } = getDatabase();
    const rows = await db.select().from(capoConfigurations);
    return NextResponse.json(rows);
  } catch (error) {
    return apiErrorResponse(error, 'capos.GET');
  }
}

/** Creates a named, reusable capo preset (canonical order: index 0 = bass-side string). */
export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = capoInputSchema.parse(await readJsonBody(req));
    const frets = normalizeCapoFrets(body.stringFrets);
    const type = inferCapoType(frets);
    const newCapo = {
      id: body.id || uuidv4(),
      name: body.name ?? `Capo (${type})`,
      type,
      stringFrets: JSON.stringify(frets),
      createdAt: Date.now(),
    };
    await db.insert(capoConfigurations).values(newCapo);
    return NextResponse.json(newCapo, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, 'capos.POST');
  }
}
