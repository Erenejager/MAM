---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 01-03-PLAN.md
last_updated: "2026-03-22T21:56:33.257Z"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** Find any video in your library instantly — by title, keyword, tag, or spoken word in the transcript.
**Current focus:** Phase 01 — foundation

## Current Position

Phase: 01 (foundation) — EXECUTING
Plan: 4 of 4

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Pre-Phase 1]: Verify OpenSearch version running on server — `@opensearch-project/opensearch` client major version must match
- [Pre-Phase 1]: Verify ffmpeg version on server (`ffmpeg -version`) — confirm OGG/Opus encoding is available
- [Pre-Phase 2]: Confirm Groq free tier rate limits (requests/min, requests/day) — affects queue concurrency and retry strategy
- [Pre-Phase 2]: Test Groq 25 MB limit with a real audio file to confirm OGG extraction size is within bounds

## Session Continuity

Last session: 2026-03-22T21:52:00Z
Stopped at: Completed 01-03-PLAN.md
Resume file: None
