---
phase: 01-foundation
plan: 03
subsystem: infra
tags: [fastify, opensearch, env-validation, bootstrap, cors]

# Dependency graph
requires:
  - phase: 01-foundation-02
    provides: Fastify server skeleton, SQLite/Drizzle DB, package.json with dependencies
provides:
  - Startup environment validation (GROQ_API_KEY, STORAGE_ROOT)
  - OpenSearch client and index initialization with explicit mapping
  - Boot sequence wiring (dotenv -> validate -> db -> opensearch -> cors -> listen)
affects: [02-ingest, 03-search, 04-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [fail-fast env validation, warn-not-crash for optional services, explicit OpenSearch mapping]

key-files:
  created:
    - backend/src/bootstrap/validate-env.ts
    - backend/src/bootstrap/opensearch.ts
  modified:
    - backend/src/index.ts

key-decisions:
  - "OpenSearch connection failure is warning-only, not fatal -- server continues without search"
  - "CORS registered only in NODE_ENV=development mode"
  - "Boot sequence order: dotenv -> validateEnv -> db -> opensearch -> cors -> listen"

patterns-established:
  - "Bootstrap pattern: separate modules in src/bootstrap/ for startup concerns"
  - "Fail-fast validation: check required env vars before server.listen()"
  - "Optional service pattern: warn on connection failure, don't crash"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 01 Plan 03: Env Validation + OpenSearch Init Summary

**Fail-fast env validation for GROQ_API_KEY and STORAGE_ROOT, OpenSearch mam-assets index with explicit mapping (dynamic:false, tags=keyword, duration=float), wired into Fastify boot sequence**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T21:49:05Z
- **Completed:** 2026-03-22T21:51:41Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Startup validation that exits with actionable errors when GROQ_API_KEY or STORAGE_ROOT is missing/invalid
- OpenSearch index initialization with explicit mapping preventing dynamic mapping pitfall (tags=keyword, duration_seconds=float, transcript=text, dynamic=false)
- Full boot sequence wiring with CORS only in development mode

## Task Commits

Each task was committed atomically:

1. **Task 1: Create startup environment validation** - `e59f9d8` (feat)
2. **Task 2: Create OpenSearch index initialization with explicit mapping** - `570a74d` (feat)
3. **Task 3: Wire validation and OpenSearch init into Fastify startup** - `2b7477b` (feat)

## Files Created/Modified
- `backend/src/bootstrap/validate-env.ts` - Validates GROQ_API_KEY presence and STORAGE_ROOT directory existence
- `backend/src/bootstrap/opensearch.ts` - OpenSearch client, mam-assets index creation with explicit field mappings
- `backend/src/index.ts` - Updated boot sequence integrating validation, OpenSearch init, and dev-only CORS

## Decisions Made
- OpenSearch connection failure treated as warning (not fatal) per CONTEXT.md decision -- server continues without search
- CORS with `origin: true` only when `NODE_ENV=development` -- production accessed via Tailscale, no CORS needed
- validateEnv() called inside start() before listen, not at module top level, so dotenv loads first

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- better-sqlite3 native module fails to compile on Node 24 (pre-existing from Plan 02, documented in STATE.md decisions). Does not affect this plan's code correctness -- all three files compile cleanly with `tsc --noEmit`. Runtime validation tested independently with a standalone script.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Server bootstrap complete with fail-fast validation and OpenSearch initialization
- Ready for Plan 04 (remaining foundation tasks) and Phase 02 (ingest pipeline)
- OpenSearch index mapping locked with `dynamic: false` -- prevents auto-mapping pitfall

## Self-Check: PASSED

All 3 created files verified on disk. All 3 task commits verified in git log.

---
*Phase: 01-foundation*
*Completed: 2026-03-22*
