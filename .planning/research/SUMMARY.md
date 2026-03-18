# Project Research Summary

**Project:** MAM — Media Asset Management
**Domain:** Personal/prosumer video library with AI transcription — Hetzner server deployment
**Researched:** 2026-03-18
**Confidence:** MEDIUM-HIGH

## Executive Summary

MAM is a single-user video asset management tool — a category occupied by tools like Adobe Bridge, Kyno, and Silverstack, but with a distinctive angle: auto-transcription via Groq API (Whisper large-v3) called as an async background job via groq-sdk and p-queue, combined with full-text search over spoken content via OpenSearch. The research consistently confirms that no personal/prosumer tool in this space currently combines local offline video browsing with auto-transcription and full-text search over spoken words. This is the genuine competitive moat, and every architectural and feature decision should protect it.

The recommended approach is a monorepo with a React 18 + Vite frontend (Cinema Dark design system with Tailwind + shadcn/ui) backed by a Fastify Node.js API server, SQLite for authoritative metadata storage, OpenSearch for the search index, and the Groq API (groq-sdk) for Whisper large-v3 transcription managed as async background jobs via p-queue. The ingest pipeline — ffprobe for metadata extraction, ffmpeg for thumbnail generation and audio pre-extraction, Groq API for transcription, and OpenSearch for indexing — is the core architectural unit and must be designed as an ordered state machine with per-stage failure handling from day one.

The most critical risks are all centered on the ingest pipeline: awaiting Groq API calls in the request handler instead of responding 202 immediately, sending video files directly to Groq without pre-extracting audio (Groq enforces a hard 25 MB upload limit), locking in wrong OpenSearch field type mappings at first document insert, and building an ingest pipeline without idempotency that leaves orphaned assets after crashes. These are not speculative concerns — each is a rewrite-forcing failure mode if not addressed in Phase 1 and Phase 2. Address them as foundational decisions, not as retrofits.

Architectural decisions are now locked: Groq API for transcription, Hetzner server for deployment, Tailscale for private network access.

---

## Key Findings

### Recommended Stack

The frontend stack is pre-specified by project constraints: React 18, Vite 5, TypeScript 5, Tailwind CSS 3, shadcn/ui, Framer Motion 11, and Lucide React. These are compatible, well-integrated, and the right choices for the Cinema Dark design system. The only decision to verify is whether React 19, Vite 6, or Tailwind 4 have gone stable and are preferable over the 18/5/3 versions — check npm before pinning.

The backend is Fastify 4 (preferred over Express 5 for built-in JSON schema validation and better async ergonomics), better-sqlite3 for SQLite (synchronous, predictable, zero-infrastructure), and the official `@opensearch-project/opensearch` client (version must match the locally-running OpenSearch instance). Video is served via HTTP range requests from the API server — nginx proxies the API and serves the frontend on the Hetzner server. Transcription uses the Groq API via groq-sdk with audio pre-extracted to OGG via ffmpeg. Thumbnails and audio extraction use fluent-ffmpeg + @ffmpeg-installer/ffmpeg.

**Core technologies:**
- React 18 + Vite 5 + TypeScript 5: Frontend — concurrent UI, fast HMR, type safety across API boundary
- Fastify 4: API server — schema validation, better async model than Express
- better-sqlite3: Metadata store — synchronous, zero-infrastructure, single-file backup
- @opensearch-project/opensearch 2.x: Search index client — official, matches AWS OpenSearch 2.x API
- fluent-ffmpeg + @ffmpeg-installer/ffmpeg: Thumbnail extraction, audio extraction (to OGG before Groq call), metadata probing
- groq-sdk: Groq API client for Whisper large-v3 transcription — async HTTP, no local compute, fast cloud inference
- p-queue: In-process job queue — concurrency control for Groq API rate limits and ffprobe/ffmpeg jobs
- TanStack Query 5: Frontend server state — replaces manual useEffect + useState for API calls, handles loading/error/refetch

