import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config(); // 1. Load .env

import { validateEnv } from './bootstrap/validate-env.js';
import { initOpenSearch } from './bootstrap/opensearch.js';
import { assetRoutes } from './routes/assets.js';
import { customFieldRoutes } from './routes/custom-fields.js';
import { searchRoutes } from './routes/search.js';
import { suggestRoutes } from './routes/suggest.js';
import { authRoutes } from './routes/auth.js';
import { registerAuthMiddleware } from './middleware/auth.js';
import './db/index.js'; // 3. Triggers DB connection

const server = Fastify({ logger: true });

server.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  // 2. Validate environment — exits if invalid
  validateEnv();

  // Cookie parsing
  await server.register(cookie);

  // 4. Initialize OpenSearch index
  await initOpenSearch();

  // 5. CORS
  if (process.env.NODE_ENV === 'development') {
    await server.register(cors, {
      origin: true,
      credentials: true,
    });
  } else if (process.env.CORS_ORIGIN) {
    await server.register(cors, {
      origin: process.env.CORS_ORIGIN,
      credentials: true,
    });
  }

  // Rate limit login endpoint only
  await server.register(rateLimit, {
    max: 5,
    timeWindow: '10 minutes',
    hook: 'onRequest',
    keyGenerator: (request) => request.ip,
    allowList: (request) => !request.url.startsWith('/api/auth/login'),
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too many attempts, try again later',
    }),
  });

  // Auth routes (login/check/logout)
  await server.register(authRoutes);

  // Auth middleware — must be after auth routes are registered
  registerAuthMiddleware(server);

  // 6. Register asset routes (upload + status)
  await server.register(assetRoutes);

  // 6a. Register custom field routes (CRUD + custom values)
  await server.register(customFieldRoutes);

  // 6c. Register search routes (full-text search via OpenSearch)
  await server.register(searchRoutes);

  // 6d. Register suggest routes (autocomplete via SQLite)
  await server.register(suggestRoutes);

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
