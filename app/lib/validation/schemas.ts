import { z } from 'zod';
import { isValidPitch } from '../music/pitch';

/**
 * Centralized runtime validation for API inputs and stored JSON structures.
 * All per-string arrays follow the canonical invariant in app/lib/music/string-order.ts
 * (index 0 = physical bass-side string).
 */

export const MAX_STRINGS = 12;
export const MAX_FRET = 36;

/** Accepts a finite number or a numeric string; never yields NaN/Infinity. */
const finiteNumber = z.union([
  z.number(),
  z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, 'Must be a number')
    .transform(Number),
]).pipe(z.number().finite());

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim())
    .transform((s) => (s.length > 0 ? s : null))
    .nullable()
    .optional();

export const pitchSchema = z
  .string()
  .trim()
  .refine((p) => isValidPitch(p), (p) => ({ message: `Invalid scientific pitch "${p}" (expected e.g. E2, F#3, Bb3)` }));

export const stringCountSchema = finiteNumber.pipe(z.number().int().min(1).max(MAX_STRINGS));
export const positiveLengthSchema = finiteNumber.pipe(z.number().positive().max(100));
export const fretNumberSchema = z.number().int().min(0).max(MAX_FRET);

export const INSTRUMENT_FAMILIES = [
  'steel_string_acoustic',
  'classical',
  'electric_archtop',
  'banjo',
  'resonator',
  'baritone_acoustic',
  'other',
] as const;

export const instrumentInputSchema = z
  .object({
    id: z.string().min(1).max(100).optional(),
    name: z.string().trim().min(1, 'Name is required').max(200),
    maker: optionalText(200),
    model: optionalText(200),
    family: z.enum(INSTRUMENT_FAMILIES).default('steel_string_acoustic'),
    stringCount: stringCountSchema,
    defaultScaleLength: z.union([positiveLengthSchema, z.literal('').transform(() => null), z.null()]).optional(),
    scaleLengthUnit: z.literal('in').default('in'),
    perStringSpeakingLengths: z.array(positiveLengthSchema.nullable()).nullable().optional(),
    notes: optionalText(10_000),
  })
  .superRefine((val, ctx) => {
    if (val.perStringSpeakingLengths && val.perStringSpeakingLengths.length !== val.stringCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['perStringSpeakingLengths'],
        message: `Per-string speaking lengths must have exactly ${val.stringCount} entries (index 0 = bass-side string).`,
      });
    }
  });

/** Partial update; cross-field checks happen against the merged record in the route. */
export const instrumentUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  maker: optionalText(200),
  model: optionalText(200),
  family: z.enum(INSTRUMENT_FAMILIES).optional(),
  stringCount: stringCountSchema.optional(),
  defaultScaleLength: z.union([positiveLengthSchema, z.literal('').transform(() => null), z.null()]).optional(),
  perStringSpeakingLengths: z.array(positiveLengthSchema.nullable()).nullable().optional(),
  notes: optionalText(10_000),
  isArchived: z.boolean().optional(),
});

export const tagsSchema = z.array(z.string().trim().min(1).max(80)).max(50);

export const tuningInputSchema = z
  .object({
    id: z.string().min(1).max(100).optional(),
    humanId: z.string().trim().regex(/^T-\d{3,}$/, 'Tuning ID must look like T-###').optional(),
    name: z.string().trim().min(1, 'Name is required').max(200),
    stringCount: stringCountSchema.optional(),
    pitches: z.array(pitchSchema).min(1).max(MAX_STRINGS),
    tonalCenter: optionalText(200),
    tags: tagsSchema.nullable().optional(),
    notes: optionalText(10_000),
  })
  .superRefine((val, ctx) => {
    if (val.stringCount !== undefined && val.stringCount !== val.pitches.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pitches'],
        message: `Tuning declares ${val.stringCount} strings but has ${val.pitches.length} pitches.`,
      });
    }
  });

export const CAPO_TYPES = ['none', 'full', 'partial', 'spider'] as const;

export const capoFretsSchema = z.array(fretNumberSchema.nullable()).min(1).max(MAX_STRINGS);

export const capoInputSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  name: optionalText(200),
  type: z.enum(CAPO_TYPES).default('partial'),
  stringFrets: capoFretsSchema,
});

export const stringAssignmentSchema = z.object({
  stringIndex: z.number().int().min(0).max(MAX_STRINGS - 1),
  productId: z.string().min(1).max(100).nullable().optional(),
  gauge: finiteNumber.pipe(z.number().positive().max(1)).nullable().optional(),
  unitWeight: finiteNumber.pipe(z.number().positive().max(1)).nullable().optional(),
});
export type StringAssignment = z.infer<typeof stringAssignmentSchema>;

