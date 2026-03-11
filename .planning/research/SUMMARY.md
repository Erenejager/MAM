# Project Research Summary

**Project:** MAM — Media Asset Management
**Domain:** Personal/prosumer local video library with AI transcription
**Researched:** 2026-03-11
**Confidence:** MEDIUM

## Executive Summary

MAM is a single-user, local-first video asset management tool — a category occupied by tools like Adobe Bridge, Kyno, and Silverstack, but with a distinctive angle: offline AI transcription (Whisper) combined with full-text search over spoken content via OpenSearch. The research consistently confirms that no personal/prosumer tool in this space currently combines local offline video browsing with privacy-preserving auto-transcription and full-text search over spoken words. This is the genuine competitive moat, and every architectural and feature decision should protect it.

The recommended approach is a monorepo with a React 18 + Vite frontend (Cinema Dark design system with Tailwind + shadcn/ui) backed by a Fastify Node.js API server, SQLite for authoritative metadata storage, OpenSearch for the search index, and whisper.cpp (or the openai-whisper CLI) running as a background child process managed by a simple in-process job queue (p-queue). The ingest pipeline — ffprobe for metadata extraction, ffmpeg for thumbnail generation, Whisper for transcription, and OpenSearch for indexing — is the core architectural unit and must be designed as an ordered state machine with per-stage failure handling from day one.

The most critical risks are all centered on the ingest pipeline: blocking the Node.js event loop with synchronous Whisper invocations, OOM-killing Whisper on large files by not pre-extracting audio, locking in wrong OpenSearch field type mappings at first document insert, and building an ingest pipeline without idempotency that leaves orphaned assets after crashes. These are not speculative concerns — each is a rewrite-forcing failure mode if not addressed in Phase 1 and Phase 2. Address them as foundational decisions, not as retrofits.

---

## Key Findings

### Recommended Stack

The frontend stack is pre-specified by project constraints: React 18, Vite 5, TypeScript 5, Tailwind CSS 3, shadcn/ui, Framer Motion 11, and Lucide React. These are compatible, well-integrated, and the right choices for the Cinema Dark design system. The only decision to verify is whether React 19, Vite 6, or Tailwind 4 have gone stable and are preferable over the 18/5/3 versions — check npm before pinning.

The backend is Fastify 4 (preferred over Express 5 for built-in JSON schema validation and better async ergonomics), better-sqlite3 for SQLite (synchronous, predictable, zero-infrastructure), and the official `@opensearch-project/opensearch` client (version must match the locally-running OpenSearch instance). Video is served via HTTP range requests from the API server — no separate nginx needed. Transcription uses whisper.cpp or the openai-whisper CLI via `child_process.spawn`. Thumbnails and audio extraction use fluent-ffmpeg + @ffmpeg-installer/ffmpeg.

**Core technologies:**
- React 18 + Vite 5 + TypeScript 5: Frontend — concurrent UI, fast HMR, type safety across API boundary
- Fastify 4: API server — schema validation, better async model than Express
- better-sqlite3: Metadata store — synchronous, zero-infrastructure, single-file backup
- @opensearch-project/opensearch 2.x: Search index client — official, matches AWS OpenSearch 2.x API
- fluent-ffmpeg + @ffmpeg-installer/ffmpeg: Thumbnail extraction, audio extraction, metadata probing
- whisper.cpp (via child_process): CPU-efficient local transcription, no Python runtime in production
- p-queue: In-process job queue — zero infrastructure, concurrency control, swap to BullMQ later if durability becomes a requirement
- TanStack Query 5: Frontend server state — replaces manual useEffect + useState for API calls, handles loading/error/refetch

**Key tradeoffs resolved by research:**
- Fastify over Express: schema validation is worth the migration from Express default
- p-queue over BullMQ: Redis dependency is unnecessary overhead for single-user local app; p-queue is the right starting point with a clear upgrade path
- SQLite over Postgres: zero concurrent write contention, no ops overhead, one-file backup
- whisper.cpp over openai-whisper Python: no Python runtime, faster CPU inference; use Python as fallback only if whisper.cpp won't compile

### Expected Features

**Must have (table stakes) — ship before anything else:**
- File import via drag-drop and picker, with deduplication (content hash)
- Auto-extracted technical metadata (duration, codec, resolution, frame rate via ffprobe)
- Thumbnail generation (ffmpeg, at 10% of duration or thumbnail=300 filter)
- Asset card grid view (thumbnail, title, duration, tags)
- Inline video playback (HTML5, range-request-backed streaming)
- Editable metadata: title, description, tags (multi-value)
- Full-text search across title, description, tags via OpenSearch
- Tag browse/filter sidebar
- Persistent library state (SQLite survives restarts)
- Delete/remove asset (offer "remove from library" vs "delete file")

