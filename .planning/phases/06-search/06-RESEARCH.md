# Phase 6: Search - Research

**Researched:** 2026-03-30
**Domain:** OpenSearch full-text search with React frontend integration
**Confidence:** HIGH

## Summary

Phase 6 implements the core value proposition of MAM: finding any asset by title, tag, description, or spoken word in the transcript. The infrastructure is already in place -- OpenSearch index `mam-assets` with text fields for title, description, and transcript, plus keyword fields for tags. The `@opensearch-project/opensearch` client v2.13.0 is installed and the indexing pipeline already populates all fields during ingest. The PATCH route already does partial OpenSearch updates.

The work breaks into three domains: (1) a backend search endpoint that queries OpenSearch with `multi_match` + `highlight` and returns enriched results, (2) frontend search state management flowing from TopBar through to the asset grid, and (3) transcript excerpt rendering with timecode links that integrate with the existing detail panel and video player.

**Primary recommendation:** Use OpenSearch `bool` query with `multi_match` for title/description/transcript and `terms` filter for tags, with `highlight` fragments for excerpt extraction. Transcript timecodes are resolved by matching highlight text against the on-disk `transcript.json` segments, which is done server-side to avoid sending full transcript data to the client for every search result.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Search acts as a filter on the existing card grid -- same layout as browse, narrowed to matching assets
- Cards expand to show transcript excerpt when there is a transcript match
- All matched fields highlighted: title, description, tags, AND transcript excerpt (amber highlight, same style as Phase 5)
- Best match only per card -- single transcript excerpt with timecode; badge shows total match count (e.g., "3 matches")
- Submit on Enter (not live/debounce) -- avoids hammering OpenSearch on every keystroke
- Centered search input in TopBar: MAM logo left, wide search input centered
- Keyboard shortcut: Cmd/Ctrl+K to focus search bar from anywhere
- No results: friendly message "No videos match 'query'" with suggestion to try different terms
- OpenSearch unavailable: banner warning "Search unavailable" but grid still works (shows all assets)
- Clearing the search returns to full grid view
- AND logic for tags + search -- selected tags narrow results first, then search filters within that subset
- Tag sidebar always shows global counts (no aggregation query per search)
- Tag filters persist across searches; search persists across tag changes
- Clicking timecode on a search result card: opens detail panel + auto-switches to Transcript tab + seeks video to that timestamp
- Transcript excerpt format: quoted with ellipsis -- "...matching **word** in context..." with amber highlight
- Timecode displayed as a small clickable link below the excerpt
- Reuses Phase 5 transcript viewer for detail panel behavior (auto-scroll, segment highlighting)

### Claude's Discretion
- OpenSearch query structure (multi_match, bool query, etc.)
- Search result relevance scoring
- Excerpt extraction algorithm (how much context around the match)
- Loading state design while search is running
- Transition animation when cards expand/collapse for excerpts
- Search input clear button design

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRCH-01 | User can full-text search across title, description, and tags | OpenSearch `multi_match` query across title, description fields + `terms` filter for tags; backend `GET /api/search` endpoint |
| SRCH-02 | User can search spoken words within transcripts | OpenSearch `transcript` text field already indexed; included in `multi_match` fields |
| SRCH-03 | Search results show highlighted matching excerpts with a timecode link | OpenSearch `highlight` API returns fragment snippets; server-side segment matching resolves timecodes from transcript.json |
| SRCH-04 | User can filter search results by tag | `bool` query combines `must` (text search) with `filter` (tags `terms` clause); composes with existing `useTagFilter` hook |

</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @opensearch-project/opensearch | 2.13.0 | OpenSearch client | Already installed, used by pipeline and PATCH |
| @tanstack/react-query | 5.x | Search data fetching | Already used for all data fetching in the app |
| framer-motion | Already installed | Card expand/collapse animation | Already used for panel transitions |
| lucide-react | Already installed | Search icon, clear button | Already used for all icons |

### No New Dependencies

This phase requires **zero new npm packages**. All functionality is achievable with the existing stack:

- OpenSearch queries use the already-installed `@opensearch-project/opensearch` client
- Frontend search state is plain React `useState` lifted to App.tsx
- Highlighting reuses the existing `escapeRegex` + `<mark>` pattern from Phase 5
- Timecode formatting uses existing `formatTimecode()` from `lib/formatters.ts`
- Animations use existing `framer-motion`

## Architecture Patterns

### Backend Search Endpoint

