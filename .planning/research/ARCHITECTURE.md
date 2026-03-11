# Architecture Patterns

**Domain:** Local Media Asset Management (single-user, local filesystem, local inference)
**Researched:** 2026-03-11
**Confidence note:** Web/search tools unavailable in this environment. Findings are based on established patterns for Node.js media pipelines, ffmpeg/ffprobe tooling, Whisper job queues, and OpenSearch indexing. Confidence levels reflect architectural stability of each domain.

---

## Recommended Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React + Vite)                                      │
│  - Asset grid / card list                                    │
│  - Search bar → query API                                    │
│  - Detail panel → metadata read/write                        │
│  - Video player (HTML5 <video> or HLS.js)                   │
└───────────────────┬─────────────────────────────────────────┘
                    │ HTTP (REST)
┌───────────────────▼─────────────────────────────────────────┐
│  API Server (Express / Fastify — Node.js)                    │
│  - POST /assets/ingest     → triggers ingest pipeline        │
│  - GET  /assets            → list from SQLite                │
│  - GET  /assets/:id        → single asset from SQLite        │
│  - PUT  /assets/:id        → update metadata in SQLite       │
│  - GET  /search?q=         → proxy to OpenSearch             │
│  - GET  /stream/:id        → range-request video stream      │
│  - GET  /thumbnails/:id    → static file serve               │
└─────┬──────────────────────┬────────────────────────────────┘
      │                      │
      ▼                      ▼
┌──────────────┐    ┌────────────────────────────────────────┐
│   SQLite     │    │   Job Queue (in-process or Bull/BullMQ)│
│  (metadata)  │    │   - ingest jobs: ffprobe → thumb →     │
│              │    │     Whisper → OpenSearch index          │
└──────────────┘    └────────────────┬───────────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                       ▼
       ┌─────────────┐      ┌──────────────┐      ┌─────────────────┐
       │ ffprobe     │      │ ffmpeg       │      │ Whisper CLI     │
       │ (metadata   │      │ (thumbnail   │      │ (transcription  │
       │  extraction)│      │  generation) │      │  background job)│
       └─────────────┘      └──────────────┘      └─────────────────┘
                                                           │
                                                  ┌────────▼────────┐
                                                  │   OpenSearch    │
                                                  │  (local, text   │
                                                  │   search index) │
                                                  └─────────────────┘

       ┌──────────────────────────────────────────────────────────┐
       │   Local Filesystem                                        │
       │   /videos/                — original video files         │
       │   /thumbnails/            — generated JPEG thumbnails    │
       │   /transcripts/           — Whisper output JSON/SRT      │
       └──────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| React Frontend | UI rendering, user input, search queries, video playback | API Server (HTTP REST) |
| API Server | Route handling, orchestrates pipeline, serves streams | SQLite, Job Queue, OpenSearch, Filesystem |
| SQLite | Persistent metadata store (assets, tags, custom fields) | API Server only |
| Job Queue | Async background job execution, job state tracking | ffprobe, ffmpeg, Whisper CLI, OpenSearch, SQLite |
| ffprobe | Technical metadata extraction (duration, codec, resolution, bitrate) | Job Queue (spawned as child process) |
| ffmpeg | Thumbnail frame extraction at seek position | Job Queue (spawned as child process) |
| Whisper CLI | Audio transcription to text (runs on CPU, slow) | Job Queue (spawned as child process) |
| OpenSearch | Full-text search index (title, description, tags, transcript) | API Server (search queries), Job Queue (indexing) |
| Local Filesystem | Durable storage for video, thumbnail, transcript files | API Server (streaming), Job Queue (read/write) |

**Hard rule:** The frontend never touches the filesystem, Whisper, or OpenSearch directly. All access is mediated by the API server.

---

## Data Flow: Ingest Pipeline

This is the most critical flow to get right. Each stage is sequential within a job; failure at any stage should be recorded without blocking earlier successful stages.