**Key tradeoffs resolved by research:**
- Fastify over Express: schema validation is worth the migration from Express default
- p-queue over BullMQ: Groq API calls are fast async HTTP, not CPU-bound long-running processes. No Redis needed. p-queue provides rate-limit-safe concurrency control.
- SQLite over Postgres: zero concurrent write contention, no ops overhead, one-file backup
- Groq API over local Whisper: server deployment context; cloud inference is faster, simpler, and removes all local model management.

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
- Auto-transcription with Groq API (background job, progress indicator)
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
- Any AI feature beyond Groq transcription

**Confirmed anti-features for v1:** multi-user auth, cloud sync, video editing/trimming, facial recognition, batch AI suggestions, responsive/mobile layout.

### Architecture Approach

The architecture separates three concerns cleanly: SQLite holds authoritative metadata (the system of record), OpenSearch holds a derived search index that must be rebuildable from SQLite at any time, and the local filesystem holds binary files (videos, thumbnails, transcripts). The React frontend communicates exclusively with the Fastify API server via REST — it never touches the filesystem, Groq API, or OpenSearch directly. The ingest pipeline is a sequential 4-stage job (ffprobe → ffmpeg thumbnail → Groq API transcription → OpenSearch indexing) managed by an in-process queue, with each stage tracked by its own SQLite status field so partial success is preserved and failures are recoverable without full re-import.

**Major components:**
1. React Frontend — UI, search queries, video playback, metadata editing (talks only to API server)
2. Fastify API Server — route handling, ingest orchestration, video streaming, static file serving (mediates all access to DB, queue, filesystem)
3. SQLite (better-sqlite3) — authoritative metadata store, job status tracking, custom field schema
4. p-queue (in-process) — job concurrency control: 1 concurrent Groq transcription job, up to 4 concurrent ffprobe/ffmpeg jobs
5. groq-sdk — Groq API client; called as async HTTP after audio pre-extraction; stdout captured as JSON transcript segments
6. fluent-ffmpeg (ffprobe + ffmpeg) — metadata extraction, thumbnail generation, audio pre-extraction to OGG for Groq
7. OpenSearch — full-text search index, derived from SQLite; never used as primary data store
8. Local Filesystem — STORAGE_ROOT (env var) with subdirectories: /videos, /thumbnails, /transcripts
9. nginx (Hetzner server) — serves frontend static files, proxies API; provides same-origin for frontend + backend in production

### Critical Pitfalls

1. **Missing HTTP range request support on video endpoint** — Use `res.sendFile()` or proper `206 Partial Content` responses; never pipe `fs.createReadStream` directly to `res`. Test video seeking on the first day of implementation — this is a day-1 correctness requirement, not a polish item.

2. **Awaiting Groq API call in the request handler** — Respond 202 immediately after file copy + SQLite record creation. Enqueue Groq call as a background job via p-queue. Never await transcription in the request handler.

3. **Groq 25 MB file size limit** — Audio pre-extraction to 16kHz mono OGG via ffmpeg is MANDATORY before every Groq call. A 1-hour video becomes ~5 MB OGG. Delete the temp file in a `finally` block regardless of success or failure.

4. **OpenSearch dynamic mapping locks in wrong field types at first document** — Define an explicit index mapping before inserting any document. Map `tags` as `keyword`, `duration` as `float`, `transcript` as `text`. Set `dynamic: false` after initial mapping. This is a Phase 1 foundational decision — changing field types after data exists requires full delete-and-reindex.

5. **Ingest pipeline has no idempotency or failure recovery** — Model each pipeline stage with independent status fields in SQLite (`metadata_status`, `thumbnail_status`, `transcription_status`, `search_index_status`). Make each stage idempotent (check if output already exists before running). Implement a startup check that resumes `pending` or `running` jobs. Use content hash for deduplication at import.

**Additional pitfalls requiring early attention:**
- CORS misconfiguration in development — gate CORS on `NODE_ENV=development`; nginx handles same-origin in production on Hetzner
- Large file uploads hit Fastify body size defaults — use multer with disk storage, set a high file size limit
- File path portability failures — store paths relative to STORAGE_ROOT, never absolute
- GROQ_API_KEY missing at startup — validate env var at boot, refuse to start if absent
- Groq 429 rate limit not handled — implement exponential backoff retry in the job queue (3 attempts, 2s/4s/8s delays)

---

## Implications for Roadmap

