---
phase: 03-browse-and-playback
plan: 01
subsystem: api
tags: [fastify, drizzle-orm, better-sqlite3, vitest, sqlite, json_each]

# Dependency graph
requires:
  - phase: 02-ingest-pipeline
    provides: assets table schema, POST /api/assets ingest pipeline, db/index.ts export
provides:
  - GET /api/assets with createdAt DESC ordering and AND-logic tag filtering
  - GET /api/tags with unique tag counts via json_each
  - DELETE /api/assets/:id with optional disk cleanup
  - PATCH /api/assets/:id for tag updates
  - Full test coverage for all 4 browse/playback API endpoints
affects: [03-browse-and-playback frontend plans, any plan needing asset list API]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SQLite json_each() for tag AND-filtering via COUNT(DISTINCT value) = N pattern"
    - "Raw SQL via db.$client.prepare() for json_each aggregation queries not expressible in Drizzle"
    - "TDD: RED commit (test file) then GREEN commit (implementation) per endpoint group"
    - "In-memory better-sqlite3 via vi.mock for fast isolated API tests with Fastify inject()"

key-files:
  created:
    - backend/src/__tests__/assets-api.test.ts
  modified:
    - backend/src/routes/assets.ts
    - backend/package.json

key-decisions:
  - "Use db.$client.prepare() for json_each aggregation — Drizzle 0.36 does not support GROUP BY on virtual table json_each(), raw SQL is cleaner than workarounds"
  - "Tag AND-filtering uses COUNT(DISTINCT value) FROM json_each WHERE value IN (...) = N — handles duplicates correctly and is performant for small tag sets"
  - "DELETE endpoint uses asset UUID directly as the asset directory name — matches STORAGE_ROOT/{id}/ storage layout"

patterns-established:
  - "Raw SQL fallback: use db.$client.prepare().all() for SQLite-specific features not in Drizzle ORM"
  - "Test isolation: vi.mock db module with in-memory SQLite + drizzle for route-level tests"

requirements-completed: [BRWS-01, BRWS-03, BRWS-04, PLAY-04]

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 03 Plan 01: Browse and Playback API Summary

**Four browse/playback REST endpoints on Fastify 4 — list with AND-tag filter, tag counts via json_each, delete with optional disk cleanup, PATCH tags — all covered by 12 passing vitest tests using in-memory SQLite.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T16:07:51Z
- **Completed:** 2026-03-25T16:10:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- All 4 browse/playback API endpoints implemented with correct behavior
- 12 automated tests covering every endpoint behavior including edge cases
- Tag AND-filtering via `COUNT(DISTINCT value) FROM json_each` correctly handles multi-tag filter requests
- `GET /api/tags` uses raw SQLite `json_each` aggregation via `db.$client.prepare()` for alphabetical tag counts

## Task Commits

Each task was committed atomically:

1. **Task 1: Create test file with failing tests (RED)** - `06553b7` (test)
2. **Task 2: Implement all 4 backend endpoints (GREEN)** - `1156f46` (feat)

## Files Created/Modified

- `backend/src/__tests__/assets-api.test.ts` - 12 test cases for all 4 browse/playback endpoints using in-memory SQLite mock
- `backend/src/routes/assets.ts` - Added GET /api/assets, GET /api/tags, DELETE /api/assets/:id, PATCH /api/assets/:id
- `backend/package.json` - Downgraded @fastify/multipart from v9 to v8 for Fastify 4 compatibility

## Decisions Made

- Used `db.$client.prepare().all()` for `GET /api/tags` — Drizzle 0.36 cannot express `GROUP BY value` on a virtual `json_each` table; raw SQL is more readable than any workaround.
- Tag AND-filter uses `COUNT(DISTINCT value) FROM json_each(...) WHERE value IN (...) = N` — handles the case where a tag appears multiple times in one asset's array without over-counting.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebuilt better-sqlite3 native bindings**
- **Found during:** Task 1 (test run)
- **Issue:** `better-sqlite3` native `.node` bindings were compiled for a different Node version; bindings not found for Node 22.22.1
- **Fix:** Ran `npm rebuild better-sqlite3` in `backend/`
- **Files modified:** None (native binary rebuild only)
- **Verification:** Tests ran successfully after rebuild
- **Committed in:** 06553b7 (included in Task 1 commit)

**2. [Rule 3 - Blocking] Downgraded @fastify/multipart from v9 to v8**
- **Found during:** Task 1 (test run)
- **Issue:** `@fastify/multipart` v9 requires Fastify 5 (peer dep `fastify: ^5.0.0`); project uses Fastify 4, causing plugin version check error in test
- **Fix:** `npm install @fastify/multipart@8` — v8.3.1 is compatible with Fastify 4
- **Files modified:** `backend/package.json`, `backend/package-lock.json`
- **Verification:** All 12 tests pass after downgrade
- **Committed in:** 06553b7 (included in Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes required for tests to run at all. No scope creep. The multipart fix also corrects a pre-existing version mismatch that would have caused runtime issues in production.

## Issues Encountered

- `@fastify/multipart` v9 was installed despite the project using Fastify 4 — this was a pre-existing mismatch, not introduced by this plan. Downgraded to v8 as part of the blocking fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 browse/playback API endpoints are live and tested
- Frontend plans (03-02 and onwards) can consume `GET /api/assets`, `GET /api/tags`, `DELETE /api/assets/:id`, `PATCH /api/assets/:id`
- `transcriptionStatus` is included in all asset responses (satisfies PLAY-04 requirement)
- No blockers for Phase 03 frontend plans

---
*Phase: 03-browse-and-playback*
*Completed: 2026-03-25*
