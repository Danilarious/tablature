import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './client';
import {
  instruments,
  tunings,
  stringProducts,
  stringSets,
  capoConfigurations,
  setups,
  positions,
  motifs,
  compositions,
  compositionMotifs,
  compositionPositions,
  compositionSetups,
} from './schema';
import { eq } from 'drizzle-orm';
import { calculateSoundingPitch } from '../lib/music/pitch';

export async function seedDatabase() {
  const { db } = getDatabase();

  const existing = await db.select().from(instruments).limit(1);
  if (existing.length > 0) {
    console.log('Database already contains records. Skipping seed.');
    return;
  }

  console.log('Seeding BxB Music Notebook starter database...');
  const now = Date.now();

  // 1. Seed Instruments exactly per specification
  const seedInstruments = [
    {
      id: 'inst-scgc-1',
      name: 'Santa Cruz steel-string acoustic #1',
      maker: 'Santa Cruz Guitar Company',
      model: null,
      family: 'steel_string_acoustic',
      stringCount: 6,
      defaultScaleLength: null, // Unknown
      scaleLengthUnit: 'in',
      perStringSpeakingLengths: null,
      notes: 'Scale length unknown. Needs physical measurement.',
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inst-scgc-2',
      name: 'Santa Cruz steel-string acoustic #2',
      maker: 'Santa Cruz Guitar Company',
      model: null,
      family: 'steel_string_acoustic',
      stringCount: 6,
      defaultScaleLength: null, // Unknown
      scaleLengthUnit: 'in',
      perStringSpeakingLengths: null,
      notes: 'Scale length unknown. Needs physical measurement.',
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inst-classical-quarter',
      name: 'Quarter-size six-string classical guitar',
      maker: 'Unknown',
      model: '1/4 Size Student',
      family: 'classical',
      stringCount: 6,
      defaultScaleLength: 18.5,
      scaleLengthUnit: 'in',
      perStringSpeakingLengths: null,
      notes: '18.5-inch short scale classical.',
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inst-classical-requinto',
      name: 'Requinto six-string classical guitar',
      maker: 'Unknown',
      model: 'Requinto',
      family: 'classical',
      stringCount: 6,
      defaultScaleLength: 24.0,
      scaleLengthUnit: 'in',
      perStringSpeakingLengths: null,
      notes: '24-inch scale requinto.',
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inst-classical-full',
      name: 'Full-size six-string classical guitar',
      maker: 'Unknown',
      model: 'Concert Classical',
      family: 'classical',
      stringCount: 6,
      defaultScaleLength: 25.5,
      scaleLengthUnit: 'in',
      perStringSpeakingLengths: null,
      notes: '25.5-inch scale full size classical.',
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inst-classical-7',
      name: 'Seven-string classical guitar',
      maker: 'Unknown',
      model: '7-String Brazilian / Concert',
      family: 'classical',
      stringCount: 7,
      defaultScaleLength: null, // Unknown
      scaleLengthUnit: 'in',
      perStringSpeakingLengths: null,
      notes: 'Scale length unknown. Typically low C or low B.',
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inst-baritone-acoustic',
      name: 'Steel-string baritone acoustic guitar',
      maker: 'Unknown',
      model: 'Baritone Acoustic',
      family: 'baritone_acoustic',
      stringCount: 6,
      defaultScaleLength: 27.0,
      scaleLengthUnit: 'in',
      perStringSpeakingLengths: null,
      notes: '27-inch extended scale baritone.',
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inst-banjo-5',
      name: 'Five-string banjo',
      maker: 'Unknown',
      model: '5-String Open Back / Resonator',
      family: 'banjo',
      stringCount: 5,
      defaultScaleLength: 26.25,
      scaleLengthUnit: 'in',
      // Canonical order (index 0 = bass-side): physical 5th string is the short thumb string.
      perStringSpeakingLengths: JSON.stringify([19.75, 26.25, 26.25, 26.25, 26.25]),
      notes: 'Scale length incomplete; shorter 5th string speaking length (~19.75") pegged at 5th fret.',
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inst-dobro-resonator',
      name: 'Dobro/resonator guitar',
      maker: 'Unknown',
      model: 'Resonator',
      family: 'resonator',
      stringCount: 6,
      defaultScaleLength: 25.0,
      scaleLengthUnit: 'in',
      perStringSpeakingLengths: null,
      notes: '25-inch scale dobro / resonator.',
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inst-guild-archtop',
      name: 'Guild electric archtop',
      maker: 'Guild',
      model: 'Electric Archtop',
      family: 'electric_archtop',
      stringCount: 6,
      defaultScaleLength: 24.5,
      scaleLengthUnit: 'in',
      perStringSpeakingLengths: null,
      notes: '24.5-inch vintage short scale archtop.',
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const inst of seedInstruments) {
    await db.insert(instruments).values(inst);
  }

  // 2. Seed String Products with accurate unit weights from manufacturer specifications
  const seedProducts = [
    {
      id: 'sp-dad-pb-012',
      manufacturer: "D'Addario",
      productFamily: 'Phosphor Bronze Acoustic',
      nominalGauge: 0.012,
      gaugeUnit: 'in',
      material: 'plain_steel',
      coreConstruction: 'solid',
      windingConstruction: 'plain',
      unitWeight: 0.0000221,
      notes: "D'Addario PL012 (Standard E 1st)",
      createdAt: now,
    },
    {
      id: 'sp-dad-pb-016',
      manufacturer: "D'Addario",
      productFamily: 'Phosphor Bronze Acoustic',
      nominalGauge: 0.016,
      gaugeUnit: 'in',
      material: 'plain_steel',
      coreConstruction: 'solid',
      windingConstruction: 'plain',
      unitWeight: 0.0000394,
      notes: "D'Addario PL016 (Standard B 2nd)",
      createdAt: now,
    },
    {
      id: 'sp-dad-pb-024w',
      manufacturer: "D'Addario",
      productFamily: 'Phosphor Bronze Acoustic',
      nominalGauge: 0.024,
      gaugeUnit: 'in',
      material: 'phosphor_bronze',
      coreConstruction: 'hex_core',
      windingConstruction: 'roundwound',
      unitWeight: 0.0000858,
      notes: "D'Addario PB024 (Standard G 3rd)",
      createdAt: now,
    },
    {
      id: 'sp-dad-pb-032w',
      manufacturer: "D'Addario",
      productFamily: 'Phosphor Bronze Acoustic',
      nominalGauge: 0.032,
      gaugeUnit: 'in',
      material: 'phosphor_bronze',
      coreConstruction: 'hex_core',
      windingConstruction: 'roundwound',
      unitWeight: 0.0001540,
      notes: "D'Addario PB032 (Standard D 4th)",
      createdAt: now,
    },
    {
      id: 'sp-dad-pb-042w',
      manufacturer: "D'Addario",
      productFamily: 'Phosphor Bronze Acoustic',
      nominalGauge: 0.042,
      gaugeUnit: 'in',
      material: 'phosphor_bronze',
      coreConstruction: 'hex_core',
      windingConstruction: 'roundwound',
      unitWeight: 0.0002581,
      notes: "D'Addario PB042 (Standard A 5th)",
      createdAt: now,
    },
    {
      id: 'sp-dad-pb-053w',
      manufacturer: "D'Addario",
      productFamily: 'Phosphor Bronze Acoustic',
      nominalGauge: 0.053,
      gaugeUnit: 'in',
      material: 'phosphor_bronze',
      coreConstruction: 'hex_core',
      windingConstruction: 'roundwound',
      unitWeight: 0.0004117,
      notes: "D'Addario PB053 (Standard E 6th)",
      createdAt: now,
    },
    {
      id: 'sp-dad-pb-056w',
      manufacturer: "D'Addario",
      productFamily: 'Phosphor Bronze Acoustic',
      nominalGauge: 0.056,
      gaugeUnit: 'in',
      material: 'phosphor_bronze',
      coreConstruction: 'hex_core',
      windingConstruction: 'roundwound',
      unitWeight: 0.0004618,
      notes: "D'Addario PB056 (Medium E 6th or Drop D/C)",
      createdAt: now,
    },
    {
      id: 'sp-dad-pb-070w',
      manufacturer: "D'Addario",
      productFamily: 'Phosphor Bronze Baritone',
      nominalGauge: 0.070,
      gaugeUnit: 'in',
      material: 'phosphor_bronze',
      coreConstruction: 'hex_core',
      windingConstruction: 'roundwound',
      unitWeight: 0.0007280,
      notes: 'Acoustic Baritone Low B',
      createdAt: now,
    },
    {
      id: 'sp-dad-pb-059-7st',
      manufacturer: "D'Addario",
      productFamily: 'Phosphor Bronze 7-String',
      nominalGauge: 0.059,
      gaugeUnit: 'in',
      material: 'phosphor_bronze',
      coreConstruction: 'hex_core',
      windingConstruction: 'roundwound',
      unitWeight: 0.0005120,
      notes: '7-string acoustic Low B',
      createdAt: now,
    },
    {
      id: 'sp-generic-unmeasured',
      manufacturer: 'Unknown Luthier',
      productFamily: 'Vintage Mystery Gauge',
      nominalGauge: 0.014,
      gaugeUnit: 'in',
      material: 'plain_steel',
      coreConstruction: 'unknown',
      windingConstruction: 'plain',
      unitWeight: null, // Deliberate test case for missing unit weight!
      notes: 'Unmeasured wire gauge without known unit weight.',
      createdAt: now,
    },
  ];

  for (const prod of seedProducts) {
    await db.insert(stringProducts).values(prod);
  }

  // 3. Seed Tunings with unambiguous T-### identifiers
  const seedTunings = [
    {
      id: 'tuning-t001',
      humanId: 'T-001',
      name: 'Standard 6-String',
      stringCount: 6,
      pitches: JSON.stringify(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']),
      tonalCenter: 'E / A',
      tags: JSON.stringify(['Standard', 'Concert']),
      notes: 'Standard Spanish guitar tuning across four fourths and one major third.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tuning-t002',
      humanId: 'T-002',
      name: 'DADGAD',
      stringCount: 6,
      pitches: JSON.stringify(['D2', 'A2', 'D3', 'G3', 'A3', 'D4']),
      tonalCenter: 'D modal',
      tags: JSON.stringify(['Celtic', 'Modal', 'Open']),
      notes: 'Modal D tuning. Both E strings dropped a whole step, B string dropped to A. Sus4 character.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tuning-t003',
      humanId: 'T-003',
      name: 'Open D',
      stringCount: 6,
      pitches: JSON.stringify(['D2', 'A2', 'D3', 'F#3', 'A3', 'D4']),
      tonalCenter: 'D Major',
      tags: JSON.stringify(['Open', 'Slide', 'Acoustic']),
      notes: 'Full D major triad across open strings. Third on the 3rd string (F#3).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tuning-t004',
      humanId: 'T-004',
      name: 'Open G',
      stringCount: 6,
      pitches: JSON.stringify(['D2', 'G2', 'D3', 'G3', 'B3', 'D4']),
      tonalCenter: 'G Major',
      tags: JSON.stringify(['Open', 'Blues', 'Slide']),
      notes: 'Low D on the 6th string, full G major open chord.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tuning-t005',
      humanId: 'T-005',
      name: 'Standard 7-String',
      stringCount: 7,
      pitches: JSON.stringify(['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4']),
      tonalCenter: 'B / E',
      tags: JSON.stringify(['Extended Range', 'Standard']),
      notes: 'Standard 7-string tuning with low B1 a perfect fourth below E2.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tuning-t006',
      humanId: 'T-006',
      name: 'Baritone B Standard',
      stringCount: 6,
      pitches: JSON.stringify(['B1', 'E2', 'A2', 'D3', 'F#3', 'B3']),
      tonalCenter: 'B minor / major',
      tags: JSON.stringify(['Baritone', 'Extended Scale']),
      notes: 'Tuned a perfect fourth below standard guitar for 27-inch scale instruments.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tuning-t007',
      humanId: 'T-007',
      name: '5-String Banjo Open G',
      stringCount: 5,
      // Canonical physical order [5th, 4th, 3rd, 2nd, 1st]; reentrant high G4 stays at index 0.
      pitches: JSON.stringify(['G4', 'D3', 'G3', 'B3', 'D4']),
      tonalCenter: 'G Major',
      tags: JSON.stringify(['Banjo', 'Reentrant', 'Old-Time']),
      notes: 'Reentrant tuning with high 5th string (g4) on short thumb peg.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tuning-t008',
      humanId: 'T-008',
      name: 'Dobro Open G',
      stringCount: 6,
      pitches: JSON.stringify(['G2', 'B2', 'D3', 'G3', 'B3', 'D4']),
      tonalCenter: 'G Major',
      tags: JSON.stringify(['Resonator', 'Dobro', 'High-Bass']),
      notes: 'High-bass open G tuning traditional for square-neck resonator guitars.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const tun of seedTunings) {
    await db.insert(tunings).values(tun);
  }

  // 4. Seed Capo Configurations
  const capos = [
    {
      id: 'capo-none',
      name: 'Open (No Capo)',
      type: 'none',
      stringFrets: JSON.stringify([null, null, null, null, null, null]),
      createdAt: now,
    },
    {
      id: 'capo-full-2',
      name: 'Full Capo II',
      type: 'full',
      stringFrets: JSON.stringify([2, 2, 2, 2, 2, 2]),
      createdAt: now,
    },
    {
      id: 'capo-drop-d-2',
      name: 'Drop D Partial Capo (Strings 1-5 @ Fret 2)',
      type: 'partial',
      stringFrets: JSON.stringify([null, 2, 2, 2, 2, 2]),
      createdAt: now,
    },
  ];

  for (const c of capos) {
    await db.insert(capoConfigurations).values(c);
  }

  // 5. Seed String Set for Santa Cruz #1
  const scgcStringSet = {
    id: 'set-scgc-1-lights',
    instrumentId: 'inst-scgc-1',
    name: "D'Addario EJ16 Phosphor Bronze Light (12-53)",
    installedDate: '2026-09-15',
    stringAssignments: JSON.stringify([
      { stringIndex: 0, productId: 'sp-dad-pb-053w', gauge: 0.053, unitWeight: 0.0004117 },
      { stringIndex: 1, productId: 'sp-dad-pb-042w', gauge: 0.042, unitWeight: 0.0002581 },
      { stringIndex: 2, productId: 'sp-dad-pb-032w', gauge: 0.032, unitWeight: 0.0001540 },
      { stringIndex: 3, productId: 'sp-dad-pb-024w', gauge: 0.024, unitWeight: 0.0000858 },
      { stringIndex: 4, productId: 'sp-dad-pb-016', gauge: 0.016, unitWeight: 0.0000394 },
      { stringIndex: 5, productId: 'sp-dad-pb-012', gauge: 0.012, unitWeight: 0.0000221 },
    ]),
    notes: 'Standard light gauge setup.',
    isActive: 1,
    createdAt: now,
  };
  await db.insert(stringSets).values(scgcStringSet);

  // 6. Seed Setup for Santa Cruz #1 in DADGAD
  const dadgadEffectivePitches = ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'];
  const scgcDadgadSetup = {
    id: 'setup-scgc-dadgad',
    instrumentId: 'inst-scgc-1',
    tuningId: 'tuning-t002',
    stringSetId: 'set-scgc-1-lights',
    capoConfigId: 'capo-none',
    name: 'Santa Cruz #1 in DADGAD Open',
    effectivePitches: JSON.stringify(dadgadEffectivePitches),
    perStringTension: null,
    totalTension: null,
    snapshot: JSON.stringify({
      instrumentName: 'Santa Cruz steel-string acoustic #1',
      scaleLength: null,
      tuningName: 'DADGAD',
      tuningPitches: dadgadEffectivePitches,
      capoName: 'Open (No Capo)',
      stringSetName: "D'Addario EJ16 Phosphor Bronze Light (12-53)",
    }),
    createdAt: now,
  };
  await db.insert(setups).values(scgcDadgadSetup);

  // 7. Seed Primary Positions (P-###)
  const seedPositions = [
    {
      id: 'pos-p001',
      humanId: 'P-001',
      name: 'DADGAD Home Drone',
      tuningId: 'tuning-t002',
      setupId: 'setup-scgc-dadgad',
      stringCount: 6,
      baseFret: 1,
      frets: JSON.stringify([0, 0, 0, 2, 0, 0]), // Open strings with 2nd fret on G string
      fingers: JSON.stringify([null, null, null, '1', null, null]),
      tags: JSON.stringify(['Root Drone', 'Open Resonance', 'Modal']),
      notes: 'Primary home voicing. Ringing unisons across D and A octaves.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'pos-p002',
      humanId: 'P-002',
      name: 'DADGAD Floating Cadd9/D',
      tuningId: 'tuning-t002',
      setupId: 'setup-scgc-dadgad',
      stringCount: 6,
      baseFret: 3,
      frets: JSON.stringify([null, 3, 2, 0, 3, 0]),
      fingers: JSON.stringify([null, '2', '1', null, '3', null]),
      tags: JSON.stringify(['Subdominant', 'Floating', 'Colour']),
      notes: 'Shifting harmony over deep low D pedal.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'pos-p003',
      humanId: 'P-003',
      name: '7-String Low B Open Cluster',
      tuningId: 'tuning-t005',
      setupId: null,
      stringCount: 7,
      baseFret: 1,
      frets: JSON.stringify([0, 2, 2, 0, 0, 0, 0]),
      fingers: JSON.stringify([null, '1', '2', null, null, null, null]),
      tags: JSON.stringify(['7-String', 'Sub-Bass', 'Resonance']),
      notes: 'Exploits the visceral low B1 subterranean fundamental.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const pos of seedPositions) {
    await db.insert(positions).values(pos);
  }

  // 8. Seed Starter Motif (M-001)
  const seedMotif = {
    id: 'motif-m001',
    humanId: 'M-001',
    name: 'Canyon Descent Ostinato',
    setupId: 'setup-scgc-dadgad',
    tuningId: 'tuning-t002',
    instrumentId: 'inst-scgc-1',
    function: 'ostinato',
    tabData: JSON.stringify([
      { id: 'col-1', notes: [{ stringIndex: 0, fret: 0 }], duration: '1/4', technique: 'thumb drone' },
      { id: 'col-2', notes: [{ stringIndex: 3, fret: 2 }, { stringIndex: 4, fret: 0 }], duration: '1/8' },
      { id: 'col-3', notes: [{ stringIndex: 5, fret: 0 }], duration: '1/8' },
      { id: 'col-4', notes: [{ stringIndex: 1, fret: 0 }], duration: '1/4' },
      { id: 'col-5', notes: [{ stringIndex: 3, fret: 4 }], duration: '1/4' },
      { id: 'col-6', notes: [{ stringIndex: 4, fret: 0 }, { stringIndex: 5, fret: 0 }], duration: '1/2' },
    ]),
    variations: JSON.stringify([
      {
        name: 'Higher Inversion',
        tabData: [
          { id: 'v-1', notes: [{ stringIndex: 0, fret: 0 }, { stringIndex: 5, fret: 7 }] },
          { id: 'v-2', notes: [{ stringIndex: 4, fret: 5 }] },
        ]
      }
    ]),
    tags: JSON.stringify(['Ostinato', 'Fingerstyle', 'Acoustic']),
    notes: 'Let strings ring together freely. Emphasis on the sympathetic resonance of the 1st and 6th D strings.',
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(motifs).values(seedMotif);

  // 9. Seed Starter Composition (C-001)
  const seedComposition = {
    id: 'comp-c001',
    humanId: 'C-001',
    title: 'High Desert Canyon',
    status: 'in_progress',
    tonalCenter: 'D Modal',
    tempo: 96,
    tempoNotes: 'Rubato, contemplative pulse',
    pieceMap: 'Intro (M-001) -> Theme A -> Harmonic Shift -> Ostinato Reprise -> Fading D Drone',
    sections: JSON.stringify([
      { id: 'sec-1', name: 'Intro', notes: 'Gentle harmonics over low D drone' },
      { id: 'sec-2', name: 'Theme A', notes: 'Driving fingerpicking using Canyon Descent Motif' },
      { id: 'sec-3', name: 'Outro', notes: 'Decaying open ring' },
    ]),
    notes: 'Written on Santa Cruz steel-string #1. Explores shifting open string voicings against constant low pedal.',
    lyrics: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(compositions).values(seedComposition);

  // Join composition to motif & position & setup
  await db.insert(compositionMotifs).values({
    id: uuidv4(),
    compositionId: 'comp-c001',
    motifId: 'motif-m001',
    sortOrder: 0,
    sectionName: 'Intro',
  });

  await db.insert(compositionPositions).values({
    id: uuidv4(),
    compositionId: 'comp-c001',
    positionId: 'pos-p001',
    sortOrder: 0,
  });

  await db.insert(compositionSetups).values({
    id: uuidv4(),
    compositionId: 'comp-c001',
    setupId: 'setup-scgc-dadgad',
    instrumentRole: 'Primary Steel-String Acoustic',
  });

  console.log('Database seeded successfully with 10 instruments, tunings, positions, motif M-001, and composition C-001.');
}

// Allow direct execution
if (require.main === module || process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
