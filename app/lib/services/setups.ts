import { and, eq, isNull } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { v4 as uuidv4 } from 'uuid';
import * as schema from '../../db/schema';
import { capoConfigurations, instruments, setups, stringSets, tunings } from '../../db/schema';
import { HttpError } from '../api/http';
import { calculateSetupTensions } from '../music/string-lab';
import {
  assertCapoFretsMatch,
  assertInstrumentTuningCompatible,
  assertStringAssignmentsMatch,
  capoFretsSchema,
  parseStoredJson,
  storedPitchesSchema,
  storedSpeakingLengthsSchema,
  stringAssignmentsSchema,
} from '../validation/schemas';

/** Either the root DB or a transaction handle (both are synchronous better-sqlite3). */
// The result-kind type parameter differs between root DB and transaction handles, hence `any`.
export type SyncDb = BaseSQLiteDatabase<'sync', any, typeof schema>;

export type NewSetup = typeof setups.$inferInsert;
export type CapoType = 'none' | 'full' | 'partial' | 'spider';

export interface SetupRequest {
  id?: string;
  instrumentId: string;
  tuningId: string;
  stringSetId?: string | null;
  capoConfigId?: string | null;
  name?: string | null;
}

/** Infer capo type from per-string frets (canonical order, null = string not capoed). */
export function inferCapoType(frets: readonly (number | null)[]): CapoType {
  const active = frets.filter((f): f is number => typeof f === 'number' && f > 0);
  if (active.length === 0) return 'none';
  if (active.length === frets.length && active.every((f) => f === active[0])) return 'full';
  if (active.every((f) => f === active[0])) return 'partial';
  return 'spider';
}

/** Normalizes 0 to null (open) so identical physical configurations compare equal. */
export function normalizeCapoFrets(frets: readonly (number | null)[]): (number | null)[] {
  return frets.map((f) => (typeof f === 'number' && f > 0 ? f : null));
}

/**
 * Returns the ID of an identical existing capo configuration, or creates one.
 * Returns null for "no capo" (all strings open), which matches existing behaviour.
 */
export function findOrCreateCapo(db: SyncDb, rawFrets: readonly (number | null)[], name?: string | null): string | null {
  const frets = normalizeCapoFrets(capoFretsSchema.parse(rawFrets));
  const type = inferCapoType(frets);
  if (type === 'none') return null;
  const fretsJson = JSON.stringify(frets);
  const existing = db
    .select({ id: capoConfigurations.id })
    .from(capoConfigurations)
    .where(and(eq(capoConfigurations.stringFrets, fretsJson), eq(capoConfigurations.type, type)))
    .get();
  if (existing) return existing.id;
  const id = uuidv4();
  db.insert(capoConfigurations)
    .values({ id, name: name?.trim() || defaultCapoName(type, frets), type, stringFrets: fretsJson, createdAt: Date.now() })
    .run();
  return id;
}

function defaultCapoName(type: CapoType, frets: (number | null)[]): string {
  const n = frets.length;
  if (type === 'full') return `Full Capo Fret ${frets.find((f) => f !== null)}`;
  const desc = frets
    .map((f, i) => (f === null ? null : `S${n - i}@${f}`))
    .filter(Boolean)
    .join(' ');
  return `${type === 'spider' ? 'Spider' : 'Partial'} Capo (${desc})`;
}

