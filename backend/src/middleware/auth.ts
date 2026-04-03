import type { FastifyInstance } from 'fastify';
import { validateSession } from '../lib/auth.js';

const PUBLIC_ROUTES = new Set([
  'POST:/api/auth/login',
  'GET:/api/health',
]);

export function registerAuthMiddleware(server: FastifyInstance) {
  server.addHook('onRequest', async (request, reply) => {
    const routeKey = `${request.method}:${request.url.split('?')[0]}`;
    if (PUBLIC_ROUTES.has(routeKey)) return;

    const token = request.cookies.mam_session;
    if (!token || !validateSession(token)) {
      reply.status(401).send({ error: 'Not authenticated' });
    }
  });
}
