import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import { initializeTables } from '../db/client';

/** Fresh in-memory database with the application schema (never touches real storage). */
export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  initializeTables(sqlite);
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

export function insertInstrument(
  db: ReturnType<typeof createTestDb>['db'],
  overrides: Partial<typeof schema.instruments.$inferInsert> = {}
) {
  const row = {
    id: 'inst-test-6',
    name: 'Test Six',
    family: 'steel_string_acoustic',
    stringCount: 6,
    defaultScaleLength: 25.5,
    scaleLengthUnit: 'in',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
  db.insert(schema.instruments).values(row).run();
  return row;
}

export function insertTuning(
  db: ReturnType<typeof createTestDb>['db'],
  overrides: Partial<typeof schema.tunings.$inferInsert> = {}
) {
  const row = {
    id: 'tuning-test-std',
    humanId: 'T-900',
    name: 'Standard',
    stringCount: 6,
    pitches: JSON.stringify(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']),
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
  db.insert(schema.tunings).values(row).run();
  return row;
}