export const stringAssignmentsSchema = z.array(stringAssignmentSchema).max(MAX_STRINGS);

export const stringSetInputSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  instrumentId: z.string().min(1).max(100).nullable().optional(),
  name: z.string().trim().min(1, 'Name is required').max(200),
  installedDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional(),
  stringAssignments: stringAssignmentsSchema,
  notes: optionalText(10_000),
  isActive: z.boolean().optional(),
});

export const positionFretSchema = z.union([fretNumberSchema, z.literal('x'), z.null()]);

export const positionInputSchema = z
  .object({
    id: z.string().min(1).max(100).optional(),
    humanId: z.string().trim().regex(/^P-\d{3,}$/, 'Position ID must look like P-###').optional(),
    name: optionalText(200),
    tuningId: z.string().min(1).max(100).nullable().optional(),
    setupId: z.string().min(1).max(100).nullable().optional(),
    stringCount: stringCountSchema,
    baseFret: finiteNumber.pipe(z.number().int().min(1).max(MAX_FRET)).optional(),
    frets: z.array(positionFretSchema),
    fingers: z.array(z.string().trim().max(3).nullable()).nullable().optional(),
    tags: tagsSchema.nullable().optional(),
    notes: optionalText(10_000),
  })
  .superRefine((val, ctx) => {
    if (val.frets.length !== val.stringCount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['frets'], message: `Expected ${val.stringCount} fret entries.` });
    }
    if (val.fingers && val.fingers.length !== val.stringCount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fingers'], message: `Expected ${val.stringCount} finger entries.` });
    }
  });

export const TAB_TECHNIQUES = ['h', 'p', '/', '\\', 'b', 'r', '~', 'harm', 'pm', 'let ring', 'tap', 'slap'] as const;

export const tabNoteSchema = z.object({
  stringIndex: z.number().int().min(0).max(MAX_STRINGS - 1),
  /** Fret number, or 'x' for a muted/dead string. */
  fret: z.union([fretNumberSchema, z.literal('x')]),
});

export const TAB_DURATIONS = ['1', '1/2', '1/4', '1/8', '1/16', 'dotted 1/4', 'triplet 1/8'] as const;
const LEGACY_DURATION_ALIASES: Record<string, (typeof TAB_DURATIONS)[number]> = {
  whole: '1',
  half: '1/2',
  quarter: '1/4',
  eighth: '1/8',
  sixteenth: '1/16',
  'dotted-quarter': 'dotted 1/4',
  'triplet-eighth': 'triplet 1/8',
};
export const tabDurationSchema = z.preprocess(
  (value) => (typeof value === 'string' ? LEGACY_DURATION_ALIASES[value] ?? value : value),
  z.enum(TAB_DURATIONS)
);
export const TAB_BARLINES = ['single', 'double', 'final'] as const;
export const TAB_COLUMN_KINDS = ['regular', 'grace'] as const;

export const tabColumnSchema = z.object({
  rhythmVersion: z.literal(2).optional(),
  measureId: z.string().min(1).max(100).optional(),
  meter: z.string().regex(/^(?:[1-9]|1[0-6])\/(?:2|4|8|16)$/).optional(),
  autoRest: z.boolean().optional(),
  id: z.string().min(1).max(100),
  notes: z.array(tabNoteSchema).max(MAX_STRINGS),
  /** null/absent = free rhythm. */
  duration: tabDurationSchema.nullable().optional(),
  /** Technique into/out of this event, rendered with familiar TAB symbols. */
  technique: z.string().trim().max(60).nullable().optional(),
  /** Explicit rest column (no notes sound). */
  rest: z.boolean().optional(),
  /** Narrow event used for a passing/grace note. */
  kind: z.enum(TAB_COLUMN_KINDS).optional(),
  /** Optional measure/final boundary rendered after this event. */
  barlineAfter: z.enum(TAB_BARLINES).nullable().optional(),
});
export type ValidTabColumn = z.infer<typeof tabColumnSchema>;

export const tabDataSchema = z.array(tabColumnSchema).max(2000).superRefine((events, ctx) => {
  if (!events.some(e => e.rhythmVersion === 2 || e.measureId || e.meter || e.autoRest)) return;
  const seen = new Set<string>(); let previous = ''; let meter = '';
  for (const [index,event] of Array.from(events.entries())) {
    const invalid = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index], message });
    if (event.rhythmVersion !== 2 || !event.measureId || !event.meter) { invalid('Measured events require version, measure and meter.'); continue; }
    if (event.measureId !== previous) {
      if (seen.has(event.measureId)) invalid('A measure must be contiguous.');
      seen.add(event.measureId); previous = event.measureId; meter = event.meter;
    }
    if (event.meter !== meter) invalid('Events in a measure must share its meter.');
    if (event.autoRest && (!event.rest || event.notes.length || event.kind === 'grace' || event.technique)) invalid('Generated rests cannot contain explicit musical content.');
    if (event.kind !== 'grace' && !event.duration) invalid('Measured events need a duration.');
  }
});

