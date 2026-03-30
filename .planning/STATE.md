---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 03-05-PLAN.md
last_updated: "2026-03-30T10:33:50.843Z"
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 15
  completed_plans: 15
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** Find any video in your library instantly — by title, keyword, tag, or spoken word in the transcript.
**Current focus:** Phase 03 — browse-and-playback

## Current Position

Phase: 03 (browse-and-playback) — COMPLETE
Plan: 5 of 5

## Performance Metrics

**Velocity:**

- Total plans completed: 3
- Average duration: 5 min
- Total execution time: 0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: none yet
- Trend: —

*Updated after each plan completion*

| Phase 01-foundation P01 | 3 min | 2 tasks | 11 files |
| Phase 01-foundation P02 | 8 min | 2 tasks | 11 files |
| Phase 01-foundation P03 | 3 min | 3 tasks | 3 files |
| Phase 02-ingest-pipeline P01 | 3 min | 2 tasks | 7 files |
| Phase 03 P02 | 2 | 2 tasks | 8 files |
| Phase 03-browse-and-playback P01 | 3 | 2 tasks | 3 files |
| Phase 02 P02 | 1 | 2 tasks | 2 files |
| Phase 02 P03 | 1 | 2 tasks | 4 files |
| Phase 03 P04 | 5 | 3 tasks | 5 files |
| Phase 04 P01 | 3 | 2 tasks | 7 files |
| Phase 04 P02 | 3 | 3 tasks | 6 files |
| Phase 04-metadata-editing P03 | 4 | 3 tasks | 6 files |
| Phase 03 P05 | 1 | 2 tasks | 3 files |

## Accumulated Context

### Decisions

| Decision | Detail |
|----------|--------|
| Transcription | Groq API (Whisper large-v3) — NOT local Whisper/whisper.cpp |
| Audio pre-extraction | Mandatory before every Groq call — ffmpeg extracts 16kHz mono OGG; Groq 25 MB limit |
| Groq rate limits | Handle 429 with exponential backoff retry in the job queue |
| Deployment | Hetzner Cloud VPS — 24/7, accessible from anywhere |
| Access | Tailscale only — server not exposed to public internet |
| Authentication | None in-app — Tailscale IS the auth layer |
| Storage | Hetzner server local disk at STORAGE_ROOT (e.g. `/mnt/mam/`) |
| SQLite location | `~/.mam/mam.db` — outside STORAGE_ROOT |
| ffmpeg | System-installed via apt-get — NOT @ffmpeg-installer/ffmpeg npm package |
| Job queue | p-queue (in-process) — Groq is fast async HTTP, no Redis/BullMQ needed |
| File paths in DB | Relative to STORAGE_ROOT — never absolute |
| OpenSearch | Already running on same Hetzner server — client version must match server version |
| OpenSearch mapping | Must be defined BEFORE first document insert — `dynamic: false` after initial mapping |
| CORS | Only needed in local development (Vite dev server vs Fastify port) — not in production |
| Tags storage | Denormalized JSON array column in assets table (`tags TEXT DEFAULT '[]'`); use SQLite json_each() for filtering. No separate tags table. Consistent with overall schema philosophy. |
| Ingest status updates | Polling via TanStack Query `refetchInterval` (3-5s while status !== 'ready'). SSE deferred to v2. No additional infrastructure needed. |
| Video player | Native HTML5 `<video>` with custom controls overlay built in shadcn + Tailwind + Framer Motion. NOT Video.js — custom controls integrate better with Cinema Dark design system and MCP Magic component generation. Transcript seek uses `videoElement.currentTime` directly. |
| Tailwind version | Use Tailwind CSS 3.x — shadcn/ui and MCP Magic 21st.dev components target Tailwind 3 config format. Tailwind 4 uses a breaking CSS-based config; do not upgrade until shadcn/ui officially supports it. |
| SQL schema additions | Assets table requires: `file_hash TEXT UNIQUE` (SHA-256 for dedup), `frame_rate REAL` (META-01), `transcription_error TEXT` (error tracking). All added in Phase 1 migration. |

- [Phase 01-foundation]: Manually created Vite project files instead of npm create vite for precise version control
- [Phase 01-foundation]: CJS format (.cjs) for Tailwind and PostCSS configs per Tailwind 3 compatibility
- [Phase 01-foundation]: Node 22 required for better-sqlite3 native compilation (Node 24 lacks prebuilt binaries)
- [Phase 01-foundation]: Drizzle ORM v0.36 composite primary key uses object return syntax, not array
- [Phase 01-foundation]: OpenSearch connection failure is warning-only, not fatal -- server continues without search
- [Phase 01-foundation]: Boot sequence: dotenv -> validateEnv -> db -> opensearch -> cors -> listen
- [Phase 02-ingest-pipeline]: saveAndHash returns {hash, size} object -- avoids extra fs.stat after write
- [Phase 02-ingest-pipeline]: p-queue needs explicit InstanceType<typeof PQueue> annotation for TS portability
- [Phase 03]: TanStack Query v5 refetchInterval uses callback form — stops polling automatically when status leaves ingesting
- [Phase 03]: API base path '/api' without port — works via Vite proxy in dev and directly in production
- [Phase 03]: Query key conventions: ['assets'] list, ['assets', id] single, ['tags'] tag counts
- [Phase 03-browse-and-playback]: Use db.$client.prepare().all() for json_each aggregation — Drizzle 0.36 cannot express GROUP BY on virtual json_each table
- [Phase 03-browse-and-playback]: Tag AND-filtering via COUNT(DISTINCT value) FROM json_each WHERE value IN (...) = N handles duplicates correctly
- [Phase 02]: Hard failure on metadata/thumbnail deletes asset dir and DB record — no orphans
- [Phase 02]: Soft failure on transcription/search — asset remains usable, status marked failed/skipped
- [Phase 02]: Single ImportView component manages all states via discriminated union rather than separate components
- [Phase 03]: Shared videoRef passed from DetailPanel to both VideoPlayer and TranscriptList for transcript sync
- [Phase 04]: Partial OpenSearch update on PATCH (opensearchClient.update with doc merge) avoids re-reading transcript blob
- [Phase 04]: Custom value upsert uses raw SQL ON CONFLICT DO UPDATE since Drizzle 0.36 lacks native upsert for composite PKs
- [Phase 04]: No putMapping needed for description -- field was already in INDEX_MAPPING since Phase 1
- [Phase 04]: Used Tailwind motion-reduce utility instead of framer-motion useReducedMotion for CSS transitions
- [Phase 04]: TagEditor uses local state synced from props for optimistic updates with revert-on-error
- [Phase 04]: View switching via useState in App.tsx — no react-router needed for two views
- [Phase 03]: Explicit createdAt at insert time instead of migration fix -- avoids db:generate/db:migrate cycle

### Pending Todos

None yet.

### Blockers/Concerns

- [Pre-Phase 1]: Verify OpenSearch version running on server — `@opensearch-project/opensearch` client major version must match
- [Pre-Phase 1]: Verify ffmpeg version on server (`ffmpeg -version`) — confirm OGG/Opus encoding is available
- [Pre-Phase 2]: Confirm Groq free tier rate limits (requests/min, requests/day) — affects queue concurrency and retry strategy
- [Pre-Phase 2]: Test Groq 25 MB limit with a real audio file to confirm OGG extraction size is within bounds

## Session Continuity

Last session: 2026-03-30T10:33:50.838Z
Stopped at: Completed 03-05-PLAN.md
Resume file: None
