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

// Mock fs/promises.rm
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

// Mock opensearch
vi.mock('../bootstrap/opensearch.js', () => ({
  opensearchClient: {
    index: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  initOpenSearch: vi.fn().mockResolvedValue(undefined),
}));

import { customFieldRoutes } from '../routes/custom-fields.js';
import { db, sqlite } from '../db/index.js';
import { assets, customFields, assetCustomValues } from '../db/schema.js';

// Helper to insert a test asset row
function seedAsset(overrides: Partial<{
  id: string;
  originalFilename: string;
  filepath: string;
  status: string;
}> = {}) {
  const defaults = {
    id: `test-${Math.random().toString(36).slice(2)}`,
    originalFilename: 'test.mp4',
    filepath: 'test-uuid/original.mp4',
    status: 'ready',
  };
  const merged = { ...defaults, ...overrides };

  db.insert(assets).values({
    id: merged.id,
    originalFilename: merged.originalFilename,
    filepath: merged.filepath,
    status: merged.status,
  }).run();

  return merged;
}

// Clear tables before each test
beforeEach(() => {
  db.delete(assetCustomValues).run();
  db.delete(customFields).run();
  db.delete(assets).run();
  vi.clearAllMocks();
});

describe('GET /api/custom-fields', () => {
  it('returns empty array when no fields exist', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(customFieldRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/custom-fields' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);

    await app.close();
  });

  it('returns fields ordered by name', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(customFieldRoutes);

    // Insert fields out of alphabetical order
    (sqlite as any).prepare(
      'INSERT INTO custom_fields (id, name, field_type) VALUES (?, ?, ?)'
    ).run('f-2', 'Zebra', 'text');
    (sqlite as any).prepare(
      'INSERT INTO custom_fields (id, name, field_type) VALUES (?, ?, ?)'
    ).run('f-1', 'Alpha', 'text');

    const res = await app.inject({ method: 'GET', url: '/api/custom-fields' });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ id: string; name: string; fieldType: string }[]>();
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe('Alpha');
    expect(body[1].name).toBe('Zebra');

    await app.close();
  });
});

describe('POST /api/custom-fields', () => {
  it('creates a field and returns 201', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(customFieldRoutes);

    const res = await app.inject({
      method: 'POST',
      url: '/api/custom-fields',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Director' }),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; name: string; fieldType: string }>();
    expect(body.name).toBe('Director');
    expect(body.id).toBeTruthy();
    expect(body.fieldType).toBe('text');

    await app.close();
  });

  it('returns 400 for missing or empty name', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(customFieldRoutes);

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/custom-fields',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res1.statusCode).toBe(400);

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/custom-fields',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    expect(res2.statusCode).toBe(400);

    await app.close();
  });

  it('returns 409 for duplicate name', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(customFieldRoutes);

    await app.inject({
      method: 'POST',
      url: '/api/custom-fields',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Director' }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/custom-fields',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Director' }),
    });

    expect(res.statusCode).toBe(409);

    await app.close();
  });
});

describe('DELETE /api/custom-fields/:id', () => {
  it('returns 204 and removes the field', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(customFieldRoutes);

    // Create a field first
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/custom-fields',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Director' }),
    });
    const field = createRes.json<{ id: string }>();

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/custom-fields/${field.id}`,
    });

    expect(res.statusCode).toBe(204);

    // Verify field is gone
    const listRes = await app.inject({ method: 'GET', url: '/api/custom-fields' });
    expect(listRes.json()).toEqual([]);

    await app.close();
  });

  it('cascades to asset_custom_values when field is deleted', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(customFieldRoutes);

    // Create asset, field, and value
    const asset = seedAsset({ id: 'cascade-test' });

    (sqlite as any).prepare(
      'INSERT INTO custom_fields (id, name, field_type) VALUES (?, ?, ?)'
    ).run('cf-1', 'Director', 'text');

    (sqlite as any).prepare(
      'INSERT INTO asset_custom_values (asset_id, field_id, value) VALUES (?, ?, ?)'
    ).run(asset.id, 'cf-1', 'Spielberg');

    // Verify value exists
    const beforeRows = (sqlite as any).prepare(
      'SELECT * FROM asset_custom_values WHERE field_id = ?'
    ).all('cf-1');
    expect(beforeRows).toHaveLength(1);

    // Delete the field
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/custom-fields/cf-1',
    });
    expect(res.statusCode).toBe(204);

    // Verify cascade
    const afterRows = (sqlite as any).prepare(
      'SELECT * FROM asset_custom_values WHERE field_id = ?'
    ).all('cf-1');
    expect(afterRows).toHaveLength(0);

    await app.close();
  });

  it('returns 404 for non-existent field', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(customFieldRoutes);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/custom-fields/nonexistent',
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });
});

describe('GET /api/assets/:id/custom-values', () => {
  it('returns empty array when no values set', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(customFieldRoutes);

    const asset = seedAsset({ id: 'cv-empty' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/assets/${asset.id}/custom-values`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);

    await app.close();
  });
});

describe('PUT /api/assets/:id/custom-values/:fieldId', () => {
  it('upserts a value and returns it', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(customFieldRoutes);

    const asset = seedAsset({ id: 'cv-upsert' });
    (sqlite as any).prepare(
      'INSERT INTO custom_fields (id, name, field_type) VALUES (?, ?, ?)'
    ).run('cf-dir', 'Director', 'text');

    const res = await app.inject({
      method: 'PUT',
      url: `/api/assets/${asset.id}/custom-values/cf-dir`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'Spielberg' }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ assetId: string; fieldId: string; value: string }>();
    expect(body.assetId).toBe('cv-upsert');
    expect(body.fieldId).toBe('cf-dir');
    expect(body.value).toBe('Spielberg');

    await app.close();
  });

  it('replaces the previous value on re-upsert', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(customFieldRoutes);

    const asset = seedAsset({ id: 'cv-replace' });
    (sqlite as any).prepare(
      'INSERT INTO custom_fields (id, name, field_type) VALUES (?, ?, ?)'
    ).run('cf-dir2', 'Director', 'text');

    // First upsert
    await app.inject({
      method: 'PUT',
      url: `/api/assets/${asset.id}/custom-values/cf-dir2`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'Spielberg' }),
    });

    // Second upsert
    const res = await app.inject({
      method: 'PUT',
      url: `/api/assets/${asset.id}/custom-values/cf-dir2`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'Nolan' }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ value: string }>();
    expect(body.value).toBe('Nolan');

    // Verify only one row
    const rows = (sqlite as any).prepare(
      'SELECT * FROM asset_custom_values WHERE asset_id = ? AND field_id = ?'
    ).all(asset.id, 'cf-dir2');
    expect(rows).toHaveLength(1);

    await app.close();
  });
});
