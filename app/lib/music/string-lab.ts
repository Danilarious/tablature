import {
  calculateStringTension,
  calculateSoundingPitch,
  calculateEffectiveVibratingLength,
  TensionResult,
} from './pitch';

export interface StringLabStringInput {
  stringIndex: number;
  /** Open (un-capoed) pitch the string is physically tuned to. */
  openPitch: string;
  capoFret: number | null;
  /** Full physical speaking length in inches (per-string override already applied). */
  scaleLength: number | null;
  stringProductId?: string | null;
  gauge?: number | null;
  unitWeight?: number | null; // lbs/inch
  targetTensionLbs?: number | null;
}

export interface StringLabStringResult {
  stringIndex: number;
  openPitch: string;
  capoFret: number | null;
  /** Pitch heard with the capo applied (notation/display only). */
  soundingPitch: string;
  /** Full physical speaking length used for tension. */
  scaleLength: number | null;
  /** Capo-to-saddle length (display only). Equals scaleLength when no capo. */
  effectiveVibratingLength: number | null;
  gauge: number | null;
  unitWeight: number | null;
  /** Physical tension: open pitch at full scale length. Unaffected by capo. */
  tension: TensionResult;
  targetTensionDiff: number | null; // tension - target
}

export interface StringLabCalculation {
  strings: StringLabStringResult[];
  totalTensionLbs: number | null;
  hasIncompleteData: boolean;
  notes: string[];
}

export function calculateStringLabTensions(inputs: StringLabStringInput[]): StringLabCalculation {
  const strings: StringLabStringResult[] = [];
  let runningTotal = 0;
  let hasIncomplete = false;
  const notes: string[] = [];
  const stringCount = inputs.length;

  for (const input of inputs) {
    const soundingPitch = calculateSoundingPitch(input.openPitch, input.capoFret, 0);
    // Physical tension: OPEN pitch at FULL physical length. A capo does not retune the string.
    const tensionResult = calculateStringTension(input.openPitch, input.scaleLength, input.unitWeight);
    const label = `String ${stringCount - input.stringIndex}`;

    let diff: number | null = null;
    if (tensionResult.tensionLbs !== null && input.targetTensionLbs) {
      diff = Math.round((tensionResult.tensionLbs - input.targetTensionLbs) * 100) / 100;
    }

    if (tensionResult.status !== 'valid' || tensionResult.tensionLbs === null) {
      hasIncomplete = true;
      if (tensionResult.status === 'missing_unit_weight') {
        notes.push(`${label} (${input.openPitch}): Unit weight unavailable. Tension cannot be calculated.`);
      } else if (tensionResult.status === 'invalid_length') {
        notes.push(`${label}: Scale length missing.`);
      } else if (tensionResult.status === 'invalid_pitch') {
        notes.push(`${label}: Invalid pitch "${input.openPitch}".`);
      }
    } else {
      runningTotal += tensionResult.tensionLbs;
    }

    strings.push({
      stringIndex: input.stringIndex,
      openPitch: input.openPitch,
      capoFret: input.capoFret,
      soundingPitch,
      scaleLength: input.scaleLength,
      effectiveVibratingLength: calculateEffectiveVibratingLength(input.scaleLength, input.capoFret),
      gauge: input.gauge ?? null,
      unitWeight: input.unitWeight ?? null,
      tension: tensionResult,
      targetTensionDiff: diff,
    });
  }

  return {
    strings,
    totalTensionLbs: hasIncomplete ? null : Math.round(runningTotal * 100) / 100,
    hasIncompleteData: hasIncomplete,
    notes,
  };
}

/** Per-string speaking length: explicit per-string override, else the default scale length. */
export function resolveSpeakingLength(
  index: number,
  defaultScaleLength: number | null | undefined,
  perStringSpeakingLengths: readonly (number | null)[] | null | undefined
): number | null {
  const override = perStringSpeakingLengths?.[index];
  if (typeof override === 'number' && override > 0) return override;
  return defaultScaleLength && defaultScaleLength > 0 ? defaultScaleLength : null;
}

export interface SetupTensionInput {
  openPitches: readonly string[];
  capoFrets: readonly (number | null)[];
  defaultScaleLength: number | null | undefined;
  perStringSpeakingLengths: readonly (number | null)[] | null | undefined;
  /** Unit weights by canonical index (null = unknown). */
  unitWeights: readonly (number | null | undefined)[];
}

export interface SetupTensionResult {
  effectivePitches: string[];
  perStringTension: (number | null)[];
  totalTension: number | null;
}

/** Shared by setup creation and Quick Capture: capo affects sounding pitch only. */
export function calculateSetupTensions(input: SetupTensionInput): SetupTensionResult {
  const calc = calculateStringLabTensions(
    input.openPitches.map((openPitch, idx) => ({
      stringIndex: idx,
      openPitch,
      capoFret: input.capoFrets[idx] ?? null,
      scaleLength: resolveSpeakingLength(idx, input.defaultScaleLength, input.perStringSpeakingLengths),
      unitWeight: input.unitWeights[idx] ?? null,
    }))
  );
  return {
    effectivePitches: calc.strings.map((s) => s.soundingPitch),
    perStringTension: calc.strings.map((s) => s.tension.tensionLbs),
    totalTension: calc.totalTensionLbs,
  };
}

export interface CatalogProduct {
  id: string;
  manufacturer: string;
  productFamily: string | null;
  nominalGauge: number;
  gaugeUnit: string;
  material: string | null;
  windingConstruction: string | null;
  unitWeight: number | null;
}

export interface CandidateRecommendation {
  product: CatalogProduct;
  predictedTensionLbs: number | null;
  targetTensionDiff: number | null;
  status: TensionResult['status'];
}

/**
 * Searches and ranks string products by proximity to target tension.
 * `openPitch` must be the OPEN (un-capoed) pitch and `scaleLength` the full physical
 * speaking length for that specific string (per-string override applied).
 * Products without unit weight are labeled honestly and ranked last.
 */
export function rankCandidatesForTargetTension(
  openPitch: string,
  scaleLength: number | null,
  targetTensionLbs: number,
  catalog: CatalogProduct[]
): CandidateRecommendation[] {
  const candidates: CandidateRecommendation[] = [];

  for (const prod of catalog) {
    const tension = calculateStringTension(openPitch, scaleLength, prod.unitWeight);
    let diff: number | null = null;
    if (tension.tensionLbs !== null) {
      diff = Math.round((tension.tensionLbs - targetTensionLbs) * 100) / 100;
    }

    candidates.push({
      product: prod,
      predictedTensionLbs: tension.tensionLbs,
      targetTensionDiff: diff,
      status: tension.status,
    });
  }

  // Rank: valid tensions sorted by absolute difference ascending, followed by missing unit weight
  return candidates.sort((a, b) => {
    if (a.targetTensionDiff !== null && b.targetTensionDiff !== null) {
      return Math.abs(a.targetTensionDiff) - Math.abs(b.targetTensionDiff);
    }
    if (a.targetTensionDiff !== null) return -1;
    if (b.targetTensionDiff !== null) return 1;
    return 0;
  });
}
