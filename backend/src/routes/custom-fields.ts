import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { customFields, assetCustomValues } from '../db/schema.js';

export async function customFieldRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/custom-fields — list all field definitions ordered by name
   */
  fastify.get('/api/custom-fields', async () => {
    return db.select().from(customFields).orderBy(customFields.name).all();
  });

  /**
   * POST /api/custom-fields — create a new custom field definition
   */
  fastify.post<{
    Body: { name?: string; fieldType?: string };
  }>('/api/custom-fields', async (request, reply) => {
    const { name, fieldType } = request.body as { name?: string; fieldType?: string };

    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'Field name is required' });
    }

    const id = randomUUID();
    const trimmedName = name.trim();
    const type = fieldType || 'text';

    try {
      db.insert(customFields).values({
        id,
        name: trimmedName,
        fieldType: type,
      }).run();
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        return reply.status(409).send({ error: 'A field with that name already exists' });
      }
      throw err;
    }

    const created = db.select().from(customFields).where(eq(customFields.id, id)).get();
    return reply.status(201).send(created);
  });

  /**
   * DELETE /api/custom-fields/:id — remove field definition (CASCADE removes values)
   */
  fastify.delete<{
    Params: { id: string };
  }>('/api/custom-fields/:id', async (request, reply) => {
    const { id } = request.params;

    const existing = db.select().from(customFields).where(eq(customFields.id, id)).get();
    if (!existing) {
      return reply.status(404).send({ error: 'Custom field not found' });
    }

    db.delete(customFields).where(eq(customFields.id, id)).run();
    return reply.status(204).send();
  });

  /**
   * GET /api/assets/:id/custom-values — list all custom values for an asset
   */
  fastify.get<{
    Params: { id: string };
  }>('/api/assets/:id/custom-values', async (request) => {
    const { id } = request.params;
    return db.select().from(assetCustomValues).where(eq(assetCustomValues.assetId, id)).all();
  });

  /**
   * PUT /api/assets/:id/custom-values/:fieldId — upsert a custom value
   */
  fastify.put<{
    Params: { id: string; fieldId: string };
    Body: { value?: string };
  }>('/api/assets/:id/custom-values/:fieldId', async (request) => {
    const { id, fieldId } = request.params;
    const { value } = request.body as { value?: string };

    db.$client.prepare(
      'INSERT INTO asset_custom_values (asset_id, field_id, value) VALUES (?, ?, ?) ON CONFLICT(asset_id, field_id) DO UPDATE SET value = excluded.value'
    ).run(id, fieldId, value ?? null);

    return { assetId: id, fieldId, value: value ?? null };
  });
}
