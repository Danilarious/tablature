import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { getStorageDirs } from '../lib/paths';

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqliteRaw: InstanceType<typeof Database> | null = null;

export function getDatabase() {
  if (dbInstance) {
    return { db: dbInstance, sqlite: sqliteRaw! };
  }

  const { dbPath } = getStorageDirs();
  sqliteRaw = new Database(dbPath);
  
  // Pragmas for reliability and performance
  sqliteRaw.pragma('journal_mode = WAL');
  sqliteRaw.pragma('foreign_keys = ON');

  // Auto-initialize tables if not already present
  initializeTables(sqliteRaw);

  dbInstance = drizzle(sqliteRaw, { schema });
  return { db: dbInstance, sqlite: sqliteRaw };
}

/** Current (pre-migration) schema bootstrap. Exported for in-memory tests. */
export function initializeTables(sqlite: InstanceType<typeof Database>) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS instruments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      maker TEXT,
      model TEXT,
      family TEXT NOT NULL,
      string_count INTEGER NOT NULL,
      default_scale_length REAL,
      scale_length_unit TEXT DEFAULT 'in' NOT NULL,
      per_string_speaking_lengths TEXT,
      notes TEXT,
      is_archived INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS string_products (
      id TEXT PRIMARY KEY,
      manufacturer TEXT NOT NULL,
      product_family TEXT,
      nominal_gauge REAL NOT NULL,
      gauge_unit TEXT DEFAULT 'in' NOT NULL,
      material TEXT,
      core_construction TEXT,
      winding_construction TEXT,
      unit_weight REAL,
      notes TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS string_sets (
      id TEXT PRIMARY KEY,
      instrument_id TEXT REFERENCES instruments(id),
      name TEXT NOT NULL,
      installed_date TEXT,
      string_assignments TEXT NOT NULL,
      notes TEXT,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tunings (
      id TEXT PRIMARY KEY,
      human_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      string_count INTEGER NOT NULL,
      pitches TEXT NOT NULL,
      tonal_center TEXT,
      tags TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS capo_configurations (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT NOT NULL,
      string_frets TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS setups (
      id TEXT PRIMARY KEY,
      instrument_id TEXT REFERENCES instruments(id),
      tuning_id TEXT REFERENCES tunings(id),
      string_set_id TEXT REFERENCES string_sets(id),
      capo_config_id TEXT REFERENCES capo_configurations(id),
      name TEXT,
      effective_pitches TEXT NOT NULL,
      per_string_tension TEXT,
      total_tension REAL,
      snapshot TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      human_id TEXT,
      name TEXT,
      tuning_id TEXT REFERENCES tunings(id),
      setup_id TEXT REFERENCES setups(id),
      string_count INTEGER NOT NULL,
      base_fret INTEGER DEFAULT 1 NOT NULL,
      frets TEXT NOT NULL,
      fingers TEXT,
      tags TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS motifs (
      id TEXT PRIMARY KEY,
      human_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      setup_id TEXT REFERENCES setups(id),
      tuning_id TEXT REFERENCES tunings(id),
      instrument_id TEXT REFERENCES instruments(id),
      function TEXT,
      tab_data TEXT NOT NULL,
      variations TEXT,
      tags TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compositions (
      id TEXT PRIMARY KEY,
      human_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'idea' NOT NULL,
      tonal_center TEXT,
      tempo INTEGER,
      tempo_notes TEXT,
      piece_map TEXT,
      sections TEXT,
      notes TEXT,
      lyrics TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS composition_motifs (
      id TEXT PRIMARY KEY,
      composition_id TEXT NOT NULL REFERENCES compositions(id) ON DELETE CASCADE,
      motif_id TEXT NOT NULL REFERENCES motifs(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      section_name TEXT
    );

    CREATE TABLE IF NOT EXISTS composition_positions (
      id TEXT PRIMARY KEY,
      composition_id TEXT NOT NULL REFERENCES compositions(id) ON DELETE CASCADE,
      position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0 NOT NULL
    );

    CREATE TABLE IF NOT EXISTS composition_setups (
      id TEXT PRIMARY KEY,
      composition_id TEXT NOT NULL REFERENCES compositions(id) ON DELETE CASCADE,
      setup_id TEXT NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
      instrument_role TEXT
    );

    CREATE TABLE IF NOT EXISTS motif_positions (
      id TEXT PRIMARY KEY,
      motif_id TEXT NOT NULL REFERENCES motifs(id) ON DELETE CASCADE,
      position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      parent_type TEXT NOT NULL,
      parent_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}
