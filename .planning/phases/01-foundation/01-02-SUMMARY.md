---
phase: 01-foundation
plan: 02
subsystem: database
tags: [fastify, typescript, sqlite, drizzle-orm, better-sqlite3]

# Dependency graph
requires: []
provides:
  - Fastify 4 HTTP server with /api/health endpoint
  - SQLite database schema (assets, custom_fields, asset_custom_values)
  - Drizzle ORM connection with WAL mode and foreign keys
  - Initial SQL migration for all three tables
  - Backend project structure with TypeScript + tsx dev tooling
affects: [01-03, 01-04, 02-ingest, 03-browse, 04-metadata, 05-transcript, 06-search]

# Tech tracking
tech-stack:
  added: [fastify ^4, better-sqlite3 ^11, drizzle-orm ^0.36, drizzle-kit ^0.28, tsx ^4, dotenv ^16, "@fastify/cors ^9", "@fastify/static ^7", "@opensearch-project/opensearch ^2"]
  patterns: [ESM modules with NodeNext resolution, WAL journal mode for SQLite, tilde-expansion for DATABASE_PATH]

key-files:
  created:
    - backend/package.json
    - backend/tsconfig.json
    - backend/src/index.ts
    - backend/src/db/schema.ts
    - backend/src/db/index.ts
    - backend/src/db/migrate.ts
    - backend/drizzle.config.ts
    - backend/drizzle/0000_clever_firelord.sql
    - backend/.env.example
    - backend/.nvmrc
    - backend/.gitignore
  modified: []

key-decisions:
  - "Node 22 required — better-sqlite3 native compilation needs build tools; Node 22 has prebuilt binaries available"
  - "Drizzle ORM composite primary key uses object return syntax (not array) in v0.36"

patterns-established:
  - "Database path: tilde-expanded DATABASE_PATH env var, defaults to ~/.mam/mam.db"
  - "SQLite pragmas: WAL journal mode + foreign keys ON at connection init"
  - "ESM project with type: module in package.json, .js extensions in imports"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-03-22
---

# Phase 01 Plan 02: Backend + Database Setup Summary

**Fastify 4 server with SQLite via better-sqlite3 + drizzle-orm, full 25-column assets schema with file_hash, frame_rate, and transcription_error columns**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-22T21:38:55Z
- **Completed:** 2026-03-22T21:46:26Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Fastify 4 backend with health check endpoint returning JSON at /api/health
- Complete SQLite schema matching architecture spec: assets (25 columns), custom_fields, asset_custom_values with composite primary key
- Drizzle ORM migration generated and verified on fresh database
- All critical columns present: file_hash (dedup), frame_rate (META-01), transcription_error (error tracking)

## Task Commits

Each task was committed atomically:

1. **Task 1: Initialize Fastify 4 + TypeScript backend project** - `3ff5829` (feat)
2. **Task 2: Define SQLite schema with drizzle-orm and generate initial migration** - `7e56566` (feat)

## Files Created/Modified
- `backend/package.json` - Dependencies and scripts for Fastify + drizzle backend
- `backend/tsconfig.json` - TypeScript config targeting ES2022 with NodeNext modules
- `backend/src/index.ts` - Fastify server entry point with /api/health endpoint
- `backend/src/db/schema.ts` - Drizzle ORM schema for assets, custom_fields, asset_custom_values
- `backend/src/db/index.ts` - Database connection with WAL mode, foreign keys, tilde-expanded path
- `backend/src/db/migrate.ts` - Migration runner script
- `backend/drizzle.config.ts` - Drizzle Kit configuration for SQLite dialect
- `backend/drizzle/0000_clever_firelord.sql` - Initial migration SQL with all CREATE TABLE statements
- `backend/.env.example` - All 6 required environment variables documented
- `backend/.nvmrc` - Node 22 version pinning
- `backend/.gitignore` - Excludes node_modules, dist, *.db, .env

## Decisions Made
- Used Node 22 instead of Node 24 — better-sqlite3 requires native compilation and Node 24 has no prebuilt binaries; Node 22 (LTS) has prebuilts available
- Drizzle ORM v0.36 composite primary key syntax uses object return `(table) => ({})` not array return `(table) => []`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched to Node 22 for better-sqlite3 compilation**
- **Found during:** Task 1 (npm install)
- **Issue:** Node 24.13.0 lacks prebuilt binaries for better-sqlite3, and build-essential (make/gcc) is not installed; no sudo access to install them
- **Fix:** Installed Node 22 via nvm which has prebuilt binaries for better-sqlite3; added .nvmrc to pin Node 22
- **Files modified:** backend/.nvmrc (created)
- **Verification:** npm install completes successfully, better_sqlite3.node binary present
- **Committed in:** 3ff5829 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed drizzle-orm composite primary key syntax**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** Drizzle ORM v0.36 expects extraConfig to return an object (`SQLiteTableExtraConfig`), not an array; `(table) => [primaryKey(...)]` fails type checking
- **Fix:** Changed to `(table) => ({ pk: primaryKey(...) })` object syntax
- **Files modified:** backend/src/db/schema.ts
- **Verification:** npx tsc --noEmit passes clean
- **Committed in:** 7e56566 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed exported variable type annotation for better-sqlite3**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** Exported `sqlite` variable failed TS4023 — cannot name type from external module
- **Fix:** Added explicit `DatabaseType` import and type annotation on the sqlite const
- **Files modified:** backend/src/db/index.ts
- **Verification:** npx tsc --noEmit passes clean
- **Committed in:** 7e56566 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All auto-fixes necessary for correct compilation and dependency installation. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend project scaffolded and ready for API route development
- Database schema complete and migrations working
- Next plans can import from `backend/src/db/index.ts` and `backend/src/db/schema.ts`
- Server starts with `npm run dev` in the backend directory

## Self-Check: PASSED

All 11 files verified present. Both task commits (3ff5829, 7e56566) confirmed in git log. Migration SQL file exists.

---
*Phase: 01-foundation*
*Completed: 2026-03-22*
