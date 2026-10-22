import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/app/lib/api/http';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/app/db/client';
import { compositions, compositionMotifs, compositionPositions, compositionSetups, motifs, attachments } from '@/app/db/schema';
import { eq, desc } from 'drizzle-orm';

function generateNextHumanId(existing: string[], prefix: string): string {
  let maxNum = 0;
  for (const id of existing) {
    if (!id) continue;
    const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
}

export async function GET() {
  try {
    const { db } = getDatabase();
    const rows = await db.select().from(compositions).orderBy(desc(compositions.createdAt));
    const links = db.select().from(compositionMotifs).all();
    const ideas = db.select().from(motifs).all();
    const media = db.select().from(attachments).all();
    return NextResponse.json(rows.map(c => ({ ...c, linkedMotifs: links.filter(l => l.compositionId === c.id).sort((a,b) => a.sortOrder - b.sortOrder).map(l => ({ ...ideas.find(m => m.id === l.motifId), sectionName: l.sectionName, attachments: media.filter(a => a.parentType === 'motif' && a.parentId === l.motifId) })) })));
  } catch (error) {
    return apiErrorResponse(error, "compositions");
  }
}

export async function POST(req: Request) {
  try {
    const { db } = getDatabase();
    const body = await req.json();

    const title = body.title?.trim() || 'Untitled Composition';

    const allComps = await db.select({ humanId: compositions.humanId }).from(compositions);
    const existingIds = allComps.map(c => c.humanId).filter(Boolean) as string[];
    const humanId = body.humanId?.trim() || generateNextHumanId(existingIds, 'C');

    const now = Date.now();
    const newCompId = body.id || uuidv4();
    const newComposition = {
      id: newCompId,
      humanId,
      title,
      status: body.status || 'idea',
      tonalCenter: body.tonalCenter ? body.tonalCenter.trim() : null,
      tempo: (() => {
        const t = typeof body.tempo === 'number' ? body.tempo : parseInt(String(body.tempo ?? ''), 10);
        return Number.isFinite(t) && t > 0 && t < 1000 ? Math.round(t) : null;
      })(),
      timeSignature: typeof body.timeSignature === 'string' && body.timeSignature.trim() ? body.timeSignature.trim() : null,
      tempoNotes: body.tempoNotes ? body.tempoNotes.trim() : null,
      pieceMap: body.pieceMap ? body.pieceMap.trim() : null,
      sections: body.sections ? (typeof body.sections === 'string' ? body.sections : JSON.stringify(body.sections)) : null,
      notes: body.notes ? body.notes.trim() : null,
      lyrics: body.lyrics ? body.lyrics.trim() : null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(compositions).values(newComposition);

    // Link motifs
    if (body.motifIds && Array.isArray(body.motifIds)) {
      for (let i = 0; i < body.motifIds.length; i++) {
        await db.insert(compositionMotifs).values({
          id: uuidv4(),
          compositionId: newCompId,
          motifId: body.motifIds[i],
          sortOrder: i,
          sectionName: body.motifSections?.[i] || null,
        });
      }
    }

    // Link positions
    if (body.positionIds && Array.isArray(body.positionIds)) {
      for (let i = 0; i < body.positionIds.length; i++) {
        await db.insert(compositionPositions).values({
          id: uuidv4(),
          compositionId: newCompId,
          positionId: body.positionIds[i],
          sortOrder: i,
        });
      }
    }

    // Link setups
    if (body.setupIds && Array.isArray(body.setupIds)) {
      for (let i = 0; i < body.setupIds.length; i++) {
        await db.insert(compositionSetups).values({
          id: uuidv4(),
          compositionId: newCompId,
          setupId: body.setupIds[i],
          instrumentRole: body.setupRoles?.[i] || 'Primary Instrument',
        });
      }
    }

    return NextResponse.json(newComposition, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "compositions");
  }
}