```
User drops file(s) onto UI
        │
        ▼
POST /assets/ingest
  - API validates file extension
  - Copies/moves file to /videos/{uuid}.{ext}
  - Creates SQLite record: status="ingesting", filepath, original_filename, size
  - Returns asset ID immediately (202 Accepted)
  - Enqueues ingest job with asset ID
        │
        ▼
Job Queue picks up ingest job
        │
        ├──► Stage 1: ffprobe
        │     - Spawns: ffprobe -v quiet -print_format json -show_streams -show_format <filepath>
        │     - Extracts: duration, width, height, codec_name, bit_rate, nb_frames
        │     - Writes extracted fields to SQLite record
        │     - On failure: mark metadata_status="failed", continue to Stage 2
        │
        ├──► Stage 2: Thumbnail (ffmpeg)
        │     - Spawns: ffmpeg -ss {seek_pos} -i <filepath> -frames:v 1 -q:v 2 <thumb_path>
        │     - seek_pos = MIN(5s, duration * 0.1) — avoids black frames at 0s
        │     - Saves to /thumbnails/{uuid}.jpg
        │     - Writes thumbnail_path to SQLite
        │     - On failure: mark thumbnail_status="failed", continue
        │
        ├──► Stage 3: Whisper Transcription (background, long-running)
        │     - Spawns: whisper <filepath> --model base --output_format json --output_dir /transcripts/
        │     - OR: node whisper wrapper via openai-whisper npm package
        │     - Saves /transcripts/{uuid}.json  (contains segments with timestamps)
        │     - Writes transcript_path + transcript_text to SQLite
        │     - On failure: mark transcription_status="failed", continue
        │
        └──► Stage 4: OpenSearch Indexing
              - Reads assembled record from SQLite (metadata + transcript text)
              - POST /_doc to OpenSearch index "mam-assets"
              - Document: { id, title, description, tags, transcript, duration, codec, ... }
              - On failure: mark search_index_status="failed" — search degraded but asset saved
              - Updates SQLite status="ready"

Frontend polls GET /assets/:id for status changes (or SSE/WebSocket for push updates)
```

**Key design decisions in the ingest flow:**

1. **File is saved before pipeline runs** — user never waits for ffprobe/Whisper to complete before the upload is "done." The asset exists in the system immediately.
2. **Each stage is independent** — a Whisper failure does not roll back the thumbnail. Partial success is better than full failure.
3. **SQLite is the source of truth** — OpenSearch is a derived index. If it goes down or gets out of sync, it can be reindexed from SQLite + transcript files.
4. **Status fields per stage** — `metadata_status`, `thumbnail_status`, `transcription_status`, `search_index_status` allow the UI to show granular progress rather than a binary loading spinner.

---

## Database / Storage Decisions

### Metadata: SQLite (not PostgreSQL, not OpenSearch-only)

**Recommendation: SQLite via `better-sqlite3`**

| Criterion | SQLite | PostgreSQL | OpenSearch-only |
|-----------|--------|------------|-----------------|
| Setup complexity | Zero (file-based) | High (separate service) | Unacceptable (wrong tool for records) |
| Single-user fit | Perfect | Overkill | N/A |
| ACID transactions | Yes | Yes | No |
| Schema migrations | Easy (`drizzle-orm` or raw SQL) | Easy | Not applicable |
| JSON column support | Yes (JSON1 extension) | Yes (JSONB) | N/A |
| Backup | Copy one file | pg_dump | Separate |
| Concurrent writes | Limited (fine for single-user) | Excellent | N/A |

**Use SQLite because:** this is a single-user local app. No concurrent writes. No network. No ops overhead. OpenSearch is NOT a metadata store — it's a search index that must be rebuildable from SQLite at any time.

**Schema outline:**

