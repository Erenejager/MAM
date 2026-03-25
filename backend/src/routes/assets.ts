import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { assets } from '../db/schema.js';
import { saveAndHash } from '../lib/hash.js';
import { pipelineQueue } from '../lib/queue.js';
import { runPipeline } from '../lib/pipeline.js';

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
}
