import { createHash } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  captureReceipts,
  attachments,
  motifs,
  compositions,
  compositionMotifs,
  compositionSetups,
} from '../../db/schema';
import { HttpError } from '../api/http';
import { parseCompositionSections, compositionSectionOptions } from '../music/composition-sections';
import { capoFretsSchema } from '../validation/schemas';
import { generateNextHumanId } from './human-ids';
import { findOrCreateCapo, findOrCreateSetup, type SyncDb } from './setups';
import { insertMotif, motifInputSchema } from './motifs';

export const destinationSchema = z.discriminatedUnion('kind', [
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
  captureId: z.string().uuid().optional(),
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
  replayed?: boolean;
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

export function linkCapture(
  db: SyncDb,
  composition: { id: string; humanId: string; title: string },
  motifId: string,
  setupId: string | null,
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

  const setupLink = setupId ? db
    .select({ id: compositionSetups.id })
    .from(compositionSetups)
    .where(and(eq(compositionSetups.compositionId, composition.id), eq(compositionSetups.setupId, setupId)))
    .get() : null;
  if (setupId && !setupLink) {
    db.insert(compositionSetups).values({
      id: uuidv4(),
      compositionId: composition.id,
      setupId,
      instrumentRole: 'Primary Instrument',
    }).run();
  }
  const stored = db.select().from(compositions).where(eq(compositions.id, composition.id)).get()!;
  const sections = parseCompositionSections(stored.sections);
  if (!sections) throw new HttpError(422, 'This composition has malformed section data. It has been preserved; repair its sections before placing a motif here.');
  if (sectionName && !compositionSectionOptions(sections).some((section) => section.name === sectionName)) {
    sections.push({ id: uuidv4(), name: sectionName });
  }
  db.update(compositions).set({ sections: JSON.stringify(sections), updatedAt: Date.now() }).where(eq(compositions.id, composition.id)).run();
}

export function createQuickCapture(db: SyncDb, rawInput: unknown, media: ((typeof attachments.$inferSelect) & { contentHash?: string })[] = []): QuickCaptureResult {
  const input = quickCaptureInputSchema.parse(rawInput);
  return db.transaction((tx) => {
    const fingerprint = createHash('sha256').update(JSON.stringify({ input, media: media.map(file => ({ name: file.displayName, mime: file.mimeType, size: file.fileSize, description: file.description, hash: file.contentHash || null })) })).digest('hex');
    if (input.captureId) {
      const receipt = tx.select().from(captureReceipts).where(eq(captureReceipts.captureId, input.captureId)).get();
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) throw new HttpError(409, 'This capture was saved from another request with different edits or recordings. Your current draft and recordings are retained. View the saved motif, or save this edited draft as a separate capture.');
        return { ...JSON.parse(receipt.result) as QuickCaptureResult, replayed: true };
      }
      if (tx.select().from(motifs).where(eq(motifs.id, input.captureId)).get()) throw new HttpError(409, 'Capture identifier already belongs to another record.');
    }
    const capoConfigId = input.capoFrets ? findOrCreateCapo(tx, input.capoFrets, input.capoName) : null;
    const { setup, reused } = findOrCreateSetup(tx, {
      instrumentId: input.instrumentId,
      tuningId: input.tuningId,
      capoConfigId,
      name: input.setupName ?? null,
    });
    const motif = insertMotif(tx, {
      ...input.motif,
      id: input.captureId,
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
      linkCapture(tx, composition, motif.id, setup.id!, destination.sectionName?.trim() || 'Unsectioned');
    } else if (destination.kind === 'new') {
      composition = createCompositionFromCapture(tx, input, destination.title);
      linkCapture(tx, composition, motif.id, setup.id!, destination.sectionName?.trim() || 'Unsectioned');
    }

    for (const file of media) tx.insert(attachments).values({ ...file, parentType: 'motif', parentId: motif.id }).run();
    const result = { motif, setupId: setup.id!, setupReused: reused, capoConfigId, composition };
    if (input.captureId) tx.insert(captureReceipts).values({ captureId: input.captureId, fingerprint, result: JSON.stringify(result) }).run();
    return result;
  });
}

/** Place an existing motif without cloning it or changing its musical content. */
export function placeMotif(db: SyncDb, motifId: string, rawDestination: unknown) {
  const destination = destinationSchema.parse(rawDestination);
  if (destination.kind === 'inbox') throw new HttpError(400, 'Choose a composition destination.');
  return db.transaction((tx) => {
    const motif = tx.select().from(motifs).where(eq(motifs.id, motifId)).get();
    if (!motif) throw new HttpError(404, 'Motif not found.');
    const composition = destination.kind === 'new'
      ? createCompositionFromCapture(tx, { motif } as unknown as QuickCaptureInput, destination.title)
      : tx.select().from(compositions).where(eq(compositions.id, destination.compositionId)).get();
    if (!composition) throw new HttpError(404, 'Composition not found.');
    const section = destination.sectionName?.trim() || 'Unsectioned';
    const existing = tx.select().from(compositionMotifs).where(and(eq(compositionMotifs.compositionId, composition.id), eq(compositionMotifs.motifId, motifId))).all();
    if (!existing.some((link) => (link.sectionName?.trim() || 'Unsectioned') === section)) linkCapture(tx, composition, motifId, motif.setupId, section);
    return composition;
  });
}
