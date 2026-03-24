# Phase 2: Ingest Pipeline - Research

**Researched:** 2026-03-24
**Domain:** File upload, video processing pipeline (ffprobe/ffmpeg), Groq transcription API, OpenSearch indexing
**Confidence:** HIGH

## Summary

Phase 2 builds the core ingest pipeline: a Fastify endpoint accepts video uploads via `@fastify/multipart`, streams them to `STORAGE_ROOT/{uuid}/`, computes a SHA-256 content hash for dedup, then runs four sequential background stages via `p-queue` -- metadata extraction (fluent-ffmpeg/ffprobe), thumbnail generation (ffmpeg), transcription (Groq Whisper API with audio pre-extraction), and OpenSearch indexing. The frontend is a single full-page drop zone that transitions to a progress bar with stage labels, polling `GET /api/assets/:id` every 2-3 seconds via TanStack Query `refetchInterval`.

All schema columns already exist from Phase 1 (per-stage `*_status` fields, `file_hash`, `transcription_error`, etc.). The OpenSearch index and client are already initialized. The main work is: (1) adding `@fastify/multipart`, `p-queue`, `fluent-ffmpeg`, and `groq-sdk` as backend dependencies, (2) implementing the upload route and 4-stage pipeline, (3) building the frontend drop zone + progress UI with TanStack Query, and (4) serving thumbnails via the existing `@fastify/static` setup.

**Primary recommendation:** Structure the pipeline as four sequential async functions called from a single p-queue job per file. Each stage updates its `*_status` column in SQLite. On metadata/thumbnail failure, clean up the asset directory and SQLite record. On transcription failure after 3 retries, soft-fail and continue to indexing.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full-page drop zone is the Phase 2 UI -- large centered drop zone with a file picker button
- No routing needed; Phase 3 will replace this surface with the browse grid
- Drag-and-drop activates on the entire window, not just the visible zone
- After 202 response, page transitions inline to a progress view (drop zone to progress bar)
- On pipeline completion: brief success state ('Ready') then reset to drop zone
- Single animated progress bar with a stage label (e.g. "Transcribing...") -- not a step indicator
- Frontend polls GET /api/assets/:id every ~2-3 seconds while status is pending or processing
- Polling stops when all stages are complete or failed
- No WebSocket or SSE in Phase 2
- Metadata failure = pipeline halt, delete asset directory + SQLite record (clean slate)
- Transcription failure = auto-retry 3x with exponential backoff, then soft-fail (asset remains)
- No retry button in Phase 2
- Pipeline stage failure (except transcription soft-fail) triggers cleanup: delete STORAGE_ROOT/{uuid}/ and SQLite record
- Mid-stream upload failure: delete partial file from disk

### Claude's Discretion
- Exact polling interval (2-3s window)
- Elapsed time counter implementation
- p-queue concurrency settings
- Thumbnail frame extraction timestamp (e.g. 5s into video)
- Temp audio file naming and cleanup timing
- Error state visual design in the progress bar
- Multi-file queue design (p-queue concurrency, per-file tracking)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IMP-01 | User can import videos via drag-and-drop or file picker (single or multiple files) | @fastify/multipart for upload streaming; HTML5 drag-and-drop + file input on frontend; p-queue for multi-file queuing |
| IMP-02 | System detects and blocks duplicate files using content hash | Node.js crypto.createHash('sha256') streaming hash during upload; check file_hash UNIQUE constraint before insert |
| IMP-03 | User can see per-stage import progress: metadata -> thumbnail -> transcription -> indexed | Per-stage *_status columns already in schema; polling via TanStack Query refetchInterval; progress bar with stage label |
| META-01 | System auto-extracts duration, codec, resolution, frame rate, and file size on import (via ffprobe) | fluent-ffmpeg ffprobe() returns format + streams metadata; map to schema columns |
| BRWS-02 | System auto-generates a thumbnail per asset on import (via ffmpeg) | fluent-ffmpeg screenshots() or manual -ss flag; serve via @fastify/static from STORAGE_ROOT |