**Should have (differentiators) — ship in v1 after core is stable:**
- Auto-transcription with Whisper (background job, progress indicator)
- Transcript viewer panel with jump-to-timestamp (click line, player seeks)
- Transcript-in-search results (highlighted snippet with timecode link)
- Custom global metadata field schema (schema-defined, not per-asset)
- Import job queue progress indicator (per-stage status: metadata, thumbnail, transcription, indexing)
- Bulk tag editing

**Defer (v2+):**
- Bulk sort/filter beyond tag sidebar (compound filter logic)
- Configurable watch folder
- Waveform / hover-scrub thumbnail strip
- SRT/VTT export
- Collections / smart folders
- Any AI feature beyond Whisper transcription

**Confirmed anti-features for v1:** multi-user auth, cloud sync, video editing/trimming, facial recognition, batch AI suggestions, responsive/mobile layout.

### Architecture Approach

The architecture separates three concerns cleanly: SQLite holds authoritative metadata (the system of record), OpenSearch holds a derived search index that must be rebuildable from SQLite at any time, and the local filesystem holds binary files (videos, thumbnails, transcripts). The React frontend communicates exclusively with the Fastify API server via REST — it never touches the filesystem, Whisper, or OpenSearch directly. The ingest pipeline is a sequential 4-stage job (ffprobe → ffmpeg thumbnail → Whisper transcription → OpenSearch indexing) managed by an in-process queue, with each stage tracked by its own SQLite status field so partial success is preserved and failures are recoverable without full re-import.

**Major components:**
1. React Frontend — UI, search queries, video playback, metadata editing (talks only to API server)
2. Fastify API Server — route handling, ingest orchestration, video streaming, static file serving (mediates all access to DB, queue, filesystem)
3. SQLite (better-sqlite3) — authoritative metadata store, job status tracking, custom field schema
4. p-queue (in-process) — job concurrency control: 1 concurrent Whisper job, up to 4 concurrent ffprobe/ffmpeg jobs
5. whisper.cpp / openai-whisper CLI — spawned as child_process, stdout captured as JSON transcript segments
6. fluent-ffmpeg (ffprobe + ffmpeg) — metadata extraction, thumbnail generation, audio pre-extraction for Whisper
7. OpenSearch — full-text search index, derived from SQLite; never used as primary data store
8. Local Filesystem — STORAGE_ROOT (env var) with subdirectories: /videos, /thumbnails, /transcripts

### Critical Pitfalls

1. **Missing HTTP range request support on video endpoint** — Use `res.sendFile()` or proper `206 Partial Content` responses; never pipe `fs.createReadStream` directly to `res`. Test video seeking on the first day of implementation — this is a day-1 correctness requirement, not a polish item.

2. **Synchronous Whisper invocation blocks the event loop** — Always use `child_process.spawn` (async), never `execSync` or `spawnSync`. Enforce 1 concurrent Whisper process via p-queue concurrency limit. Respond 202 immediately after file copy + SQLite record creation; all pipeline work is async.

3. **Whisper OOM-kills on large video files** — Pre-extract audio to 16kHz mono WAV using ffmpeg before passing to Whisper. Whisper loads the entire decoded audio into RAM; passing a 2-hour 4K video directly can consume 4-8 GB RAM and trigger an OOM kill with no error surface to the user.

4. **OpenSearch dynamic mapping locks in wrong field types at first document** — Define an explicit index mapping before inserting any document. Map `tags` as `keyword`, `duration` as `float`, `transcript` as `text`. Set `dynamic: false` after initial mapping. This is a Phase 1 foundational decision — changing field types after data exists requires full delete-and-reindex.

5. **Ingest pipeline has no idempotency or failure recovery** — Model each pipeline stage with independent status fields in SQLite (`metadata_status`, `thumbnail_status`, `transcription_status`, `search_index_status`). Make each stage idempotent (check if output already exists before running). Implement a startup check that resumes `pending` or `running` jobs. Use content hash for deduplication at import.

