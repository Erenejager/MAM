import type { FastifyInstance } from 'fastify';
import { sqlite } from '../db/index.js';

interface Suggestion {
  type: 'asset' | 'tag';
  id: string | null;
  text: string;
}

export async function suggestRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Querystring: { q?: string };
  }>('/api/suggest', async (request) => {
    const q = (request.query.q ?? '').trim().toLowerCase();
    if (q.length < 2) {
      return { suggestions: [] };
    }

    const pattern = `%${q}%`;

    // Asset matches: title or original_filename contain the query
    const assetRows = sqlite
      .prepare(
        `SELECT id, COALESCE(title, original_filename) AS text
         FROM assets
         WHERE status != 'error'
           AND (LOWER(title) LIKE ? OR LOWER(original_filename) LIKE ?)
         ORDER BY
           CASE WHEN LOWER(COALESCE(title, original_filename)) LIKE ? THEN 0 ELSE 1 END,
           updated_at DESC
         LIMIT 8`,
      )
      .all(pattern, pattern, q + '%') as { id: string; text: string }[];

    // Tag matches: individual tag values from JSON arrays
    const tagRows = sqlite
      .prepare(
        `SELECT DISTINCT value AS text
         FROM assets, json_each(assets.tags)
         WHERE LOWER(value) LIKE ?
         ORDER BY
           CASE WHEN LOWER(value) LIKE ? THEN 0 ELSE 1 END,
           value
         LIMIT 4`,
      )
      .all(pattern, q + '%') as { text: string }[];

    const suggestions: Suggestion[] = [
      ...assetRows.map((r) => ({ type: 'asset' as const, id: r.id, text: r.text })),
      ...tagRows.map((r) => ({ type: 'tag' as const, id: null, text: r.text })),
    ];

    // Deduplicate: if a tag text matches an asset text exactly, drop the tag
    const assetTexts = new Set(assetRows.map((r) => r.text.toLowerCase()));
    const deduped = suggestions.filter(
      (s) => s.type === 'asset' || !assetTexts.has(s.text.toLowerCase()),
    );

    return { suggestions: deduped.slice(0, 10) };
  });
}
