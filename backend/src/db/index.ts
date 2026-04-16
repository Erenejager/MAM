import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { resolve } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';

function getDbPath(): string {
  const envPath = process.env.DATABASE_PATH;
  if (envPath) {
    return envPath.replace(/^~/, homedir());
  }
  const defaultDir = resolve(homedir(), '.mam');
  if (!existsSync(defaultDir)) {
    mkdirSync(defaultDir, { recursive: true });
  }
  return resolve(defaultDir, 'mam.db');
}

const dbPath = getDbPath();
const dir = resolve(dbPath, '..');
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const sqlite: DatabaseType = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Ensure tags_lookup exists (may not be in migrations for existing installs)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS tags_lookup (
    asset_id TEXT NOT NULL,
    tag TEXT NOT NULL COLLATE NOCASE
  )
`);

export const db = drizzle(sqlite, { schema });
export { sqlite };

export function rebuildTagsLookup(): void {
  sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM tags_lookup').run();
    sqlite.prepare(`
      INSERT INTO tags_lookup (asset_id, tag)
      SELECT id, value
      FROM assets, json_each(assets.tags)
      WHERE assets.tags IS NOT NULL AND assets.tags != '[]'
    `).run();
  })();
}
