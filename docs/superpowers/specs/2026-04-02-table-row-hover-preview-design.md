# Table Row Hover Preview Card

**Date:** 2026-04-02
**Status:** Approved
**Scope:** Replace the current ThumbnailPopup in table view with a rich floating preview card featuring scrub preview and metadata.

## Problem

Table view hover currently shows a 160x90 popup that's just a bigger version of the row thumbnail. It doesn't reveal any new information about the asset and has positioning issues (clips for the first row, overlaps UI elements).

Meanwhile, the grid view has rich hover interactions: scrub preview across 6 pre-extracted frames, metadata overlay with description/tags/technical specs. The table view hover is underpowered by comparison.

## Design

### Preview Card

A floating card rendered via `createPortal` to `document.body` with `position: fixed`. Replaces the existing `ThumbnailPopup` component entirely for table view usage.

**Dimensions:** 320px wide, variable height (~280px typical).

**Card contents (top to bottom):**

1. **Scrubbable thumbnail (320x180)** — uses the same 6-frame system as grid view (`/storage/{id}/frame_0..5.jpg`). Mouse movement across the thumbnail area scrubs through frames. Red progress bar at the bottom + timecode tooltip. Falls back to static thumbnail if `framesStatus !== 'complete'`.

2. **Original filename** — monospace, muted (`#52525b`), truncated with ellipsis. Shown because the row title might be an edited/cleaned-up version.

3. **Full description** — italic, `#a1a1aa`, multi-line (no truncation). Only shown if the asset has a description.

4. **Technical specs** — horizontal row of pill badges: codec (e.g. H.264), resolution (e.g. 1080p), file size (e.g. 1.2 GB). Monospace, `rgba(255,255,255,0.04)` background with subtle border.

5. **Transcript snippet** — separated by a subtle top border. Label "Transcript" in small uppercase. First 2 lines of transcript text, clamped with `-webkit-line-clamp: 2`. Only shown if `transcriptionStatus === 'complete'`.

**Not included:** Tags (already visible in the row).

### Positioning

- **Anchor:** Left edge of the card aligns with the left edge of the thumbnail cell in the row.
- **Vertical:** Centered on the hovered row by default.
- **Edge detection:** If the card would extend below the viewport, position it above center. If it would extend above the viewport (first row), position it below center.
- **Rendering:** `createPortal` to `document.body`, `position: fixed`, `z-index: 50`.

### Behavior

| Aspect | Spec |
|--------|------|
| **Trigger** | 200ms hover delay on table row (same as current ThumbnailPopup) |
| **Show** | Fade in via opacity transition (150ms) |
| **Dismiss** | Mouse leaves both the row and the card → fade out (150ms) |
| **Scrub interaction** | Mouse move horizontally over thumbnail area → update frame index (0-5) based on X position ratio. Show red progress bar + timecode tooltip. |
| **Click** | Clicking the row (or card) still triggers `onSelectAsset` as before |
| **Portal** | Rendered outside the scroll container so it never clips |

### Transitions

- Card appear: `opacity 0 → 1` over 150ms, `ease-out`
- Card dismiss: `opacity 1 → 0` over 150ms, `ease-in`
- No scale or transform animations (per design system anti-patterns)

## Implementation Notes

### Component Changes

- **Replace `ThumbnailPopup`** with a new `PreviewCard` component. The existing `ThumbnailPopup` is only used by `AssetTableRow` — it can be replaced directly.
- **`PreviewCard`** accepts: `asset`, `visible`, `anchorRect`, `onSelect`.
- **Scrub logic** can be extracted from `ScrubPreview.tsx` — the frame index calculation (`Math.min(Math.floor(ratio * 6), 5)`) and timecode formatting are reusable.

### Data Requirements

All data is already available on the `Asset` type:
- `framesStatus` — determines if scrub is available
- `codec`, `width`, `height`, `fileSize` — technical specs
- `description`, `originalFilename` — metadata
- `transcriptionStatus` — whether to show transcript section

Transcript text is NOT on the `Asset` type currently. Options:
- Fetch from `/storage/{id}/transcript.json` on hover (adds latency)
- Add a `transcriptSnippet` field to the asset query (first ~200 chars)
- Skip transcript snippet for now, add later

**Recommendation:** Skip transcript snippet in v1, add it when transcript data is more readily available on the asset object. The card is already rich without it.

### Files Modified

- `frontend/src/components/assets/ThumbnailPopup.tsx` → rewrite as `PreviewCard`
- `frontend/src/components/assets/AssetTableRow.tsx` → swap ThumbnailPopup for PreviewCard, pass full asset
- No changes to `AssetTableView`, `AssetGrid`, or `SearchTableRow`

## Design System Compliance

- Colors: `#1E1B4B` card background, `#2D2A5E` border, `#E11D48` progress bar — all from the palette
- Typography: Fira Code for monospace elements, Fira Sans for body text
- Shadows: `0 8px 32px rgba(0,0,0,0.6)` — within the defined shadow scale
- Z-index: 50 (modal/overlay level per the z-index scale)
- No scale transforms on hover (anti-pattern)
- 150ms transitions (within 150-300ms range)
