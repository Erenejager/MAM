---
phase: 02-ingest-pipeline
plan: 02
subsystem: api
tags: [ffprobe, ffmpeg, groq, whisper, opensearch, fluent-ffmpeg, pipeline]

# Dependency graph
requires:
  - phase: 02-ingest-pipeline/01
    provides: "Upload route, saveAndHash, pipelineQueue, DB schema with status columns"
provides:
  - "runPipeline function — full 4-stage ingest pipeline (ffprobe, thumbnail, transcription, search indexing)"
  - "Per-stage status tracking with hard/soft failure semantics"
  - "Groq transcription with 16kHz mono OGG extraction and retry on 429"
  - "OpenSearch document indexing with graceful degradation"
affects: [03-browse-and-playback, 04-search-and-filter, 05-detail-view]

# Tech tracking
tech-stack:
  added: [groq-sdk, fluent-ffmpeg]
  patterns: [sequential-pipeline-stages, hard-vs-soft-failure, per-stage-status-columns, withRetry-exponential-backoff]

key-files:
  created:
    - backend/src/lib/pipeline.ts
  modified:
    - backend/src/routes/assets.ts

key-decisions:
  - "Hard failure on metadata/thumbnail deletes asset dir and DB record — no orphans"
  - "Soft failure on transcription/search — asset remains usable, status marked failed/skipped"
  - "GROQ_API_KEY guard: sets transcriptionStatus='skipped' when env var absent"
  - "Temp OGG audio file deleted in finally block — no disk leaks"

patterns-established:
  - "Pipeline stage pattern: update status to processing -> execute -> update status to complete/failed"
  - "Hard vs soft failure: stages 1-2 are hard (cleanup + return), stages 3-4 are soft (mark failed + continue)"
  - "withRetry pattern: exponential backoff on HTTP 429 with configurable max attempts"

requirements-completed: [IMP-03, META-01]

# Metrics
duration: 1min
completed: 2026-03-26
---

# Phase 02 Plan 02: Ingest Pipeline Summary

**4-stage sequential pipeline: ffprobe metadata extraction, ffmpeg thumbnail generation, Groq Whisper transcription with retry, and OpenSearch indexing with hard/soft failure semantics**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-26T15:26:19Z
- **Completed:** 2026-03-26T15:27:16Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Implemented full ingest pipeline with ffprobe metadata extraction (duration, codec, resolution, frame rate, bitrate)
- Thumbnail generation via ffmpeg at 5s or 10% of duration, 360p height
- Groq Whisper transcription with 16kHz mono OGG extraction, retry on 429, and GROQ_API_KEY guard
- OpenSearch document indexing with graceful degradation on connection failure
- Hard failure semantics for metadata/thumbnail (cleanup disk + DB), soft failure for transcription/search

## Task Commits

Each task was committed atomically:

1. **Task 1: Create pipeline.ts with all 4 stages** - `388cf97` (feat) — pipeline.ts already existed from prior execution
2. **Task 2: Wire runPipeline into assets.ts** - `388cf97` (feat) — import already wired from prior execution

**Note:** Both tasks were committed together in a single commit during a prior execution session.

## Files Created/Modified
- `backend/src/lib/pipeline.ts` - Full ingest pipeline: probeFile, captureThumbnail, transcribeWithGroq, indexInOpenSearch, runPipeline orchestrator
- `backend/src/routes/assets.ts` - Import runPipeline from pipeline.ts (replaced stub)

## Decisions Made
- Hard failure on metadata/thumbnail: deletes asset directory and DB record to prevent orphans
- Soft failure on transcription/search: marks status as failed/skipped, pipeline continues
- GROQ_API_KEY guard: sets transcriptionStatus to 'skipped' when environment variable is absent
- Temporary OGG audio file is always cleaned up in finally block to prevent disk leaks
- Thumbnail captured at min(5s, 10% of duration) at 360p height for consistent sizing

## Deviations from Plan

None - plan executed exactly as written. Both files matched the plan specification exactly.

## Issues Encountered

None - code was already implemented and committed from a prior session. Verification confirmed TypeScript compiles clean and all tests pass.

## User Setup Required

**External services require manual configuration:**
- `GROQ_API_KEY` must be set in `backend/.env` for transcription to run (without it, transcriptionStatus will be 'skipped')
- OpenSearch must be running and `OPENSEARCH_URL` must be set for search indexing (without it, searchIndexStatus will be 'failed' but app continues)

## Next Phase Readiness
- Pipeline is complete: uploads trigger real processing through all 4 stages
- Browse/playback phase can rely on populated metadata, thumbnails, and transcript data
- Search phase can rely on OpenSearch document indexing

---
*Phase: 02-ingest-pipeline*
*Completed: 2026-03-26*
