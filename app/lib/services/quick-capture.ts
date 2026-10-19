import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  compositions,
  compositionMotifs,
  compositionSetups,
} from '../../db/schema';
import { HttpError } from '../api/http';
import { capoFretsSchema } from '../validation/schemas';
import { generateNextHumanId } from './human-ids';
import { findOrCreateCapo, findOrCreateSetup, type SyncDb } from './setups';
import { insertMotif, motifInputSchema } from './motifs';

const destinationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inbox') }),
  z.object({
    kind: z.literal('existing'),
    compositionId: z.string().min(1).max(100),
    sectionName: z.string().trim().max(200).nullable().optional(),
  }),
  z.object({
    kind: z.literal('new'),
    title: z.string().trim().min(1).max(300),
    sectionName: z.string().trim().max(200).nullable().optional(),
  }),
]);

/**
 * Quick Capture creates (or reuses) a capo configuration, an immutable setup snapshot and a
 * motif in ONE SQLite transaction. It can also create/link a composition in that transaction.
 * Any failure rolls back the whole chain, so a failed capture never leaves partial records.
 */
export const quickCaptureInputSchema = z.object({
  instrumentId: z.string().min(1).max(100),
  tuningId: z.string().min(1).max(100),
  /** Canonical per-string capo frets (index 0 = bass-side); null/0 = string not capoed. */
  capoFrets: capoFretsSchema.nullable().optional(),
  capoName: z.string().trim().max(200).nullable().optional(),
  setupName: z.string().trim().max(300).nullable().optional(),
  motif: motifInputSchema.omit({ setupId: true, tuningId: true, instrumentId: true, id: true, humanId: true }),
  destination: destinationSchema.optional(),
});
export type QuickCaptureInput = z.infer<typeof quickCaptureInputSchema>;

export interface QuickCaptureResult {
  motif: ReturnType<typeof insertMotif>;
  setupId: string;
  setupReused: boolean;
  capoConfigId: string | null;
  composition: { id: string; humanId: string; title: string } | null;
}

function createCompositionFromCapture(
  db: SyncDb,
  input: QuickCaptureInput,
  title: string
): { id: string; humanId: string; title: string } {
  const existingIds = db.select({ humanId: compositions.humanId }).from(compositions).all().map((row) => row.humanId);
  const now = Date.now();
  const record = {
    id: uuidv4(),
    humanId: generateNextHumanId(existingIds, 'C'),
    title,
    status: 'idea',
    tonalCenter: null,
    tempo: input.motif.tempo ?? null,
    timeSignature: input.motif.timeSignature ?? null,
    tempoNotes: null,
    pieceMap: null,
    sections: null,
    notes: 'Created from Quick Capture.',
    lyrics: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(compositions).values(record).run();
  return { id: record.id, humanId: record.humanId, title: record.title };
}

function linkCapture(
  db: SyncDb,
  composition: { id: string; humanId: string; title: string },
  motifId: string,
  setupId: string,
  sectionName: string | null
): void {
  const existingLinks = db
    .select({ sortOrder: compositionMotifs.sortOrder })
    .from(compositionMotifs)
    .where(eq(compositionMotifs.compositionId, composition.id))
    .all();
  const sortOrder = existingLinks.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

  db.insert(compositionMotifs).values({
    id: uuidv4(),
    compositionId: composition.id,
    motifId,
    sortOrder,
    sectionName,
  }).run();

  const setupLink = db
    .select({ id: compositionSetups.id })
    .from(compositionSetups)
    .where(and(eq(compositionSetups.compositionId, composition.id), eq(compositionSetups.setupId, setupId)))
    .get();
  if (!setupLink) {
    db.insert(compositionSetups).values({
      id: uuidv4(),
      compositionId: composition.id,
      setupId,
      instrumentRole: 'Primary Instrument',
    }).run();
  }
  db.update(compositions).set({ updatedAt: Date.now() }).where(eq(compositions.id, composition.id)).run();
}

export function createQuickCapture(db: SyncDb, rawInput: unknown): QuickCaptureResult {
  const input = quickCaptureInputSchema.parse(rawInput);
  return db.transaction((tx) => {
    const capoConfigId = input.capoFrets ? findOrCreateCapo(tx, input.capoFrets, input.capoName) : null;
    const { setup, reused } = findOrCreateSetup(tx, {
      instrumentId: input.instrumentId,
      tuningId: input.tuningId,
      capoConfigId,
      name: input.setupName ?? null,
    });
    const motif = insertMotif(tx, {
      ...input.motif,
      setupId: setup.id,
      tuningId: input.tuningId,
      instrumentId: input.instrumentId,
    });

    const destination = input.destination ?? { kind: 'inbox' as const };
    let composition: QuickCaptureResult['composition'] = null;
    if (destination.kind === 'existing') {
      const existing = tx.select().from(compositions).where(eq(compositions.id, destination.compositionId)).get();
      if (!existing) throw new HttpError(404, 'Composition not found.');
      composition = { id: existing.id, humanId: existing.humanId, title: existing.title };
      linkCapture(tx, composition, motif.id, setup.id!, destination.sectionName?.trim() || null);
    } else if (destination.kind === 'new') {
      composition = createCompositionFromCapture(tx, input, destination.title);
      linkCapture(tx, composition, motif.id, setup.id!, destination.sectionName?.trim() || null);
    }

    return { motif, setupId: setup.id!, setupReused: reused, capoConfigId, composition };
  });
}
