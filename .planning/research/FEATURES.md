# Feature Landscape

**Domain:** Personal / single-user Media Asset Management (MAM) — local video library
**Researched:** 2026-03-11
**Confidence note:** Research conducted from training data (cutoff August 2025). WebSearch, WebFetch, and Bash tools were unavailable. Competitive analysis draws on direct knowledge of Adobe Bridge (CC 2024), Kyno 2.x, Hedge 23/24, Silverstack Lab 7, DaVinci Resolve media page, Mochi 1.x, and self-hosted tools (Jellyfin, Immich, Dim). Confidence is noted per section.

---

## Table Stakes

Features users expect in any credible MAM/video library tool. Missing = product feels broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Thumbnail generation | Every MAM shows a frame representative of the clip; without it the library is visually useless | Low | Auto-generate at import from frame near 10% mark; allow manual scrub to pick frame later |
| File import (drag-drop + picker) | Standard desktop-app affordance; users will not use a tool that requires CLI or manual DB entry | Low | Must handle multiple files and folder drop in one gesture |
| Auto-extracted technical metadata | Duration, resolution, codec, file size, frame rate, audio channels — users take this for granted | Low | FFprobe covers this reliably; no user configuration needed |
| Inline video playback | A video library that can't play video feels absurd; users will not tolerate opening an external player | Medium | HTML5 `<video>` covers most modern codecs; H.264/AAC is universal; HEVC/AV1 support varies by browser |
| Editable descriptive metadata | Title, description, tags — the absolute floor of annotation | Low | Tags should support multi-value; title should default to filename |
| Full-text search | The core value prop of any MAM over a plain file system; must search across all metadata fields | Medium | OpenSearch already available; straightforward for title/description/tags |
| Tag browsing / filter sidebar | Users navigate by browsing tags as much as by searching; filter-by-tag is expected behavior | Low | Sidebar tag list is standard in every competitor |
| Persistent library state | Library survives app restart; files don't need to be re-imported | Low | Backend DB (SQLite or Postgres) is expected baseline |
| Asset card grid view | Visual grid of thumbnails is the default view mode in every MAM tool | Low | Full-width card with thumbnail + title + duration + tags is a reasonable default |
| Delete / remove asset | Users need to remove assets from the library (with or without deleting the underlying file) | Low | Offer "remove from library" vs "delete file" as distinct actions |
| Import deduplication | Importing the same file twice should not create two entries | Low | Hash-based (MD5/SHA256) dedup at import; warn rather than silently skip |

**Confidence:** HIGH — these are universal across all examined tools.

---

## Differentiators

Features that distinguish a MAM from a plain file system or basic media player. Not universally expected, but highly valued by prosumers.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Auto-transcription (local Whisper) | Full-text search over spoken word; no other personal MAM does this offline without an API | High | Background job post-import; CPU-bound; progress indicator essential; WebSocket or polling for status |
| Transcript-in-search results | Surfacing the exact sentence where a keyword was spoken (with timestamp) vs just "this video mentions X" | Medium | Requires storing transcript segments with timestamps in OpenSearch; snippet highlighting |
| Jump-to-transcript-moment | Click a transcript line and the video player seeks to that timecode | Medium | Requires synchronized player + transcript panel; high delight feature |
| Custom metadata fields (global schema) | Power users want project codes, shoot dates, subject matter fields beyond title/description/tags | Medium | Schema-defined fields applied to all assets; stored in DB; surfaced in search |
| Technical metadata display | Showing codec, resolution, frame rate, audio spec in the detail panel; pro users want this | Low | Already extracted at import; just needs to be surfaced in UI |
| Bulk tag editing | Select multiple assets, apply/remove tags in one action | Medium | Essential once library grows past ~50 items; reduces friction significantly |
| Sort and filter controls | Sort by date added, duration, file size, title; filter by tag, resolution, codec | Medium | Beyond tag sidebar — compound filter logic |
| Transcript viewer panel | Side-by-side video player + scrolling transcript with timecode markers | Medium | High differentiation vs competitors; pairs with jump-to-moment |
| Waveform / thumbnail strip scrubber | Hover-scrub thumbnail strip or audio waveform in the card view | High | Nice polish; Kyno and Silverstack do this; high effort for moderate gain in v1 |
| Configurable watch folder | Auto-import files dropped into a designated folder on disk | Medium | Useful for production pipelines; Hedge-style ingest workflow |
| Import progress with job queue | Visual job queue showing transcription and indexing status per asset | Medium | Important for trust when Whisper is running a 30-min video in background |

**Confidence:** HIGH for features drawn from direct product knowledge. The local-Whisper + transcript-search combination is a genuine differentiator with no direct equivalent in the personal MAM market as of mid-2025.

---

## Anti-Features

