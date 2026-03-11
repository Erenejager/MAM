# MAM — Media Asset Management

## What This Is

A single-user web application for managing video assets locally. Users can import video files via drag-and-drop or file picker, view and edit metadata (title, description, tags, custom fields), play back videos, and search across their library. Transcriptions are auto-generated on import using local Whisper and also surfaced in search results via OpenSearch.

## Core Value

Find any video in your library instantly — by title, keyword, tag, or spoken word in the transcript.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can import video files via drag-and-drop or file picker
- [ ] User can browse all assets as full-width cards with thumbnail, duration, size, and tags
- [ ] User can play back a video in-app (click-to-play, no autoplay)
- [ ] User can view and edit metadata: title, description, tags
- [ ] User can view full transcription for a video asset
- [ ] User can search across assets using OpenSearch (title, description, tags, transcript content)
- [ ] Transcription is auto-generated on import using local Whisper
- [ ] User can define global custom metadata fields applied to all assets
- [ ] System auto-extracts technical metadata on import: duration, file size, codec, resolution
- [ ] System auto-generates a thumbnail on import

### Out of Scope

- Multi-user / authentication — single user, no login needed
- Cloud storage — files stored on local filesystem only
- Mobile app — web-first, desktop browser only
- Real-time collaboration — not applicable for single-user
- Video editing — view and annotate only, no editing

## Context

- **Existing search infrastructure**: OpenSearch running locally (separate project). The MAM app will connect to this instance for full-text search across asset metadata and transcriptions.
- **Transcription**: Local Whisper inference — no API cost, runs on CPU. Transcription is a background job post-import.
- **Design system**: Cinema Dark aesthetic. Persisted to `design-system/mam/MASTER.md`. Colors: `#0F0F23` background, `#1E1B4B` panels, `#E11D48` accent. Fonts: Fira Code (headings), Fira Sans (body). Component library: shadcn/ui + Tailwind + Framer Motion + Lucide icons.
- **UI layout**: Top search bar, left sidebar navigation (All / Recent / Tags / Settings), main content area with full-width asset cards, right slide-in detail panel.

## Constraints

- **Stack**: React + Vite frontend, Node.js backend (Express or Fastify) — local server that manages file storage, Whisper invocation, and OpenSearch indexing
- **Storage**: Local filesystem — videos saved to a configurable local directory
- **Search**: OpenSearch (local instance) — must be running for search to work
- **Transcription**: Whisper runs locally — processing time depends on CPU; runs as background job
- **Platform**: Desktop browser (Chrome/Firefox), no mobile requirement

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Local filesystem storage | No cloud cost, simpler for single-user personal tool | — Pending |
| Local Whisper for transcription | No API cost, privacy, no internet required | — Pending |
| OpenSearch for search | Already available locally from another project | — Pending |
| Full-width card layout | Maximizes metadata visibility without opening a detail view | — Pending |
| No authentication | Single-user app, unnecessary complexity | — Pending |
| React + Vite stack | Fast DX, component ecosystem, shadcn/ui available | — Pending |

---
*Last updated: 2026-03-11 after initialization*
