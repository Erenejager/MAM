import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from 'dotenv';

config(); // 1. Load .env

import { validateEnv } from './bootstrap/validate-env.js';
import { initOpenSearch } from './bootstrap/opensearch.js';
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

  // 7. Start listening
  const port = parseInt(process.env.PORT || '3001', 10);
  await server.listen({ port, host: '0.0.0.0' });
};

start();
