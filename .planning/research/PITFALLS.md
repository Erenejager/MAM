# Domain Pitfalls

**Domain:** Local Media Asset Management (Whisper + OpenSearch + ffmpeg + React + Node.js)
**Researched:** 2026-03-11
**Confidence note:** HTTP range request behavior confirmed via MDN official docs. Whisper, OpenSearch, ffmpeg, and Node.js patterns drawn from training knowledge (cutoff August 2025) — flagged by confidence level per finding.

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

### Pitfall 2: Whisper Blocks the Node.js Process When Invoked Synchronously

**What goes wrong:** The ingest handler calls `child_process.execSync('whisper ...')` or `spawnSync(...)` directly in the request handler. This blocks the Node.js event loop for the entire transcription duration — which can be 5–30+ minutes for a 1-hour video on CPU. Every other request (browse, play, search) hangs until transcription completes. The app appears frozen.

**Why it happens:** Developers treat Whisper like a fast utility call. It is a heavyweight ML inference process. On CPU-only hardware, Whisper can take 4–10x real-time (a 10-minute video = 40–100 minutes transcription time).

**Consequences:**
- App completely unresponsive during transcription
- If multiple files are imported, all imports queue behind each other on the main thread
- Server process may OOM-kill if multiple Whisper processes are spawned concurrently
- No way to cancel an in-progress transcription

**Prevention:**
- Always use async `spawn()` from `child_process`, never `execSync` or `spawnSync`
- Implement a job queue (even a simple in-memory queue) that processes one Whisper job at a time
- Expose a `/jobs` status endpoint so the frontend can poll transcription progress
- Enforce a maximum of 1 concurrent Whisper process — running multiple on CPU will thrash memory and all will slow down

**Detection (warning signs):**
- API calls hang during a file import
- CPU hits 100% and the entire server stops responding
- `top`/Task Manager shows `whisper` or `python` consuming all cores with no other process getting time

**Phase:** Ingest pipeline — Phase 2 or 3

**Confidence:** MEDIUM — based on well-documented Node.js event loop behavior (confirmed via official docs) and known Whisper CPU performance characteristics from training data

---

### Pitfall 3: Whisper OOM-Kills or Crashes on Large Files Without Audio Pre-Extraction

**What goes wrong:** Whisper is invoked directly on a video file (`.mp4`, `.mkv`). Whisper internally uses ffmpeg to decode the audio, but it loads the entire decoded audio into RAM as float32 arrays before inference. For a 2-hour 4K video file, the in-memory audio representation can exceed 4–8 GB RAM. The OS kills the process. The ingest job disappears with no error surfaced to the user.

**Why it happens:** Whisper's CLI accepts video files, so developers assume it handles them efficiently. It does not stream audio — it decodes fully into memory.

**Consequences:**
- OOM crash with no error message visible to the user
- Asset is left in a "processing" state permanently (orphaned job)
- On machines with 8 GB RAM, files over ~30–60 minutes become unreliable

**Prevention:**
- Pre-extract audio to a WAV or FLAC file using ffmpeg before passing to Whisper: `ffmpeg -i input.mp4 -ar 16000 -ac 1 -f wav temp_audio.wav`
- Use 16 kHz mono WAV — Whisper's native sample rate; avoids unnecessary resampling overhead
- Delete the temp audio file after transcription completes (or fails)
- Consider using `whisper-base` or `whisper-small` models for long files when on memory-constrained hardware

**Detection (warning signs):**
- Jobs for files > 30 minutes silently disappear
- System RAM spikes to 100% during transcription
- No error in logs — process is killed before it can write one

**Phase:** Ingest pipeline — Phase 2 or 3

**Confidence:** MEDIUM — based on Whisper's known architecture (full decode into memory) from training data

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

**What goes wrong:** A file is imported, thumbnail generation starts, then Whisper crashes halfway through. The asset record is written to the database (or OpenSearch) in a half-complete state — thumbnail missing, transcript missing, status shows "processing" forever. Re-importing the same file creates a duplicate record. There is no way to retry just the failed step.

**Why it happens:** Ingest is implemented as a linear sequence of side effects with no transactional boundary and no state machine. Each step writes output without tracking which steps completed.

**Consequences:**
- Orphaned assets that can never be completed without manual database surgery
- Duplicate records after retry attempts
- No way to distinguish "pending" from "stuck" assets in the UI
- Re-running the app after a crash leaves the library in an inconsistent state

**Prevention:**
- Model ingest as a state machine with explicit status transitions: `pending → extracting_metadata → generating_thumbnail → transcribing → indexing → complete | failed`
- Store status per-step in the asset record (SQLite or a JSON file per asset)
- Make each step idempotent: check if thumbnail file already exists before running ffmpeg; check if transcript already exists before running Whisper
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

**What goes wrong:** Asset records store absolute file paths (e.g., `C:\Users\agharian\Videos\interview.mp4`). The user moves their video library directory to a different drive or the app is reinstalled to a different path. Every asset link is broken. Re-linking requires editing every record in the database.

