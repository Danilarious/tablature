import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { stringProducts } from '@/app/db/schema';

export async function GET() {
  try {
    const { db } = getDatabase();
    const rows = await db.select().from(stringProducts).orderBy(stringProducts.manufacturer, stringProducts.nominalGauge);
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = await req.json();

    if (!body.manufacturer || body.nominalGauge === undefined) {
      return NextResponse.json(
        { error: 'Manufacturer and nominal gauge are required.' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const newProduct = {
      id: body.id || uuidv4(),
      manufacturer: body.manufacturer.trim(),
      productFamily: body.productFamily ? body.productFamily.trim() : null,
      nominalGauge: parseFloat(body.nominalGauge),
      gaugeUnit: body.gaugeUnit || 'in',
      material: body.material || null,
      coreConstruction: body.coreConstruction || null,
      windingConstruction: body.windingConstruction || null,
      unitWeight: body.unitWeight !== undefined && body.unitWeight !== null && body.unitWeight !== ''
        ? parseFloat(body.unitWeight)
        : null,
      notes: body.notes ? body.notes.trim() : null,
      createdAt: now,
    };

    await db.insert(stringProducts).values(newProduct);
    return NextResponse.json(newProduct, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
