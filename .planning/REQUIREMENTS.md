# Requirements: MAM — Media Asset Management

**Defined:** 2026-03-11
**Core Value:** Find any video in your library instantly — by title, keyword, tag, or spoken word in the transcript.

## v1 Requirements

### Import

- [ ] **IMP-01**: User can import videos via drag-and-drop or file picker (single or multiple files)
- [ ] **IMP-02**: System detects and blocks duplicate files using content hash
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
- Requires `GROQ_API_KEY` in `.env`
- Groq accepts audio/video files directly — no local audio pre-extraction required
- Free tier with rate limits; no model download or local compute needed
- Transcript segments (text + start/end timestamps) stored in SQLite and indexed in OpenSearch

## Traceability

*Populated during roadmap creation.*

| Requirement | Phase | Status |
|-------------|-------|--------|
| IMP-01 | — | Pending |
| IMP-02 | — | Pending |
| IMP-03 | — | Pending |
| META-01 | — | Pending |
| META-02 | — | Pending |
| META-03 | — | Pending |
| META-04 | — | Pending |
| BRWS-01 | — | Pending |
| BRWS-02 | — | Pending |
| BRWS-03 | — | Pending |
| BRWS-04 | — | Pending |
| PLAY-01 | — | Pending |
| PLAY-02 | — | Pending |
| PLAY-03 | — | Pending |
| PLAY-04 | — | Pending |
| SRCH-01 | — | Pending |
| SRCH-02 | — | Pending |
| SRCH-03 | — | Pending |
| SRCH-04 | — | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 0
- Unmapped: 19 ⚠️

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after initial definition*
