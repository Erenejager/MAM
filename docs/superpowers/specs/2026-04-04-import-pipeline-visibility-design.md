# Import Pipeline Visibility

**Date:** 2026-04-04
**Status:** Approved

## Problem

The current Import tab only tracks a single upload at a time (idle -> uploading -> polling -> idle). There is no visibility into queued/concurrent imports, no history of past imports, and no way to check pipeline status without navigating to the Import tab.

## Solution

Two connected features:

1. **Redesigned Import Tab** — stacked vertical layout with import button, active queue with pipeline timelines, and 3-day completion history
2. **TopBar Import Popover** — hover-sticky popover on the Import pill showing at-a-glance pipeline status from any view

---

## Feature 1: Import Tab Redesign

### Layout (top to bottom)

1. **Import Button** — compact centered CTA button ("Import Video") that doubles as a drag-and-drop target. On drag-over: glows with CTA accent color and dashed border. Clicking opens file browser. Replaces the current large centered drop zone.

2. **In Progress Section** — header reads "IN PROGRESS" with a count badge (CTA red). Lists all assets with `status === 'ingesting'` as cards, newest first. Each card contains:
   - Thumbnail (or placeholder while generating), filename, elapsed time, estimated time remaining
   - Horizontal segmented progress bar — one segment per pipeline stage (Meta, Thumb, Transcribe, Index, OCR). Each segment is colored: green (`#10B981`) for complete, pulsing amber (`#F59E0B`) for processing, dim track (`rgba(255,255,255,0.08)`) for pending, red (`#E11D48`) for failed. Stage labels appear below each segment in matching color.

3. **Divider** — subtle horizontal line (`rgba(45,42,94,0.4)`)

4. **Completed Section** — header reads "COMPLETED" with "last 3 days" label. Responsive grid (`grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))`). Each card contains:
   - Small thumbnail, filename, relative timestamp (e.g. "2h ago")
   - Compact dot stepper — 5 small dots, one per stage: green for complete, red for failed, grey for skipped
   - Clicking a completed card navigates to that asset in the library view

### Empty States

- **No in-progress items:** Section hidden entirely (not shown as empty)
- **No completed items in 3 days:** Show muted text: "No imports in the last 3 days"
- **No activity at all (fresh state):** Show a larger centered drop zone (current idle state) instead of the button layout — the compact button layout only appears once there is at least one item in the queue or history

### Data Source

Query `GET /api/assets` filtered to:
- **In progress:** `status === 'ingesting'` — poll every 2.5s
- **Completed:** `status === 'ready' || status === 'error'`, `createdAt` within last 3 days, ordered by `createdAt DESC`

The completed list is fetched once on mount and invalidated when an import finishes. No continuous polling for completed items.

### Upload Flow

Clicking the Import button or dropping a file triggers `POST /api/assets`. On 202, the new asset appears in the In Progress section automatically (query invalidation). On 409, show inline error "Already imported" with link to existing asset. Multiple files can be uploaded sequentially — each appears in the queue as it starts.

### Timing & Estimates

Reuse the existing `useImportEstimate` hook. Each in-progress card tracks its own stage transitions independently. Elapsed timer per card starts when the upload begins. Estimate text shows next to elapsed time.

---

## Feature 2: TopBar Import Popover

### Trigger

Hover-sticky: hovering over the Import pill in the TopBar opens the popover. The popover stays open while the mouse is anywhere inside the popover area (pill + dropdown). Disappears when the mouse leaves the combined area entirely. No click required.

### Position

Anchored below the Import pill, aligned to its horizontal center. `z-index: 50` (same as modals/dropdowns in the design system). Glass-blur background (`rgba(15,15,35,0.95)`, `backdrop-filter: blur(16px)`).

### Content

1. **Header** — "PROCESSING" label + "{N} active" count in CTA red. Hidden if no active imports.

2. **Active Items** (max 3 shown, "+N more" if overflow) — card-style rows:
   - Thumbnail (or placeholder), filename
   - Dot stepper (5 dots, same color scheme as Import tab)
   - Active stage label + elapsed time (e.g. "Transcribing... · 2:34")

3. **Recent Section** — "RECENT" label, shows last 2 completed imports:
   - Thumbnail, filename, dot stepper, relative time

4. **Footer** — "View all imports ->" link, navigates to the Import tab on click.

### Empty State

If no active imports and no recent completions: popover shows a single line "No recent activity" with the "View all imports" link.

### Polling

The popover reuses the same query as the Import tab (assets list). No additional polling is added. Data is already available from the top-level `useAssets()` hook in App.tsx.

---

## Pipeline Stages

Both features display the same 5 stages in order:

| Stage | DB Column | Labels |
|-------|-----------|--------|
| Metadata | `metadataStatus` | Meta |
| Thumbnail | `thumbnailStatus` | Thumb |
| Transcription | `transcriptionStatus` | Transcribe |
| Search Index | `searchIndexStatus` | Index |
| OCR | `ocrStatus` | OCR |

Status mapping: `processing` -> amber pulse, `complete`/`skipped` -> green, `failed` -> red, everything else -> pending (dim).

---

## Components

### New Components

- `ImportQueueView` — top-level Import tab component (replaces current `ImportView`)
- `ImportButton` — CTA button + drag-drop target
- `InProgressCard` — active import card with segmented progress bar
- `CompletedCard` — compact card with dot stepper
- `ImportPopover` — TopBar hover popover
- `StageStepper` — reusable dot stepper (5 dots, colored by status)
- `SegmentedProgress` — reusable horizontal segmented bar with stage labels

### Modified Components

- `TopBar` — wrap Import pill with hover logic, render `ImportPopover`
- `App.tsx` — replace `<ImportView>` with `<ImportQueueView>`, pass navigation callback

### Removed Components

- `ImportView` — replaced entirely by `ImportQueueView`

---

## Styling

All styling follows the Cinema Dark design system (`design-system/mam/MASTER.md`):

- Backgrounds: `#0F0F23` (page), `rgba(30,27,75,0.4)` (cards)
- Borders: `rgba(45,42,94,0.8)` (cards), `rgba(45,42,94,0.5)` (completed cards)
- Text: `#F8FAFC` (primary), `#94A3B8` (muted)
- Status colors: `#10B981` (complete), `#F59E0B` (processing), `#E11D48` (failed/CTA)
- Fonts: Fira Sans (body), Fira Code (monospace — timestamps, stage labels, file sizes)
- Transitions: 150-200ms on all interactive elements
- Border-radius: 8px (cards), 6px (buttons)

---

## Accessibility

- Import button: `aria-label="Import video — drag and drop or click to browse"`
- Segmented progress: `role="progressbar"` with `aria-valuenow` (completed stage count) and `aria-valuemax="5"`
- Dot stepper: `aria-label` on each dot with stage name + status (e.g. "Metadata: complete")
- Popover: `role="tooltip"`, ESC key closes it
- Completed cards: `cursor-pointer`, focus-visible outline per design system
- All icon-only elements have `aria-label`

---

## Scope Exclusions

- No WebSocket/SSE — continues using polling (2.5s for active, no polling for completed)
- No multi-file simultaneous upload UI (drag multiple files) — files are uploaded one at a time sequentially
- No backend changes — all data already available from existing `GET /api/assets` and `GET /api/assets/:id` endpoints
- No upload progress percentage (would require XHR with progress events) — upload phase just shows "Uploading..." until 202
- No persistent storage of import history beyond what's in SQLite `assets` table