</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fastify/multipart | ^9.4.0 | Multipart file upload handling for Fastify | Official Fastify plugin; streams files without buffering entire file in memory |
| p-queue | ^9.1.0 | In-process promise queue with concurrency control | Locked decision; ESM-only package; handles sequential pipeline stages per file |
| fluent-ffmpeg | ^2.1.3 | Node.js wrapper for ffmpeg/ffprobe CLI | Standard Node.js ffmpeg wrapper; provides ffprobe metadata extraction and ffmpeg commands |
| groq-sdk | ^1.1.1 | Official Groq API TypeScript client | Official SDK; typed transcription API with fs.createReadStream support |
| @tanstack/react-query | ^5.95.2 | Data fetching + polling for React | Locked decision for ingest status polling via refetchInterval |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/fluent-ffmpeg | ^2.1.28 | TypeScript types for fluent-ffmpeg | Always -- fluent-ffmpeg has no built-in types |
| uuid (crypto.randomUUID) | built-in | Generate asset UUIDs | Node 22 has crypto.randomUUID() built-in; no npm package needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fluent-ffmpeg | child_process.exec('ffprobe ...') | Direct exec is lighter but fluent-ffmpeg handles argument escaping, JSON parsing, error handling |
| p-queue | BullMQ + Redis | Overkill for single-user; p-queue is in-process, zero infrastructure |
| groq-sdk | raw fetch to api.groq.com | SDK handles auth, retries, types; no reason to hand-roll |

**Installation:**
```bash
# Backend
cd backend && npm install @fastify/multipart p-queue fluent-ffmpeg groq-sdk && npm install -D @types/fluent-ffmpeg

# Frontend
cd frontend && npm install @tanstack/react-query
```

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
  routes/
    assets.ts              # POST /api/assets (upload), GET /api/assets/:id (status)
  pipeline/
    index.ts               # orchestrator: runs stages sequentially, handles cleanup
    stages/
      metadata.ts          # ffprobe extraction
      thumbnail.ts         # ffmpeg screenshot
      transcription.ts     # Groq API with audio pre-extraction + chunking
      index-search.ts      # OpenSearch document insert
  lib/
    hash.ts                # SHA-256 streaming file hash
    queue.ts               # p-queue singleton instance
  bootstrap/
    opensearch.ts          # (existing)
    validate-env.ts        # (existing)
  db/
    schema.ts              # (existing -- no changes needed)
    index.ts               # (existing)

frontend/src/
  App.tsx                  # Drop zone + progress view (single component tree)
  components/
    DropZone.tsx            # Full-page drag-and-drop + file picker
    ImportProgress.tsx      # Progress bar with stage label
  hooks/
    useAssetPolling.ts     # TanStack Query hook with refetchInterval
  lib/
    api.ts                 # fetch helpers for POST /api/assets, GET /api/assets/:id
```

### Pattern 1: Streaming Upload with Simultaneous Hashing

**What:** Stream the uploaded file to disk while simultaneously computing its SHA-256 hash, then check for duplicates before starting the pipeline.
**When to use:** Every file upload.
**Example:**
```typescript
// Source: Node.js crypto docs + @fastify/multipart docs
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { PassThrough } from 'node:stream';

