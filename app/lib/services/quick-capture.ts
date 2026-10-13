import { z } from 'zod';
import { capoFretsSchema } from '../validation/schemas';
import { findOrCreateCapo, findOrCreateSetup, type SyncDb } from './setups';
import { insertMotif, motifInputSchema } from './motifs';

/**
 * Quick Capture creates (or reuses) a capo configuration, an immutable setup snapshot and a
 * motif in ONE SQLite transaction. Any failure rolls back the whole chain, so a failed capture
 * never leaves a partial capo/setup/motif.
 */
export const quickCaptureInputSchema = z.object({
  instrumentId: z.string().min(1).max(100),
  tuningId: z.string().min(1).max(100),
  /** Canonical per-string capo frets (index 0 = bass-side); null/0 = string not capoed. */
  capoFrets: capoFretsSchema.nullable().optional(),
  capoName: z.string().trim().max(200).nullable().optional(),
  setupName: z.string().trim().max(300).nullable().optional(),
  motif: motifInputSchema.omit({ setupId: true, tuningId: true, instrumentId: true, id: true, humanId: true }),
});
export type QuickCaptureInput = z.infer<typeof quickCaptureInputSchema>;

export interface QuickCaptureResult {
  motif: ReturnType<typeof insertMotif>;
  setupId: string;
  setupReused: boolean;
  capoConfigId: string | null;
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
    return { motif, setupId: setup.id!, setupReused: reused, capoConfigId };
  });
}