**Additional pitfalls requiring early attention:**
- CORS misconfiguration breaks multipart upload preflights (Phase 1 — use `cors` package with explicit OPTIONS handler)
- Large file uploads hit Express/Fastify body size defaults (Phase 2 — use multer with disk storage, set a high file size limit)
- File path portability failures (Phase 1 — store paths relative to STORAGE_ROOT, never absolute)
- Whisper model not pre-downloaded at first run (Phase 1 — validate model presence at startup, include setup step)

---

## Implications for Roadmap

Based on the combined research, the architecture's own dependency graph strongly dictates a 6-phase structure. The ARCHITECTURE.md researcher independently derived the same phase order that the PITFALLS.md researcher flags as correctness-critical. This convergence increases confidence in the suggested structure.

### Phase 1: Foundation and Infrastructure

**Rationale:** Every subsequent phase depends on correct foundational decisions. The pitfalls that cause rewrites (OpenSearch mapping, absolute file paths, CORS, Whisper model setup) must be addressed before any feature work starts. This phase has no user-visible features but determines whether later phases need to be rebuilt.

**Delivers:** Project scaffolding (Vite + React + TypeScript frontend, Fastify backend), SQLite schema with migrations, STORAGE_ROOT env config with validation on startup, OpenSearch index with explicit mapping (before first document), CORS configured correctly with OPTIONS preflight support, Whisper model presence check and setup step, health check endpoint.

**Addresses:** Storage design, database schema, search index initialization.

**Avoids:** Pitfall 4 (dynamic OpenSearch mapping), Pitfall 9 (absolute file paths), Pitfall 11 (CORS misconfiguration), Pitfall 10 (missing Whisper model on first run).

**Research flag:** Standard patterns — skip phase research. SQLite schema design, Fastify scaffolding, OpenSearch index creation, and CORS configuration are all well-documented.

---

### Phase 2: Ingest Pipeline (Backend Only)

**Rationale:** The ingest pipeline is the core technical risk. It involves 3 external processes (ffprobe, ffmpeg, Whisper), a job queue, async child process management, and multi-stage failure handling. Building and testing it via API calls (curl/Postman) before any UI exists is faster and safer — fewer moving parts to debug.

**Delivers:** `POST /assets/ingest` endpoint (file copy + 202 response + SQLite record), p-queue setup with concurrency limits (1 Whisper, 4 ffprobe/ffmpeg), ffprobe stage (metadata → SQLite), ffmpeg stage (thumbnail → filesystem + SQLite), Whisper stage (audio pre-extraction to WAV, then transcription → SQLite), OpenSearch indexing stage, per-stage status fields, idempotency checks per stage, startup resume of interrupted jobs.

**Addresses:** File import, auto-extracted technical metadata, thumbnail generation, auto-transcription, import job queue tracking.