async function saveAndHash(fileStream: NodeJS.ReadableStream, destPath: string): Promise<string> {
  const hash = createHash('sha256');
  const writeStream = createWriteStream(destPath);
  const passThrough = new PassThrough();

  passThrough.on('data', (chunk) => hash.update(chunk));

  await pipeline(fileStream, passThrough, writeStream);
  return hash.digest('hex');
}
```

### Pattern 2: Sequential Pipeline with Status Updates

**What:** Each pipeline stage is an async function that updates its status column before and after execution.
**When to use:** For every imported asset.
**Example:**
```typescript
// Pipeline orchestrator pattern
import { db } from '../db/index.js';
import { assets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

async function runPipeline(assetId: string, filePath: string): Promise<void> {
  try {
    // Stage 1: Metadata
    await updateStatus(assetId, 'metadata_status', 'processing');
    const meta = await extractMetadata(filePath);
    await db.update(assets).set({ ...meta, metadataStatus: 'complete' }).where(eq(assets.id, assetId));

    // Stage 2: Thumbnail
    await updateStatus(assetId, 'thumbnail_status', 'processing');
    const thumbPath = await generateThumbnail(filePath, assetId);
    await db.update(assets).set({ thumbnailPath: thumbPath, thumbnailStatus: 'complete' }).where(eq(assets.id, assetId));

    // Stage 3: Transcription (soft-fail)
    await updateStatus(assetId, 'transcription_status', 'processing');
    try {
      const transcript = await transcribeWithRetry(filePath, assetId);
      await db.update(assets).set({
        transcriptText: transcript.text,
        transcriptionStatus: 'complete'
      }).where(eq(assets.id, assetId));
    } catch (err) {
      await db.update(assets).set({
        transcriptionStatus: 'failed',
        transcriptionError: (err as Error).message
      }).where(eq(assets.id, assetId));
      // Continue -- transcription failure is soft
    }

    // Stage 4: OpenSearch indexing
    await updateStatus(assetId, 'search_index_status', 'processing');
    await indexInOpenSearch(assetId);
    await db.update(assets).set({ searchIndexStatus: 'complete', status: 'ready' }).where(eq(assets.id, assetId));

  } catch (err) {
    // Hard failure (metadata or thumbnail) -- cleanup
    await db.update(assets).set({ status: 'error' }).where(eq(assets.id, assetId));
    await cleanupAssetDirectory(assetId);
    await db.delete(assets).where(eq(assets.id, assetId));
  }
}
```

### Pattern 3: Groq Transcription with Audio Pre-extraction and Chunking

**What:** Extract audio to 16kHz mono OGG via ffmpeg, check size, chunk if >= 25 MB, send to Groq, concatenate segments.
**When to use:** Transcription stage.
**Example:**
```typescript
// Audio extraction command
// ffmpeg -i input.mp4 -vn -acodec libopus -ar 16000 -ac 1 output.ogg

import Groq from 'groq-sdk';
import fs from 'node:fs';

const groq = new Groq(); // reads GROQ_API_KEY from env

async function transcribe(audioPath: string): Promise<{ text: string; segments: Segment[] }> {
  const transcription = await groq.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-large-v3',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  });

  return {
    text: transcription.text,
    segments: transcription.segments, // { start, end, text }[]
  };
}
```

### Pattern 4: Frontend Polling with TanStack Query

**What:** Use TanStack Query's refetchInterval to poll asset status.
**When to use:** After upload returns 202.
**Example:**
```typescript
import { useQuery } from '@tanstack/react-query';

function useAssetPolling(assetId: string | null) {
  return useQuery({
    queryKey: ['asset', assetId],
    queryFn: () => fetch(`/api/assets/${assetId}`).then(r => r.json()),
    enabled: !!assetId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2500;
      if (data.status === 'ready' || data.status === 'error') return false;
      return 2500;
    },
  });
}
```

### Anti-Patterns to Avoid
- **Buffering entire upload in memory:** Use `req.file()` streaming, NOT `req.body` or reading the whole file into a Buffer. Videos can be gigabytes.
- **Synchronous hash computation:** Always stream-hash. Never `fs.readFileSync()` + `hash.update(buffer)` for video files.
- **Storing absolute paths in DB:** All paths in the `filepath` and `thumbnail_path` columns must be relative to STORAGE_ROOT (locked decision).
- **Running pipeline stages in parallel:** Stages must be sequential -- thumbnail needs the file to exist, transcription needs audio extraction, indexing needs transcript text.
- **Polling with setInterval instead of TanStack Query:** Use refetchInterval -- it handles component unmount cleanup, caching, and deduplication automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File upload parsing | Custom multipart parser | @fastify/multipart | Multipart parsing is deceptively complex (boundaries, encoding, streaming) |
| Video metadata extraction | child_process exec + JSON parse | fluent-ffmpeg ffprobe() | Handles path escaping, JSON parsing, error normalization |
| Groq API auth + retries | fetch + manual retry loop | groq-sdk | Official SDK; handles auth headers, error types, streaming |
| Promise queue | Custom queue with arrays + shift() | p-queue | Handles concurrency, error propagation, queue clearing |
| SHA-256 hashing | Manual chunk reading | Node.js crypto.createHash streaming | Built-in, battle-tested, handles stream backpressure |
| Polling state management | useState + setInterval | TanStack Query refetchInterval | Handles cleanup, dedup, error states, background refetch |

**Key insight:** Every component in this pipeline has a well-maintained library. The complexity is in orchestrating them correctly (error handling, cleanup, status updates), not in the individual operations.

## Common Pitfalls

### Pitfall 1: p-queue is ESM-only
**What goes wrong:** Import fails with `ERR_REQUIRE_ESM` if project uses CommonJS.
**Why it happens:** p-queue v7+ dropped CJS support entirely.
**How to avoid:** The backend is already `"type": "module"` in package.json -- this is fine. Just use `import PQueue from 'p-queue'`.
**Warning signs:** Build errors mentioning require() or module format.

### Pitfall 2: @fastify/multipart stream not consumed
**What goes wrong:** Request hangs indefinitely; the multipart promise never resolves.
**Why it happens:** If you call `req.file()` but don't pipe/consume the file stream, the request stalls.
**How to avoid:** Always pipe the file stream to a write stream (or explicitly consume it with `await file.toBuffer()` for small files). For video uploads, always stream to disk.
**Warning signs:** Requests timing out on upload.

### Pitfall 3: Groq 25 MB file size limit
**What goes wrong:** API returns 413 or error for large audio files.
**Why it happens:** Groq free tier limits files to 25 MB (dev tier: 100 MB).
**How to avoid:** Always pre-extract audio to 16kHz mono OGG before sending. A 1-hour video typically produces ~5 MB OGG. For very long videos (5+ hours), implement chunking: split the OGG into segments, send sequentially, offset timestamps when concatenating.
**Warning signs:** Files > 25 MB after OGG extraction (very long videos or high-bitrate sources).

### Pitfall 4: Groq rate limits (429 responses)
**What goes wrong:** API returns 429 Too Many Requests.
**Why it happens:** Free tier: 20 RPM, 2,000 RPD, 7,200 audio seconds/hour.
**How to avoid:** Implement exponential backoff retry (3 attempts). Set p-queue concurrency to 1 for Groq calls so only one transcription runs at a time.
**Warning signs:** Burst-importing many files triggers 429s.

### Pitfall 5: Orphaned files on pipeline failure
**What goes wrong:** Failed imports leave files on disk with no matching DB record, or DB records with no files.
**Why it happens:** Pipeline crashes between file save and cleanup.
**How to avoid:** Wrap pipeline in try/catch. On hard failure (metadata/thumbnail), delete `STORAGE_ROOT/{uuid}/` directory and the SQLite record. Use `fs.rm(dir, { recursive: true, force: true })`.
**Warning signs:** Disk usage growing despite failed imports.

### Pitfall 6: fluent-ffmpeg ffprobe returns undefined fields
**What goes wrong:** Some video files lack certain metadata fields (e.g., bitrate, frame rate).
**Why it happens:** Not all container formats or encoders populate all fields.
**How to avoid:** Treat all ffprobe fields as optional. Use nullish coalescing: `stream.r_frame_rate` may be "30/1" (a fraction string), not a number. Parse frame rate from the fraction string.
**Warning signs:** NaN or undefined in database columns.

### Pitfall 7: Frame rate is a fraction string
**What goes wrong:** ffprobe returns `r_frame_rate` as "30000/1001" (NTSC), not a number.
**Why it happens:** ffprobe reports exact rational frame rates.
**How to avoid:** Parse: `const [num, den] = frameRateStr.split('/').map(Number); const fps = num / den;`
**Warning signs:** "30000/1001" stored as a string instead of 29.97.

### Pitfall 8: Concurrent SQLite writes from pipeline
**What goes wrong:** SQLITE_BUSY errors when multiple pipeline stages write simultaneously.
**Why it happens:** SQLite has a single-writer model. WAL mode helps but concurrent writes from different async operations can still conflict.
**How to avoid:** Pipeline stages are sequential per file (by design). For multi-file imports, p-queue concurrency should be low (1-2). WAL mode is already enabled.
**Warning signs:** SQLITE_BUSY errors in logs during bulk imports.

## Code Examples

### ffprobe Metadata Extraction
```typescript
// Source: fluent-ffmpeg docs + @types/fluent-ffmpeg
import ffmpeg from 'fluent-ffmpeg';

interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  codec: string;
  bitrate: number | null;
  frameRate: number;
  fileSize: number;
}

function extractMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);

      const videoStream = data.streams.find(s => s.codec_type === 'video');
      if (!videoStream) return reject(new Error('No video stream found'));

      // Parse frame rate from fraction string (e.g. "30000/1001")
      let frameRate = 0;
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        frameRate = den ? num / den : num;
      }

      resolve({
        durationSeconds: data.format.duration ?? 0,
        width: videoStream.width ?? 0,
        height: videoStream.height ?? 0,
        codec: videoStream.codec_name ?? 'unknown',
        bitrate: data.format.bit_rate ? Math.round(data.format.bit_rate) : null,
        frameRate: Math.round(frameRate * 100) / 100,
        fileSize: data.format.size ?? 0,
      });
    });
  });
}
```

### Thumbnail Generation
```typescript
// Source: fluent-ffmpeg docs
import ffmpeg from 'fluent-ffmpeg';
import { resolve } from 'node:path';

function generateThumbnail(videoPath: string, outputDir: string, filename: string): Promise<string> {
  return new Promise((resolve_fn, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['5%'],  // 5% into the video
        filename,
        folder: outputDir,
        size: '640x?',       // 640px wide, maintain aspect ratio
      })
      .on('end', () => resolve_fn(`${filename}`))
      .on('error', reject);
  });
}
```

### Audio Pre-extraction for Groq
```typescript
// Source: fluent-ffmpeg docs + Groq requirements
import ffmpeg from 'fluent-ffmpeg';