```
GET /api/search?q=<query>&tags=<tag1>&tags=<tag2>
```

**Response shape:**
```typescript
interface SearchResult {
  id: string;
  highlights: {
    title?: string[];     // highlighted fragments
    description?: string[];
    transcript?: string[];  // highlighted transcript fragments
  };
  transcriptMatch?: {
    text: string;          // excerpt with match context
    timestamp: number;     // start time in seconds
    matchCount: number;    // total transcript matches
  };
  score: number;
}

// Endpoint returns { results: SearchResult[] }
// Frontend uses result IDs to look up full asset data from the existing
// TanStack Query cache (already fetched by useAssets)
```

### OpenSearch Query Structure

```typescript
// Recommended query: bool with multi_match + tag filter + highlight
const body = {
  query: {
    bool: {
      must: [
        {
          multi_match: {
            query: q,
            fields: ['title^3', 'description^2', 'transcript'],
            type: 'best_fields',
            fuzziness: 'AUTO',
          },
        },
      ],
      filter: tags.length > 0
        ? [{ terms: { tags: tags } }]   // AND with search
        : [],
    },
  },
  highlight: {
    fields: {
      title: { number_of_fragments: 1 },
      description: { number_of_fragments: 1 },
      transcript: {
        number_of_fragments: 1,     // best match only per card
        fragment_size: 120,          // ~120 chars of context
      },
    },
    pre_tags: ['<em>'],
    post_tags: ['</em>'],
  },
  _source: ['id'],   // minimize payload -- we only need IDs + highlights
  size: 100,          // practical upper bound for single-user
};
```

**Key design decisions:**
- `title^3, description^2, transcript` -- boost title/description over transcript for relevance
- `type: 'best_fields'` -- find best matching field, not cross-field
- `fuzziness: 'AUTO'` -- tolerates minor typos (1-2 char edits based on term length)
- `fragment_size: 120` for transcript -- gives ~20 words of context around match
- `number_of_fragments: 1` for transcript -- "best match only per card" per user decision

### Transcript Timecode Resolution

**Problem:** OpenSearch `highlight` returns text fragments but no timestamp. We need to map the highlighted transcript excerpt back to a timestamp from the segment data.

**Solution:** Server-side segment matching:
1. When a transcript highlight is returned, read the asset's `transcript.json` from disk
2. Search for the highlight text (stripped of `<em>` tags) within the segments
3. Return the `start` timestamp of the matching segment

```typescript
// Server-side: find timestamp for a highlight fragment
function findTimestamp(
  segments: { start: number; end: number; text: string }[],
  highlightText: string
): number | null {
  const clean = highlightText.replace(/<\/?em>/g, '');
  // Segments are short (typically one sentence each)
  // Find segment whose text contains the matched excerpt
  for (const seg of segments) {
    if (seg.text.includes(clean) || clean.includes(seg.text.trim())) {
      return seg.start;
    }
  }
  // Fallback: fuzzy match by finding the segment with most word overlap
  const words = clean.toLowerCase().split(/\s+/);
  let bestSeg = segments[0];
  let bestOverlap = 0;
  for (const seg of segments) {
    const segWords = seg.text.toLowerCase().split(/\s+/);
    const overlap = words.filter(w => segWords.includes(w)).length;
    if (overlap > bestOverlap) { bestOverlap = overlap; bestSeg = seg; }
  }
  return bestSeg?.start ?? null;
}
```

**Why server-side, not client-side:** Avoids sending full transcript segment arrays to the client for every search result. The server reads one `transcript.json` file per result that has a transcript match -- efficient for a single-user app with <1000 assets.

### Frontend State Flow

```
App.tsx (searchQuery state, searchResults state)
  |
  +-- TopBar (search input, onSearch callback)
  |     |
  |     +-- SearchInput (value, onChange, onSubmit, onClear)
  |
  +-- AssetGrid (receives searchResultIds + searchHighlights)
  |     |
  |     +-- AssetCard (expanded with transcript excerpt when search active)
  |
  +-- DetailPanel (receives initialTab + seekTimestamp props)
```

**State management approach:**
- `searchQuery` and `searchResults` are `useState` in App.tsx (same pattern as `selectedAssetId`)
- New `useSearch(query, tags)` TanStack Query hook calls `GET /api/search`
- AssetGrid switches data source: when search active, filter `useAssets` data to only IDs in search results
- No React Context needed -- prop drilling is fine for this shallow component tree

