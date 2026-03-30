import { FastifyInstance } from 'fastify';
import { resolve } from 'node:path';
import { readFile } from 'fs/promises';
import { opensearchClient } from '../bootstrap/opensearch.js';
import { buildSearchQuery, resolveTranscriptTimestamp } from '../lib/search.js';
import type { TranscriptSegment } from '../lib/search.js';

interface SearchHit {
  _id: string;
  _score: number;
  highlight?: {
    title?: string[];
    description?: string[];
    transcript?: string[];
  };
}

interface SearchResultItem {
  id: string;
  score: number;
  highlights: {
    title?: string[];
    description?: string[];
    transcript?: string[];
  };
  transcriptMatch?: {
    text: string;
    timestamp: number;
    matchCount: number;
  };
}

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Querystring: { q?: string; tags?: string | string[] };
  }>('/api/search', async (request, reply) => {
    const { q = '', tags } = request.query;
    const tagList = tags ? (Array.isArray(tags) ? tags : [tags]) : [];

    const queryBody = buildSearchQuery(q, tagList);
    if (!queryBody) {
      return { results: [] };
    }

    try {
      const response = await opensearchClient.search({
        index: 'mam-assets',
        body: queryBody,
      });

      const hits: SearchHit[] = response.body.hits.hits;
      const results: SearchResultItem[] = [];

      for (const hit of hits) {
        const result: SearchResultItem = {
          id: hit._id,
          score: hit._score,
          highlights: hit.highlight || {},
        };

        // Resolve transcript timestamps if there are transcript highlights
        if (hit.highlight?.transcript && hit.highlight.transcript.length > 0) {
          try {
            const transcriptPath = resolve(
              process.env.STORAGE_ROOT!,
              hit._id,
              'transcript.json',
            );
            const raw = await readFile(transcriptPath, 'utf-8');
            const data = JSON.parse(raw);
            const segments: TranscriptSegment[] = Array.isArray(data)
              ? data
              : data.segments || [];

            const timestamp = resolveTranscriptTimestamp(
              segments,
              hit.highlight.transcript[0],
            );

            result.transcriptMatch = {
              text: hit.highlight.transcript[0],
              timestamp,
              matchCount: hit.highlight.transcript.length,
            };
          } catch (err) {
            // transcript.json missing or unreadable — skip timestamp resolution
            request.log.warn(
              { assetId: hit._id, err },
              'Failed to resolve transcript timestamp',
            );
          }
        }

        results.push(result);
      }

      return { results };
    } catch (err) {
      const message = (err as Error).message || '';
      if (
        message.includes('ECONNREFUSED') ||
        message.includes('connect') ||
        message.includes('ConnectionError')
      ) {
        return reply.status(503).send({ error: 'search_unavailable' });
      }
      request.log.error(err, 'Search failed');
      return reply.status(500).send({ error: 'Search failed' });
    }
  });
}
