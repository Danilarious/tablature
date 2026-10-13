import { calculateStringTension, calculateSoundingPitch, parsePitch, TensionResult } from './pitch';

export interface StringLabStringInput {
  stringIndex: number;
  openPitch: string;
  capoFret: number | null;
  scaleLength: number | null; // inches
  stringProductId?: string | null;
  gauge?: number | null;
  unitWeight?: number | null; // lbs/inch
  targetTensionLbs?: number | null;
}

export interface StringLabStringResult {
  stringIndex: number;
  openPitch: string;
  capoFret: number | null;
  soundingPitch: string;
  scaleLength: number | null;
  gauge: number | null;
  unitWeight: number | null;
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

  for (const input of inputs) {
    const soundingPitch = calculateSoundingPitch(input.openPitch, input.capoFret, 0);
    const tensionResult = calculateStringTension(soundingPitch, input.scaleLength, input.unitWeight);

    let diff: number | null = null;
    if (tensionResult.tensionLbs !== null && input.targetTensionLbs) {
      diff = Math.round((tensionResult.tensionLbs - input.targetTensionLbs) * 100) / 100;
    }

    if (tensionResult.status !== 'valid' || tensionResult.tensionLbs === null) {
      hasIncomplete = true;
      if (tensionResult.status === 'missing_unit_weight') {
        notes.push(`String ${input.stringIndex + 1} (${soundingPitch}): Unit weight unavailable. Tension cannot be calculated.`);
      } else if (tensionResult.status === 'invalid_length') {
        notes.push(`String ${input.stringIndex + 1}: Scale length missing.`);
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
  status: 'valid' | 'missing_unit_weight' | 'invalid_length';
}

/**
 * Searches and ranks string products by proximity to target tension.
 * Products without unit weight are labeled honestly.
 */
export function rankCandidatesForTargetTension(
  soundingPitch: string,
  scaleLength: number | null,
  targetTensionLbs: number,
  catalog: CatalogProduct[]
): CandidateRecommendation[] {
  const candidates: CandidateRecommendation[] = [];

  for (const prod of catalog) {
    const tension = calculateStringTension(soundingPitch, scaleLength, prod.unitWeight);
    let diff: number | null = null;
    if (tension.tensionLbs !== null) {
      diff = Math.round((tension.tensionLbs - targetTensionLbs) * 100) / 100;
    }

    candidates.push({
      product: prod,
      predictedTensionLbs: tension.tensionLbs,
      targetTensionDiff: diff,
      status: tension.status as any,
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
