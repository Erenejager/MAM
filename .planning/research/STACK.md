# Technology Stack

**Project:** MAM — Media Asset Management
**Researched:** 2026-03-11
**Confidence Note:** All external research tools (WebSearch, WebFetch, Bash, Context7) were unavailable during this research session. All version numbers and recommendations are sourced from training knowledge with a cutoff of August 2025. VERIFY ALL VERSIONS against npm/official docs before pinning in package.json.

---

## Recommended Stack

### Core Frontend Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | 18.x | UI component tree | Required by project constraints. React 18 concurrent features enable non-blocking UI during background transcription jobs. |
| Vite | 5.x | Build tool + dev server | Required by project constraints. Sub-second HMR, native ESM, minimal config. No CRA overhead. |
| TypeScript | 5.x | Type safety across frontend + backend | Catches shape mismatches between API responses and UI components at compile time — critical for metadata schema that includes custom fields. |

**Confidence:** MEDIUM — versions are consistent with August 2025 state; React 18 and Vite 5 were current. Verify React 19 status before choosing.

---

### UI / Design System

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | 3.x | Utility-first styling | Pre-specified in design system. Required — colors, spacing, and font utilities map directly to the Cinema Dark tokens. |
| shadcn/ui | latest | Component primitives | Pre-specified in design system. Headless, composable, ships source files (not a blackbox package). Ideal for custom dark-theme components. |
| Framer Motion | 11.x | Animations | Pre-specified in design system. Powers the right-side detail panel slide-in. Declarative animation API pairs well with React state changes. |
| Lucide React | 0.x | Icon set | Pre-specified in design system. Tree-shakeable, consistent stroke widths, pairs well with shadcn/ui components. |

**Confidence:** MEDIUM — Tailwind 3.x, Framer Motion 11.x, and Lucide React were current in mid-2025. Tailwind 4 beta was in progress; verify whether 4.x is stable before choosing.

---

### Video Playback

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Video.js | 8.x | In-app video player | Battle-tested, handles broad codec coverage via HLS.js integration, supports custom skins. React wrapper (`video.js` + manual ref) is straightforward. Actively maintained. |

**Alternative considered:** `react-player` (2.x) — simpler API but adds YouTube/Vimeo adapter overhead that is useless in a local-file context. Video.js gives direct control over the player instance, which matters for seeking to transcript timestamps. NOT recommended here.

**Alternative considered:** `<video>` HTML5 native — sufficient for mp4/webm, but provides no progress callbacks for transcript sync, no HLS support, and no accessible UI controls out of the box.

**Confidence:** MEDIUM — Video.js 8.x was the dominant production-grade choice for local/self-hosted video in mid-2025. Verify it hasn't been superseded by Media Chrome (`media-chrome`) which was gaining traction.

---

### File Upload / Drag-and-Drop

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| react-dropzone | 14.x | Drag-and-drop upload zone | Most widely adopted, headless (no imposed styles), exposes file metadata and MIME type before upload starts. Pairs with the custom Cinema Dark design. |
| Multer | 1.x | Server-side multipart form parsing (Node.js) | Standard Express/Node.js multipart middleware. Streams large video files directly to disk without buffering in memory — critical for large video files. |

**Alternative for Multer:** `busboy` (underlying library) — Multer wraps busboy. Use Multer unless hitting edge cases. If switching to Fastify, use `@fastify/multipart` instead (which also uses busboy).

**Confidence:** MEDIUM — react-dropzone 14.x and Multer 1.x were stable and current in mid-2025.

---

### Backend Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Fastify | 4.x | HTTP server | Faster than Express (benchmarks show 2–3x throughput), native async/await, built-in JSON schema validation. Better fit for a file-serving + API backend than Express. Schema validation on routes catches malformed metadata updates before they reach the database. |

**Alternative considered:** Express 5.x — project constraints say "Express or Fastify." Express 5 finally adds async error handling but still lacks built-in schema validation. Fastify is the better choice for new projects in 2025.

**Confidence:** MEDIUM — Fastify 4.x was current and production-stable in mid-2025. Fastify 5 was in beta; verify whether it has gone stable.

---

### Database (Metadata Store)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SQLite (via better-sqlite3) | 9.x | Asset metadata, custom fields, job queue | Local, zero-infrastructure, file-based. Single-user app has no concurrent write requirements that would justify Postgres. `better-sqlite3` is synchronous, predictable, and has no async quirks. |

**Schema approach:** Store assets in a `assets` table (id, file_path, title, description, duration_ms, file_size_bytes, codec, resolution, thumbnail_path, created_at). Store custom field definitions in `custom_field_defs` (id, name, type). Store values in `asset_custom_values` (asset_id, field_id, value). Tags in a normalized `tags` + `asset_tags` junction.

**Alternative considered:** `sqlite3` (async/callback) — `better-sqlite3` is synchronous and significantly easier to reason about in a request handler. The async overhead of the callback version adds complexity without benefit.

