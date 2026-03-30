---
phase: 04-metadata-editing
plan: 01
subsystem: api
tags: [fastify, drizzle, opensearch, metadata, custom-fields, sqlite]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: database schema with assets, custom_fields, asset_custom_values tables
  - phase: 02-ingest-pipeline
    provides: pipeline.ts indexInOpenSearch function, opensearch client
provides:
  - PATCH /api/assets/:id accepting title, description, tags with partial OpenSearch re-index
  - Custom field CRUD API (GET, POST, DELETE /api/custom-fields)
  - Per-asset custom value upsert (PUT /api/assets/:id/custom-values/:fieldId)
  - Custom value listing (GET /api/assets/:id/custom-values)
  - Description included in OpenSearch indexed documents during pipeline ingest
affects: [04-metadata-editing, 05-search]

# Tech tracking
tech-stack:
  added: []
  patterns: [partial-opensearch-update, upsert-via-raw-sql, fire-and-forget-reindex]

key-files:
  created:
    - backend/src/routes/custom-fields.ts
    - backend/src/__tests__/custom-fields.test.ts
  modified:
    - backend/src/routes/assets.ts
    - backend/src/lib/pipeline.ts
    - backend/src/index.ts
    - backend/src/__tests__/assets-api.test.ts

key-decisions:
  - "Partial OpenSearch update on PATCH (opensearchClient.update with doc merge) avoids re-reading transcript blob"
  - "Custom value upsert uses raw SQL ON CONFLICT DO UPDATE since Drizzle 0.36 lacks native upsert for composite PKs"
  - "No putMapping needed for description -- field was already in INDEX_MAPPING since Phase 1"

patterns-established:
  - "Fire-and-forget pattern: opensearchClient.update().catch(warn) for non-critical reindex after DB write"
  - "Raw SQL upsert via db.$client.prepare() for composite PK tables Drizzle cannot express"

requirements-completed: [META-02, META-03, META-04]

# Metrics
duration: 3min
completed: 2026-03-30
---

# Phase 4 Plan 1: Metadata Editing Backend APIs Summary

**Extended PATCH endpoint for title/description/tags with fire-and-forget OpenSearch partial update, plus full custom fields CRUD and per-asset custom value upsert API**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-30T08:57:54Z
- **Completed:** 2026-03-30T09:00:42Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Extended PATCH /api/assets/:id to accept title, description, and tags with partial OpenSearch re-indexing
- Created custom-fields.ts with 5 routes: GET/POST/DELETE for field definitions, GET/PUT for per-asset values
- Added description field to indexInOpenSearch data parameter in pipeline.ts
- Registered customFieldRoutes in index.ts
- Full TDD coverage: 4 new PATCH tests + 11 custom field tests (27 total tests passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 -- Test scaffolds for META-02 and META-04** - `aafe4d2` (test)
2. **Task 2: Backend routes -- extend PATCH, add custom-fields routes, update OpenSearch** - `37c97cd` (feat)

## Files Created/Modified
- `backend/src/routes/custom-fields.ts` - Custom field CRUD + custom value upsert routes (new)
- `backend/src/__tests__/custom-fields.test.ts` - 11 test cases for META-04 behaviors (new)
- `backend/src/routes/assets.ts` - PATCH handler extended with title, description, OpenSearch partial update
- `backend/src/lib/pipeline.ts` - indexInOpenSearch now includes description in indexed document
- `backend/src/index.ts` - Registers customFieldRoutes after assetRoutes
- `backend/src/__tests__/assets-api.test.ts` - 4 new PATCH tests for title/description/combined/no-op
- `backend/src/bootstrap/opensearch.ts` - No changes needed (description already in INDEX_MAPPING)

## Decisions Made
- Used opensearchClient.update() with partial doc merge for PATCH reindex instead of full re-index to avoid re-reading transcript blob from SQLite
- Used raw SQL (db.$client.prepare) for custom value upsert with ON CONFLICT DO UPDATE since Drizzle 0.36 cannot express upserts on composite primary keys
- Skipped putMapping call in opensearch.ts since the description field was already present in INDEX_MAPPING from Phase 1

## Deviations from Plan

None - plan executed exactly as written. Both tasks (TDD RED then GREEN) followed the planned sequence.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend API surface complete for metadata editing
- Frontend can now call PATCH /api/assets/:id with {title, description, tags}
- Frontend can call custom field CRUD and value upsert endpoints
- Ready for 04-02 (frontend metadata editing UI)

## Self-Check: PASSED

- FOUND: backend/src/routes/custom-fields.ts
- FOUND: backend/src/__tests__/custom-fields.test.ts
- FOUND: commit aafe4d2
- FOUND: commit 37c97cd
- All 27 tests passing (2 suites green, 1 skipped)
- TypeScript compiles with zero errors

---
*Phase: 04-metadata-editing*
*Completed: 2026-03-30*
