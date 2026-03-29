import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';

// Mock the db module before importing routes
vi.mock('../db/index.js', () => {
  // Create in-memory SQLite with full schema
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      original_filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      file_size INTEGER,
      status TEXT DEFAULT 'ingesting',
      file_hash TEXT UNIQUE,
      duration_seconds REAL,
      width INTEGER,
      height INTEGER,
      codec TEXT,
      bitrate INTEGER,
      frame_rate REAL,
      metadata_status TEXT DEFAULT 'pending',
      thumbnail_path TEXT,
      thumbnail_status TEXT DEFAULT 'pending',
      transcript_path TEXT,
      transcript_text TEXT,
      transcription_status TEXT DEFAULT 'pending',
      transcription_error TEXT,
      search_index_status TEXT DEFAULT 'pending',
      title TEXT,
      description TEXT,
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS custom_fields (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      field_type TEXT DEFAULT 'text',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS asset_custom_values (
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      field_id TEXT NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
      value TEXT,
      PRIMARY KEY (asset_id, field_id)
    );
  `);

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
});

// Mock fs/promises.rm for deleteFile tests
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rm: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock pipeline dependencies so they don't run
vi.mock('../lib/queue.js', () => ({
  pipelineQueue: { add: vi.fn() },
}));

vi.mock('../lib/pipeline.js', () => ({
  runPipeline: vi.fn(),
}));

vi.mock('../lib/hash.js', () => ({
  saveAndHash: vi.fn().mockResolvedValue({ hash: 'abc123', size: 1000 }),
}));

import { assetRoutes } from '../routes/assets.js';
import { db } from '../db/index.js';
import { assets } from '../db/schema.js';
import { rm } from 'node:fs/promises';

// Helper to insert a test asset row
function seedAsset(overrides: Partial<{
  id: string;
  originalFilename: string;
  filepath: string;
  tags: string;
  createdAt: string;
  transcriptionStatus: string;
  status: string;
}> = {}) {
  const defaults = {
    id: `test-${Math.random().toString(36).slice(2)}`,
    originalFilename: 'test.mp4',
    filepath: 'test-uuid/original.mp4',
    tags: '[]',
    createdAt: '2026-03-01T00:00:00Z',
    transcriptionStatus: 'pending',
    status: 'ready',
  };
  const merged = { ...defaults, ...overrides };

  db.insert(assets).values({
    id: merged.id,
    originalFilename: merged.originalFilename,
    filepath: merged.filepath,
    tags: merged.tags,
    createdAt: merged.createdAt,
    transcriptionStatus: merged.transcriptionStatus as string,
    status: merged.status,
  }).run();

  return merged;
}

// Clear assets table before each test
beforeEach(() => {
  db.delete(assets).run();
  vi.clearAllMocks();
});

describe('GET /api/assets', () => {
  it('returns 200 with all assets ordered by createdAt DESC', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    seedAsset({ id: 'asset-a', createdAt: '2026-03-01T00:00:00Z' });
    seedAsset({ id: 'asset-b', createdAt: '2026-03-02T00:00:00Z' });
    seedAsset({ id: 'asset-c', createdAt: '2026-03-03T00:00:00Z' });

    const res = await app.inject({ method: 'GET', url: '/api/assets' });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ id: string }[]>();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
    // Ordered DESC: asset-c, asset-b, asset-a
    expect(body[0].id).toBe('asset-c');
    expect(body[1].id).toBe('asset-b');
    expect(body[2].id).toBe('asset-a');

    await app.close();
  });

  it('returns empty array when no assets exist', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/assets' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);

    await app.close();
  });

  it('filters by single tag using ?tags=interview', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    seedAsset({ id: 'asset-a', tags: '["interview","raw"]' });
    seedAsset({ id: 'asset-b', tags: '["interview"]' });
    seedAsset({ id: 'asset-c', tags: '["broll"]' });

    const res = await app.inject({ method: 'GET', url: '/api/assets?tags=interview' });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ id: string }[]>();
    const ids = body.map((a) => a.id);
    expect(ids).toContain('asset-a');
    expect(ids).toContain('asset-b');
    expect(ids).not.toContain('asset-c');

    await app.close();
  });

  it('filters by multiple tags (AND logic) using ?tags=interview&tags=raw', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    seedAsset({ id: 'asset-a', tags: '["interview","raw"]' });
    seedAsset({ id: 'asset-b', tags: '["interview"]' });
    seedAsset({ id: 'asset-c', tags: '["broll"]' });

    const res = await app.inject({ method: 'GET', url: '/api/assets?tags=interview&tags=raw' });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ id: string }[]>();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('asset-a');

    await app.close();
  });

  it('every asset response includes transcriptionStatus field', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    seedAsset({ id: 'asset-a', transcriptionStatus: 'ready' });
    seedAsset({ id: 'asset-b', transcriptionStatus: 'pending' });
    seedAsset({ id: 'asset-c', transcriptionStatus: 'processing' });

    const res = await app.inject({ method: 'GET', url: '/api/assets' });
    const body = res.json<{ transcriptionStatus: string }[]>();

    for (const asset of body) {
      expect(asset).toHaveProperty('transcriptionStatus');
    }

    await app.close();
  });
});

describe('GET /api/tags', () => {
  it('returns 200 with [{tag, count}] array ordered alphabetically', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    seedAsset({ tags: '["interview","raw"]' });
    seedAsset({ tags: '["interview"]' });
    seedAsset({ tags: '["broll"]' });

    const res = await app.inject({ method: 'GET', url: '/api/tags' });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ tag: string; count: number }[]>();
    expect(Array.isArray(body)).toBe(true);
    // Alphabetical: broll, interview, raw
    expect(body).toHaveLength(3);
    expect(body[0]).toMatchObject({ tag: 'broll', count: 1 });
    expect(body[1]).toMatchObject({ tag: 'interview', count: 2 });
    expect(body[2]).toMatchObject({ tag: 'raw', count: 1 });

    await app.close();
  });

  it('returns empty array when no assets have tags', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    seedAsset({ tags: '[]' });

    const res = await app.inject({ method: 'GET', url: '/api/tags' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);

    await app.close();
  });
});

describe('DELETE /api/assets/:id', () => {
  it('returns 204 and removes the DB record', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    const asset = seedAsset({ id: 'del-asset' });

    const res = await app.inject({ method: 'DELETE', url: `/api/assets/${asset.id}` });
    expect(res.statusCode).toBe(204);

    // Verify DB record is gone
    const remaining = db.select().from(assets).all();
    expect(remaining).toHaveLength(0);

    await app.close();
  });

  it('returns 404 for non-existent asset', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    const res = await app.inject({ method: 'DELETE', url: '/api/assets/nonexistent-id' });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('also removes the asset directory when deleteFile=true', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    process.env.STORAGE_ROOT = '/test/storage';
    const asset = seedAsset({ id: 'del-file-asset' });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/assets/${asset.id}?deleteFile=true`,
    });
    expect(res.statusCode).toBe(204);

    // Verify rm was called with correct path
    expect(rm).toHaveBeenCalledWith(
      '/test/storage/del-file-asset',
      { recursive: true, force: true }
    );

    delete process.env.STORAGE_ROOT;
    await app.close();
  });
});

