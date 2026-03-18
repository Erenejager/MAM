# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** Find any video in your library instantly — by title, keyword, tag, or spoken word in the transcript.
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 6 (Foundation)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-03-18 — Architecture review complete, all decisions locked, ready to begin Phase 1 planning

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: — min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: none yet
- Trend: —

*Updated after each plan completion*

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Pre-Phase 1]: Verify OpenSearch version running on server — `@opensearch-project/opensearch` client major version must match
- [Pre-Phase 1]: Verify ffmpeg version on server (`ffmpeg -version`) — confirm OGG/Opus encoding is available
- [Pre-Phase 2]: Confirm Groq free tier rate limits (requests/min, requests/day) — affects queue concurrency and retry strategy
- [Pre-Phase 2]: Test Groq 25 MB limit with a real audio file to confirm OGG extraction size is within bounds

## Session Continuity

Last session: 2026-03-18
Stopped at: Architecture review complete. All decisions locked. No plans written yet.
Resume file: None