**Prevention:**
- Store paths relative to a configurable `MEDIA_ROOT` directory (set in config, defaulting to `./media`)
- The app resolves absolute paths at runtime by joining `MEDIA_ROOT + relative_path`
- `MEDIA_ROOT` is stored in a config file (`.planning/config.json` or `app.config.json`), not hard-coded
- On startup, validate that `MEDIA_ROOT` exists and is readable; warn the user if it is missing

**Phase:** Infrastructure / storage design — Phase 1

**Confidence:** MEDIUM

---

### Pitfall 10: Whisper Model Not Downloaded at First Run, No User-Friendly Error

**What goes wrong:** The first time a file is imported, the app invokes Whisper, which attempts to download the model (~140 MB for `base`, ~1.5 GB for `large`). This download happens silently during an apparent transcription job. On a slow connection it takes minutes. If the download fails mid-way (network interruption), Whisper may leave a corrupt partial model file and fail every future transcription with a cryptic error.

**Prevention:**
- Include a setup/initialization step that pre-downloads the Whisper model before any file is imported
- Check for model existence at startup and warn the user if it is missing
- Document the model download in the README / first-run experience
- Store the model in a known location (`~/.cache/whisper/`) and verify file integrity (Whisper does this via hash check, but surface errors to the user)

**Phase:** Project setup / first-run experience — Phase 1

**Confidence:** MEDIUM

---

### Pitfall 11: CORS Misconfiguration Breaks the React Dev Server Against the API

**What goes wrong:** During development, the React Vite dev server runs on port 5173 and the Node.js backend runs on port 3000. The browser blocks API requests because CORS headers are missing. Developers add `Access-Control-Allow-Origin: *` as a quick fix. This works for GET requests but breaks for `POST` with JSON bodies (preflight OPTIONS requests fail), multipart file uploads, or custom headers — all of which this app uses.

**Prevention:**
- Use the `cors` npm package with explicit configuration: allow origin `http://localhost:5173`, methods `GET, POST, PUT, DELETE, OPTIONS`, headers `Content-Type, Authorization`
- Handle the OPTIONS preflight method explicitly: `app.options('*', cors(corsOptions))`
- In production (where frontend and backend are served from the same origin), CORS is not needed — design for this from the start using Vite's `proxy` config in dev

**Detection (warning signs):**
- GET requests work, but file uploads or POST requests fail with CORS errors in DevTools
- `Access-Control-Allow-Origin` header present on GET responses but not OPTIONS

**Phase:** Infrastructure — Phase 1

**Confidence:** HIGH — standard CORS behavior for Vite + Express dev setup

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

**What goes wrong:** A video starts playing in the asset detail panel. The user clicks away to a different asset. The `<video>` element is not unmounted — it keeps downloading the file in the background, consuming bandwidth and blocking the connection to the local server. On the next asset, a second video starts downloading. After browsing 5 assets, 5 concurrent video streams are in progress.

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
| CORS setup | OPTIONS preflight fails for multipart uploads | Use `cors` package with explicit options + `app.options('*', cors(...))` |
| Ingest pipeline | Sync Whisper call blocks event loop | Job queue, async spawn, 1 concurrent Whisper process max |
| Ingest pipeline | Whisper OOM on large video files | Pre-extract audio to 16kHz mono WAV before passing to Whisper |
| Ingest pipeline | Silent failures, orphaned assets | State machine for job status; idempotent per-step checks |
| ffmpeg thumbnails | Black frame captures | Use `thumbnail=300` filter; seek to 10% of duration as fallback |
| OpenSearch mapping | Dynamic mapping locks in wrong types | Define explicit mapping before first document insert |
| Search results | Full transcript returned in every query | Use `_source_excludes`; store full transcript in SQLite |
| Custom metadata | Label used as key — breaks on rename | Use UUID as key, label as display only |
| Video playback | Player keeps streaming after navigation | Clear `src` and pause on component unmount |
| First run | Whisper model not pre-downloaded | Setup step to download model; validate at startup |

---

## Sources

- HTTP range request behavior: MDN Web Docs — https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests (confirmed MEDIUM-HIGH confidence)
- Node.js event loop blocking: Node.js official guide "Don't Block the Event Loop" — https://nodejs.org/en/docs/guides/dont-block-the-event-loop (confirmed HIGH confidence via WebFetch)
- Express.js performance best practices: https://expressjs.com/en/advanced/best-practice-performance.html (confirmed MEDIUM confidence via WebFetch)
- OpenSearch mapping / Elasticsearch field types: Training knowledge (HIGH confidence — well-established behavior unchanged for many versions)
- Whisper memory/CPU behavior: Training knowledge (MEDIUM confidence — architecture is publicly documented; verify against current Whisper release notes)
- ffmpeg thumbnail filter: Training knowledge (MEDIUM confidence — stable ffmpeg API)
- multer / Express body limits: Training knowledge (HIGH confidence — well-documented defaults)
- CORS preflight behavior: Training knowledge (HIGH confidence — specified by the CORS W3C spec)
