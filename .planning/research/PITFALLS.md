# Domain Pitfalls

**Domain:** Media Asset Management (Groq API + OpenSearch + ffmpeg + React + Node.js) — Hetzner server + Tailscale deployment
**Researched:** 2026-03-18
**Confidence note:** HTTP range request behavior confirmed via MDN official docs. OpenSearch, ffmpeg, and Node.js patterns drawn from training knowledge (cutoff August 2025) — flagged by confidence level per finding. Transcription approach updated to Groq API (Whisper large-v3 via groq-sdk).

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or total ingest pipeline failure.

---

### Pitfall 1: Video Playback Fails Because Node.js Does Not Serve Range Requests

**What goes wrong:** The React frontend renders a `<video>` element pointing to a Node.js endpoint that serves the file as a plain stream (`res.pipe(fs.createReadStream(...))`). Video plays from the start but seeking jumps back to the beginning, or the browser refuses to play the file at all in some codecs. The HTML5 video element requires `Accept-Ranges: bytes` and proper `206 Partial Content` responses to enable seeking, duration detection, and codec negotiation.

**Why it happens:** Express's `res.sendFile()` handles range requests correctly, but any hand-rolled streaming endpoint (piping a readable stream) does not. Developers assume streaming = video support. It does not.

**Consequences:**
- Video seeks silently fail — the player jumps back to position 0
- Large files may force the browser to download the entire file before playing begins
- Duration may show as 0:00 or NaN until the whole file is buffered
- Some browsers (Safari especially) refuse to play at all without a proper 206 response

**Prevention:**
- Use `express.static()` or `res.sendFile()` — both handle `Range` headers and return `206 Partial Content` automatically
- Never use `fs.createReadStream()` piped directly to `res` for video endpoints without manually parsing `Range` headers
- Test seeking immediately after first implementation — do not defer this

**Detection (warning signs):**
- Video plays but scrubbing jumps to 0:00
- Browser DevTools Network tab shows `200 OK` instead of `206 Partial Content` on video requests
- Duration displays as NaN or 0

**Phase:** Core infrastructure / video serving endpoint — Phase 1 or 2

---

### Pitfall 2: Awaiting Groq API Call in the Request Handler

**What goes wrong:** The ingest handler awaits the groq-sdk call synchronously in the request lifecycle, blocking the response until transcription completes.

**Why it happens:** Groq calls can take 10–60 seconds for long audio files. Awaiting in the handler delays the 202 response — the client gets no acknowledgment while the server is occupied with the Groq call.

**Prevention:**
- Respond 202 immediately after file copy + SQLite record creation
- Enqueue the Groq call as a background job via p-queue
- Never await transcription in the request handler

**Phase:** Ingest pipeline — Phase 2 or 3

**Confidence:** HIGH — standard Node.js async pattern; Groq API latency is well-documented

---

### Pitfall 3: Groq 25 MB File Size Limit Not Handled

**What goes wrong:** A video file is sent directly to the Groq API. Any file larger than 25 MB fails with a 413 error from Groq.

**Why it happens:** Groq's Whisper endpoint has a hard 25 MB upload limit. Most video files exceed this by a significant margin.

**Consequences:**
- Transcription silently fails for the majority of real-world video files
- The asset is left in a "processing" or "failed" state with no clear explanation surfaced to the user

**Prevention:**
- ALWAYS pre-extract audio via ffmpeg before sending to Groq: `ffmpeg -i input.mp4 -ar 16000 -ac 1 -c:a libopus -b:a 12k temp.ogg`
- A 1-hour video becomes approximately 5 MB OGG at these settings — well within the 25 MB limit
- Delete the temp file in a `finally` block regardless of success or failure

**Phase:** Ingest pipeline — Phase 2 or 3

**Confidence:** HIGH — Groq's 25 MB file size limit is documented in their API reference

---

### Pitfall 4: OpenSearch Index Mapping Locked In at First Document

**What goes wrong:** The index is created without an explicit mapping. OpenSearch's dynamic mapping infers field types from the first document inserted. If the first `tags` value is a string `"interview"`, the field is mapped as `text`. Later when the app sends `["interview", "documentary"]` (an array), behavior becomes unpredictable — or vice versa. Changing a field type after documents exist requires a full index delete-and-reindex. There is no ALTER TABLE equivalent.

**Why it happens:** Dynamic mapping works fine in early development. The problem surfaces when field types need to change (e.g., `duration` ingested as a string `"00:02:34"` needs to become a number for range queries) and there is already data in the index.

**Consequences:**
- Tags field becomes unsortable/unaggregatable if mapped as `text` instead of `keyword`
- Numeric range queries (`duration > 60`) fail if `duration` was mapped as `text`
- Full re-index required — all data must be re-imported
- Dynamic mapping of the transcript field without `index: false` on sub-fields can cause index bloat

