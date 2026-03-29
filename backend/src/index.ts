import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config(); // 1. Load .env

import { validateEnv } from './bootstrap/validate-env.js';
import { initOpenSearch } from './bootstrap/opensearch.js';
import { assetRoutes } from './routes/assets.js';
import { customFieldRoutes } from './routes/custom-fields.js';
import './db/index.js'; // 3. Triggers DB connection

const server = Fastify({ logger: true });

server.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  // 2. Validate environment — exits if invalid
  validateEnv();

  // 4. Initialize OpenSearch index
  await initOpenSearch();

  // 5. CORS — development only (per CONTEXT.md decision)
  if (process.env.NODE_ENV === 'development') {
    await server.register(cors, {
      origin: true, // Allow all origins in dev
    });
  }

  // 6. Register asset routes (upload + status)
  await server.register(assetRoutes);

  // 6a. Register custom field routes (CRUD + custom values)
  await server.register(customFieldRoutes);

  // 6b. Serve uploaded files from STORAGE_ROOT
  await server.register(fastifyStatic, {
    root: resolve(process.env.STORAGE_ROOT!),
    prefix: '/storage/',
    decorateReply: false,
  });

  // 7. Start listening
  const port = parseInt(process.env.PORT || '3001', 10);
  await server.listen({ port, host: '0.0.0.0' });
};

start();
