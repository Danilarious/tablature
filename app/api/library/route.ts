import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/app/lib/api/http';
import { getDatabase } from '@/app/db/client';
import {
  compositions,
  motifs,
  tunings,
  instruments,
  setups,
  positions,
  compositionMotifs,
  compositionPositions,
  compositionSetups,
  motifPositions,
  attachments,
} from '@/app/db/schema';
import { eq, like, or } from 'drizzle-orm';

// Reads request.url and live database state; never prerender.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { db } = getDatabase();
    const { searchParams } = new URL(req.url);

    const query = searchParams.get('q')?.toLowerCase() || '';
    const instrumentId = searchParams.get('instrumentId');
    const tuningId = searchParams.get('tuningId');
    const setupId = searchParams.get('setupId');

    // Fetch primary collections
    const [allComps, allMotifs, allTunings, allInsts, allSetups, allPositions, allAttachments] = await Promise.all([
      db.select().from(compositions),
      db.select().from(motifs),
      db.select().from(tunings),
      db.select().from(instruments),
      db.select().from(setups),
      db.select().from(positions),
      db.select().from(attachments),
    ]);

    // Fetch join tables
    const [compMotifs, compPositions, compSetups, motPositions] = await Promise.all([
      db.select().from(compositionMotifs),
      db.select().from(compositionPositions),
      db.select().from(compositionSetups),
      db.select().from(motifPositions),
    ]);

    // Create lookup maps
    const tuningMap = new Map(allTunings.map(t => [t.id, t]));
    const instrumentMap = new Map(allInsts.map(i => [i.id, i]));
    const setupMap = new Map(allSetups.map(s => [s.id, s]));

    // Relate Compositions to their tunings and instruments through their Setups
    const compositionsWithRelations = allComps.map(c => {
      const setupsForComp = compSetups.filter(cs => cs.compositionId === c.id);
      const linkedSetupIds = setupsForComp.map(cs => cs.setupId);
      const linkedSetups = linkedSetupIds.map(sid => setupMap.get(sid)).filter(Boolean);
      const linkedInstrumentIds = linkedSetups.map(s => s!.instrumentId).filter(Boolean);
      const linkedTuningIds = linkedSetups.map(s => s!.tuningId).filter(Boolean);
      const linkedMotifs = compMotifs.filter(cm => cm.compositionId === c.id).map(cm => cm.motifId);
      const linkedPositions = compPositions.filter(cp => cp.compositionId === c.id).map(cp => cp.positionId);
      const linkedAttachments = allAttachments.filter(a => a.parentType === 'composition' && a.parentId === c.id);

      return {
        ...c,
        linkedSetupIds,
        linkedInstrumentIds,
        linkedTuningIds,
        linkedMotifs,
        linkedPositions,
        linkedAttachments,
      };
    });

    // Relate Motifs
    const motifsWithRelations = allMotifs.map(m => {
      const parentSetup = m.setupId ? setupMap.get(m.setupId) : null;
      const effectiveTuningId = m.tuningId || parentSetup?.tuningId || null;
      const effectiveInstrumentId = m.instrumentId || parentSetup?.instrumentId || null;
      const linkedComps = compMotifs.filter(cm => cm.motifId === m.id).map(cm => cm.compositionId);
      const linkedPositions = motPositions.filter(mp => mp.motifId === m.id).map(mp => mp.positionId);
      const linkedAttachments = allAttachments.filter(a => a.parentType === 'motif' && a.parentId === m.id);

      return {
        ...m,
        effectiveTuningId,
        effectiveInstrumentId,
        linkedCompositions: linkedComps,
        linkedPositions,
        linkedAttachments,
      };
    });

    // Filter results if parameters are provided
    let filteredComps = compositionsWithRelations;
    let filteredMotifs = motifsWithRelations;
    let filteredPositions = allPositions;
    let filteredSetups = allSetups;

    if (instrumentId) {
      filteredComps = filteredComps.filter(c => c.linkedInstrumentIds.includes(instrumentId));
      filteredMotifs = filteredMotifs.filter(m => m.effectiveInstrumentId === instrumentId);
      filteredSetups = filteredSetups.filter(s => s.instrumentId === instrumentId);
    }

    if (tuningId) {
      filteredComps = filteredComps.filter(c => c.linkedTuningIds.includes(tuningId));
      filteredMotifs = filteredMotifs.filter(m => m.effectiveTuningId === tuningId);
      filteredPositions = filteredPositions.filter(p => p.tuningId === tuningId);
      filteredSetups = filteredSetups.filter(s => s.tuningId === tuningId);
    }

    if (setupId) {
      filteredComps = filteredComps.filter(c => c.linkedSetupIds.includes(setupId));
      filteredMotifs = filteredMotifs.filter(m => m.setupId === setupId);
      filteredPositions = filteredPositions.filter(p => p.setupId === setupId);
      filteredSetups = filteredSetups.filter(s => s.id === setupId);
    }

    if (query) {
      filteredComps = filteredComps.filter(c =>
        c.title.toLowerCase().includes(query) ||
        c.humanId.toLowerCase().includes(query) ||
        (c.notes && c.notes.toLowerCase().includes(query)) ||
        (c.pieceMap && c.pieceMap.toLowerCase().includes(query))
      );
      filteredMotifs = filteredMotifs.filter(m =>
        m.name.toLowerCase().includes(query) ||
        m.humanId.toLowerCase().includes(query) ||
        (m.notes && m.notes.toLowerCase().includes(query)) ||
        (m.tags && m.tags.toLowerCase().includes(query))
      );
      filteredPositions = filteredPositions.filter(p =>
        (p.name && p.name.toLowerCase().includes(query)) ||
        (p.humanId && p.humanId.toLowerCase().includes(query)) ||
        (p.tags && p.tags.toLowerCase().includes(query))
      );
    }

    return NextResponse.json({
      compositions: filteredComps,
      motifs: filteredMotifs,
      tunings: allTunings,
      instruments: allInsts,
      setups: filteredSetups,
      positions: filteredPositions,
      attachments: allAttachments,
    });
  } catch (error) {
    return apiErrorResponse(error, "library");
  }
}