**Prevention:**
- Define an explicit index mapping before inserting any data — do this in Phase 1 bootstrap code
- Map `tags` as `keyword` (for exact match, aggregations, sorting) — if you need full-text search on tags, use a multi-field: `keyword` + `text`
- Map `duration` as `float` or `integer` (seconds) — never as a formatted string
- Map `transcript` as `text` with a separate `keyword` multi-field disabled to prevent index explosion
- Map `title` and `description` as `text` (analyzed) with a `keyword` sub-field for sorting
- Set `dynamic: false` or `dynamic: strict` after the initial mapping to prevent new unintended fields

**Detection (warning signs):**
- Tag filters return no results even though documents exist with that tag value
- Sort by duration returns alphabetical order instead of numeric
- Index size grows unexpectedly fast

**Phase:** Infrastructure setup — Phase 1 (before first document is indexed)

**Confidence:** HIGH — OpenSearch/Elasticsearch dynamic mapping behavior is well-established and extensively documented

---

### Pitfall 5: Ingest Pipeline Has No Idempotency or Failure Recovery

**What goes wrong:** A file is imported, thumbnail generation starts, then the Groq API call fails halfway through. The asset record is written to the database (or OpenSearch) in a half-complete state — thumbnail missing, transcript missing, status shows "processing" forever. Re-importing the same file creates a duplicate record. There is no way to retry just the failed step.

**Why it happens:** Ingest is implemented as a linear sequence of side effects with no transactional boundary and no state machine. Each step writes output without tracking which steps completed.

**Consequences:**
- Orphaned assets that can never be completed without manual database surgery
- Duplicate records after retry attempts
- No way to distinguish "pending" from "stuck" assets in the UI
- Re-running the app after a crash leaves the library in an inconsistent state

**Prevention:**
- Model ingest as a state machine with explicit status transitions: `pending → extracting_metadata → generating_thumbnail → transcribing → indexing → complete | failed`
- Store status per-step in the asset record (SQLite or a JSON file per asset)
- Make each step idempotent: check if thumbnail file already exists before running ffmpeg; check if transcript already exists before calling Groq
- Implement a "resume on startup" check that picks up `pending` or `failed` jobs and retries them
- Use a content hash (MD5/SHA256) of the file as a deduplication key — reject imports of files already in the library

**Detection (warning signs):**
- Assets stuck at "processing" after a restart
- Library shows the same filename twice after a retry
- Thumbnail images are missing for some cards but show no error

**Phase:** Ingest pipeline architecture — Phase 2

**Confidence:** MEDIUM — standard distributed systems pattern applied to this specific ingest context

---

## Moderate Pitfalls

### Pitfall 6: ffmpeg Thumbnail Extraction Picks a Black Frame

**What goes wrong:** ffmpeg is called with `-ss 00:00:01 -vframes 1` to capture a thumbnail at the 1-second mark. Many videos start with a black fade-in, title card, or studio logo at the beginning. Every thumbnail in the library shows a black frame or the same logo.

**Prevention:**
- Use the `thumbnail` filter instead of a fixed timestamp: `ffmpeg -i input.mp4 -vf thumbnail=300 -vframes 1 thumb.jpg` — this selects the most representative frame from the first 300 frames
- As a fallback, seek to 10% of the video duration rather than an absolute 1 second
- Store the timestamp used so it can be displayed or overridden later

**Phase:** Ingest pipeline — Phase 2

**Confidence:** MEDIUM

---

### Pitfall 7: ffmpeg Fails Silently on Unusual Codecs and Containers

**What goes wrong:** ffmpeg exits with a non-zero code when encountering a codec it cannot decode (e.g., proprietary camera formats, older DivX, or HEVC without the right build). The Node.js `child_process` wrapper catches `stderr` but the ingest job is not marked as failed because the error handling only checks `exit code === 0` on the process close event, and some ffmpeg errors still exit with 0 but write nothing to output.

**Prevention:**
- Always check both exit code AND whether the output file was created and has non-zero size after ffmpeg completes
- Log the full `stderr` stream from ffmpeg to a per-asset log file for debugging
- Surface codec/container errors clearly in the UI — "Thumbnail failed: unsupported codec" is more useful than a silent missing thumbnail
- Test with at least: MP4/H.264, MP4/HEVC, MKV, MOV, and AVI

**Phase:** Ingest pipeline — Phase 2

**Confidence:** MEDIUM

---

### Pitfall 8: OpenSearch Is Treated as a Source of Truth

**What goes wrong:** Asset metadata lives only in OpenSearch. When the index is deleted, rebuilt, or corrupted, all metadata (user-added titles, descriptions, tags, custom fields) is lost. OpenSearch is a search index, not a primary database.