### Recommended File Structure

```
backend/src/
  routes/
    search.ts              # NEW: GET /api/search endpoint
  lib/
    search.ts              # NEW: OpenSearch query builder + segment matcher

frontend/src/
  components/
    layout/
      TopBar.tsx           # MODIFIED: add SearchInput
      SearchInput.tsx      # NEW: search bar component
    assets/
      AssetCard.tsx        # MODIFIED: add transcript excerpt section
      TranscriptExcerpt.tsx  # NEW: excerpt + timecode display for cards
  hooks/
    useSearch.ts           # NEW: TanStack Query hook for search
  lib/
    api.ts                 # MODIFIED: add searchAssets() function
  types/
    asset.ts               # MODIFIED: add SearchResult type
```

### Anti-Patterns to Avoid
- **Don't query OpenSearch for display data:** Search returns IDs + highlights only. Full asset data comes from the existing SQLite-backed `useAssets` query cache. OpenSearch is a search index, not a data store.
- **Don't debounce/live-search:** User decision is explicit Enter-to-search. No `onChange` searching.
- **Don't aggregate tag counts from search results:** User decision says tag sidebar always shows global counts. No per-search aggregation query.
- **Don't send transcript segments to the client in search results:** Resolve timecodes server-side to keep the response payload small.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search | Custom SQLite FTS5 | OpenSearch multi_match | Already indexed, handles stemming, relevance scoring, highlighting |
| Highlight rendering | `dangerouslySetInnerHTML` | Split + `<mark>` pattern | XSS safety -- Phase 5 already established this pattern |
| Keyboard shortcut (Cmd+K) | Custom event listener | `useEffect` with `keydown` | Simple enough, no library needed for one shortcut |
| Search result caching | Custom cache | TanStack Query | Already handles caching, refetching, stale data |

**Key insight:** The entire search infrastructure (OpenSearch index, client, indexing pipeline) already exists. This phase is about querying it and rendering results -- no new infrastructure needed.

## Common Pitfalls

### Pitfall 1: OpenSearch Unavailable at Search Time
**What goes wrong:** User searches, OpenSearch is down, unhandled 500 error
**Why it happens:** OpenSearch connection is non-fatal at boot -- app runs without it
**How to avoid:** The search endpoint must catch connection errors and return a structured error response (e.g., `{ error: 'search_unavailable' }`). Frontend shows banner: "Search unavailable" and falls back to showing the full grid.
**Warning signs:** No error handling around `opensearchClient.search()` calls

### Pitfall 2: HTML Injection via Highlight Tags
**What goes wrong:** OpenSearch returns `<em>highlighted</em>` fragments. Using `dangerouslySetInnerHTML` to render them opens XSS risk.
**Why it happens:** OpenSearch highlight tags are configurable but the content between them is user-generated text.
**How to avoid:** Parse the `<em>`/`</em>` tags server-side or client-side and render using React elements (the split+mark pattern from Phase 5). Never use `dangerouslySetInnerHTML`.
**Warning signs:** Any use of `dangerouslySetInnerHTML` in search result rendering

### Pitfall 3: Tag Filter AND vs OR Semantics
**What goes wrong:** OpenSearch `terms` query is OR by default -- "show assets with tag A OR tag B". But the app uses AND logic (assets must have ALL selected tags).
**Why it happens:** `terms` in OpenSearch is an implicit OR.
**How to avoid:** When multiple tags are selected, use multiple `term` clauses inside `bool.filter.must`:
```typescript
filter: tags.map(tag => ({ term: { tags: tag } }))
// This is AND -- each tag must be present
```
**Warning signs:** Single `terms` clause with multiple values

### Pitfall 4: Stale Search Results After Metadata Edit
**What goes wrong:** User edits title/tags, searches, old values still appear
**Why it happens:** OpenSearch index is eventually consistent. The PATCH route already does fire-and-forget OpenSearch updates, but there may be a brief delay.
**How to avoid:** After PATCH, invalidate the search query in TanStack Query. The OpenSearch update from PATCH is near-instant for a single node. If still stale, add `refresh: 'wait_for'` to the PATCH's OpenSearch update call (only if needed -- adds latency).
**Warning signs:** User edits a field and immediately searches for the old value