```sql
CREATE TABLE assets (
  id TEXT PRIMARY KEY,              -- UUID
  original_filename TEXT NOT NULL,
  filepath TEXT NOT NULL,           -- absolute path on disk
  file_size INTEGER,
  status TEXT DEFAULT 'ingesting',  -- ingesting | ready | error

  -- Technical metadata (from ffprobe)
  duration_seconds REAL,
  width INTEGER,
  height INTEGER,
  codec TEXT,
  bitrate INTEGER,
  metadata_status TEXT DEFAULT 'pending',

  -- Thumbnail
  thumbnail_path TEXT,
  thumbnail_status TEXT DEFAULT 'pending',

  -- Transcription
  transcript_path TEXT,             -- path to JSON file
  transcript_text TEXT,             -- full plain text (for quick access)
  transcription_status TEXT DEFAULT 'pending',

  -- Search index
  search_index_status TEXT DEFAULT 'pending',

  -- User-editable metadata
  title TEXT,
  description TEXT,
  tags TEXT,                        -- JSON array stored as TEXT

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE custom_fields (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  field_type TEXT DEFAULT 'text',   -- text | number | date | boolean
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE asset_custom_values (
  asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
  field_id TEXT REFERENCES custom_fields(id) ON DELETE CASCADE,
  value TEXT,
  PRIMARY KEY (asset_id, field_id)
);
```

### File Storage: Local Filesystem with Configurable Root

```
{STORAGE_ROOT}/
  videos/         -- original files, never mutated after ingest
  thumbnails/     -- {asset_id}.jpg
  transcripts/    -- {asset_id}.json (Whisper output)
```

`STORAGE_ROOT` is set via environment variable with a sensible default (e.g., `~/.mam/storage`). Never hardcode.

### Search: OpenSearch Index Schema

The OpenSearch document is a denormalized projection of the SQLite record — it is NOT the system of record.

```json
{
  "id": "uuid",
  "title": "string (analyzed)",
  "description": "string (analyzed)",
  "tags": ["array", "of", "strings"],
  "transcript": "string (analyzed, from full transcript_text)",
  "duration_seconds": 120.5,
  "codec": "h264",
  "created_at": "2026-03-11T00:00:00Z"
}
```

Index name: `mam-assets`. Use a single index; no sharding needed for single-user scale.

---

## Video Serving Architecture

**Recommendation: HTTP range requests served directly from the API server**

HTML5 `<video>` elements require range request support to enable seeking. The implementation:

1. API Server handles `GET /stream/:id`
2. Reads `filepath` from SQLite for the given asset ID
3. Checks `Range` header from browser
4. Responds with `206 Partial Content` and the correct byte range
5. Sets `Content-Type` based on file extension (video/mp4, video/webm, etc.)

This is straightforward to implement in Express/Fastify using `fs.createReadStream` with `start`/`end` options. No transcoding needed since files are played as-is from the local disk.

**Do NOT use:** a separate static file server (nginx) for videos — unnecessary complexity for a local single-user app.

**Codec compatibility note:** If source files are in non-browser-compatible formats (MKV with non-H.264, AV1 without browser support), the video tag will fail silently. For MVP, serve as-is and document the limitation. Transcoding to H.264 MP4 is a future enhancement.

---

## Whisper as Background Job

### Job Queue Selection

| Option | Complexity | Redis needed | Best for |
|--------|------------|--------------|---------|
| In-process queue (p-queue) | Minimal | No | Single process, single machine |
| Bull/BullMQ | Medium | Yes (Redis) | Multi-worker, job persistence |
| Custom setTimeout/setInterval | Fragile | No | Avoid |

**Recommendation: `p-queue` (in-process) for MVP, designed to swap to BullMQ later**

Rationale: Adding Redis as a dependency for a single-user local app is unnecessary overhead. `p-queue` gives concurrency control (limit Whisper to 1 concurrent job to avoid CPU thrashing) with zero infrastructure. The tradeoff is that in-flight jobs are lost on server restart — acceptable for MVP since the user can re-trigger transcription.

```javascript
// Whisper job concurrency: 1 (CPU-bound, single model load)
// ffprobe/thumbnail concurrency: 4 (fast, I/O-bound)
const whisperQueue = new PQueue({ concurrency: 1 });
const mediaProcessingQueue = new PQueue({ concurrency: 4 });
```

### Whisper Invocation Pattern

Whisper is called as a CLI child process. Two viable approaches:

**Option A: Shell out to `whisper` CLI directly (recommended)**
```javascript
import { spawn } from 'child_process';
// whisper <filepath> --model base --output_format json --output_dir <dir> --language auto
```
- Requires `whisper` in PATH (pip-installed globally or in venv)
- Model: `base` for CPU — good accuracy/speed tradeoff
- Output: JSON file with segments (timestamps + text) + plain TXT

