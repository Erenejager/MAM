import type { FastifyInstance } from 'fastify';
import { createSession, removeSession, validateSession, verifyPassword } from '../lib/auth.js';

const COOKIE_NAME = 'mam_session';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days
const isDev = process.env.NODE_ENV === 'development';

export async function authRoutes(server: FastifyInstance) {
  server.post<{ Body: { password: string } }>('/api/auth/login', async (request, reply) => {
    const { password } = request.body ?? {};
    if (!password || typeof password !== 'string') {
      return reply.status(400).send({ error: 'Password is required' });
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      return reply.status(401).send({ error: 'Wrong password' });
    }

    const token = createSession();
    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: !isDev,
      sameSite: isDev ? 'lax' : 'none',
      path: '/',
      maxAge: MAX_AGE_SECONDS,
    });

    return { ok: true };
  });

  server.get('/api/auth/check', async (request, reply) => {
    const token = request.cookies[COOKIE_NAME];
    if (!token || !validateSession(token)) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
    return { ok: true };
  });

  server.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[COOKIE_NAME];
    if (token) removeSession(token);
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  });
}