export const timeSignatureSchema = z.union([
  z.literal('free'),
  z.string().regex(/^(?:[1-9]|1[0-6])\/(?:2|4|8|16)$/, 'Use a time signature such as 4/4, 6/8, or free.'),
]);

export const tempoSchema = z.number().int().min(20).max(400);

export const fretboardMapNoteSchema = z.object({
  stringIndex: z.number().int().min(0).max(MAX_STRINGS - 1),
  fret: fretNumberSchema,
});

export const fretboardMapSchema = z.array(fretboardMapNoteSchema).max(500).superRefine((notes, ctx) => {
  const seen = new Set<string>();
  notes.forEach((note, index) => {
    const key = `${note.stringIndex}:${note.fret}`;
    if (seen.has(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: 'Duplicate fretboard-map note.' });
    }
    seen.add(key);
  });
});

export class CompatibilityError extends Error {
  constructor(message: string, public readonly path: string[] = []) {
    super(message);
    this.name = 'CompatibilityError';
  }
}

/** Selected instrument and tuning must have matching string counts. */
export function assertInstrumentTuningCompatible(instrumentStringCount: number, tuningStringCount: number, tuningPitchCount?: number): void {
  if (tuningPitchCount !== undefined && tuningPitchCount !== tuningStringCount) {
    throw new CompatibilityError(`Tuning record is inconsistent: ${tuningStringCount} strings but ${tuningPitchCount} pitches.`, ['tuningId']);
  }
  if (instrumentStringCount !== tuningStringCount) {
    throw new CompatibilityError(
      `Incompatible tuning: instrument has ${instrumentStringCount} strings but tuning has ${tuningStringCount}.`,
      ['tuningId']
    );
  }
}

export function assertCapoFretsMatch(capoFrets: readonly (number | null)[], stringCount: number): void {
  if (capoFrets.length !== stringCount) {
    throw new CompatibilityError(`Capo configuration has ${capoFrets.length} entries but the instrument has ${stringCount} strings.`, ['stringFrets']);
  }
}

export function assertStringAssignmentsMatch(assignments: readonly StringAssignment[], stringCount: number): void {
  if (assignments.length !== stringCount) {
    throw new CompatibilityError(`String set has ${assignments.length} assignments but the instrument has ${stringCount} strings.`, ['stringAssignments']);
  }
  const seen = new Set<number>();
  for (const a of assignments) {
    if (a.stringIndex >= stringCount || seen.has(a.stringIndex)) {
      throw new CompatibilityError(`Invalid or duplicate stringIndex ${a.stringIndex} for ${stringCount} strings.`, ['stringAssignments']);
    }
    seen.add(a.stringIndex);
  }
}

export function assertFretboardMapMatchesStringCount(notes: readonly { stringIndex: number; fret: number }[], stringCount: number): void {
  for (const note of notes) {
    if (note.stringIndex >= stringCount) {
      throw new CompatibilityError(`Fretboard map references string index ${note.stringIndex} but the instrument has ${stringCount} strings.`, ['fretboardMap']);
    }
  }
}

export function assertTabMatchesStringCount(tab: readonly ValidTabColumn[], stringCount: number): void {
  for (const col of tab) {
    const seen = new Set<number>();
    for (const n of col.notes) {
      if (n.stringIndex >= stringCount) {
        throw new CompatibilityError(`TAB column ${col.id} references string index ${n.stringIndex} but the instrument has ${stringCount} strings.`, ['tabData']);
      }
      if (seen.has(n.stringIndex)) {
        throw new CompatibilityError(`TAB column ${col.id} has two notes on string index ${n.stringIndex}.`, ['tabData']);
      }
      seen.add(n.stringIndex);
    }
  }
}

/** Safely parse a stored JSON column; returns null when absent or malformed. */
export function parseStoredJson<S extends z.ZodTypeAny>(raw: string | null | undefined, schema: S): z.output<S> | null {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export const storedPitchesSchema = z.array(pitchSchema).min(1).max(MAX_STRINGS);
export const storedSpeakingLengthsSchema = z.array(z.number().positive().nullable());
