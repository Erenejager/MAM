import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as schema from '../../db/schema.js';
import { ensureTagsLookup, rebuildTagsLookupOn } from '../../db/tags-lookup.js';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle');

export interface TestDb {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: DatabaseType;
  rebuildTagsLookup: () => void;
}

/**
 * In-memory stand-in for ../db/index.js.
 *
 * The schema is applied from the real Drizzle migrations rather than hand-written
 * DDL, so tests cannot drift from src/db/schema.ts when columns are added.
 */
export function createTestDb(): TestDb {
  const sqlite: DatabaseType = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });

  ensureTagsLookup(sqlite);

  return {
    db,
    sqlite,
    rebuildTagsLookup: () => rebuildTagsLookupOn(sqlite),
  };
}