Features to deliberately NOT build in v1. Each has a reason and an alternative.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Multi-user authentication | Adds auth middleware, session management, RBAC, and significant surface area; zero value for single-user use case | No login; assume single local user; revisit only if multi-user ever becomes a requirement |
| Cloud storage / sync | Massively increases complexity (S3, CDN, chunked upload, resume); conflicts with local-first privacy value prop | Local filesystem only; document how to point the storage path at a NAS or external drive |
| Video editing / trimming | Slippery slope into a NLE; out of scope by definition | Provide timestamp annotations and transcript; let users open in external editor via "reveal in Finder/Explorer" |
| Collections / smart folders | Powerful but complex to spec correctly; tag-based filtering covers 90% of the use case | Use tags + search as the organizational primitive; revisit after real user feedback |
| Facial / object recognition | GPU inference, expensive models, privacy concerns, significant integration complexity | Auto-transcription already covers the high-value AI feature; don't over-extend ML scope |
| Export / transcode | FFmpeg-based transcode pipeline is a large separate concern; adds job queue complexity | Expose the source file path; let users transcode with dedicated tools |
| Browser-based file system access | Browser File System API has inconsistent support and security restrictions | Backend node server manages all file I/O; frontend is a client to the local API |
| Batch AI metadata suggestions | LLM-based auto-titling/tagging is interesting but scope-creep for v1; Whisper transcript is the AI anchor | Let transcription surface keywords; user tags manually from that context |
| Inline subtitle burn-in / SRT export | Useful eventually, but requires FFmpeg integration and format decisions | Store transcript internally; SRT export can be phase 2 |
| Mobile / responsive layout | Single-user desktop browser tool; mobile optimization wastes significant layout effort | Fix layout at desktop viewport; don't build responsive breakpoints in v1 |

**Confidence:** HIGH — these scope boundaries are consistent with the PROJECT.md out-of-scope declarations and reflect common v1 overreach patterns in personal tool projects.

---

## Feature Dependencies

```
File Import
  → Auto-extract technical metadata (FFprobe runs on import)
  → Thumbnail generation (FFmpeg runs on import)
  → Transcription job queued (Whisper background job)
      → OpenSearch indexing of transcript segments
          → Transcript-in-search results
              → Jump-to-transcript-moment (requires player + indexed segments)

Custom metadata fields (schema)
  → Custom fields surfaced in detail panel
  → Custom field values included in OpenSearch index

Tag system
  → Tag filter sidebar
  → Bulk tag editing (requires multi-select)

Full-text search (OpenSearch)
  → Requires: title/description/tags indexed
  → Requires: transcript segments indexed (after Whisper job)
  → Enables: sort + filter controls on results
  → Enables: transcript snippet highlighting in results

Video playback (inline)
  → Enables: jump-to-transcript-moment (player seek API)
  → Requires: browser codec support for source file format

Import job queue visibility
  → Requires: background job system (Whisper, FFprobe, FFmpeg)
  → Enables: per-asset progress state in UI
```

---

## MVP Recommendation

Based on the PROJECT.md active requirements and the feature analysis above, prioritize strictly:

**Build first (table stakes + core value prop):**
1. File import with drag-drop, FFprobe metadata extraction, thumbnail generation, dedup check
2. Asset card grid with thumbnail, title, duration, size, tags
3. Editable metadata: title, description, tags (multi-value)
4. Inline video playback (HTML5)
5. OpenSearch indexing + full-text search (title, description, tags)
6. Background transcription with Whisper + transcript segment indexing
7. Transcript viewer panel with jump-to-moment
8. Import job queue progress indicator (Whisper status per asset)
9. Custom global metadata field schema

**Build second (high-value differentiators, after core is stable):**
- Transcript snippet surfacing in search results (with timecode link)
- Bulk tag editing
- Sort and filter controls beyond tag sidebar
- Configurable watch folder

**Defer indefinitely:**
- Waveform scrubber / hover-scrub thumbnail strip (high effort, low priority)
- SRT / VTT export
- Collections / smart folders
- Any AI feature beyond Whisper transcription

---

## Competitive Reference Notes

These observations are from training data (cutoff August 2025). Confidence: MEDIUM (product versions may have changed).

| Tool | Relevant Strength | Relevant Gap vs This Project |
|------|-------------------|------------------------------|
| **Adobe Bridge** | Excellent metadata panel, XMP standard, batch editing | No transcription, requires Creative Cloud, not video-first |
| **Kyno** | Best-in-class offline video browsing, hover-scrub, log notes | Paid macOS-only, no full-text transcript search |
| **Hedge** | Excellent ingest/copy workflow with verification | Focused on ingest, not library management or search |
| **Silverstack Lab** | Pro-grade on-set DAM, transcoding, color metadata | Overkill for personal use; expensive; complex |
| **Jellyfin** | Self-hosted, good playback, community-maintained | Media server paradigm (not asset management); no transcript search |
| **Immich** | Excellent self-hosted photo/video with ML tagging | Photo-first; no transcript; strong UI reference for card grids |
| **DaVinci Resolve (Media page)** | Excellent technical metadata, bins, smart bins | NLE-centric; not standalone; requires project structure |

**Key gap this project fills:** No personal/prosumer tool combines local offline video browsing + auto-transcription (no API cost, privacy-preserving) + full-text search over spoken content. This is the genuine competitive moat.

---

## Sources

- Training knowledge of Adobe Bridge CC 2024 feature set (MEDIUM confidence — version-dated)
- Training knowledge of Kyno 2.x feature set (MEDIUM confidence — product was acquired by Lesspain Software)
- Training knowledge of Hedge 23/24 feature set (MEDIUM confidence)
- Training knowledge of Silverstack Lab 7 (MEDIUM confidence)
- Training knowledge of Jellyfin 10.x and Immich 1.x (MEDIUM confidence)
- PROJECT.md requirements and constraints (HIGH confidence — primary source)
- WebSearch, WebFetch, and Bash tools were unavailable during this research session; no live web verification was possible. Findings should be validated against current product documentation before finalizing roadmap decisions.
