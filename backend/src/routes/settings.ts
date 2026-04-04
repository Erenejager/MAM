import type { FastifyInstance } from 'fastify';
import { opensearchClient } from '../bootstrap/opensearch.js';

export async function settingsRoutes(server: FastifyInstance) {
  server.get('/api/settings/status', async () => {
    const groqConfigured = !!process.env.GROQ_API_KEY;
    const geminiConfigured = !!process.env.GEMINI_API_KEY;

    let opensearchConnected = false;
    try {
      await opensearchClient.cluster.health({ timeout: '2s' });
      opensearchConnected = true;
    } catch {
      // OpenSearch not reachable
    }

    return {
      groq: { configured: groqConfigured },
      gemini: { configured: geminiConfigured },
      opensearch: { connected: opensearchConnected },
    };
  });
}
