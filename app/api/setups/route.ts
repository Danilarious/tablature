import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { setups, instruments, tunings, stringSets, capoConfigurations } from '@/app/db/schema';
import { eq, desc } from 'drizzle-orm';
import { calculateSoundingPitch, calculateStringTension } from '@/app/lib/music/pitch';

export async function GET(req: Request) {
  try {
    const { db } = getDatabase();
    const { searchParams } = new URL(req.url);
    const instrumentId = searchParams.get('instrumentId');

    let rows;
    if (instrumentId) {
      rows = await db.select().from(setups).where(eq(setups.instrumentId, instrumentId)).orderBy(desc(setups.createdAt));
    } else {
      rows = await db.select().from(setups).orderBy(desc(setups.createdAt));
    }
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = await req.json();

    if (!body.instrumentId || !body.tuningId) {
      return NextResponse.json(
        { error: 'instrumentId and tuningId are required.' },
        { status: 400 }
      );
    }

    // Fetch referenced entities to construct snapshot
    const [inst] = await db.select().from(instruments).where(eq(instruments.id, body.instrumentId));
    const [tun] = await db.select().from(tunings).where(eq(tunings.id, body.tuningId));

    if (!inst || !tun) {
      return NextResponse.json({ error: 'Instrument or Tuning not found.' }, { status: 404 });
    }

    let stringSetRecord = null;
    if (body.stringSetId) {
      const [ss] = await db.select().from(stringSets).where(eq(stringSets.id, body.stringSetId));
      stringSetRecord = ss || null;
    }

    let capoRecord = null;
    if (body.capoConfigId) {
      const [cp] = await db.select().from(capoConfigurations).where(eq(capoConfigurations.id, body.capoConfigId));
      capoRecord = cp || null;
    }

    const openPitches: string[] = JSON.parse(tun.pitches);
    const capoFrets: (number | null)[] = capoRecord ? JSON.parse(capoRecord.stringFrets) : [];

    // Calculate effective pitches with capo
    const effectivePitches = openPitches.map((openPitch, idx) => {
      const capoFret = capoFrets[idx] ?? null;
      return calculateSoundingPitch(openPitch, capoFret, 0);
    });

    // Calculate tensions if scale length and string set data are available
    let perStringTension: (number | null)[] | null = null;
    let totalTension: number | null = null;

    if (inst.defaultScaleLength && stringSetRecord) {
      try {
        const assignments = JSON.parse(stringSetRecord.stringAssignments);
        const perStringSpeakingLengths = inst.perStringSpeakingLengths ? JSON.parse(inst.perStringSpeakingLengths) : null;

        const tensions: (number | null)[] = [];
        let runningTotal = 0;
        let allValid = true;

        for (let i = 0; i < effectivePitches.length; i++) {
          const stringLength = perStringSpeakingLengths?.[i] ?? inst.defaultScaleLength;
          const assignment = assignments[i];
          const unitWeight = assignment?.unitWeight;

          const res = calculateStringTension(effectivePitches[i], stringLength, unitWeight);
          if (res.status === 'valid' && res.tensionLbs !== null) {
            tensions.push(res.tensionLbs);
            runningTotal += res.tensionLbs;
          } else {
            tensions.push(null);
            allValid = false;
          }
        }

        perStringTension = tensions;
        if (allValid && runningTotal > 0) {
          totalTension = Math.round(runningTotal * 100) / 100;
        }
      } catch (err) {
        console.warn('Tension calculation error:', err);
      }
    }

    const snapshot = {
      timestamp: Date.now(),
      instrument: {
        id: inst.id,
        name: inst.name,
        stringCount: inst.stringCount,
        defaultScaleLength: inst.defaultScaleLength,
        perStringSpeakingLengths: inst.perStringSpeakingLengths,
      },
      tuning: {
        id: tun.id,
        humanId: tun.humanId,
        name: tun.name,
        pitches: openPitches,
      },
      capo: capoRecord ? {
        id: capoRecord.id,
        name: capoRecord.name,
        type: capoRecord.type,
        stringFrets: capoFrets,
      } : null,
      stringSet: stringSetRecord ? {
        id: stringSetRecord.id,
        name: stringSetRecord.name,
        assignments: stringSetRecord.stringAssignments,
      } : null,
      effectivePitches,
    };

    const now = Date.now();
    const newSetup = {
      id: body.id || uuidv4(),
      instrumentId: inst.id,
      tuningId: tun.id,
      stringSetId: stringSetRecord?.id || null,
      capoConfigId: capoRecord?.id || null,
      name: body.name ? body.name.trim() : `${inst.name} / ${tun.humanId} (${tun.name})`,
      effectivePitches: JSON.stringify(effectivePitches),
      perStringTension: perStringTension ? JSON.stringify(perStringTension) : null,
      totalTension,
      snapshot: JSON.stringify(snapshot),
      createdAt: now,
    };

    await db.insert(setups).values(newSetup);
    return NextResponse.json(newSetup, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