Based on the combined research, the architecture's own dependency graph strongly dictates a 6-phase structure. The ARCHITECTURE.md researcher independently derived the same phase order that the PITFALLS.md researcher flags as correctness-critical. This convergence increases confidence in the suggested structure.

### Phase 1: Foundation and Infrastructure

**Rationale:** Every subsequent phase depends on correct foundational decisions. The pitfalls that cause rewrites (OpenSearch mapping, absolute file paths, CORS, GROQ_API_KEY validation) must be addressed before any feature work starts. This phase has no user-visible features but determines whether later phases need to be rebuilt.

**Delivers:** Project scaffolding (Vite + React + TypeScript frontend, Fastify backend), SQLite schema with migrations, STORAGE_ROOT env config with validation on startup, OpenSearch index with explicit mapping (before first document), CORS configured for dev only (gated on NODE_ENV), GROQ_API_KEY presence check at startup, health check endpoint.

**Addresses:** Storage design, database schema, search index initialization.

**Avoids:** Pitfall 4 (dynamic OpenSearch mapping), Pitfall 9 (absolute file paths), Pitfall 11 (CORS misconfiguration), Pitfall 10 (missing GROQ_API_KEY at startup).

**Research flag:** Standard patterns — skip phase research. SQLite schema design, Fastify scaffolding, OpenSearch index creation, and CORS configuration are all well-documented.

---

### Phase 2: Ingest Pipeline (Backend Only)

**Rationale:** The ingest pipeline is the core technical risk. It involves 3 external processes/services (ffprobe, ffmpeg, Groq API), a job queue, async HTTP management, and multi-stage failure handling. Building and testing it via API calls (curl/Postman) before any UI exists is faster and safer — fewer moving parts to debug.

**Delivers:** `POST /assets/ingest` endpoint (file copy + 202 response + SQLite record), p-queue setup with concurrency limits (1 Groq call, 4 ffprobe/ffmpeg), ffprobe stage (metadata → SQLite), ffmpeg stage (thumbnail → filesystem + SQLite), audio pre-extraction to OGG, Groq API transcription stage (groq-sdk → SQLite), OpenSearch indexing stage, per-stage status fields, idempotency checks per stage, startup resume of interrupted jobs, exponential backoff retry on Groq 429 responses.

**Addresses:** File import, auto-extracted technical metadata, thumbnail generation, auto-transcription, import job queue tracking.