/** Builds (but does not insert) an immutable setup snapshot after full validation. */
export function buildSetupRecord(db: SyncDb, req: SetupRequest): NewSetup {
  const inst = db.select().from(instruments).where(eq(instruments.id, req.instrumentId)).get();
  if (!inst) throw new HttpError(404, 'Instrument not found.');
  const tun = db.select().from(tunings).where(eq(tunings.id, req.tuningId)).get();
  if (!tun) throw new HttpError(404, 'Tuning not found.');

  const openPitches = parseStoredJson(tun.pitches, storedPitchesSchema);
  if (!openPitches) throw new HttpError(422, `Tuning ${tun.humanId} has invalid stored pitches and needs review.`);
  assertInstrumentTuningCompatible(inst.stringCount, tun.stringCount, openPitches.length);

  let stringSetRecord: typeof stringSets.$inferSelect | null = null;
  let assignments: ReturnType<typeof stringAssignmentsSchema.parse> = [];
  if (req.stringSetId) {
    stringSetRecord = db.select().from(stringSets).where(eq(stringSets.id, req.stringSetId)).get() ?? null;
    if (!stringSetRecord) throw new HttpError(404, 'String set not found.');
    const parsed = parseStoredJson(stringSetRecord.stringAssignments, stringAssignmentsSchema);
    if (!parsed) throw new HttpError(422, 'String set has invalid stored assignments and needs review.');
    assertStringAssignmentsMatch(parsed, inst.stringCount);
    assignments = parsed;
  }

  let capoRecord: typeof capoConfigurations.$inferSelect | null = null;
  let capoFrets: (number | null)[] = Array(inst.stringCount).fill(null);
  if (req.capoConfigId) {
    capoRecord = db.select().from(capoConfigurations).where(eq(capoConfigurations.id, req.capoConfigId)).get() ?? null;
    if (!capoRecord) throw new HttpError(404, 'Capo configuration not found.');
    const parsed = parseStoredJson(capoRecord.stringFrets, capoFretsSchema);
    if (!parsed) throw new HttpError(422, 'Capo configuration has invalid stored frets.');
    assertCapoFretsMatch(parsed, inst.stringCount);
    capoFrets = parsed;
  }

  const perStringSpeakingLengths = parseStoredJson(inst.perStringSpeakingLengths, storedSpeakingLengthsSchema);
  const unitWeights = Array.from({ length: inst.stringCount }, (_, i) => assignments.find((a) => a.stringIndex === i)?.unitWeight ?? null);

  const hasTensionInputs = Boolean(stringSetRecord) && (inst.defaultScaleLength || perStringSpeakingLengths);
  const tension = calculateSetupTensions({
    openPitches,
    capoFrets,
    defaultScaleLength: inst.defaultScaleLength,
    perStringSpeakingLengths,
    unitWeights,
  });

  const snapshot = {
    schemaVersion: 2,
    stringOrder: 'index0=bass-side',
    instrument: {
      id: inst.id,
      name: inst.name,
      family: inst.family,
      stringCount: inst.stringCount,
      defaultScaleLength: inst.defaultScaleLength,
      perStringSpeakingLengths,
    },
    tuning: { id: tun.id, humanId: tun.humanId, name: tun.name, pitches: openPitches },
    capo: capoRecord ? { id: capoRecord.id, name: capoRecord.name, type: capoRecord.type, stringFrets: capoFrets } : null,
    stringSet: stringSetRecord ? { id: stringSetRecord.id, name: stringSetRecord.name, assignments } : null,
    effectivePitches: tension.effectivePitches,
    tensionBasis: 'open pitch at full physical speaking length (capo does not change tension)',
  };

  return {
    id: req.id || uuidv4(),
    instrumentId: inst.id,
    tuningId: tun.id,
    stringSetId: stringSetRecord?.id ?? null,
    capoConfigId: capoRecord?.id ?? null,
    name: req.name?.trim() || `${inst.name} / ${tun.humanId} (${tun.name})${capoRecord ? ` + ${capoRecord.name ?? 'capo'}` : ''}`,
    effectivePitches: JSON.stringify(tension.effectivePitches),
    perStringTension: hasTensionInputs ? JSON.stringify(tension.perStringTension) : null,
    totalTension: hasTensionInputs ? tension.totalTension : null,
    snapshot: JSON.stringify(snapshot),
    createdAt: Date.now(),
  };
}

function snapshotCore(snapshotJson: string): string {
  try {
    const { timestamp: _ts, ...rest } = JSON.parse(snapshotJson) as Record<string, unknown>;
    return JSON.stringify(rest);
  } catch {
    return snapshotJson;
  }
}

/**
 * Reuses an existing setup only when it is physically identical (same references AND
 * identical frozen snapshot content); otherwise inserts a new immutable snapshot.
 */
export function findOrCreateSetup(db: SyncDb, req: SetupRequest): { setup: NewSetup; reused: boolean } {
  const candidate = buildSetupRecord(db, req);
  const sameRefs = db
    .select()
    .from(setups)
    .where(
      and(
        eq(setups.instrumentId, candidate.instrumentId!),
        eq(setups.tuningId, candidate.tuningId!),
        candidate.stringSetId ? eq(setups.stringSetId, candidate.stringSetId) : isNull(setups.stringSetId),
        candidate.capoConfigId ? eq(setups.capoConfigId, candidate.capoConfigId) : isNull(setups.capoConfigId)
      )
    )
    .all();
  const core = snapshotCore(candidate.snapshot);
  const match = sameRefs.find((s) => snapshotCore(s.snapshot) === core);
  if (match) return { setup: match, reused: true };
  db.insert(setups).values(candidate).run();
  return { setup: candidate, reused: false };
}