**Alternative considered:** Postgres / MySQL — no justification for the infrastructure overhead on a single-user local app.

**Confidence:** HIGH — SQLite + better-sqlite3 is the canonical choice for local single-user apps. This recommendation is stable and unlikely to change.

---

### OpenSearch Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @opensearch-project/opensearch | 2.x | Node.js client for OpenSearch | Official client maintained by AWS/OpenSearch project. Mirrors the Elasticsearch JS client API, making migration straightforward. Supports connection pooling, retry on failure, and index template management. |

**Indexing strategy:** Index documents with fields: `asset_id`, `title`, `description`, `tags` (array), `transcript_text` (full text). Use a `multi_match` query across all fields for the search bar. Store `asset_id` only — no file paths in OpenSearch to avoid stale data if files move.

**Key issue:** OpenSearch 2.x uses `@opensearch-project/opensearch` ^2.0.0. The 3.x client tracks OpenSearch 3.x. Pin the client version to match your running OpenSearch instance version.

**Confidence:** MEDIUM — The `@opensearch-project/opensearch` package was the correct official client in mid-2025. Verify the exact version that matches the locally-running OpenSearch instance.

---

### Transcription (Whisper)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| whisper.cpp (via child_process) | latest binary | Local Whisper inference | No Python runtime required in production. `whisper.cpp` is a C++ port of OpenAI Whisper — significantly faster on CPU than the Python `openai-whisper` package. The Node.js backend spawns it as a child process and captures stdout (JSON or SRT output). |

**Integration pattern:**
```
Node.js backend
  → spawns: whisper.cpp CLI binary
  → args: --model ggml-base.en.bin --output-json <audio_file>
  → reads: stdout JSON with segments [{start, end, text}]
  → writes: transcript JSON to SQLite + OpenSearch
```

**Alternative considered:** `openai-whisper` Python package — requires Python runtime, slower on CPU (PyTorch overhead), but has better model availability and newer model support. Use if `whisper.cpp` proves difficult to compile or package on the deployment machine.

**Alternative considered:** `nodejs-whisper` npm package — a thin wrapper around `whisper.cpp`. Simplifies the child_process plumbing. Evaluate this before writing raw spawn code; may save implementation time.

**Audio extraction step:** Videos must be converted to WAV/FLAC before passing to Whisper. Use `fluent-ffmpeg` to extract audio as a pre-step.

**Confidence:** MEDIUM — `whisper.cpp` was the dominant CPU-efficient local Whisper option in mid-2025. The Node.js integration via `child_process` or `nodejs-whisper` wrapper is a verified community pattern.

---

### Thumbnail & Metadata Extraction (FFmpeg)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| fluent-ffmpeg | 2.x | Thumbnail extraction + audio extraction for Whisper | Node.js fluent API wrapper around the `ffmpeg` CLI. Handles screenshot capture (thumbnail at N seconds), audio extraction for Whisper, and metadata probing. |
| ffprobe (via fluent-ffmpeg) | bundled with ffmpeg | Duration, codec, resolution extraction | `fluentFfmpeg.ffprobe()` returns full stream metadata. No separate library needed. |
| @ffmpeg-installer/ffmpeg | latest | Bundles platform FFmpeg binary | Provides a pre-compiled `ffmpeg` binary for the current OS, so the app does not depend on a system-installed `ffmpeg`. Important for portable deployment. |

**Thumbnail strategy:** Capture at 10% of video duration (avoids black frames at start). Save as JPEG (smaller than PNG) at 640px width. Serve via a static `/thumbnails/:asset_id.jpg` route.

**Confidence:** MEDIUM — fluent-ffmpeg 2.x and @ffmpeg-installer/ffmpeg were the standard pairing in mid-2025. These packages have been stable for several years.

---

### Background Job Queue

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| BullMQ | 5.x | Background job queue for transcription + thumbnail jobs | Redis-backed, durable across restarts. Jobs persist if the server crashes mid-transcription. Supports job progress events (useful for progress indicators in the UI). |

**Alternative considered:** Simple in-memory queue (custom) — acceptable if transcription jobs are short and crash recovery is not a concern. For Whisper on CPU, a 30-minute video can take 5–10 minutes. BullMQ is the safer choice for long-running jobs.

**Alternative considered:** `p-queue` (in-memory) — no persistence, but simpler setup. Viable if you explicitly accept "re-queue on restart" as a product behavior.

**Dependency note:** BullMQ requires a running Redis instance. This adds infrastructure overhead. If Redis is unacceptable, use `p-queue` + SQLite job status table as a lightweight alternative.

**Confidence:** MEDIUM — BullMQ 5.x was current in mid-2025. The Redis dependency is a real constraint worth flagging — the team should decide: Redis (more robust) vs. in-memory + SQLite status (simpler but less durable).

---