describe('PATCH /api/assets/:id', () => {
  it('updates tags and returns the updated asset', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    const asset = seedAsset({ id: 'patch-asset', tags: '["old-tag"]' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/assets/${asset.id}`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: ['new-tag', 'another-tag'] }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ tags: string; id: string }>();
    expect(body.id).toBe(asset.id);
    // tags should be updated
    const parsedTags = JSON.parse(body.tags);
    expect(parsedTags).toEqual(['new-tag', 'another-tag']);

    await app.close();
  });

  it('returns 404 for non-existent asset', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/assets/nonexistent-id',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: ['tag1'] }),
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('updates title and returns the updated asset', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    const asset = seedAsset({ id: 'patch-title' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/assets/${asset.id}`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New Title' }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ title: string }>();
    expect(body.title).toBe('New Title');

    await app.close();
  });

  it('updates description and returns the updated asset', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    const asset = seedAsset({ id: 'patch-desc' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/assets/${asset.id}`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'New desc' }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ description: string }>();
    expect(body.description).toBe('New desc');

    await app.close();
  });

  it('updates title, description, and tags together', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    const asset = seedAsset({ id: 'patch-all' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/assets/${asset.id}`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'T', description: 'D', tags: ['a'] }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ title: string; description: string; tags: string }>();
    expect(body.title).toBe('T');
    expect(body.description).toBe('D');
    expect(JSON.parse(body.tags)).toEqual(['a']);

    await app.close();
  });

  it('returns 200 with unchanged asset when no recognized fields sent', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(assetRoutes);

    const asset = seedAsset({ id: 'patch-noop', tags: '["existing"]' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/assets/${asset.id}`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; tags: string }>();
    expect(body.id).toBe('patch-noop');
    expect(JSON.parse(body.tags)).toEqual(['existing']);

    await app.close();
  });
});