### Pitfall 5: Transcript Fragment Doesn't Match Any Segment
**What goes wrong:** OpenSearch highlight fragment spans across segment boundaries, so exact substring match against individual segments fails.
**Why it happens:** The `transcript` field is the full concatenated text, not segmented. A highlight fragment may include text from multiple segments.
**How to avoid:** Use word-overlap fuzzy matching as fallback (see Architecture Patterns above). The first segment with significant overlap wins.
**Warning signs:** `transcriptMatch.timestamp` is null for results that clearly have transcript matches

### Pitfall 6: Empty Query with Tags
**What goes wrong:** User has tags selected but no search query -- what should the search endpoint return?
**How to avoid:** When `q` is empty, skip the OpenSearch query entirely and fall back to the existing `GET /api/assets?tags=` endpoint (SQLite-based tag filtering). OpenSearch is only used when there is actual text to search.
**Warning signs:** Empty `multi_match` query string causes OpenSearch errors or returns everything

## Code Examples

### Backend: Search Route

```typescript
// backend/src/routes/search.ts
import { FastifyInstance } from 'fastify';
import { opensearchClient } from '../bootstrap/opensearch.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Querystring: { q?: string; tags?: string | string[] };
  }>('/api/search', async (request, reply) => {
    const { q, tags } = request.query;
    const tagList = tags ? (Array.isArray(tags) ? tags : [tags]) : [];

    if (!q || q.trim() === '') {
      // No search query -- return empty (frontend uses regular asset list)
      return { results: [] };
    }

    try {
      const must: object[] = [
        {
          multi_match: {
            query: q.trim(),
            fields: ['title^3', 'description^2', 'transcript'],
            type: 'best_fields',
            fuzziness: 'AUTO',
          },
        },
      ];

      // AND logic: each tag must be present
      const filter: object[] = tagList.map(tag => ({ term: { tags: tag } }));

      const response = await opensearchClient.search({
        index: 'mam-assets',
        body: {
          query: { bool: { must, filter } },
          highlight: {
            fields: {
              title: { number_of_fragments: 1 },
              description: { number_of_fragments: 1 },
              transcript: { number_of_fragments: 1, fragment_size: 120 },
            },
            pre_tags: ['<em>'],
            post_tags: ['</em>'],
          },
          _source: ['id'],
          size: 100,
        },
      });

      const hits = response.body.hits.hits;
      const storageRoot = process.env.STORAGE_ROOT!;

      const results = await Promise.all(
        hits.map(async (hit: any) => {
          const result: any = {
            id: hit._id,
            score: hit._score,
            highlights: hit.highlight ?? {},
          };

          // Resolve transcript timecode if transcript was highlighted
          if (hit.highlight?.transcript?.length > 0) {
            const fragment = hit.highlight.transcript[0];
            try {
              const jsonPath = resolve(storageRoot, hit._id, 'transcript.json');
              const raw = await readFile(jsonPath, 'utf-8');
              const data = JSON.parse(raw);
              const segments = data.segments ?? data;
              const clean = fragment.replace(/<\/?em>/g, '');

              // Find matching segment
              let bestSeg = null;
              let bestOverlap = 0;
              const words = clean.toLowerCase().split(/\s+/);
              for (const seg of segments) {
                const segWords = seg.text.toLowerCase().split(/\s+/);
                const overlap = words.filter((w: string) => segWords.includes(w)).length;
                if (overlap > bestOverlap) {
                  bestOverlap = overlap;
                  bestSeg = seg;
                }
              }

              // Count total transcript matches (for badge)
              const matchCount = (hit.highlight.transcript as string[]).length;
              // Note: OpenSearch returns number_of_fragments fragments.
              // For total count, we'd need a separate count or use
              // the full transcript text match count.

              result.transcriptMatch = {
                text: fragment,
                timestamp: bestSeg?.start ?? 0,
                matchCount,
              };
            } catch {
              // transcript.json not found -- skip
            }
          }

          return result;
        })
      );

      return { results };
    } catch (err: any) {
      if (err.message?.includes('ECONNREFUSED') || err.message?.includes('connect')) {
        return reply.status(503).send({ error: 'search_unavailable' });
      }
      request.log.error(err, 'Search failed');
      return reply.status(500).send({ error: 'Search failed' });
    }
  });
}
```

### Frontend: Search Input Component

```tsx
// frontend/src/components/layout/SearchInput.tsx
import { useRef, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  onSearch: (query: string) => void;
  onClear: () => void;
}

export function SearchInput({ onSearch, onClear }: SearchInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(value.trim());
  };

  const handleClear = () => {
    setValue('');
    onClear();
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="flex-1 max-w-xl mx-auto">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search videos... (Ctrl+K)"
          className="w-full bg-background border border-border rounded-lg pl-10 pr-10 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-cta"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </form>
  );
}
```