### API Communication (Frontend ↔ Backend)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TanStack Query (React Query) | 5.x | Server state management + caching | Replaces manual `useEffect` + `useState` for API calls. Handles loading/error states, background refetch, optimistic updates for metadata edits. Built-in cache invalidation after upload completes. |
| Axios | 1.x | HTTP client for API calls | Cleaner API than `fetch` for multipart uploads (progress events, cancellation). Used alongside TanStack Query as the fetcher function. |

**Confidence:** MEDIUM — TanStack Query 5.x (released late 2023) was the current stable version in mid-2025. Verify whether v6 has shipped.

---

### Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vitest | 2.x | Unit + integration tests (frontend + backend) | Native Vite integration. Faster than Jest for Vite projects. Same API as Jest so migration cost is zero. |
| Testing Library (React) | 14.x | Component testing | Tests component behavior (not implementation). Required for testing upload flow, metadata form, and search results rendering. |
| Supertest | 6.x | HTTP API testing | Integration-tests Fastify routes without running a real server. Standard Node.js API testing tool. |

**Confidence:** LOW — versions here are estimated from mid-2025 state. Verify before pinning.

---

## Alternatives Considered (Summary)

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Backend | Fastify 4.x | Express 5.x | Express lacks built-in schema validation; async error handling still bolted on |
| Video Player | Video.js 8.x | react-player 2.x | react-player adds streaming-service adapters with no benefit in local-file context |
| Video Player | Video.js 8.x | Native `<video>` | No transcript timestamp sync, no accessible controls, no HLS |
| Transcription | whisper.cpp | openai-whisper (Python) | Python runtime overhead, slower CPU inference; use as fallback if whisper.cpp won't compile |
| DB | SQLite + better-sqlite3 | Postgres | No multi-user concurrency; infrastructure overhead not justified |
| Job Queue | BullMQ | p-queue (in-memory) | p-queue loses jobs on crash; Whisper jobs can take minutes |
| Job Queue | BullMQ | Bull (v4) | BullMQ is Bull's successor, written for Redis 5+, better TypeScript support |
| Drag-and-drop | react-dropzone | @dnd-kit | @dnd-kit is for list reordering; react-dropzone is purpose-built for file-drop zones |

---

## Installation

```bash
# Frontend
npm install react react-dom
npm install -D vite @vitejs/plugin-react typescript
npm install tailwindcss @tailwindcss/forms
npm install framer-motion lucide-react
npm install video.js
npm install react-dropzone
npm install @tanstack/react-query axios

# Backend
npm install fastify @fastify/multipart @fastify/static @fastify/cors
npm install better-sqlite3
npm install @opensearch-project/opensearch
npm install fluent-ffmpeg @ffmpeg-installer/ffmpeg
npm install bullmq ioredis

# Dev / Testing
npm install -D vitest @testing-library/react @testing-library/jest-dom supertest
npm install -D @types/node @types/better-sqlite3 @types/fluent-ffmpeg
```

```bash
# whisper.cpp — build or download pre-compiled binary separately
# See: https://github.com/ggerganov/whisper.cpp
# Download ggml model: models/ggml-base.en.bin (for English-only, ~150MB)
# For multilingual: models/ggml-base.bin (~150MB)
```

---

## Version Verification Required

The following versions MUST be verified against npm/official docs before pinning, as all version data comes from training knowledge (August 2025 cutoff):

| Package | Approximate Version | Verify At |
|---------|--------------------|-----------|
| react | 18.x or 19.x | https://www.npmjs.com/package/react |
| vite | 5.x or 6.x | https://www.npmjs.com/package/vite |
| fastify | 4.x or 5.x | https://www.npmjs.com/package/fastify |
| @opensearch-project/opensearch | 2.x or 3.x | https://www.npmjs.com/package/@opensearch-project/opensearch |
| bullmq | 5.x | https://www.npmjs.com/package/bullmq |
| video.js | 8.x | https://www.npmjs.com/package/video.js |
| @tanstack/react-query | 5.x | https://www.npmjs.com/package/@tanstack/react-query |
| tailwindcss | 3.x or 4.x | https://www.npmjs.com/package/tailwindcss |
| framer-motion | 11.x or 12.x | https://www.npmjs.com/package/framer-motion |

**Critical compatibility check:** The `@opensearch-project/opensearch` client major version must match the major version of the locally-running OpenSearch instance. This is a breaking compatibility constraint.

---

## Sources

All recommendations are based on training knowledge (cutoff: August 2025). No external sources could be consulted during this research session due to tool permission restrictions. Confidence levels reflect this limitation.

- Official OpenSearch JS Client: https://github.com/opensearch-project/opensearch-js
- whisper.cpp repository: https://github.com/ggerganov/whisper.cpp
- Fastify documentation: https://fastify.dev/docs/latest/
- Video.js documentation: https://videojs.com/
- BullMQ documentation: https://docs.bullmq.io/
- fluent-ffmpeg: https://github.com/fluent-ffmpeg/node-fluent-ffmpeg
- TanStack Query v5: https://tanstack.com/query/v5/docs