**Avoids:** Pitfall 1 (needs HTTP range requests — but that's Phase 3), Pitfall 2 (async Whisper), Pitfall 3 (audio pre-extraction), Pitfall 5 (idempotent pipeline with state machine), Pitfall 6 (thumbnail filter instead of fixed timestamp), Pitfall 7 (check output file exists, not just exit code), Pitfall 12 (multer disk storage, no body size limit for video routes).

**Research flag:** Needs phase research. The Whisper child_process integration pattern (stdout parsing, error detection, model path handling) and the p-queue setup for mixed I/O-bound + CPU-bound jobs benefit from specific implementation research before coding.

---

### Phase 3: Browse and Playback UI

**Rationale:** With ingest working, there is real data to display. The browse UI can be built against actual ingested assets rather than mocked data. Video streaming must be implemented correctly here — it is a correctness requirement that affects the entire user experience.

**Delivers:** `GET /assets` list endpoint, `GET /assets/:id` detail endpoint, `GET /stream/:id` endpoint with proper HTTP range request support (206 Partial Content), thumbnail static file route, React asset grid with cards (thumbnail, title, duration, tags), video player component (Video.js or HTML5 `<video>` with range request backend), tag filter sidebar, status polling for in-progress ingest jobs.

**Addresses:** Asset card grid view, inline video playback, tag browsing, persistent library state display.

**Avoids:** Pitfall 1 (range request support — this is where it gets implemented), Pitfall 14 (video player src cleared and paused on unmount).

**Research flag:** Standard patterns for most components. Video.js integration with a range-request backend is well-documented. The only nuance is the range request implementation in Fastify — verify the `@fastify/static` plugin handles this correctly vs. a hand-rolled stream endpoint.

---

### Phase 4: Metadata Editing and Custom Fields

**Rationale:** With browse working, users need to annotate assets. Custom fields must be designed with stable UUIDs as keys (not labels) from the start — retrofitting this schema decision is painful.

**Delivers:** `PUT /assets/:id` metadata update endpoint, `POST /fields` and `GET /fields` custom field schema endpoints, `asset_custom_values` table populated and queryable, inline editing UI in detail panel (title, description, tags, custom fields), async OpenSearch update queued after SQLite write (not synchronous on every edit).

**Addresses:** Editable metadata, custom global metadata field schema.

**Avoids:** Pitfall 5 (OpenSearch indexed async after SQLite write), Pitfall 15 (field UUID as key, label as display only — not the reverse).

**Research flag:** Standard patterns — skip phase research. REST metadata editing and SQLite schema updates are well-documented patterns with no significant unknowns.

---

### Phase 5: Transcript Viewer and Jump-to-Moment

**Rationale:** Whisper transcription runs in the Phase 2 pipeline, but the UI to surface transcripts comes here. This is the primary differentiator feature. It requires synchronized player state + transcript panel, which is a frontend-specific integration concern.

**Delivers:** Transcript display panel in the asset detail view (scrolling transcript with timecode markers), player seek integration (click a transcript line, player seeks to that timestamp), transcript status indicator (pending/running/complete/failed per asset), `GET /assets/:id/transcript` endpoint returning segments with timestamps, OpenSearch transcript segment storage for snippet highlighting.

**Addresses:** Auto-transcription with progress indicator, transcript viewer panel, jump-to-transcript-moment.

**Avoids:** Pitfall 13 (use `_source_excludes` in search queries; store full transcript in SQLite, not OpenSearch).

**Research flag:** Needs phase research. The synchronized player + transcript panel interaction (scroll sync on playback, highlight active segment, seek on click) requires specific implementation research. This is the most UI-complex feature in the product.

---

### Phase 6: Search

**Rationale:** Search is last because it depends on indexed data from all prior stages. Building search before transcription exists would test against incomplete data and create a false sense of completeness. With real transcripts and metadata in OpenSearch, search can be tested against production-representative data.

**Delivers:** `GET /search?q=` API endpoint (OpenSearch multi_match across title, description, tags, transcript), search bar UI with results display, transcript snippet highlighting in results with timecode links, tag filter in search results, re-index endpoint for existing assets (`POST /reindex`), delete/remove asset endpoint (`DELETE /assets/:id`).

**Addresses:** Full-text search, transcript-in-search results, tag filter sidebar in search, delete/remove asset.

**Avoids:** Pitfall 8 (SQLite is source of truth; OpenSearch is rebuilt on demand via reindex endpoint), Pitfall 13 (exclude transcript from search result documents; return only highlighted snippets).

**Research flag:** Standard patterns for most of this phase. OpenSearch multi_match queries and highlight API are well-documented. The snippet highlighting with timecode link-back to the player is a custom UI integration — consider specific research on the OpenSearch highlight API configuration.

---

### Phase Ordering Rationale

- Phase 1 before everything: foundational decisions (OpenSearch mapping, file path design, CORS) that cannot be retrofitted without rewrites.
- Phase 2 before Phase 3: you need ingested assets with thumbnails before the browse UI has anything to display.
- Phase 3 before Phase 4: browsing must work before editing is useful — editing an asset you can't find or play is useless.
- Phase 5 after Phase 2: Whisper runs in the Phase 2 pipeline; the transcript UI slots onto existing data. But the player + transcript sync is complex enough to isolate as its own phase.
- Phase 6 last: search quality depends on indexed transcript data from Phase 5. Testing search before transcripts exist produces misleading results and delays discovery of OpenSearch configuration issues.

### Research Flags

**Needs deeper research before coding:**
- Phase 2 (Ingest Pipeline): Whisper child_process integration — stdout JSON parsing, error detection without exit code, model path resolution across OS. The `nodejs-whisper` npm package vs. direct spawn tradeoff.
- Phase 5 (Transcript Viewer): Player + transcript scroll sync implementation. How to highlight the active transcript segment during playback. TanStack Query integration with a Video.js player ref.

**Standard patterns — skip research-phase:**
- Phase 1 (Foundation): Fastify scaffolding, SQLite schema, Vite + React setup, CORS — all well-documented.
- Phase 3 (Browse/Playback): Asset grid, TanStack Query data fetching, static file routes — standard patterns. Verify @fastify/static range request support.
- Phase 4 (Metadata Editing): REST CRUD, SQLite updates, form state — no unknowns.
- Phase 6 (Search): OpenSearch multi_match and highlight API — well-documented. Custom timecode link UI is straightforward.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Core choices (React, Fastify, SQLite, fluent-ffmpeg) are stable and well-validated. Version numbers need npm verification — some packages (React, Vite, Fastify, Tailwind) may have released new major versions since August 2025 cutoff. The @opensearch-project/opensearch client version must match the locally-running OpenSearch instance exactly. |
| Features | HIGH | Feature list draws directly from PROJECT.md constraints and direct knowledge of competing products (Bridge, Kyno, Silverstack, Jellyfin). The local-Whisper + transcript-search gap in the market is well-established. Anti-features are clearly justified by scope. |
| Architecture | HIGH | SQLite-as-source-of-truth, OpenSearch-as-derived-index, and async ingest pipeline patterns are canonical for this class of application. Range request streaming, p-queue concurrency control, and ffprobe/ffmpeg CLI patterns are stable and well-documented. The 6-phase build order is independently confirmed by both ARCHITECTURE.md and PITFALLS.md research. |
| Pitfalls | HIGH for structural pitfalls, MEDIUM for specifics | HTTP range request behavior (MDN-confirmed), event loop blocking (Node.js official docs-confirmed), OpenSearch dynamic mapping (well-established behavior), CORS preflight (W3C spec-confirmed) are HIGH confidence. Whisper OOM behavior and ffmpeg codec edge cases are MEDIUM — architecture is publicly documented but specific thresholds vary by hardware. |

**Overall confidence:** MEDIUM-HIGH

The structural decisions (architecture, feature scope, phase order) are HIGH confidence. The specific version numbers in the stack are MEDIUM confidence and require npm verification before pinning in package.json.

### Gaps to Address

- **Version pinning:** All package versions come from training knowledge (August 2025 cutoff). Before writing package.json, check npm for: react, vite, fastify, tailwindcss, framer-motion, @opensearch-project/opensearch, bullmq, video.js, @tanstack/react-query. The OpenSearch client version is a hard compatibility constraint — it must match the major version of the locally-running OpenSearch instance.

- **whisper.cpp vs openai-whisper decision:** Research recommends whisper.cpp (no Python runtime, faster CPU), but the compilation step may be nontrivial on Windows (the development environment is Windows 11). Evaluate `nodejs-whisper` npm package and `openai-whisper` CLI as fallbacks before committing to whisper.cpp. This decision affects Phase 2 planning.

- **Codec compatibility scope:** HTML5 `<video>` handles H.264/AAC MP4 universally, but HEVC/AV1/MKV support varies by browser. The research recommends serving source files as-is and documenting limitations for MVP. Decide explicitly whether any transcode-to-H.264 fallback is in v1 scope before Phase 3 begins.

- **BullMQ vs p-queue final decision:** Research recommends p-queue for MVP with a clear upgrade path to BullMQ. This decision should be finalized during Phase 2 planning — if the team has Redis available locally and wants job persistence from day one, BullMQ is the right choice. If Redis adds friction, p-queue is correct.

- **Video.js vs Media Chrome:** Research notes that `media-chrome` was gaining traction as of mid-2025 as a potential successor to Video.js for custom-skinned players. Verify current npm download trends and maintenance status before committing to Video.js 8.x in Phase 3.

---

## Sources

### Primary (HIGH confidence)
- PROJECT.md — project constraints, out-of-scope declarations, design system specifications
- MDN Web Docs: HTTP Range Requests — range request behavior, 206 Partial Content requirements
- Node.js official docs: "Don't Block the Event Loop" — async child_process patterns
- OpenSearch/Elasticsearch documentation: dynamic mapping behavior, field type constraints
- W3C CORS specification — preflight request behavior

### Secondary (MEDIUM confidence)
- Training knowledge of Adobe Bridge CC 2024, Kyno 2.x, Silverstack Lab 7, Jellyfin 10.x, Immich 1.x feature sets — competitive analysis
- Whisper architecture documentation (public) — memory usage, model loading behavior
- ffmpeg documentation — thumbnail filter, audio extraction patterns
- Express.js performance best practices — multer disk storage, body size limits

### Tertiary (LOW confidence — verify before use)
- Package version numbers for all npm dependencies — verify against current npm registry before pinning
- whisper.cpp CPU performance benchmarks — verify against current release and hardware

---

*Research completed: 2026-03-11*
*Ready for roadmap: yes*
