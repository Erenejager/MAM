# Roadmap: MAM — Media Asset Management

## Overview

Six phases build the product from the ground up, each delivering one coherent capability. Phase 1 lays the infrastructure that every later phase depends on — wrong decisions here cause rewrites, not rework. Phase 2 builds the ingest pipeline entirely on the backend before any UI exists, so Phase 3 can browse real data. Phase 4 adds annotation, Phase 5 surfaces transcripts in the player, and Phase 6 completes the core value: find any video by spoken word.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Project scaffolding, database schema, OpenSearch index mapping, storage layout, nginx config and systemd service for Hetzner deployment (completed 2026-03-22)
- [x] **Phase 2: Ingest Pipeline** - File import, metadata extraction, thumbnail generation, Groq transcription, OpenSearch indexing (completed 2026-03-24)
- [ ] **Phase 3: Browse and Playback** - Asset card grid, tag filter sidebar, in-app video player, transcription status display
- [x] **Phase 4: Metadata Editing** - Editable title/description/tags, custom global metadata fields (completed 2026-03-30)
- [ ] **Phase 5: Transcript Viewer** - Scrollable transcript panel, jump-to-timestamp, player sync
- [ ] **Phase 6: Search** - Full-text search across metadata and transcript, highlighted excerpts with timecode links, asset deletion

## Phase Details

### Phase 1: Foundation
**Goal**: The application skeleton runs correctly and every foundational decision is locked in before feature work begins
**Depends on**: Nothing (first phase)
**Requirements**: None (enabling infrastructure — all 19 v1 requirements depend on this phase)
**Success Criteria** (what must be TRUE):
  1. The app starts with `npm run dev` (frontend) and `npm run dev` (backend) without errors and the health check endpoint returns 200
  2. SQLite database initializes with the full schema (including file_hash, frame_rate, transcription_error columns) and migrations run cleanly on a fresh checkout
  3. OpenSearch index exists with explicit field mappings (tags as keyword, duration as float, transcript as text, dynamic: false) — verified by inspecting the index before any document is inserted
  4. STORAGE_ROOT env var is validated at startup: server refuses to start if the directory does not exist
  5. GROQ_API_KEY is validated at startup and a clear error is shown if missing
  6. nginx config is written and documented: serves Vite-built frontend static files, proxies `/api` to Fastify. systemd service unit file exists for the Node.js backend process.
**Plans:** 4/4 plans complete
Plans:
- [ ] 01-01-PLAN.md — Frontend scaffolding (Vite + React 18 + Tailwind 3 with Cinema Dark tokens)
- [ ] 01-02-PLAN.md — Backend scaffolding (Fastify 4 + SQLite schema + drizzle-orm migrations)
- [ ] 01-03-PLAN.md — Startup validation (env checks, OpenSearch index init, health check wiring)
- [ ] 01-04-PLAN.md — Deployment configs (nginx reverse proxy + systemd service + documentation)

### Phase 2: Ingest Pipeline
**Goal**: Users can import video files and the system automatically extracts metadata, generates a thumbnail, transcribes via Groq, and indexes the asset — all tracked per stage
**Depends on**: Phase 1
**Requirements**: IMP-01, IMP-02, IMP-03, META-01, BRWS-02
**Success Criteria** (what must be TRUE):
  1. User can drag-and-drop or pick a video file, and the server responds 202 immediately while pipeline stages run in the background
  2. Importing a duplicate file (same content hash) is blocked — the server returns an error and no duplicate record is created in SQLite
  3. After import, the asset record in SQLite has duration, codec, resolution, frame rate, and file size populated from ffprobe
  4. A thumbnail image file exists on disk and is accessible via HTTP after the thumbnail stage completes
  5. Transcription segments (text + start/end timestamps) are stored in SQLite after Groq API completes, and each import stage (metadata / thumbnail / transcription / indexed) has a queryable status field (pending / processing / complete / failed)
**Plans**: TBD

### Phase 3: Browse and Playback
**Goal**: Users can see their full library as a browsable card grid, filter by tag, play any video in-app, and see transcription progress
**Depends on**: Phase 2
**Requirements**: BRWS-01, BRWS-03, BRWS-04, PLAY-01, PLAY-04
**Success Criteria** (what must be TRUE):
  1. User sees the full asset library as full-width cards showing thumbnail, title, duration, tags, and transcript status — with no layout shifts after load
  2. User can click a tag in the sidebar to filter the visible assets to only those with that tag
  3. User can play a video in-app by clicking it — the player starts on click, does not autoplay, and video seeking (scrubbing) works correctly (HTTP 206 range requests)
  4. User can delete an asset and is offered the choice to remove it from the library only, or delete the file from disk as well
  5. Transcription status (pending / processing / complete / failed) is visible per card and updates without a full page reload
**Plans:** 5 plans (4 executed + 1 gap closure)
Plans:
- [ ] 03-01-PLAN.md — Backend API endpoints (list, tags, delete, patch) + tests
- [ ] 03-02-PLAN.md — Frontend foundation (deps, types, utilities, hooks)
- [ ] 03-03-PLAN.md — App shell, asset card grid, tag sidebar, context menu, delete dialog
- [ ] 03-04-PLAN.md — Detail panel with video player, metadata, transcript sync
- [ ] 03-05-PLAN.md — Gap closure: fix /storage proxy and createdAt timestamp

### Phase 4: Metadata Editing
**Goal**: Users can annotate any asset with a title, description, and tags, and define global custom fields that apply to every asset in the library
**Depends on**: Phase 3
**Requirements**: META-02, META-03, META-04
**Success Criteria** (what must be TRUE):
  1. User can edit the title and description of an asset inline in the detail panel and the changes persist across browser refreshes
  2. User can add and remove tags on an asset; added tags appear immediately in the tag sidebar filter
  3. User can define a new global custom metadata field (name + type) in Settings and that field appears on every existing and future asset detail panel
  4. Changes to metadata are reflected in OpenSearch within one subsequent search query (async re-index after SQLite write)
**Plans**: TBD

### Phase 5: Transcript Viewer
**Goal**: Users can read the full transcript alongside the player and navigate the video by clicking any spoken line
**Depends on**: Phase 4
**Requirements**: PLAY-02, PLAY-03
**Success Criteria** (what must be TRUE):
  1. User can open an asset's detail view and see a scrollable transcript panel with each line showing its timecode
  2. User can click any transcript line and the video player immediately seeks to that timestamp
  3. The currently-playing transcript segment is visually highlighted as the video plays
**Plans**: TBD

### Phase 6: Search
**Goal**: Users can find any asset by title, tag, description, or spoken word in the transcript — the core value of the application is fully delivered
**Depends on**: Phase 5
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04
**Success Criteria** (what must be TRUE):
  1. User can type a query in the top search bar and see matching assets with the matching terms highlighted in the title, description, or tags
  2. User can search for a word spoken in a video and see results that include transcript excerpt snippets with highlighted matching text
  3. User can click a timecode link in a transcript search result and the video player opens at that exact moment
  4. User can filter search results by clicking a tag — results narrow to only assets with that tag
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete   | 2026-03-22 |
| 2. Ingest Pipeline | 3/3 | Complete   | 2026-03-26 |
| 3. Browse and Playback | 4/5 | In Progress|  |
| 4. Metadata Editing | 3/3 | Complete   | 2026-03-30 |
| 5. Transcript Viewer | 0/TBD | Not started | - |
| 6. Search | 0/TBD | Not started | - |
