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

**Dimensions:** 320px wide, variable height (~220-250px depending on content).

**Card contents (top to bottom):**

1. **Scrubbable thumbnail (320x180)** — uses the same 6-frame system as grid view (`/storage/{id}/frame_0..5.jpg`). Mouse movement across the thumbnail area scrubs through frames. Red progress bar at the bottom + timecode tooltip. Falls back to static thumbnail if `framesStatus !== 'complete'`.

2. **All tags** — horizontal row of pill badges wrapping if needed. Monospace, `rgba(255,255,255,0.04)` background with subtle border. Only shown if the asset has tags.

3. **Full description** — italic, `#a1a1aa`, multi-line (no truncation). Only shown if the asset has a description.

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
- `tags` — JSON array string, parsed with `JSON.parse()`
- `description` — may be null/empty

### Files Modified

- `frontend/src/components/assets/ThumbnailPopup.tsx` → rewrite as `PreviewCard`
- `frontend/src/components/assets/AssetTableRow.tsx` → swap ThumbnailPopup for PreviewCard, pass full asset
- No changes to `AssetTableView`, `AssetGrid`, or `SearchTableRow`

## Design System Compliance

- Colors: `#1E1B4B` card background, `#2D2A5E` border, `#E11D48` progress bar — all from the palette
- Typography: Fira Code for tag badges, Fira Sans for description
- Shadows: `0 8px 32px rgba(0,0,0,0.6)` — within the defined shadow scale
- Z-index: 50 (modal/overlay level per the z-index scale)
- No scale transforms on hover (anti-pattern)
- 150ms transitions (within 150-300ms range)
