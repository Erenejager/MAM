import Fastify from 'fastify';
import { config } from 'dotenv';
config();

const server = Fastify({ logger: true });

server.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  const port = parseInt(process.env.PORT || '3001', 10);
  await server.listen({ port, host: '0.0.0.0' });
};
start();
