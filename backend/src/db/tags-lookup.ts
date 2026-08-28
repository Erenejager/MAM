import type { Database as DatabaseType } from 'better-sqlite3';

/**
 * Denormalized tag index backing GET /api/tags. Not part of the Drizzle
 * migrations, so it is created on demand for existing installs.
 */
export function ensureTagsLookup(sqlite: DatabaseType): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tags_lookup (
      asset_id TEXT NOT NULL,
      tag TEXT NOT NULL COLLATE NOCASE
    )
  `);
}

/**
 * Rebuild tags_lookup from assets.tags.
 *
 * Columns are table-qualified because json_each() also exposes an `id`
 * column, which makes a bare `id` ambiguous and fails at prepare time.
 */
export function rebuildTagsLookupOn(sqlite: DatabaseType): void {
  sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM tags_lookup').run();
    sqlite.prepare(`
      INSERT INTO tags_lookup (asset_id, tag)
      SELECT assets.id, json_each.value
      FROM assets, json_each(assets.tags)
      WHERE assets.tags IS NOT NULL AND assets.tags != '[]'
    `).run();
  })();
}
