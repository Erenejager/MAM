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

export const db = drizzle(sqlite, { schema });
export { sqlite };
