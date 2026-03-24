# Requirements: MAM — Media Asset Management

**Defined:** 2026-03-11
**Core Value:** Find any video in your library instantly — by title, keyword, tag, or spoken word in the transcript.

## v1 Requirements

### Import

- [x] **IMP-01**: User can import videos via drag-and-drop or file picker (single or multiple files)
- [x] **IMP-02**: System detects and blocks duplicate files using content hash
- [ ] **IMP-03**: User can see per-stage import progress: metadata → thumbnail → transcription → indexed

### Metadata

- [ ] **META-01**: System auto-extracts duration, codec, resolution, frame rate, and file size on import (via ffprobe)
- [ ] **META-02**: User can edit title and description per asset
- [ ] **META-03**: User can add and remove tags (multi-value) per asset
- [ ] **META-04**: Admin can define global custom metadata fields applied to all assets

### Browse

- [ ] **BRWS-01**: User sees full-width asset cards with thumbnail, title, duration, tags, and transcript preview
- [ ] **BRWS-02**: System auto-generates a thumbnail per asset on import (via ffmpeg)
- [ ] **BRWS-03**: User can filter the asset list by clicking a tag in the sidebar
- [ ] **BRWS-04**: User can delete an asset from the library (with option to also delete the file)

### Playback

- [ ] **PLAY-01**: User can play a video in-app via click (no autoplay)
- [ ] **PLAY-02**: User can view a scrollable transcript with timestamps alongside the player
- [ ] **PLAY-03**: User can click a transcript line to seek the player to that timestamp
- [ ] **PLAY-04**: User can see transcription status (pending / processing / complete / failed) per asset

### Search

- [ ] **SRCH-01**: User can full-text search across title, description, and tags
- [ ] **SRCH-02**: User can search spoken words within transcripts
- [ ] **SRCH-03**: Search results show highlighted matching excerpts with a timecode link
- [ ] **SRCH-04**: User can filter search results by tag

## v2 Requirements

### Browse

- **BRWS-V2-01**: User can switch between card view and grid/thumbnail-only view
- **BRWS-V2-02**: Configurable watch folder (auto-ingest new files dropped into a directory)

### Playback

- **PLAY-V2-01**: Waveform / hover-scrub thumbnail strip on video player

### Export

- **EXP-V2-01**: User can export transcript as SRT or plain text file
- **EXP-V2-02**: Bulk tag editing across multiple assets

## Out of Scope

| Feature | Reason |
|---------|--------|
| Local Whisper / whisper.cpp | Requires large model files on disk and CPU-heavy processing — using Groq API instead |
| Multi-user / authentication | Single-user app, unnecessary complexity |
| Cloud file storage | Files stored on local filesystem only |
| Video editing / trimming | View and annotate only |
| Mobile / responsive layout | Desktop browser only |
| Real-time collaboration | Single-user |
| Facial recognition / AI suggestions | Out of scope for v1 |
| Collections / smart folders | Deferred to v2+ |
| Transcode / format conversion | Serve files as-is; document browser codec limitations |

## Transcription Architecture Note

Transcription is generated via **Groq API** (Whisper large-v3) as a background job after import.
- Requires `GROQ_API_KEY` in `.env` — validated at startup, server refuses to start if missing
- **Audio pre-extraction is mandatory** — Groq has a 25 MB file size limit. All video files must be pre-extracted to 16kHz mono OGG/Opus via ffmpeg before sending to Groq (a 1-hour video → ~5 MB). The temp audio file is deleted after transcription completes or fails.
- Free tier with rate limits (requests/min and requests/day) — ingest queue must handle 429 responses with exponential backoff retry
- No local model download or local compute needed
- Transcript segments (text + start/end timestamps) stored in SQLite and indexed in OpenSearch

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| IMP-01 | Phase 2 | Complete |
| IMP-02 | Phase 2 | Complete |
| IMP-03 | Phase 2 | Pending |
| META-01 | Phase 2 | Pending |
| META-02 | Phase 4 | Pending |
| META-03 | Phase 4 | Pending |
| META-04 | Phase 4 | Pending |
| BRWS-01 | Phase 3 | Pending |
| BRWS-02 | Phase 2 | Pending |
| BRWS-03 | Phase 3 | Pending |
| BRWS-04 | Phase 3 | Pending |
| PLAY-01 | Phase 3 | Pending |
| PLAY-02 | Phase 5 | Pending |
| PLAY-03 | Phase 5 | Pending |
| PLAY-04 | Phase 3 | Pending |
| SRCH-01 | Phase 6 | Pending |
| SRCH-02 | Phase 6 | Pending |
| SRCH-03 | Phase 6 | Pending |
| SRCH-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after roadmap creation*
