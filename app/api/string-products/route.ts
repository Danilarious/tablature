import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/app/lib/api/http';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { stringProducts } from '@/app/db/schema';

export async function GET() {
  try {
    const { db } = getDatabase();
    const rows = await db.select().from(stringProducts).orderBy(stringProducts.manufacturer, stringProducts.nominalGauge);
    return NextResponse.json(rows);
  } catch (error) {
    return apiErrorResponse(error, "string-products");
  }
}

export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const num = (v: unknown): number | null => {
      if (v === undefined || v === null || v === '') return null;
      const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d*\.?\d+$/.test(v.trim()) ? Number(v) : NaN;
      return Number.isFinite(n) && n > 0 ? n : NaN;
    };
    const gauge = num(body?.nominalGauge);
    const unitWeight = num(body?.unitWeight);

    if (!body || typeof body.manufacturer !== 'string' || !body.manufacturer.trim() || gauge === null || Number.isNaN(gauge)) {
      return NextResponse.json(
        { error: 'Manufacturer and a positive nominal gauge are required.' },
        { status: 400 }
      );
    }
    if (Number.isNaN(unitWeight)) {
      return NextResponse.json({ error: 'Unit weight must be a positive number or left blank (unknown).' }, { status: 400 });
    }
    const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null);

    const now = Date.now();
    const newProduct = {
      id: typeof body.id === 'string' && body.id ? body.id : uuidv4(),
      manufacturer: body.manufacturer.trim(),
      productFamily: text(body.productFamily),
      nominalGauge: gauge,
      gaugeUnit: 'in',
      material: text(body.material),
      coreConstruction: text(body.coreConstruction),
      windingConstruction: text(body.windingConstruction),
      unitWeight,
      notes: text(body.notes),
      createdAt: now,
    };

    await db.insert(stringProducts).values(newProduct);
    return NextResponse.json(newProduct, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "string-products");
  }
}
