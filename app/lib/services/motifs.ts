import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { instruments, motifPositions, motifs, positions, setups, tunings } from '../../db/schema';
import { HttpError } from '../api/http';
import {
  assertInstrumentTuningCompatible,
  assertTabMatchesStringCount,
  tabDataSchema,
  tagsSchema,
} from '../validation/schemas';
import { generateNextHumanId } from './human-ids';
import type { SyncDb } from './setups';

export const MOTIF_FUNCTIONS = ['intro', 'transition', 'ostinato', 'ending', 'texture', 'riff', 'other'] as const;

export const motifInputSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  humanId: z.string().trim().regex(/^M-\d{3,}$/, 'Motif ID must look like M-###').optional(),
  name: z.string().trim().max(300).optional(),
  setupId: z.string().min(1).nullable().optional(),
  tuningId: z.string().min(1).nullable().optional(),
  instrumentId: z.string().min(1).nullable().optional(),
  function: z.enum(MOTIF_FUNCTIONS).default('riff'),
  tabData: tabDataSchema.default([]),
  variations: z.array(z.object({ name: z.string().max(200).optional(), tabData: tabDataSchema })).nullable().optional(),
  tags: tagsSchema.nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  positionIds: z.array(z.string().min(1)).max(200).optional(),
});
export type MotifInput = z.infer<typeof motifInputSchema>;

/** Resolves the string count that TAB must conform to, verifying every reference exists. */
function resolveMotifStringCount(db: SyncDb, input: MotifInput): number | null {
  let instCount: number | null = null;
  let tunCount: number | null = null;
  if (input.instrumentId) {
    const inst = db.select().from(instruments).where(eq(instruments.id, input.instrumentId)).get();
    if (!inst) throw new HttpError(404, 'Instrument not found.');
    instCount = inst.stringCount;
  }
  if (input.tuningId) {
    const tun = db.select().from(tunings).where(eq(tunings.id, input.tuningId)).get();
    if (!tun) throw new HttpError(404, 'Tuning not found.');
    tunCount = tun.stringCount;
  }
  if (input.setupId) {
    const s = db.select().from(setups).where(eq(setups.id, input.setupId)).get();
    if (!s) throw new HttpError(404, 'Setup not found.');
    if (input.instrumentId && s.instrumentId && s.instrumentId !== input.instrumentId) {
      throw new HttpError(400, 'Setup belongs to a different instrument.');
    }
    if (input.tuningId && s.tuningId && s.tuningId !== input.tuningId) {
      throw new HttpError(400, 'Setup uses a different tuning.');
    }
  }
  if (instCount !== null && tunCount !== null) assertInstrumentTuningCompatible(instCount, tunCount);
  return instCount ?? tunCount;
}

/** Validates and inserts a motif (and its position links). Call inside a transaction. */
export function insertMotif(db: SyncDb, rawInput: unknown) {
  const input = motifInputSchema.parse(rawInput);
  const stringCount = resolveMotifStringCount(db, input);
  if (stringCount !== null) {
    assertTabMatchesStringCount(input.tabData, stringCount);
    for (const v of input.variations ?? []) assertTabMatchesStringCount(v.tabData, stringCount);
  }
  for (const posId of input.positionIds ?? []) {
    if (!db.select({ id: positions.id }).from(positions).where(eq(positions.id, posId)).get()) {
      throw new HttpError(404, `Position ${posId} not found.`);
    }
  }

  const existingIds = db.select({ humanId: motifs.humanId }).from(motifs).all().map((m) => m.humanId);
  const now = Date.now();
  const record = {
    id: input.id || uuidv4(),
    humanId: input.humanId || generateNextHumanId(existingIds, 'M'),
    name: input.name?.trim() || 'Untitled Motif',
    setupId: input.setupId ?? null,
    tuningId: input.tuningId ?? null,
    instrumentId: input.instrumentId ?? null,
    function: input.function,
    tabData: JSON.stringify(input.tabData),
    variations: input.variations && input.variations.length > 0 ? JSON.stringify(input.variations) : null,
    tags: input.tags && input.tags.length > 0 ? JSON.stringify(input.tags) : null,
    notes: input.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(motifs).values(record).run();
  for (const posId of input.positionIds ?? []) {
    db.insert(motifPositions).values({ id: uuidv4(), motifId: record.id, positionId: posId }).run();
  }
  return record;
}