**Prevention:**
- Maintain a canonical metadata store separate from OpenSearch — SQLite is the right choice for this project (lightweight, single-file, no server, handles single-user writes perfectly)
- OpenSearch is a projection of the SQLite data, not the authority
- Implement a `reindex` command that rebuilds the OpenSearch index from SQLite — this should be trivially runnable at any time
- Never write metadata only to OpenSearch; always write to SQLite first, then index to OpenSearch

**Phase:** Architecture — Phase 1 (foundational decision before any data is stored)

**Confidence:** HIGH — this is a well-understood architectural principle; using a search engine as primary storage is a documented anti-pattern

---

### Pitfall 9: File Path Storage Creates Portability Failures

**What goes wrong:** Asset records store absolute file paths (e.g., `/home/user/videos/interview.mp4`). The video library directory moves or the app is reinstalled to a different path. Every asset link is broken. Re-linking requires editing every record in the database.

**Prevention:**
- Store paths relative to a configurable `MEDIA_ROOT` directory (set in config, defaulting to `./media`)
- The app resolves absolute paths at runtime by joining `MEDIA_ROOT + relative_path`
- `MEDIA_ROOT` is stored in a config file or environment variable, not hard-coded
- On startup, validate that `MEDIA_ROOT` exists and is readable; warn the user if it is missing

**Phase:** Infrastructure / storage design — Phase 1

**Confidence:** MEDIUM

---

### Pitfall 10: Groq API Key Missing or Invalid at Runtime

**What goes wrong:** `GROQ_API_KEY` is not set or has expired. The first transcription job fails with a 401 error deep in the pipeline, with no clear feedback to the user that the root cause is a missing or invalid API key.

**Prevention:**
- Validate `GROQ_API_KEY` at server startup — check env var presence at minimum; optionally make a lightweight test call
- Refuse to start the server if the key is missing
- Show a clear error message at boot so the operator can diagnose the issue immediately

**Phase:** Project setup / startup validation — Phase 1

**Confidence:** HIGH — standard env var validation pattern

---

### Pitfall 10a: Groq Rate Limit (429) Not Handled in Job Queue

**What goes wrong:** Multiple files are imported simultaneously. Groq returns 429 Too Many Requests. The job is marked as failed permanently with no retry, even though the failure is transient.

**Prevention:**
- Implement exponential backoff retry on 429 responses: 3 attempts with delays of 2s, 4s, and 8s before marking `transcription_status='failed'`
- Log the rate limit hit explicitly so it is visible in server logs
- The p-queue concurrency limit (1 concurrent Groq call) reduces the likelihood of hitting rate limits for normal single-user usage

**Phase:** Ingest pipeline — Phase 2

**Confidence:** MEDIUM — standard retry pattern for rate-limited HTTP APIs

---

### Pitfall 11: CORS Misconfiguration in Development

**What goes wrong:** On the Hetzner server, nginx serves both the frontend and proxies the backend — same origin, no CORS issue in production. CORS only applies during local development, where the Vite dev server runs on a different port than Fastify. The risk is configuring CORS too broadly (e.g., `Access-Control-Allow-Origin: *`) during development and forgetting to remove or restrict it before deploying.

**Prevention:**
- Gate CORS configuration on `NODE_ENV=development`
- In production, rely on nginx reverse proxy — no CORS headers needed
- Do not leave wildcard CORS in production

**Phase:** Infrastructure — Phase 1

**Confidence:** HIGH

---

### Pitfall 12: Uploading Large Video Files via Multipart Form Hits Express Body Size Limits

**What goes wrong:** A 4 GB video file upload fails with a `413 Payload Too Large` error. Express and most middleware (including `multer`) have default limits that are far below video file sizes. `body-parser` has a 100 KB default limit. `multer` defaults to no limit (which is a different problem — unbounded disk writes).

**Prevention:**
- Use `multer` with a `dest` option pointing to the media directory — this streams directly to disk rather than buffering in memory
- Set a reasonable `fileSize` limit on multer (e.g., 50 GB for a local tool) — enough to not block real use, but prevent runaway writes
- Never use `express.json()` or `body-parser` for file upload routes
- Remove the Express `limit` option default issue by not applying `bodyParser` globally to file upload routes

**Detection (warning signs):**
- Upload of any file > 1 MB fails immediately with 413
- Small files work, large files fail without a helpful error message

**Phase:** File upload / ingest endpoint — Phase 2

**Confidence:** HIGH — Express + multer size limit behavior is well-documented

---

## Minor Pitfalls

### Pitfall 13: Transcript Full Text Stored in OpenSearch With No Truncation

