import { describe, it, expect } from 'vitest';
import { calculateStringLabTensions, rankCandidatesForTargetTension, CatalogProduct } from './string-lab';

describe('String Lab Physics & Recommendation Engine', () => {
  const sampleCatalog: CatalogProduct[] = [
    {
      id: 'p1',
      manufacturer: "D'Addario",
      productFamily: 'Phosphor Bronze',
      nominalGauge: 0.053,
      gaugeUnit: 'in',
      material: 'phosphor_bronze',
      windingConstruction: 'roundwound',
      unitWeight: 0.0004117,
    },
    {
      id: 'p2',
      manufacturer: "D'Addario",
      productFamily: 'Phosphor Bronze',
      nominalGauge: 0.056,
      gaugeUnit: 'in',
      material: 'phosphor_bronze',
      windingConstruction: 'roundwound',
      unitWeight: 0.0004618,
    },
    {
      id: 'p3',
      manufacturer: 'Mystery Brand',
      productFamily: 'Unknown Vintage',
      nominalGauge: 0.054,
      gaugeUnit: 'in',
      material: 'unknown',
      windingConstruction: 'roundwound',
      unitWeight: null, // Missing unit weight
    },
  ];

  it('calculates full set tensions accurately when data is complete', () => {
    const calculation = calculateStringLabTensions([
      {
        stringIndex: 0,
        openPitch: 'E2',
        capoFret: null,
        scaleLength: 25.5,
        unitWeight: 0.0004117,
        gauge: 0.053,
      },
      {
        stringIndex: 1,
        openPitch: 'A2',
        capoFret: null,
        scaleLength: 25.5,
        unitWeight: 0.0002581,
        gauge: 0.042,
      },
    ]);

    expect(calculation.hasIncompleteData).toBe(false);
    expect(calculation.totalTensionLbs).toBeGreaterThan(30);
    expect(calculation.strings[0].tension.tensionLbs).toBeGreaterThan(18);
  });

  it('flags missing unit weight honestly and does not fabricate total tension', () => {
    const calculation = calculateStringLabTensions([
      {
        stringIndex: 0,
        openPitch: 'E2',
        capoFret: null,
        scaleLength: 25.5,
        unitWeight: null, // missing!
        gauge: 0.053,
      },
    ]);

    expect(calculation.hasIncompleteData).toBe(true);
    expect(calculation.totalTensionLbs).toBeNull();
    expect(calculation.strings[0].tension.status).toBe('missing_unit_weight');
    expect(calculation.notes[0]).toContain('Unit weight unavailable');
  });

  it('ranks candidate strings by distance from target tension', () => {
    // For E2 on 25.5" scale, target 19 lbs
    const ranked = rankCandidatesForTargetTension('E2', 25.5, 19.0, sampleCatalog);

    expect(ranked.length).toBe(3);
    // p1 (0.053 gives ~18.8 lbs, diff ~ -0.2) should rank before p2 (~21 lbs, diff ~ +2)
    expect(ranked[0].product.id).toBe('p1');
    expect(ranked[0].status).toBe('valid');
    expect(ranked[1].product.id).toBe('p2');
    // p3 with null unit weight should be last and marked missing_unit_weight
    expect(ranked[2].product.id).toBe('p3');
    expect(ranked[2].status).toBe('missing_unit_weight');
  });
});