function extractAudio(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libopus')
      .audioFrequency(16000)
      .audioChannels(1)
      .format('ogg')
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}
```

### Exponential Backoff Retry for Groq
```typescript
async function transcribeWithRetry(
  audioPath: string,
  maxRetries: number = 3
): Promise<TranscriptionResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await transcribe(audioPath);
    } catch (err: any) {
      lastError = err;
      // Only retry on 429 (rate limit) or 5xx (server error)
      const status = err?.status || err?.statusCode;
      if (status === 429 || (status >= 500 && status < 600)) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err; // Non-retryable error
    }
  }
  throw lastError;
}
```

### Fastify Upload Route
```typescript
// Source: @fastify/multipart docs
import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';

async function assetRoutes(fastify: FastifyInstance) {
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024 * 1024, // 10 GB max
    },
  });

  fastify.post('/api/assets', async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: 'No file uploaded' });

    const assetId = crypto.randomUUID();
    // ... stream file to disk, compute hash, check dedup, create DB record

    // Return 202 immediately, pipeline runs in background
    reply.status(202).send({ id: assetId, status: 'ingesting' });

    // Enqueue pipeline (fire-and-forget after response)
    queue.add(() => runPipeline(assetId, filePath));
  });

  fastify.get('/api/assets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const asset = await db.select().from(assets).where(eq(assets.id, id)).get();
    if (!asset) return reply.status(404).send({ error: 'Asset not found' });
    return asset;
  });
}
```

### Duplicate Detection
```typescript
// Check hash uniqueness before creating record
import { eq } from 'drizzle-orm';