**Avoids:** Pitfall 1 (needs HTTP range requests — but that's Phase 3), Pitfall 2 (async Groq call, never awaited in handler), Pitfall 3 (audio pre-extraction to OGG before every Groq call), Pitfall 5 (idempotent pipeline with state machine), Pitfall 6 (thumbnail filter instead of fixed timestamp), Pitfall 7 (check output file exists, not just exit code), Pitfall 10a (Groq 429 retry), Pitfall 12 (multer disk storage, no body size limit for video routes).

**Research flag:** Needs phase research. The groq-sdk integration pattern (audio upload, response parsing, error handling for 413/429/401) and the p-queue setup for Groq rate limit management benefit from specific implementation research before coding.

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

**Rationale:** Groq transcription runs in the Phase 2 pipeline, but the UI to surface transcripts comes here. This is the primary differentiator feature. It requires synchronized player state + transcript panel, which is a frontend-specific integration concern.

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

- Phase 1 before everything: foundational decisions (OpenSearch mapping, file path design, CORS, GROQ_API_KEY) that cannot be retrofitted without rewrites.
- Phase 2 before Phase 3: you need ingested assets with thumbnails before the browse UI has anything to display.
- Phase 3 before Phase 4: browsing must work before editing is useful — editing an asset you can't find or play is useless.
- Phase 5 after Phase 2: Groq transcription runs in the Phase 2 pipeline; the transcript UI slots onto existing data. But the player + transcript sync is complex enough to isolate as its own phase.
- Phase 6 last: search quality depends on indexed transcript data from Phase 5. Testing search before transcripts exist produces misleading results and delays discovery of OpenSearch configuration issues.

### Research Flags

**Needs deeper research before coding:**
- Phase 2 (Ingest Pipeline): groq-sdk integration — audio file upload pattern, response segment parsing, 413/429/401 error handling, temp file cleanup. The audio pre-extraction to OGG and the retry strategy for 429 responses are the highest-risk implementation details.
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
| Stack | MEDIUM | Core choices (React, Fastify, SQLite, fluent-ffmpeg, groq-sdk) are stable and well-validated. Version numbers need npm verification — some packages (React, Vite, Fastify, Tailwind) may have released new major versions since August 2025 cutoff. The @opensearch-project/opensearch client version must match the locally-running OpenSearch instance exactly. |
| Features | HIGH | Feature list draws directly from PROJECT.md constraints and direct knowledge of competing products (Bridge, Kyno, Silverstack, Jellyfin). The Groq API + transcript-search gap in the market is well-established. Anti-features are clearly justified by scope. |
| Architecture | HIGH | SQLite-as-source-of-truth, OpenSearch-as-derived-index, and async ingest pipeline patterns are canonical for this class of application. Range request streaming, p-queue concurrency control, and ffprobe/ffmpeg CLI patterns are stable and well-documented. The 6-phase build order is independently confirmed by both ARCHITECTURE.md and PITFALLS.md research. |
| Pitfalls | HIGH for structural pitfalls, MEDIUM for specifics | HTTP range request behavior (MDN-confirmed), event loop blocking (Node.js official docs-confirmed), OpenSearch dynamic mapping (well-established behavior), CORS preflight (W3C spec-confirmed) are HIGH confidence. Groq API file size limits and rate limits are documented. ffmpeg codec edge cases are MEDIUM — stable API but specific thresholds vary by build. |

**Overall confidence:** MEDIUM-HIGH. Architectural decisions are now locked: Groq API for transcription, Hetzner server for deployment, Tailscale for private network access. The structural decisions (architecture, feature scope, phase order) are HIGH confidence. Specific version numbers in the stack are MEDIUM confidence and require npm verification before pinning in package.json.

### Gaps to Address

- **Version pinning:** All package versions come from training knowledge (August 2025 cutoff). Before writing package.json, check npm for: react, vite, fastify, tailwindcss, framer-motion, @opensearch-project/opensearch, groq-sdk, video.js, @tanstack/react-query. The OpenSearch client version is a hard compatibility constraint — it must match the major version of the locally-running OpenSearch instance.

- **Groq free tier rate limits:** Confirm exact requests/min and requests/day limits before implementing retry strategy in Phase 2. The current exponential backoff plan (3 attempts, 2s/4s/8s) is designed around typical rate limit windows — verify against actual Groq free tier documentation before finalizing the retry implementation.

- **Codec compatibility scope:** HTML5 `<video>` handles H.264/AAC MP4 universally, but HEVC/AV1/MKV support varies by browser. The research recommends serving source files as-is and documenting limitations for MVP. Decide explicitly whether any transcode-to-H.264 fallback is in v1 scope before Phase 3 begins.

- **Video.js vs Media Chrome:** Research notes that `media-chrome` was gaining traction as of mid-2025 as a potential successor to Video.js for custom-skinned players. Verify current npm download trends and maintenance status before committing to Video.js 8.x in Phase 3.

---

## Sources

### Primary (HIGH confidence)
- PROJECT.md — project constraints, out-of-scope declarations, design system specifications
- MDN Web Docs: HTTP Range Requests — range request behavior, 206 Partial Content requirements
- Node.js official docs: "Don't Block the Event Loop" — async child_process patterns
- OpenSearch/Elasticsearch documentation: dynamic mapping behavior, field type constraints
- W3C CORS specification — preflight request behavior
- Groq API documentation — file size limits, rate limits, groq-sdk usage

### Secondary (MEDIUM confidence)
- Training knowledge of Adobe Bridge CC 2024, Kyno 2.x, Silverstack Lab 7, Jellyfin 10.x, Immich 1.x feature sets — competitive analysis
- ffmpeg documentation — thumbnail filter, audio extraction patterns
- Express.js performance best practices — multer disk storage, body size limits

### Tertiary (LOW confidence — verify before use)
- Package version numbers for all npm dependencies — verify against current npm registry before pinning
- Groq free tier rate limit specifics — verify against current Groq documentation

---

*Research completed: 2026-03-18*
*Ready for roadmap: yes*
*Deployment context: Hetzner server + Tailscale. Architectural decisions locked.*
