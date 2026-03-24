# Phase 03 — Browse and Playback: Context

> Decisions gathered via /gsd:discuss-phase. These are locked choices for downstream research and planning agents.

## 1. Card Layout

- **Thumbnail position**: Left side, fixed width (~240–280px). Info column fills remaining space on the right.
- **Metadata fields on card** (right column):
  - Title
  - Duration
  - Tags (wrap to 2 lines, then clip with `…`)
  - File size (e.g., "2.3 GB")
  - Codec / resolution (e.g., "H.264 · 4K")
  - Date imported (e.g., "Mar 22, 2026")
  - Status badge when `status !== 'ready'` (e.g., "Ingesting…")
- **Tag overflow**: Wrap to 2 rows of tags; truncate remainder with `…`
- **Card click**: Opens detail panel (slide-in from right). Does NOT navigate to a separate route.

## 2. Player Placement (Detail Panel)

- **Panel width**: 40% of viewport; the asset grid shrinks to 60% when panel is open.
- **Panel slide direction**: Right edge of viewport.
- **Panel content** (top to bottom):
  1. Video player (native `<video>` with custom controls per CLAUDE.md decision)
  2. Full metadata — all DB fields (title, duration, codec, resolution, file size, date imported, file hash, filepath)
  3. Tags — inline editable (click to add/remove)
  4. Transcript — scrollable segment list with timestamps; clicking a segment seeks the player
- **Delete button**: NOT in the detail panel (handled via right-click context menu — see section 4).
- **Transcript sync**:
  - Active segment is highlighted with accent color
  - List auto-scrolls to keep the active segment visible
  - Clicking any segment seeks the video to that timestamp
  - Implementation: `HTMLVideoElement.currentTime` + `timeupdate` event (per STATE.md — no Video.js)
  - Status polling: TanStack Query `refetchInterval` 3–5s while `transcriptionStatus !== 'ready'` (per STATE.md)

## 3. Tag Sidebar

- **Location**: Left sidebar (240px per design system layout spec in MASTER.md)
- **Content**: All tags in the library, listed alphabetically, each with a count badge (e.g., `interview (12)`)
- **No cap** on number of tags shown — full list
- **Filter logic**: AND — asset must have ALL selected tags to appear in the grid
- **Active filter visual**: Selected tags use filled accent background (`#E11D48`); unselected tags use default panel/border styling
- **Clear filters**: Clicking an active tag deselects it; no explicit "clear all" button needed (clicking each removes them)

## 4. Asset Deletion UX

- **Trigger**: Right-click context menu on a card — clean card surface, no persistent hover buttons
- **Context menu items**: At minimum "Delete" (other items may be added in later phases)
- **Confirmation dialog**: Two distinct action buttons:
  - "Remove from library" — deletes the SQLite record only; file remains on disk
  - "Delete file + library" — deletes SQLite record AND the `STORAGE_ROOT/{uuid}/` directory
- **Post-deletion animation**: Card fades out, then remaining cards reflow to fill the gap (Framer Motion)
- **If detail panel is open** for the deleted asset: panel closes as part of the removal flow

## Code Context

Relevant existing code for Phase 3 implementation:

| What | Where |
|------|-------|
| Asset DB schema (all fields, status columns, tags as JSON) | `backend/src/db/schema.ts` |
| `GET /api/assets/:id` | `backend/src/routes/assets.ts:95` |
| CSS custom properties (colors, fonts) | `frontend/src/index.css` |
| App entry point (bare stub) | `frontend/src/App.tsx` |
| Design system tokens and layout spec | `design-system/mam/MASTER.md` |
| Phase 2 UI decisions (drop zone, etc.) | `.planning/phases/02-ingest-pipeline/02-CONTEXT.md` |

**APIs needed** (not yet implemented):
- `GET /api/assets` — list all assets (no endpoint exists yet; Phase 3 must add it)
- `DELETE /api/assets/:id` with `?deleteFile=true|false` query param
- `PATCH /api/assets/:id` — for inline tag editing (add/remove tags)

**Frontend packages not yet installed** (Phase 3 will need):
- `react-router-dom` (if routes are added, but current decision uses panel not page navigation)
- `@tanstack/react-query` — for polling and data fetching
- `framer-motion` — for card fade-out and panel slide-in animations
- `shadcn/ui` — component library (confirmed in STATE.md, not yet installed)

## Deferred Ideas

- Full-text search bar (top of layout) — roadmapped for Phase 4
- Custom fields display in detail panel — roadmapped for Phase 5
- Bulk selection / bulk delete — not in this phase
- Sort order controls in the grid — not explicitly discussed, implement simplest default (date desc)
