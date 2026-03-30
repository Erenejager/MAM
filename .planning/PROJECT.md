# MAM — Media Asset Management

## What This Is

A single-user web application for managing video assets on a self-hosted Hetzner server. Users can import video files via drag-and-drop or file picker, view and edit metadata (title, description, tags, custom fields), play back videos, and search across their library. Transcriptions are auto-generated on import using the Groq API (Whisper large-v3) and surfaced in search results via OpenSearch.

## Core Value

Find any video in your library instantly — by title, keyword, tag, or spoken word in the transcript.

## Requirements

### Validated

- [x] User can import video files via drag-and-drop or file picker — Validated in Phase 02: Ingest Pipeline
- [x] User can browse all assets as full-width cards with thumbnail, duration, size, and tags — Validated in Phase 03: Browse and Playback
- [x] User can play back a video in-app (click-to-play, no autoplay) — Validated in Phase 03: Browse and Playback
- [x] System auto-extracts technical metadata on import: duration, file size, codec, resolution — Validated in Phase 02: Ingest Pipeline
- [x] System auto-generates a thumbnail on import — Validated in Phase 02: Ingest Pipeline
- [x] User can view and edit metadata: title, description, tags — Validated in Phase 04: Metadata Editing
- [x] User can define global custom metadata fields applied to all assets — Validated in Phase 04: Metadata Editing
- [x] User can view full transcription for a video asset — Validated in Phase 05: Transcript Viewer

### Active

- [ ] User can search across assets using OpenSearch (title, description, tags, transcript content)
- [ ] Transcription is auto-generated on import using Groq API (Whisper large-v3)

### Out of Scope

- Multi-user / authentication — access controlled by Tailscale network membership, no in-app login
- Cloud storage — video files stored on Hetzner server local disk only
- Mobile app — web-first, desktop browser only
- Real-time collaboration — not applicable for single-user
- Video editing — view and annotate only, no editing

## Context

- **Deployment**: Hetzner Cloud VPS. App runs as a Node.js server process. Files stored at `STORAGE_ROOT` (e.g. `/mnt/mam/`).
- **Access**: Via Tailscale only. Server not exposed to public internet. Tailscale provides encrypted access and acts as the authentication layer — no in-app auth needed.
- **Existing search infrastructure**: OpenSearch running locally on the same Hetzner server. The MAM app connects to this instance for full-text search across asset metadata and transcriptions.
- **Transcription**: Groq API (Whisper large-v3). Audio is pre-extracted to 16kHz mono OGG before upload to respect Groq's 25 MB file size limit. Background job post-import.
- **Design system**: Cinema Dark aesthetic. Persisted to `design-system/mam/MASTER.md`. Colors: `#0F0F23` background, `#1E1B4B` panels, `#E11D48` accent. Fonts: Fira Code (headings), Fira Sans (body). Component library: shadcn/ui + Tailwind + Framer Motion + Lucide icons.
- **UI layout**: Top search bar, left sidebar navigation (All / Recent / Tags / Settings), main content area with full-width asset cards, right slide-in detail panel.

## Constraints

- **Stack**: React + Vite frontend, Node.js backend (Fastify) — server manages file storage, Groq transcription, and OpenSearch indexing
- **Storage**: Hetzner server local disk — videos saved to a configurable `STORAGE_ROOT` directory (e.g. `/mnt/mam/`)
- **Database**: SQLite at `~/.mam/mam.db` — outside `STORAGE_ROOT` to keep app state separate from media files
- **Search**: OpenSearch (local instance on same server) — must be running for search to work
- **Transcription**: Groq API — requires `GROQ_API_KEY`, internet access, and audio pre-extraction via ffmpeg
- **Platform**: Desktop browser (Chrome/Firefox), no mobile requirement
- **ffmpeg**: System-installed on server (`apt-get install ffmpeg`) — not bundled via npm

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hetzner server deployment | 24/7 availability, accessible from anywhere, no local machine dependency | Confirmed |
| Tailscale for access | No public internet exposure, Tailscale IS the auth layer, zero app-level auth code needed | Confirmed |
| SQLite outside STORAGE_ROOT | Separation of app state from media files; survives STORAGE_ROOT remount/expansion | Confirmed |
| Groq API for transcription | No local model download, no CPU compute, fast (cloud GPU), simple HTTP call | Confirmed |
| Audio pre-extraction before Groq | Groq 25 MB limit; ffmpeg extracts 16kHz mono OGG (~5 MB/hr) before sending | Confirmed |
| System ffmpeg (apt-get) | Server has ffmpeg available; no need for @ffmpeg-installer/ffmpeg npm package | Confirmed |
| p-queue (in-process) | Groq is fast async HTTP, not CPU-bound; no Redis dependency needed | Confirmed |
| No authentication in app | Tailscale handles access control at network level | Confirmed |
| Local filesystem storage | No S3 complexity; Hetzner Volume can expand disk if needed | Confirmed |
| OpenSearch for search | Already running on the server from another project | Confirmed |
| Full-width card layout | Maximizes metadata visibility without opening a detail view | Confirmed |
| React + Vite stack | Fast DX, component ecosystem, shadcn/ui available | Confirmed |

---
*Last updated: 2026-03-30 — Phase 05 complete: transcript viewer (tab layout, scrollable transcript, click-to-seek, in-transcript search)*
