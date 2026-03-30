import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { assets } from '../db/schema.js';
import { saveAndHash } from '../lib/hash.js';
import { pipelineQueue } from '../lib/queue.js';
import { runPipeline } from '../lib/pipeline.js';
import { opensearchClient } from '../bootstrap/opensearch.js';

export async function assetRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10 GB
  });

  /**
   * POST /api/assets — accept multipart file upload
   * Streams file to STORAGE_ROOT/{uuid}/original.{ext}, computes SHA-256,
   * rejects duplicates (409), creates DB record, returns 202.
   */
  fastify.post('/api/assets', async (request, reply) => {
    const storageRoot = process.env.STORAGE_ROOT;
    if (!storageRoot) {
      return reply.status(500).send({ error: 'STORAGE_ROOT not configured' });
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const assetId = randomUUID();
    const assetDir = resolve(storageRoot, assetId);

    try {
      await mkdir(assetDir, { recursive: true });

      const ext = extname(file.filename) || '.mp4';
      const destPath = resolve(assetDir, `original${ext}`);

      const { hash: fileHash, size: fileSize } = await saveAndHash(file.file, destPath);

      // Check for duplicate
      const existing = db
        .select({ id: assets.id })
        .from(assets)
        .where(eq(assets.fileHash, fileHash))
        .get();

      if (existing) {
        await rm(assetDir, { recursive: true, force: true });
        return reply.status(409).send({
          error: 'This file has already been imported.',
          existingId: existing.id,
        });
      }

      // Insert asset record
      db.insert(assets)
        .values({
          id: assetId,
          originalFilename: file.filename,
          filepath: `${assetId}/original${ext}`,
          fileSize,
          fileHash,
          status: 'ingesting',
          title: file.filename.replace(/\.[^.]+$/, ''),
          createdAt: new Date().toISOString(),
          metadataStatus: 'pending',
          thumbnailStatus: 'pending',
          transcriptionStatus: 'pending',
          searchIndexStatus: 'pending',
        })
        .run();

      // Enqueue pipeline after reply is sent
      pipelineQueue.add(() => runPipeline(assetId));

      return reply.status(202).send({ id: assetId, status: 'ingesting' });
    } catch (err) {
      request.log.error(err, 'Upload failed');
      await rm(assetDir, { recursive: true, force: true }).catch(() => {});
      return reply.status(500).send({ error: 'Upload failed' });
    }
  });

  /**
   * GET /api/assets/:id — return full asset record
   */
  fastify.get<{ Params: { id: string } }>('/api/assets/:id', async (request, reply) => {
    const { id } = request.params;

    const asset = db
      .select()
      .from(assets)
      .where(eq(assets.id, id))
      .get();

    if (!asset) {
      return reply.status(404).send({ error: 'Asset not found' });
    }

    return asset;
  });

  /**
   * GET /api/assets — list all assets with optional tag filter
   * Query params: tags (string | string[]) — AND filter when multiple values
   */
  fastify.get<{
    Querystring: { tags?: string | string[] };
  }>('/api/assets', async (request) => {
    const { tags } = request.query;
    const tagList = tags ? (Array.isArray(tags) ? tags : [tags]) : [];

    if (tagList.length > 0) {
      return db
        .select()
        .from(assets)
        .where(
          sql`(SELECT COUNT(DISTINCT value) FROM json_each(${assets.tags}) WHERE value IN (${sql.join(tagList.map((t) => sql`${t}`), sql`, `)})) = ${tagList.length}`
        )
        .orderBy(sql`${assets.createdAt} DESC`)
        .all();
    }

    return db.select().from(assets).orderBy(sql`${assets.createdAt} DESC`).all();
  });

  /**
   * GET /api/tags — unique tags with counts, ordered alphabetically
   */
  fastify.get('/api/tags', async () => {
    const rows = db.$client
      .prepare(
        `SELECT value as tag, COUNT(*) as count
         FROM assets, json_each(assets.tags)
         GROUP BY value
         ORDER BY value`
      )
      .all() as { tag: string; count: number }[];
    return rows;
  });

  /**
   * DELETE /api/assets/:id — remove DB record and optionally disk files
   * Query params: deleteFile=true to also remove STORAGE_ROOT/{uuid}/ directory
   */
  fastify.delete<{
    Params: { id: string };
    Querystring: { deleteFile?: string };
  }>('/api/assets/:id', async (request, reply) => {
    const { id } = request.params;
    const deleteFile = request.query.deleteFile === 'true';

    const asset = db.select().from(assets).where(eq(assets.id, id)).get();
    if (!asset) {
      return reply.status(404).send({ error: 'Asset not found' });
    }

    db.delete(assets).where(eq(assets.id, id)).run();

    if (deleteFile) {
      const storageRoot = process.env.STORAGE_ROOT!;
      const assetDir = resolve(storageRoot, id);
      await rm(assetDir, { recursive: true, force: true });
    }

    return reply.status(204).send();
  });

  /**
   * PATCH /api/assets/:id — update asset fields (title, description, tags)
   * Fire-and-forget partial OpenSearch update for changed fields.
   */
  fastify.patch<{
    Params: { id: string };
    Body: { title?: string; description?: string; tags?: string[] };
  }>('/api/assets/:id', async (request, reply) => {
    const { id } = request.params;
    const { title, description, tags } = request.body as {
      title?: string;
      description?: string;
      tags?: string[];
    };

    const asset = db.select().from(assets).where(eq(assets.id, id)).get();
    if (!asset) {
      return reply.status(404).send({ error: 'Asset not found' });
    }

    // Build updates object with only provided fields
    const updates: Partial<typeof assets.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (tags !== undefined) updates.tags = JSON.stringify(tags);

    // Only write if there are actual field changes (beyond updatedAt)
    if (title !== undefined || description !== undefined || tags !== undefined) {
      db.update(assets).set(updates).where(eq(assets.id, id)).run();

      // Fire-and-forget partial OpenSearch update — only send changed fields
      const osDoc: Record<string, unknown> = {};
      if (title !== undefined) osDoc.title = title;
      if (description !== undefined) osDoc.description = description;
      if (tags !== undefined) osDoc.tags = tags;

      if (Object.keys(osDoc).length > 0) {
        opensearchClient.update({
          index: 'mam-assets',
          id,
          body: { doc: osDoc },
        }).catch((err: Error) => console.warn('OpenSearch partial update failed (PATCH):', err.message));
      }
    }

    return db.select().from(assets).where(eq(assets.id, id)).get();
  });
}
