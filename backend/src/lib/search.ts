/**
 * Search query builder and transcript timestamp resolver for OpenSearch.
 */

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Build an OpenSearch request body for full-text search.
 * Returns null if the query is empty (signals: skip OpenSearch, return empty results).
 */
export function buildSearchQuery(q: string, tags: string[]): object | null {
  const trimmed = q.trim();
  if (!trimmed) return null;

  return {
    query: {
      bool: {
        must: [
          {
            multi_match: {
              query: trimmed,
              fields: ['title^3', 'description^2', 'transcript'],
              type: 'best_fields',
              fuzziness: 'AUTO',
            },
          },
        ],
        filter: tags.map((tag) => ({ term: { tags: tag } })),
      },
    },
    highlight: {
      fields: {
        title: { number_of_fragments: 1 },
        description: { number_of_fragments: 1 },
        transcript: { number_of_fragments: 5, fragment_size: 120 },
      },
      pre_tags: ['<em>'],
      post_tags: ['</em>'],
    },
    _source: ['id'],
    size: 100,
  };
}

/**
 * Resolve a highlight fragment to the best-matching transcript segment's start time.
 * Strips <em></em> tags before matching.
 */
export function resolveTranscriptTimestamp(
  segments: TranscriptSegment[],
  highlightFragment: string,
): number {
  if (segments.length === 0) return 0;

  // Strip highlight tags
  const cleaned = highlightFragment.replace(/<\/?em>/g, '');

  // Try exact substring match first
  for (const seg of segments) {
    if (seg.text.includes(cleaned) || cleaned.includes(seg.text)) {
      return seg.start;
    }
  }

  // Fall back to word-overlap scoring
  const fragmentWords = new Set(cleaned.toLowerCase().split(/\s+/).filter(Boolean));

  let bestScore = 0;
  let bestStart = 0;

  for (const seg of segments) {
    const segWords = seg.text.toLowerCase().split(/\s+/).filter(Boolean);
    let overlap = 0;
    for (const word of segWords) {
      if (fragmentWords.has(word)) overlap++;
    }
    if (overlap > bestScore) {
      bestScore = overlap;
      bestStart = seg.start;
    }
  }

  return bestStart;
}
