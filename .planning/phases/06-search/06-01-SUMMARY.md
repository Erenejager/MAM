---
phase: 06-search
plan: 01
subsystem: api
tags: [opensearch, full-text-search, tanstack-query, fastify]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: OpenSearch client bootstrap and index mapping
provides:
  - GET /api/search endpoint with multi_match + highlight + tag AND-filter
  - buildSearchQuery and resolveTranscriptTimestamp library functions
  - SearchResult/SearchResponse frontend types
  - searchAssets API function with 503 graceful degradation
  - useSearch TanStack Query hook (disabled when query empty)
affects: [06-search plan 02 (UI wiring)]

# Tech tracking
tech-stack:
  added: []
  patterns: [opensearch-bool-query-builder, transcript-timestamp-resolution, word-overlap-matching]

key-files:
  created:
    - backend/src/lib/search.ts
    - backend/src/routes/search.ts
    - backend/src/__tests__/search.test.ts
    - frontend/src/hooks/useSearch.ts
  modified:
    - backend/src/index.ts
    - frontend/src/types/asset.ts
    - frontend/src/lib/api.ts

key-decisions:
  - "multi_match with title^3/description^2/transcript field boosting for relevance ranking"
  - "Tag AND-filter via individual term clauses (not terms) for strict multi-tag matching"
  - "Transcript fragment_size 120 with 5 fragments for match count badge"
  - "Word-overlap fallback when exact substring match fails for transcript timestamp resolution"
  - "useSearch enabled only when query.trim().length > 0 -- empty query shows full grid via useAssets"

patterns-established:
  - "Search query builder: pure function returning OpenSearch body or null (testable without mocks)"
  - "Transcript timestamp resolution: strip highlight tags, exact match, then word-overlap scoring"
  - "503 graceful degradation: frontend returns empty results with error field, not thrown exception"

requirements-completed: [SRCH-01, SRCH-02, SRCH-03, SRCH-04]

# Metrics
duration: 4min
completed: 2026-03-30
---

# Phase 6 Plan 1: Search Data Layer Summary

**Full-text search endpoint with OpenSearch bool queries, transcript timestamp resolution, and frontend TanStack Query hook**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-30T20:45:29Z
- **Completed:** 2026-03-30T20:49:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Backend search endpoint with multi_match query across title/description/transcript, fuzziness AUTO, and per-tag AND-filter
- Transcript timestamp resolver that maps highlight fragments to segment start times via substring match and word-overlap fallback
- Frontend data layer: SearchResult/SearchResponse types, searchAssets API with 503 handling, useSearch hook disabled when query empty
- 11 passing tests covering query building, timestamp resolution, route behavior, and error handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend search library and route with tests** - `ee471cb` (test: failing tests) + `690f002` (feat: implementation)
2. **Task 2: Frontend search types, API function, and TanStack Query hook** - `30b2a1b` (feat)

_Note: Task 1 used TDD with separate test and implementation commits._

## Files Created/Modified
- `backend/src/lib/search.ts` - Query builder (buildSearchQuery) and transcript timestamp resolver (resolveTranscriptTimestamp)
- `backend/src/routes/search.ts` - GET /api/search route with OpenSearch integration and 503 handling
- `backend/src/index.ts` - Route registration for searchRoutes
- `backend/src/__tests__/search.test.ts` - 11 tests for query builder, timestamp resolver, and route
- `frontend/src/types/asset.ts` - SearchResult, SearchTranscriptMatch, SearchResponse interfaces
- `frontend/src/lib/api.ts` - searchAssets function with 503 graceful degradation
- `frontend/src/hooks/useSearch.ts` - useSearch TanStack Query hook

## Decisions Made
- multi_match with title^3/description^2/transcript field boosting prioritizes title matches
- Tag AND-filter uses individual term clauses per tag, not a single terms clause
- Fragment size 120 chars with 5 fragments gives match count for badge display
- useSearch enabled guard prevents unnecessary OpenSearch calls on empty query

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Search data layer complete, ready for Plan 02 (UI wiring: search bar, results display, tag filter integration)
- All types and hooks exported and ready for component consumption

## Self-Check: PASSED

All 7 files verified present. All 3 commits verified in git log.

---
*Phase: 06-search*
*Completed: 2026-03-30*