async function checkDuplicate(fileHash: string): Promise<boolean> {
  const existing = await db.select({ id: assets.id })
    .from(assets)
    .where(eq(assets.fileHash, fileHash))
    .get();
  return !!existing;
}
```

### Transcript Segment Storage

The schema has `transcript_text TEXT` (full concatenated text) but transcript segments with timestamps are needed for Phase 5 (PLAY-02, PLAY-03: click transcript to seek). Two options:

**Option A (recommended): Store segments as JSON in transcript_text column**
Store the full text separately for search, and segments as a JSON array in a dedicated column or serialized alongside. Since the schema already has `transcript_text`, store the plain text there for OpenSearch indexing, and add segment data as a JSON string in a separate approach.

**Practical approach:** The existing `transcript_path` column can point to a JSON file on disk (`STORAGE_ROOT/{uuid}/transcript.json`) containing the full segment array `[{text, start, end}]`. The `transcript_text` column stores the concatenated plain text for full-text search. This keeps the SQLite row small while preserving timestamp data for later phases.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| multer (Express) | @fastify/multipart | Fastify adoption | Must use Fastify plugin, not Express middleware |
| p-queue CJS | p-queue ESM-only | v7 (2022) | Must use ESM imports; project already ESM |
| whisper.cpp local | Groq API cloud | 2024 | No local GPU needed; 25 MB limit requires audio extraction |
| OpenAI whisper API | Groq whisper API | 2024 | Same API shape (OpenAI-compatible); faster, free tier |

**Deprecated/outdated:**
- `fastify-multipart` (no @fastify prefix): Old package name, use `@fastify/multipart`
- `whisper-large-v2`: Use `whisper-large-v3` or `whisper-large-v3-turbo` on Groq

## Open Questions

1. **Transcript segments table vs JSON file**
   - What we know: Schema has `transcript_text` (plain text) and `transcript_path` (file reference). Segments with timestamps are needed in Phase 5 for seek-to-timestamp.
   - What's unclear: Whether to add a `transcript_segments` table in a future migration or store segments as a JSON file at `transcript_path`.
   - Recommendation: Store segments as JSON file at `STORAGE_ROOT/{uuid}/transcript.json` and keep `transcript_text` as plain text for search. This avoids a schema migration and keeps segment data accessible for Phase 5. The JSON file approach is simpler and segment data is read-only after creation.

2. **Audio chunking for very long videos**
   - What we know: 16kHz mono OGG is ~1.3 MB/hour. A 19-hour video would hit 25 MB.
   - What's unclear: Whether the user's library contains videos that long.
   - Recommendation: Implement the chunking path (check file size, split if >= 25 MB, sequential Groq requests, offset timestamps) -- the user explicitly asked for it and it handles edge cases safely.

3. **@fastify/static serving thumbnails**
   - What we know: @fastify/static is already installed. Thumbnails need to be served via HTTP.
   - What's unclear: Whether it's already configured with a root path or needs registration.
   - Recommendation: Register @fastify/static with `root: STORAGE_ROOT` and `prefix: '/storage/'` so thumbnails at `STORAGE_ROOT/{uuid}/thumb.jpg` are accessible at `/storage/{uuid}/thumb.jpg`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.1 (recommended -- not yet installed) |
| Config file | none -- Wave 0 must create vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IMP-01 | Upload endpoint accepts file and returns 202 | integration | `npx vitest run backend/src/__tests__/upload.test.ts -t "upload"` | Wave 0 |
| IMP-02 | Duplicate file hash rejected with error | unit | `npx vitest run backend/src/__tests__/dedup.test.ts -t "duplicate"` | Wave 0 |
| IMP-03 | Status endpoint returns per-stage status fields | integration | `npx vitest run backend/src/__tests__/status.test.ts -t "status"` | Wave 0 |
| META-01 | ffprobe extracts duration, codec, resolution, frame rate, file size | unit | `npx vitest run backend/src/__tests__/metadata.test.ts -t "metadata"` | Wave 0 |
| BRWS-02 | Thumbnail file exists on disk after thumbnail stage | integration | `npx vitest run backend/src/__tests__/thumbnail.test.ts -t "thumbnail"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/vitest.config.ts` -- vitest configuration for backend
- [ ] `frontend/vitest.config.ts` -- vitest configuration for frontend (if testing frontend)
- [ ] `backend/src/__tests__/upload.test.ts` -- upload endpoint integration test
- [ ] `backend/src/__tests__/dedup.test.ts` -- duplicate hash detection unit test
- [ ] `backend/src/__tests__/metadata.test.ts` -- ffprobe metadata extraction unit test
- [ ] `backend/src/__tests__/thumbnail.test.ts` -- thumbnail generation test
- [ ] `backend/src/__tests__/status.test.ts` -- status polling endpoint test
- [ ] Framework install: `cd backend && npm install -D vitest` and `cd frontend && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`

## Groq API Reference

### Rate Limits (Free Tier)
| Metric | Limit |
|--------|-------|
| Requests per minute (RPM) | 20 |
| Requests per day (RPD) | 2,000 |
| Audio seconds per hour (ASH) | 7,200 (2 hours) |
| Audio seconds per day (ASD) | 28,800 (8 hours) |
| Max file size | 25 MB |
| Min file length | 0.01 seconds |

### Transcription Response (verbose_json with segment granularity)
```json
{
  "text": "Full transcription text...",
  "segments": [
    {
      "id": 0,
      "seek": 0,
      "start": 0.0,
      "end": 5.12,
      "text": "This is the first segment.",
      "avg_logprob": -0.25,
      "compression_ratio": 1.2,
      "no_speech_prob": 0.01
    }
  ]
}
```

## STORAGE_ROOT Layout

Per locked decision, each asset gets a UUID-named directory:
```
STORAGE_ROOT/
  {uuid}/
    original.ext          # Original video file (preserved extension)
    thumb.jpg             # Generated thumbnail
    audio.ogg             # Temp: extracted audio for Groq (deleted after transcription)
    transcript.json       # Segment data [{text, start, end}]