**Option B: `nodejs-whisper` npm package**
- Wraps the same CLI, adds a Node.js API
- Less control over arguments; adds an npm dependency on top of the Python install

**Use Option A** — direct CLI invocation is more transparent, easier to debug, and the path forward if the user wants to switch to `whisper.cpp` (C++ port, significantly faster on CPU).

### Job Status Tracking

Since p-queue has no built-in persistence, track job state in SQLite:

```
asset.transcription_status:
  pending   → job not yet picked up
  running   → currently being processed
  complete  → transcript file written, text stored
  failed    → error stored in asset.transcription_error column
```

Frontend polls `GET /assets/:id` every 3-5 seconds while `status !== 'ready'`. Alternatively, use SSE (Server-Sent Events) for push notification — this is the recommended upgrade path from polling.

---

## Patterns to Follow

### Pattern 1: Source of Truth Separation

**What:** SQLite holds authoritative metadata. OpenSearch holds a derived search index. Filesystem holds binary files.
**When:** Always. Never query OpenSearch for metadata display — query SQLite. Only use OpenSearch for search queries.
**Why:** OpenSearch can be rebuilt. SQLite is cheap to query for single records. Mixing them creates sync complexity.

### Pattern 2: Ingest Pipeline as Ordered Stages with Independent Status

**What:** Each pipeline stage (ffprobe, thumbnail, transcription, indexing) writes its own status field and can fail independently.
**When:** During ingest job execution.
**Why:** Whisper can take minutes. If it fails, the asset should still be browsable and playable. Users should see what succeeded and what's pending.

### Pattern 3: UUID for Asset Identity

**What:** Generate a UUID (v4) at ingest time. Use it as both the SQLite primary key and the filename stem for thumbnail/transcript files.
**When:** At `POST /assets/ingest` before any pipeline work starts.
**Why:** Decouples asset identity from original filename. Original filenames can contain special characters, collide, or be renamed. UUID is stable.

### Pattern 4: Range Request Streaming

**What:** Video streaming via HTTP range requests from the API server.
**When:** `GET /stream/:id` endpoint.
**Why:** Browser `<video>` elements require 206 Partial Content support for seeking. Without range request support, seeking is broken or forces full download.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: OpenSearch as Primary Metadata Store

**What:** Storing all asset metadata only in OpenSearch and using it for list/detail views.
**Why bad:** OpenSearch is an inverted index — not designed for relational data or transactional updates. Schema changes require reindexing. Record retrieval by ID is slow compared to SQLite. If OpenSearch is down, the app is completely broken.
**Instead:** SQLite for metadata persistence, OpenSearch for search queries only.

### Anti-Pattern 2: Blocking Upload on Whisper Completion

**What:** Making the POST /ingest endpoint synchronous — waiting for ffprobe + thumbnail + Whisper before responding.
**Why bad:** Whisper on CPU takes 1-10x the video duration. A 10-minute video takes 10-100 minutes. The HTTP connection would time out. UX is completely broken.
**Instead:** Respond 202 immediately after file copy + SQLite record creation. All pipeline work is async.

### Anti-Pattern 3: Storing Video Files Inside the Node Process Working Directory

**What:** Saving uploaded files to `./uploads` relative to the server process.
**Why bad:** Files are lost on deployments, refactors, or if the app is moved. Relative paths break easily.
**Instead:** `STORAGE_ROOT` environment variable resolved to absolute path at startup. Validate it exists and is writable on boot.

### Anti-Pattern 4: Spawning Unbounded Whisper Processes

**What:** Kicking off a new Whisper child process for every ingest without concurrency limits.
**Why bad:** Whisper loads a model (several hundred MB to GB) per process. Two simultaneous Whisper jobs on a CPU-only machine will saturate memory and CPU, causing OOM kills or severe thrashing.
**Instead:** Single-concurrency job queue for Whisper. Queue depth is fine — jobs wait their turn.

### Anti-Pattern 5: Reindexing OpenSearch on Every Metadata Edit

