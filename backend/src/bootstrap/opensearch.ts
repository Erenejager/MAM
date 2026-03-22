import { Client } from '@opensearch-project/opensearch';

const INDEX_NAME = 'mam-assets';

export function createOpenSearchClient(): Client {
  const node = process.env.OPENSEARCH_URL || 'http://localhost:9200';
  return new Client({ node });
}

export const opensearchClient = createOpenSearchClient();

const INDEX_MAPPING = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
  },
  mappings: {
    dynamic: false as const,
    properties: {
      id: { type: 'keyword' },
      title: {
        type: 'text',
        fields: { keyword: { type: 'keyword', ignore_above: 256 } },
      },
      description: {
        type: 'text',
        fields: { keyword: { type: 'keyword', ignore_above: 256 } },
      },
      tags: { type: 'keyword' },
      transcript: { type: 'text' },
      duration_seconds: { type: 'float' },
      codec: { type: 'keyword' },
      resolution: { type: 'keyword' },
      created_at: { type: 'date' },
    },
  },
};

export async function initOpenSearch(): Promise<void> {
  try {
    const exists = await opensearchClient.indices.exists({ index: INDEX_NAME });
    if (exists.body) {
      console.log(`OpenSearch index '${INDEX_NAME}' already exists`);
      return;
    }

    await opensearchClient.indices.create({
      index: INDEX_NAME,
      body: INDEX_MAPPING,
    });
    console.log(`OpenSearch index '${INDEX_NAME}' created with explicit mapping`);
  } catch (err) {
    // OpenSearch connection failure is a WARNING, not a fatal error
    // Per CONTEXT.md decision: "Warn (don't block) on missing OpenSearch connection"
    console.warn(
      `WARNING: Could not connect to OpenSearch at ${process.env.OPENSEARCH_URL || 'http://localhost:9200'}. ` +
      `Search features will be unavailable until OpenSearch is running. Error: ${(err as Error).message}`
    );
  }
}