```

All paths stored in SQLite are relative to STORAGE_ROOT (e.g., `{uuid}/original.mp4`).

## Sources

### Primary (HIGH confidence)
- [Groq Speech-to-Text docs](https://console.groq.com/docs/speech-to-text) -- response formats, file limits, timestamp granularities
- [Groq Rate Limits docs](https://console.groq.com/docs/rate-limits) -- free tier RPM/RPD/ASH/ASD
- [Node.js crypto docs](https://nodejs.org/api/crypto.html) -- createHash streaming API
- [@fastify/multipart GitHub](https://github.com/fastify/fastify-multipart) -- streaming file upload API
- [p-queue GitHub](https://github.com/sindresorhus/p-queue) -- ESM-only, concurrency control
- [fluent-ffmpeg GitHub](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) -- ffprobe and ffmpeg Node.js API

### Secondary (MEDIUM confidence)
- npm registry version checks (verified 2026-03-24): @fastify/multipart@9.4.0, p-queue@9.1.0, fluent-ffmpeg@2.1.3, groq-sdk@1.1.1, @tanstack/react-query@5.95.2

### Tertiary (LOW confidence)
- Audio chunking for > 25 MB files: approach from CONTEXT.md discussion + Groq docs mention of chunking cookbook (not directly verified)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified on npm registry with current versions; locked decisions from CONTEXT.md
- Architecture: HIGH -- pipeline pattern is straightforward sequential stages; schema already exists
- Pitfalls: HIGH -- ffprobe frame rate parsing, Groq rate limits, p-queue ESM-only are well-documented issues
- Groq API: HIGH -- official docs verified for response format, rate limits, file size limits

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain, libraries are mature)
