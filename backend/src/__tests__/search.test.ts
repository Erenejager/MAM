import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';

// Mock opensearchClient before importing routes
vi.mock('../bootstrap/opensearch.js', () => ({
  opensearchClient: {
    search: vi.fn(),
  },
}));

// Mock fs/promises for transcript.json reads
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import { buildSearchQuery, resolveTranscriptTimestamp } from '../lib/search.js';
import { searchRoutes } from '../routes/search.js';
import { opensearchClient } from '../bootstrap/opensearch.js';
import { readFile } from 'fs/promises';

const mockedSearch = vi.mocked(opensearchClient.search);
const mockedReadFile = vi.mocked(readFile);

describe('buildSearchQuery', () => {
  it('returns null for empty string', () => {
    expect(buildSearchQuery('', [])).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(buildSearchQuery('   ', [])).toBeNull();
  });

  it('returns correct bool query structure for query with no tags', () => {
    const result = buildSearchQuery('budget', []);
    expect(result).not.toBeNull();
    const body = result as Record<string, any>;
    expect(body.query.bool.must[0].multi_match).toEqual({
      query: 'budget',
      fields: ['title^3', 'description^2', 'transcript'],
      type: 'best_fields',
      fuzziness: 'AUTO',
    });
    expect(body.query.bool.filter).toEqual([]);
    expect(body.highlight.fields).toHaveProperty('title');
    expect(body.highlight.fields).toHaveProperty('description');
    expect(body.highlight.fields).toHaveProperty('transcript');
    expect(body.highlight.fields.transcript.fragment_size).toBe(120);
  });

  it('returns correct filter with individual term clauses for multiple tags (AND logic)', () => {
    const result = buildSearchQuery('budget', ['interview', 'finance']);
    const body = result as Record<string, any>;
    expect(body.query.bool.filter).toEqual([
      { term: { tags: 'interview' } },
      { term: { tags: 'finance' } },
    ]);
  });
});

describe('resolveTranscriptTimestamp', () => {
  it('strips em tags and finds matching segment', () => {
    const segments = [
      { start: 0, end: 5, text: 'Hello world' },
      { start: 10, end: 15, text: 'The budget for this project is large' },
      { start: 20, end: 25, text: 'Thank you' },
    ];
    const highlight = 'The <em>budget</em> for this project';
    expect(resolveTranscriptTimestamp(segments, highlight)).toBe(10);
  });

  it('returns 0 for empty segments array', () => {
    expect(resolveTranscriptTimestamp([], 'some text')).toBe(0);
  });

  it('uses word overlap when exact match fails', () => {
    const segments = [
      { start: 0, end: 5, text: 'Hello world everyone' },
      { start: 10, end: 15, text: 'The budget report is ready for review' },
      { start: 20, end: 25, text: 'Goodbye all' },
    ];
    // Fragment that partially overlaps but isn't an exact substring
    const highlight = '<em>budget</em> report ready';
    expect(resolveTranscriptTimestamp(segments, highlight)).toBe(10);
  });
});

describe('GET /api/search route', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    // Set STORAGE_ROOT for transcript resolution
    process.env.STORAGE_ROOT = '/tmp/mam-test-storage';
    app = Fastify();
    await app.register(searchRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns empty results for empty query', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ results: [] });
  });

  it('returns structured results from mocked OpenSearch response', async () => {
    mockedSearch.mockResolvedValueOnce({
      body: {
        hits: {
          hits: [
            {
              _id: 'abc-123',
              _score: 5.2,
              highlight: {
                title: ['<em>Test</em> Video'],
                description: ['A <em>test</em> description'],
              },
            },
          ],
        },
      },
    } as any);

    const res = await app.inject({ method: 'GET', url: '/api/search?q=test' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].id).toBe('abc-123');
    expect(body.results[0].score).toBe(5.2);
    expect(body.results[0].highlights.title).toEqual(['<em>Test</em> Video']);
  });

  it('resolves transcript timestamps from segment data', async () => {
    const transcriptData = {
      segments: [
        { start: 0, end: 5, text: 'Hello world' },
        { start: 10, end: 15, text: 'The budget for this project' },
      ],
    };

    mockedSearch.mockResolvedValueOnce({
      body: {
        hits: {
          hits: [
            {
              _id: 'def-456',
              _score: 3.1,
              highlight: {
                transcript: ['The <em>budget</em> for this project', 'another <em>budget</em> mention'],
              },
            },
          ],
        },
      },
    } as any);

    mockedReadFile.mockResolvedValueOnce(JSON.stringify(transcriptData) as any);

    const res = await app.inject({ method: 'GET', url: '/api/search?q=budget' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results[0].transcriptMatch).toEqual({
      text: 'The <em>budget</em> for this project',
      timestamp: 10,
      matchCount: 2,
    });
  });

  it('returns 503 when OpenSearch is unreachable', async () => {
    mockedSearch.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:9200'));

    const res = await app.inject({ method: 'GET', url: '/api/search?q=test' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'search_unavailable' });
  });
});