**What:** Calling OpenSearch update on every `PUT /assets/:id` request.
**Why bad:** Unnecessary OpenSearch call on every tag edit, every title change. Adds latency to all edits.
**Instead:** Write to SQLite immediately (fast, synchronous, always works). Enqueue an async OpenSearch update job. The search index can be ~seconds stale — acceptable for single-user local use.

---

## Suggested Build Order (Phase Dependencies)

Components have hard dependencies that dictate build order:

```
Phase 1: Foundation
  - Project scaffolding (Vite + React frontend, Express/Fastify backend)
  - SQLite schema + migrations (drizzle-orm recommended)
  - File storage layout + STORAGE_ROOT env config
  - Health check endpoint
  ↓
Phase 2: Ingest Pipeline (no UI needed yet)
  - POST /ingest: file copy + SQLite record creation
  - Job queue setup (p-queue)
  - ffprobe stage: metadata extraction → SQLite
  - ffmpeg stage: thumbnail generation → filesystem + SQLite
  - (Can build and test via curl/Postman before any UI)
  ↓
Phase 3: Browse + Playback UI
  - Asset list API: GET /assets (reads SQLite)
  - Asset detail API: GET /assets/:id
  - Video streaming: GET /stream/:id (range requests)
  - Thumbnail serving: static file route
  - React asset grid with cards (thumbnail, title, duration, tags)
  - Video player component
  ↓
Phase 4: Metadata Editing
  - PUT /assets/:id
  - Custom fields: POST /fields, GET /fields
  - Inline editing UI in detail panel
  ↓
Phase 5: Whisper Transcription
  - Whisper job stage added to ingest pipeline (after Phase 2 queue exists)
  - Transcript display in detail panel
  - Status polling (pending/running/complete/failed indicators)
  ↓
Phase 6: Search
  - OpenSearch client setup (index creation, document mapping)
  - Indexing in ingest pipeline (Stage 4, after transcript is ready)
  - Re-index endpoint for existing assets
  - GET /search?q= proxy endpoint
  - Search bar UI + results display
```

**Rationale for this order:**
- Phase 2 before Phase 3: You need ingest working to have any assets to display.
- Phase 3 before Phase 4: Browse must work before editing is useful.
- Phase 5 after Phase 2: Whisper slots into the existing job queue — queue infrastructure must exist first.
- Phase 6 last: Search depends on indexed data from all prior stages. Building search before data exists makes testing harder and creates a false sense of completeness.

---

## Scalability Considerations

This is a single-user local app — scalability is not a primary concern. However, design decisions that avoid future pain:

| Concern | At current scale (1 user, <10K assets) | If ever needed |
|---------|----------------------------------------|----------------|
| SQLite write contention | Non-issue (single user, sequential writes) | Migrate to PostgreSQL (schema is standard SQL) |
| Whisper throughput | p-queue, 1 concurrent, CPU-bound | Switch to whisper.cpp (3-5x faster), or add GPU |
| OpenSearch sync lag | Async queue, seconds stale | Add SSE push on index completion |
| Job persistence (crash recovery) | p-queue loses in-flight jobs on restart | Swap to BullMQ + Redis |
| File count (filesystem) | Flat directories fine under ~100K files | Add hash-bucketed subdirectories |

---

## Sources

- Confidence: HIGH for SQLite single-user pattern, range request streaming, ffprobe/ffmpeg CLI patterns, Whisper CLI invocation — these are stable, well-documented patterns.
- Confidence: HIGH for OpenSearch document schema design and index-as-derived-projection pattern.
- Confidence: MEDIUM for `p-queue` as the specific queue library — this is a common recommendation but the npm ecosystem evolves; verify current download stats and maintenance status before committing.
- Confidence: MEDIUM for `better-sqlite3` vs `@libsql/client` — both are valid; better-sqlite3 is more established for embedded SQLite in Node.js as of 2025.
- Note: Web search tools were unavailable during this research session. All patterns are drawn from established architecture principles for Node.js media pipelines. Recommend verifying library version choices (ffprobe bindings, p-queue API) against current npm registry before implementation.
