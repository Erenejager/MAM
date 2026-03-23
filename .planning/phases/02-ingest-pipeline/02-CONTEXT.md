# Phase 2: Ingest Pipeline - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend pipeline that accepts video file uploads and runs 4 sequential stages: metadata extraction (ffprobe) → thumbnail generation (ffmpeg) → transcription (Groq API) → OpenSearch indexing. Includes a minimal import-only frontend UI to drive the pipeline. Browse, playback, and asset management are Phase 3+.

</domain>

<decisions>
## Implementation Decisions

### Import UI — Form and placement
- Full-page drop zone is the Phase 2 UI — a large centered drop zone with a file picker button
- No routing needed; Phase 3 will replace this surface with the browse grid
- Drag-and-drop activates on the **entire window**, not just the visible zone
- After the server responds 202, the page transitions inline to a progress view (drop zone → progress bar)
- On pipeline completion: brief success state ('Ready') then reset to drop zone for next import

### Import UI — Progress display
- Single animated **progress bar with a stage label** (e.g. "Transcribing...") — not a step indicator
- No time estimate; animated bar with label is sufficient
- An elapsed time counter (e.g. "0:34") is acceptable as a lightweight addition — Claude's discretion

### Progress polling
- Frontend polls `GET /api/assets/:id` every ~2-3 seconds while status is `pending` or `processing`
- Polling stops when all stages are `complete` or `failed`
- No WebSocket or SSE needed in Phase 2

### Stage failure behavior
- **Metadata failure = pipeline halt**: no duration/codec/resolution means the asset is unusable. Mark `status = 'error'`, surface which stage failed in the UI.
- **Transcription failure = auto-retry then soft-fail**: retry up to 3× with exponential backoff to handle Groq 429s (required by REQUIREMENTS.md). After all retries exhausted, mark `transcription_status = 'failed'` and continue — the asset is still usable without a transcript. `transcription_error` column stores the error message.
- **No retry button in Phase 2**: failed status is visible, but re-import is the workaround. Retry UI is Phase 3+.

### Cleanup on failure
- **Pipeline stage failure** (e.g. ffprobe error after file is on disk): delete the asset directory from `STORAGE_ROOT/{uuid}/` and remove the SQLite record — clean slate, no orphaned files or error records.
- **Mid-stream upload failure** (connection drop before file is fully written): delete the partial file from disk.
- Transcription soft-fail is the **exception**: since the asset is still usable (has metadata + thumbnail), do NOT delete on transcription failure — only delete on hard pipeline halts (metadata stage failure).

### Multi-file handling
- **Claude's discretion**: IMP-01 mentions "single or multiple files". Queue design (p-queue concurrency, per-file tracking) is left to the planner. At minimum, the drop zone must accept multiple files in one drop.

### Claude's Discretion
- Exact polling interval (2–3s window)
- Elapsed time counter implementation
- p-queue concurrency settings
- Thumbnail frame extraction timestamp (e.g. 5s into video)
- Temp audio file naming and cleanup timing
- Error state visual design in the progress bar

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — IMP-01, IMP-02, IMP-03, META-01, BRWS-02 define the acceptance criteria for this phase. ALSO contains the Transcription Architecture Note (Groq 25 MB limit, audio pre-extraction, 429 backoff requirement).

### Schema and data model
- `backend/src/db/schema.ts` — Full SQLite schema with all `*_status` columns (`metadata_status`, `thumbnail_status`, `transcription_status`, `search_index_status`), `file_hash`, `transcription_error`, `transcript_text`. Pipeline must write to these exact columns.

### OpenSearch index
- `backend/src/bootstrap/opensearch.ts` — Index creation and mapping already in place. Ingest pipeline's final stage writes here.

### Project decisions
- `.planning/PROJECT.md` §Key Decisions — Locked choices: p-queue (in-process), system ffmpeg, Groq audio pre-extraction (16kHz mono OGG), STORAGE_ROOT layout, SQLite at `~/.mam/mam.db`.

### Design system
- `design-system/mam/MASTER.md` — Cinema Dark tokens, component patterns. Frontend import UI must follow this.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/db/schema.ts`: All pipeline status columns are already defined — no schema changes needed
- `backend/src/db/index.ts`: Drizzle ORM db instance to import in route handlers and pipeline workers
- `backend/src/bootstrap/opensearch.ts`: OpenSearch client already initialised — import and reuse in the index stage
- `backend/src/bootstrap/validate-env.ts`: `GROQ_API_KEY` and `STORAGE_ROOT` are already validated at startup

### Established Patterns
- Fastify route registration: routes should be added as plugins in `backend/src/index.ts` (or a routes/ directory registered there)
- `@fastify/static` is already installed — can serve thumbnails from STORAGE_ROOT over HTTP without extra setup
- Frontend is bare (`App.tsx` returns a single div) — no routing, no components, no state library yet. Phase 2 adds the first real frontend code.

### Integration Points
- Upload endpoint (`POST /api/assets`) registers on the existing Fastify instance
- Status endpoint (`GET /api/assets/:id`) needed by the polling loop
- `@fastify/multipart` needs to be added (not yet installed) for file streaming
- `p-queue` needs to be added as a dependency
- Frontend needs a file drop/upload component — no existing UI primitives to reuse yet

</code_context>

<specifics>
## Specific Ideas

- Progress bar style: single bar filling left-to-right with stage label above (e.g. "Transcribing...") — user confirmed the progress-bar-with-label mockup
- No specific visual references given beyond the Cinema Dark design system

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-ingest-pipeline*
*Context gathered: 2026-03-23*
