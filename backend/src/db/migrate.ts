import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './index.js';
import { config } from 'dotenv';

config();

migrate(db, { migrationsFolder: './drizzle' });
console.log('Migrations complete');
