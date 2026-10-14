import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 1. Instruments
export const instruments = sqliteTable('instruments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  maker: text('maker'),
  model: text('model'),
  family: text('family').notNull(), // 'steel_string_acoustic' | 'classical' | 'electric_archtop' | 'banjo' | 'resonator' | 'baritone_acoustic' | 'other'
  stringCount: integer('string_count').notNull(),
  defaultScaleLength: real('default_scale_length'), // in inches
  scaleLengthUnit: text('scale_length_unit').default('in').notNull(),
  perStringSpeakingLengths: text('per_string_speaking_lengths'), // JSON array: number[] | null[]
  notes: text('notes'),
  isArchived: integer('is_archived').default(0).notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// 2. String Products
export const stringProducts = sqliteTable('string_products', {
  id: text('id').primaryKey(),
  manufacturer: text('manufacturer').notNull(),
  productFamily: text('product_family'),
  nominalGauge: real('nominal_gauge').notNull(), // e.g. 0.012
  gaugeUnit: text('gauge_unit').default('in').notNull(),
  material: text('material'), // phosphor_bronze, 80_20_bronze, nickel, nylon, carbon, etc.
  coreConstruction: text('core_construction'), // round_core, hex_core, solid_nylon
  windingConstruction: text('winding_construction'), // roundwound, flatwound, halfwound, plain
  unitWeight: real('unit_weight'), // lbs/inch (e.g. 0.0000221)
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  // Provenance (all nullable: unknown stays unknown; never fabricate)
  catalogId: text('catalog_id'), // manufacturer part / catalog number, e.g. "PB053"
  unitWeightSource: text('unit_weight_source'), // 'manufacturer_chart' | 'measured' | 'third_party' | 'unknown'
  sourceNote: text('source_note'),
  sourceUrl: text('source_url'),
  verifiedAt: text('verified_at'), // ISO date the unit weight was last checked against the source
});

// 3. String Sets
export const stringSets = sqliteTable('string_sets', {
  id: text('id').primaryKey(),
  instrumentId: text('instrument_id').references(() => instruments.id),
  name: text('name').notNull(),
  installedDate: text('installed_date'),
  stringAssignments: text('string_assignments').notNull(), // JSON array of assignments: { stringIndex: number, productId?: string, gauge?: number, unitWeight?: number }[]
  notes: text('notes'),
  isActive: integer('is_active').default(1).notNull(),
  createdAt: integer('created_at').notNull(),
});

// 4. Tunings
export const tunings = sqliteTable('tunings', {
  id: text('id').primaryKey(),
  humanId: text('human_id').unique().notNull(), // T-001
  name: text('name').notNull(),
  stringCount: integer('string_count').notNull(),
  pitches: text('pitches').notNull(), // JSON array: ["D2", "A2", "D3", "F#3", "A3", "D4"]
  tonalCenter: text('tonal_center'),
  tags: text('tags'), // JSON array: string[]
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// 5. Capo Configurations
export const capoConfigurations = sqliteTable('capo_configurations', {
  id: text('id').primaryKey(),
  name: text('name'),
  type: text('type').notNull(), // 'none' | 'full' | 'partial' | 'spider'
  stringFrets: text('string_frets').notNull(), // JSON array of (number | null)[]
  createdAt: integer('created_at').notNull(),
});

// 6. Setups (Snapshot context)
export const setups = sqliteTable('setups', {
  id: text('id').primaryKey(),
  instrumentId: text('instrument_id').references(() => instruments.id),
  tuningId: text('tuning_id').references(() => tunings.id),
  stringSetId: text('string_set_id').references(() => stringSets.id),
  capoConfigId: text('capo_config_id').references(() => capoConfigurations.id),
  name: text('name'),
  effectivePitches: text('effective_pitches').notNull(), // JSON array of strings
  perStringTension: text('per_string_tension'), // JSON array of numbers or nulls
  totalTension: real('total_tension'), // total lbs or null
  snapshot: text('snapshot').notNull(), // JSON snapshot of frozen state
  createdAt: integer('created_at').notNull(),
});

// 7. Positions (PRIMARY POSITIONS)
export const positions = sqliteTable('positions', {
  id: text('id').primaryKey(),
  humanId: text('human_id'), // P-001
  name: text('name'),
  tuningId: text('tuning_id').references(() => tunings.id),
  setupId: text('setup_id').references(() => setups.id),
  stringCount: integer('string_count').notNull(),
  baseFret: integer('base_fret').default(1).notNull(),
  frets: text('frets').notNull(), // JSON array of number | null | 'x' | 0
  fingers: text('fingers'), // JSON array of string | null (e.g. "1", "2", "3", "4", "T")
  tags: text('tags'), // JSON array of string[]
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// 8. Motifs
export const motifs = sqliteTable('motifs', {
  id: text('id').primaryKey(),
  humanId: text('human_id').unique().notNull(), // M-001
  name: text('name').notNull(),
  setupId: text('setup_id').references(() => setups.id),
  tuningId: text('tuning_id').references(() => tunings.id),
  instrumentId: text('instrument_id').references(() => instruments.id),
  function: text('function'), // 'intro' | 'transition' | 'ostinato' | 'ending' | 'texture' | 'riff' | 'other'
  tabData: text('tab_data').notNull(), // JSON array of TabColumn: { id: string, notes: { stringIndex: number, fret: number | string }[], duration?: string, technique?: string }[]
  variations: text('variations'), // JSON array
  tags: text('tags'), // JSON array
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// 9. Compositions
export const compositions = sqliteTable('compositions', {
  id: text('id').primaryKey(),
  humanId: text('human_id').unique().notNull(), // C-001
  title: text('title').notNull(),
  status: text('status').default('idea').notNull(), // 'idea' | 'in_progress' | 'completed' | 'archived'
  tonalCenter: text('tonal_center'),
  tempo: integer('tempo'),
  tempoNotes: text('tempo_notes'),
  pieceMap: text('piece_map'),
  sections: text('sections'), // JSON array of { id: string, name: string, notes?: string, tabData?: any[] }
  notes: text('notes'),
  lyrics: text('lyrics'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// Join tables
export const compositionMotifs = sqliteTable('composition_motifs', {
  id: text('id').primaryKey(),
  compositionId: text('composition_id').references(() => compositions.id, { onDelete: 'cascade' }).notNull(),
  motifId: text('motif_id').references(() => motifs.id, { onDelete: 'cascade' }).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  sectionName: text('section_name'),
});

export const compositionPositions = sqliteTable('composition_positions', {
  id: text('id').primaryKey(),
  compositionId: text('composition_id').references(() => compositions.id, { onDelete: 'cascade' }).notNull(),
  positionId: text('position_id').references(() => positions.id, { onDelete: 'cascade' }).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
});

export const compositionSetups = sqliteTable('composition_setups', {
  id: text('id').primaryKey(),
  compositionId: text('composition_id').references(() => compositions.id, { onDelete: 'cascade' }).notNull(),
  setupId: text('setup_id').references(() => setups.id, { onDelete: 'cascade' }).notNull(),
  instrumentRole: text('instrument_role'), // e.g. "Lead guitar", "Drone banjo", "Rhythm 7-string"
});

export const motifPositions = sqliteTable('motif_positions', {
  id: text('id').primaryKey(),
  motifId: text('motif_id').references(() => motifs.id, { onDelete: 'cascade' }).notNull(),
  positionId: text('position_id').references(() => positions.id, { onDelete: 'cascade' }).notNull(),
});

// Attachments
export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  parentType: text('parent_type').notNull(), // 'composition' | 'motif' | 'tuning' | 'instrument'
  parentId: text('parent_id').notNull(),
  displayName: text('display_name').notNull(),
  filePath: text('file_path').notNull(), // relative to storage/media
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
});

// Review flags: records a migration or validator could not safely transform automatically.
// Flagged records are preserved unchanged; the flag explains what a human should verify.
export const reviewFlags = sqliteTable('review_flags', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(), // 'tuning' | 'instrument' | 'motif' | ...
  entityId: text('entity_id').notNull(),
  flagType: text('flag_type').notNull(), // e.g. 'string_order_needs_review', 'legacy_seed_migrated'
  message: text('message').notNull(),
  details: text('details'), // JSON
  status: text('status').default('open').notNull(), // 'open' | 'resolved' | 'info'
  createdAt: integer('created_at').notNull(),
  resolvedAt: integer('resolved_at'),
});