**What goes wrong:** A 2-hour video transcript can be 50,000–100,000 words. OpenSearch indexes it as a single `text` field. This works but the source document stored in OpenSearch is very large. If the API fetches the full document from OpenSearch for every search result, response payloads become huge even when only displaying a snippet.

**Prevention:**
- Use `_source_excludes` in OpenSearch queries to exclude the `transcript` field from search results — return only the highlighted snippet via the highlighting API
- Store the full transcript in SQLite, not OpenSearch; index only the text in OpenSearch and retrieve the full text from SQLite when the detail panel is opened

**Phase:** Search implementation — Phase 3

**Confidence:** MEDIUM

---

### Pitfall 14: React Video Player Does Not Unload on Navigation

**What goes wrong:** A video starts playing in the asset detail panel. The user clicks away to a different asset. The `<video>` element is not unmounted — it keeps downloading the file in the background, consuming bandwidth and blocking the connection to the server. On the next asset, a second video starts downloading. After browsing 5 assets, 5 concurrent video streams are in progress.

**Prevention:**
- Always pause the `<video>` element and clear `src` (set to `""`) in the component's cleanup/unmount effect
- Use a single video player component at the layout level rather than mounting one per asset card
- Revoke any object URLs created via `URL.createObjectURL()` in the unmount effect

**Phase:** Frontend video player component — Phase 3

**Confidence:** MEDIUM

---

### Pitfall 15: Custom Metadata Fields Schema Not Versioned

**What goes wrong:** The user defines custom metadata fields (e.g., "Project", "Client", "Rating"). The schema is stored in config. Later the schema changes — a field is renamed or deleted. Existing assets still have the old field key in their metadata. The UI shows `undefined` for renamed fields. There is no migration path.

**Prevention:**
- Store custom field definitions with an `id` (UUID) and a `label` — never use the label as the key in asset metadata
- When a field label changes, only the display label changes — the `id` remains stable
- Implement schema versioning: store a `schemaVersion` number alongside field definitions
- Soft-delete fields rather than hard-deleting: mark as `archived: true` so existing asset data is preserved

**Phase:** Custom metadata feature — Phase 3 or 4

**Confidence:** MEDIUM

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Storage / DB schema design | Absolute file paths + OpenSearch as primary store | Use relative paths from MEDIA_ROOT; SQLite as source of truth |
| Video serving endpoint | Missing HTTP range request support | Use `res.sendFile()` or `express.static()`; test seeking on Day 1 |
| File upload handler | 413 errors on large files | Use `multer` with `dest` (disk storage), not memory storage |
| CORS setup | Wildcard CORS left in production | Gate CORS on `NODE_ENV=development`; nginx handles same-origin in production |
| Ingest pipeline | Groq call awaited in request handler | Respond 202 immediately, enqueue Groq call as background job via p-queue |
| Ingest pipeline | Groq 25 MB limit | Pre-extract audio to OGG via ffmpeg before every Groq call |
| Ingest pipeline | Silent failures, orphaned assets | State machine for job status; idempotent per-step checks |
| Ingest pipeline | Groq 429 rate limit | Retry with exponential backoff (3 attempts) |
| ffmpeg thumbnails | Black frame captures | Use `thumbnail=300` filter; seek to 10% of duration as fallback |
| OpenSearch mapping | Dynamic mapping locks in wrong types | Define explicit mapping before first document insert |
| Search results | Full transcript returned in every query | Use `_source_excludes`; store full transcript in SQLite |
| Custom metadata | Label used as key — breaks on rename | Use UUID as key, label as display only |
| Video playback | Player keeps streaming after navigation | Clear `src` and pause on component unmount |
| Startup | GROQ_API_KEY missing or invalid | Validate env var at startup, refuse to start if missing |

---

## Sources

- HTTP range request behavior: MDN Web Docs — https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests (confirmed MEDIUM-HIGH confidence)
- Node.js event loop blocking: Node.js official guide "Don't Block the Event Loop" — https://nodejs.org/en/docs/guides/dont-block-the-event-loop (confirmed HIGH confidence via WebFetch)
- Express.js performance best practices: https://expressjs.com/en/advanced/best-practice-performance.html (confirmed MEDIUM confidence via WebFetch)
- OpenSearch mapping / Elasticsearch field types: Training knowledge (HIGH confidence — well-established behavior unchanged for many versions)
- Groq API file size limits and rate limits: Groq API documentation (HIGH confidence — documented hard limits)
- ffmpeg thumbnail filter: Training knowledge (MEDIUM confidence — stable ffmpeg API)
- multer / Express body limits: Training knowledge (HIGH confidence — well-documented defaults)
- CORS preflight behavior: Training knowledge (HIGH confidence — specified by the CORS W3C spec)
