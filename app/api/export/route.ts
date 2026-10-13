import { NextResponse } from 'next/server';
import { getDatabase } from '@/app/db/client';
import {
  instruments,
  tunings,
  stringProducts,
  stringSets,
  capoConfigurations,
  setups,
  positions,
  motifs,
  compositions,
  compositionMotifs,
  compositionPositions,
  compositionSetups,
  motifPositions,
  attachments,
} from '@/app/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: Request) {
  try {
    const { db } = getDatabase();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'full';
    const id = searchParams.get('id');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (type === 'full') {
      const [
        allInstruments,
        allTunings,
        allProducts,
        allSets,
        allCapos,
        allSetups,
        allPositions,
        allMotifs,
        allCompositions,
        allCompMotifs,
        allCompPositions,
        allCompSetups,
        allMotifPositions,
        allAttachments,
      ] = await Promise.all([
        db.select().from(instruments),
        db.select().from(tunings),
        db.select().from(stringProducts),
        db.select().from(stringSets),
        db.select().from(capoConfigurations),
        db.select().from(setups),
        db.select().from(positions),
        db.select().from(motifs),
        db.select().from(compositions),
        db.select().from(compositionMotifs),
        db.select().from(compositionPositions),
        db.select().from(compositionSetups),
        db.select().from(motifPositions),
        db.select().from(attachments),
      ]);

      const archive = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        appName: 'BxB Music Notebook',
        database: {
          instruments: allInstruments,
          tunings: allTunings,
          stringProducts: allProducts,
          stringSets: allSets,
          capoConfigurations: allCapos,
          setups: allSetups,
          positions: allPositions,
          motifs: allMotifs,
          compositions: allCompositions,
          relations: {
            compositionMotifs: allCompMotifs,
            compositionPositions: allCompPositions,
            compositionSetups: allCompSetups,
            motifPositions: allMotifPositions,
          },
          attachments: allAttachments,
        },
      };

      return new NextResponse(JSON.stringify(archive, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="bxb-music-notebook-full-archive-${timestamp}.json"`,
        },
      });
    }

    if (type === 'composition' && id) {
      const [comp] = await db.select().from(compositions).where(eq(compositions.id, id));
      if (!comp) return NextResponse.json({ error: 'Composition not found' }, { status: 404 });

      const [cMotifs, cPositions, cSetups, cAttachments] = await Promise.all([
        db.select().from(compositionMotifs).where(eq(compositionMotifs.compositionId, id)),
        db.select().from(compositionPositions).where(eq(compositionPositions.compositionId, id)),
        db.select().from(compositionSetups).where(eq(compositionSetups.compositionId, id)),
        db.select().from(attachments).where(eq(attachments.parentId, id)),
      ]);

      const bundle = {
        type: 'composition_record',
        composition: comp,
        motifs: cMotifs,
        positions: cPositions,
        setups: cSetups,
        attachments: cAttachments,
        exportedAt: new Date().toISOString(),
      };

      const safeTitle = (comp.title || comp.humanId).replace(/[^a-zA-Z0-9_-]/g, '_');
      return new NextResponse(JSON.stringify(bundle, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${comp.humanId}-${safeTitle}-record.json"`,
        },
      });
    }

    if (type === 'tuning' && id) {
      const [tun] = await db.select().from(tunings).where(eq(tunings.id, id));
      if (!tun) return NextResponse.json({ error: 'Tuning not found' }, { status: 404 });

      const bundle = {
        type: 'tuning_record',
        tuning: tun,
        exportedAt: new Date().toISOString(),
      };
      const safeName = tun.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      return new NextResponse(JSON.stringify(bundle, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${tun.humanId}-${safeName}-record.json"`,
        },
      });
    }

    if (type === 'motif' && id) {
      const [mot] = await db.select().from(motifs).where(eq(motifs.id, id));
      if (!mot) return NextResponse.json({ error: 'Motif not found' }, { status: 404 });

      const bundle = {
        type: 'motif_record',
        motif: mot,
        exportedAt: new Date().toISOString(),
      };
      const safeName = mot.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      return new NextResponse(JSON.stringify(bundle, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${mot.humanId}-${safeName}-record.json"`,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid export parameters' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
