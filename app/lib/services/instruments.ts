import { eq } from 'drizzle-orm';
import { instruments } from '../../db/schema';
import { HttpError } from '../api/http';
import { CompatibilityError, instrumentUpdateSchema, parseStoredJson, storedSpeakingLengthsSchema } from '../validation/schemas';
import type { SyncDb } from './setups';

/**
 * Validated partial update of a live instrument record. Existing setups keep their
 * frozen snapshots, so historical motifs/compositions are not affected.
 */
export function updateInstrument(db: SyncDb, id: string, rawBody: unknown) {
  const body = instrumentUpdateSchema.parse(rawBody);
  return db.transaction((tx) => {
    const current = tx.select().from(instruments).where(eq(instruments.id, id)).get();
    if (!current) throw new HttpError(404, 'Instrument not found.');

    const nextStringCount = body.stringCount ?? current.stringCount;
    const nextLengths =
      body.perStringSpeakingLengths !== undefined
        ? body.perStringSpeakingLengths
        : parseStoredJson(current.perStringSpeakingLengths, storedSpeakingLengthsSchema);
    if (nextLengths && nextLengths.length !== nextStringCount) {
      throw new CompatibilityError(
        `Per-string speaking lengths have ${nextLengths.length} entries but the instrument has ${nextStringCount} strings.`,
        ['perStringSpeakingLengths']
      );
    }

    const updateData: Partial<typeof instruments.$inferInsert> = { updatedAt: Date.now() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.maker !== undefined) updateData.maker = body.maker ?? null;
    if (body.model !== undefined) updateData.model = body.model ?? null;
    if (body.family !== undefined) updateData.family = body.family;
    if (body.stringCount !== undefined) updateData.stringCount = body.stringCount;
    if (body.defaultScaleLength !== undefined) updateData.defaultScaleLength = body.defaultScaleLength ?? null;
    if (body.perStringSpeakingLengths !== undefined) {
      updateData.perStringSpeakingLengths = body.perStringSpeakingLengths ? JSON.stringify(body.perStringSpeakingLengths) : null;
    }
    if (body.notes !== undefined) updateData.notes = body.notes ?? null;
    if (body.isArchived !== undefined) updateData.isArchived = body.isArchived ? 1 : 0;

    tx.update(instruments).set(updateData).where(eq(instruments.id, id)).run();
    return tx.select().from(instruments).where(eq(instruments.id, id)).get();
  });
}