### Frontend: Highlight Rendering (Reusing Phase 5 Pattern)

```tsx
// Parse OpenSearch <em> tags into React elements with amber highlights
function renderHighlight(text: string): React.ReactNode {
  const parts = text.split(/(<em>.*?<\/em>)/g);
  return parts.map((part, i) => {
    const match = part.match(/^<em>(.*?)<\/em>$/);
    if (match) {
      return (
        <mark key={i} className="bg-amber-500/30 text-amber-200 rounded-sm px-0.5">
          {match[1]}
        </mark>
      );
    }
    return part;
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SQLite FTS5 for search | OpenSearch for full-text search | Project start (by design) | OpenSearch handles relevance scoring, highlighting, stemming out of the box |
| Client-side filtering | Server-side OpenSearch query | This phase | Search works across all indexed fields simultaneously |

**Already in place:**
- OpenSearch 2.x index with text mappings for title, description, transcript
- Indexing pipeline populates all fields on ingest
- PATCH route updates OpenSearch on metadata edits
- OpenSearch client v2.13.0 installed

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (already configured) |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx vitest run src/__tests__/search.test.ts` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRCH-01 | Search across title, description, tags | integration | `npx vitest run src/__tests__/search.test.ts -t "title"` | No -- Wave 0 |
| SRCH-02 | Search spoken words in transcripts | integration | `npx vitest run src/__tests__/search.test.ts -t "transcript"` | No -- Wave 0 |
| SRCH-03 | Highlighted excerpts with timecode | unit | `npx vitest run src/__tests__/search.test.ts -t "timecode"` | No -- Wave 0 |
| SRCH-04 | Filter search results by tag | integration | `npx vitest run src/__tests__/search.test.ts -t "tag filter"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx vitest run src/__tests__/search.test.ts`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/__tests__/search.test.ts` -- covers SRCH-01 through SRCH-04
- [ ] OpenSearch mock/stub for test isolation (opensearchClient.search mock)
- [ ] Note: Integration tests against real OpenSearch are impractical without a running instance. Tests should mock the OpenSearch client and verify query construction + segment matching logic.

## Open Questions

1. **Transcript match count accuracy**
   - What we know: OpenSearch `number_of_fragments` controls how many fragments are returned, not how many matches exist. Getting total match count requires a different approach (e.g., counting in the full transcript text).
   - What's unclear: Whether `total` match count badge is critical UX or nice-to-have
   - Recommendation: Use `number_of_fragments: 5` but only display the first one on the card. Use the array length as approximate match count for the badge. This is good enough for a single-user app.

2. **OpenSearch refresh timing**
   - What we know: Pipeline does `opensearchClient.index()` without `refresh: 'wait_for'`. Default refresh interval is 1 second.
   - What's unclear: Whether the 1-second delay ever causes UX issues
   - Recommendation: Leave as-is. For a single-user app, 1 second is fine. If users report issues, add `refresh: 'wait_for'` to the pipeline's index call.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `backend/src/bootstrap/opensearch.ts` -- index mapping with title, description, tags, transcript fields
- Existing codebase: `backend/src/lib/pipeline.ts` -- indexing flow, transcript text storage
- Existing codebase: `frontend/src/components/detail/TranscriptList.tsx` -- highlight pattern (split+mark), timecode formatting
- OpenSearch documentation: multi_match query, highlight API, bool query, terms filter -- standard OpenSearch 2.x features verified against installed client v2.13.0

### Secondary (MEDIUM confidence)
- OpenSearch highlight fragment_size behavior -- based on Elasticsearch/OpenSearch documentation; default fragment_size is 100 chars
- Fuzzy matching with `fuzziness: 'AUTO'` -- standard feature, edit distance 0 for 1-2 char terms, 1 for 3-5, 2 for 6+

### Tertiary (LOW confidence)
- None -- all research backed by codebase inspection and well-documented OpenSearch features

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all already installed and in use
- Architecture: HIGH -- follows established codebase patterns (TanStack Query hooks, Fastify routes, OpenSearch client)
- Pitfalls: HIGH -- derived from known codebase decisions (non-fatal OpenSearch, XSS patterns from Phase 5, AND tag logic)

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable -- no fast-moving dependencies)
