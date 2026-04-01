# MAM UI/UX Redesign — Design Spec

**Date:** 2026-03-31
**Status:** Superseded by 2026-04-01-liquid-glass-redesign.md
**Scope:** Full frontend visual and interaction redesign

---

## 1. Layout: Topbar Only

Remove the 240px sidebar. The entire UI is driven by a single top bar + full-width content area.

**Top bar structure (left → center → right):**
- **Left:** MAM logo with Projector Reveal hover animation
- **Center:** Search input (Ctrl+K shortcut preserved)
- **Right:** Icon buttons only (no text labels) — Upload, Filter, Settings

**Grid area:** Full viewport width minus top bar height. No sidebar column. The grid owns all horizontal space.

**Views:**
- **Library** (default): asset grid
- **Full-screen detail**: replaces grid when an asset is clicked
- **Settings**: modal overlay, no longer a separate page/view
- **Import**: removed as a view — upload is global (see section 6)

**Files to change:** `AppShell.tsx` (remove sidebar column from grid), `App.tsx` (remove sidebar, import view, settings view → modal), `Sidebar.tsx` (delete), `TopBar.tsx` (add icon buttons), `SettingsPage.tsx` (convert to modal).

---

## 2. Color: Obsidian Layers

Replace the indigo Cinema Dark palette with a gradient-based dark theme.

**Background:** Multi-stop diagonal gradient applied to `<body>` or root:
```
background: linear-gradient(170deg, #0c0c12 0%, #09090e 40%, #0b0b11 70%, #08080c 100%);
```

**Card/Surface:** Top-light gradient:
```
background: linear-gradient(160deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
```

**Borders:** `rgba(255,255,255,0.06)` default, `rgba(255,255,255,0.10)` on hover.

**Top bar:** Subtle horizontal gradient:
```
background: linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0.02) 100%);
```

**CTA/Accent:** `#E11D48` preserved. Buttons use gradient: `linear-gradient(135deg, #E11D48, #be123c)` with `box-shadow: 0 2px 10px rgba(225,29,72,0.3)`.

**Selected state:** `border-color: rgba(225,29,72,0.35)` + `box-shadow: 0 0 20px rgba(225,29,72,0.1)`.

**Ambient glow:** Subtle CTA-colored radial gradient in bottom-right corner of the page background.

**Text:** `#e4e4e7` primary (slightly warmer than current `#F8FAFC`), `#71717a` muted, `#52525b` faint.

**Tailwind config updates:**
- Replace `background`, `panel`, `border`, `text`, `text-muted` color tokens
- Remove indigo-based values (`#1E1B4B`, `#2D2A5E`, `#0F0F23`)
- Add gradient utilities or apply gradients via custom CSS classes

**Files to change:** `tailwind.config.cjs`, `index.css`, every component that uses `bg-panel`, `bg-background`, `border-border`, `text-text-muted` (all of them — this is a global change).

---

## 3. Asset Cards: Thumbnail-first Overlay

Replace the horizontal list cards with vertical thumbnail-dominant cards in a responsive grid.

**Grid:** 3 columns default (`grid-template-columns: repeat(3, 1fr)`), 2 on screens narrower than ~1200px. Gap: 12px. Padding: 16px around grid.

**Card structure:**
```
┌─────────────────────────────┐
│ [tag] [tag]         (top-left, frosted glass)
│                              │
│        THUMBNAIL             │  ← fills entire card, 16:9 aspect-ratio
│        (object-cover)        │
│                              │
│ ░░░░░ gradient fade ░░░░░░░ │  ← linear-gradient(transparent 40%, rgba(0,0,0,0.85) 100%)
│ Title                  3:42  │  ← overlaid at bottom
│ 1080p · 1.2 GB              │
└─────────────────────────────┘
```

**Overlay elements:**
- **Tags:** Top-left, frosted glass pills (`background: rgba(0,0,0,0.5); backdrop-filter: blur(4px)`). Show max 2, "+N" if more.
- **Title:** Bottom-left, `font-size: 14px`, `font-weight: 600`, white. Single line, truncated.
- **Duration:** Bottom-right, monospace, dark pill background.
- **Tech metadata:** Below title, `font-size: 11px`, muted. Format: `{resolution} · {fileSize}`.
- **Status indicator:** Top-left dot (only visible during processing/failed states). Amber for processing, red for failed.
- **Bottom gradient:** `linear-gradient(transparent 40%, rgba(0,0,0,0.85) 100%)` — ensures text readability over any thumbnail.

**Selected state:** Orbiting gradient border. The card is wrapped in a 2px padding container with a `conic-gradient` background that rotates continuously via `@property --angle` animation (3s linear infinite). The gradient has a red hotspot (#E11D48 at ~10%) fading to transparent, creating a light point that orbits the card edge. Uses CSS `@property` for the angle animation. Fallback for unsupported browsers: static red border + glow.

**Hover state:** Slight scale (`transform: scale(1.02)`) + border brightens + shadow deepens. Triggers Quick Look preview (see section 4).

**Search results:** When searching, transcript excerpt + clickable timecodes appear below the card (outside the thumbnail overlay) as they do now.

**Files to change:** `AssetCard.tsx` (full rewrite), `AssetGrid.tsx` (switch to CSS grid), `TranscriptExcerpt.tsx` (minor — moves below card).

---

## 4. Detail: Hover Preview + Full-screen View

Two interaction layers replace the current slide-in panel.

### 4a. Hover Preview (Quick Look)

**Trigger:** Mouse hovers on an asset card for 500ms (debounced).

**Behavior:** A floating popover appears above/below the card (positioned to stay in viewport). Contains:
- Video element that auto-plays muted from the start
- Title, duration, resolution on a dark overlay
- Fade in with `opacity 0→1` + slight `scale(0.96→1)` over 200ms

**Dismiss:** Mouse leaves the card or popover. 200ms fade out.

**Implementation:** New component `AssetPreview.tsx`. Uses a portal to render above the grid. Loads the video lazily on hover. `<video muted autoPlay playsInline>` with the asset's source file.

**Constraints:** Only one preview at a time. Don't preview assets still ingesting. Popover should not overflow viewport — position dynamically.

### 4b. Full-screen Detail View

**Trigger:** Click on an asset card (or press Enter when focused).

**Behavior:** Grid view transitions to a full-screen detail layout:

```
┌──────────────────────────────────────────────────────┐
│ ← Back to Library    Sinner vs Lehecka    [prev][next] │  ← sub-header row
├──────────────────────────────┬───────────────────────┤
│                              │  [Info] [Transcript]  │
│                              │                       │
│      VIDEO PLAYER            │  Title (editable)     │
│      (60% width)             │  Description          │
│                              │  Tags                 │
│                              │  ─────────────        │
│                              │  Codec · Res · FPS    │
│                              │  Duration · Size      │
│                              │  ─────────────        │
│                              │  Transcript segments  │
│                              │  (scrollable)         │
├──────────────────────────────┴───────────────────────┤
```

**Navigation:**
- "Back to Library" returns to grid (preserves scroll position + search/filter state)
- Prev/Next buttons cycle through current grid results (respecting active filters/search)
- Escape key returns to grid

**Transition:** Framer Motion layout animation — the clicked thumbnail morphs into the large video player position. Grid fades out. Detail fades in.

**Video player:** Same native `<video>` with custom controls. Larger — takes 60% width.

**Right panel:** Tabbed (Info / Transcript) same as current DetailPanel, but more vertical space.

**Files to change:** `DetailPanel.tsx` (rewrite as full-screen layout), `App.tsx` (add detail view state + navigation), new `AssetPreview.tsx` component. Delete the current slide-in motion wrapper.

---

## 5. Logo: MAM Projector Reveal

Replace the static "MAM" text logo with an animated branded element.

**Resting state:**
- "MAM" in Fira Code, 700 weight, ~18px in the top bar
- Letters are dim: `color: rgba(255,255,255,0.25)`
- Subtle, doesn't dominate

**Hover animation (Projector Reveal):**
1. A translucent light beam (30px wide, vertical gradient) scans left → right across the letters over 0.9s
2. As the beam passes each letter, it reveals at full brightness (`color: #fafafa`) with a red text-shadow (`0 0 20px rgba(225,29,72,0.4)`)
3. A red afterglow underline follows from left, sweeping across the bottom
4. "Media Asset Manager" fades in below the letters (`font-family: Fira Sans; weight: 300; size: 9px; letter-spacing: 6px; uppercase`)

**Hover out:** Letters fade back to dim over 0.3s. Subtitle fades out.

**Implementation:** Pure CSS animations (`@keyframes`), no JS needed. The beam is a pseudo-element. The reveal uses `clip-path: inset()` animated from `inset(0 100% 0 0)` to `inset(0 0 0 0)`. Afterglow is a `::after` with `transform: scaleX(0→1)`.

**Files to change:** New `Logo.tsx` component. Update `TopBar.tsx` to use it.

---

## 6. Upload: Global Drag-anywhere

Remove the dedicated ImportView. Upload is a global behavior available from any view.

**Drag detection:** App-level `onDragOver`/`onDrop` handlers on the root element. When a file is dragged over the window:
- Full-page overlay appears with subtle border glow and "Drop to import" centered text
- Overlay: `position: fixed; inset: 0; background: rgba(225,29,72,0.03); border: 2px dashed rgba(225,29,72,0.3)`
- Fade in 150ms

**Upload icon:** In the top bar, triggers a hidden `<input type="file">` click — same as current ImportView's file picker behavior.

**Progress indicator:** Compact, in the top bar next to the upload icon:
- During upload: small animated bar or percentage badge (`bg-cta/15` pill showing "↑ 72%")
- During pipeline processing: "Processing..." with a subtle pulse
- On completion: brief green checkmark flash, then disappears

**New asset in grid:** Appears immediately with an "ingesting" card state — thumbnail placeholder with a progress skeleton. Updates reactively as pipeline stages complete (uses existing React Query polling).

**Files to change:** `App.tsx` (add global drag handlers + upload state), `TopBar.tsx` (add upload icon + progress indicator), delete `ImportView.tsx`. Extract upload logic from ImportView into a `useUpload` hook.

---

## 7. Tag Filtering: Dynamic Faceted

Replace the sidebar tag list with a dynamic faceted filter system.

### Filter icon + dropdown

**Location:** Top bar, between upload and settings icons. Funnel icon.

**Badge:** When filters are active, a red dot with count appears on the icon.

**Dropdown panel:** Click the filter icon → positioned below, right-aligned. Contains:
- "Filter by tag" label
- All available tags as toggleable chips with counts: `tennis (3)`
- Counts update dynamically based on current search query results
- Selected tags are visually distinct (red-tinted background)
- Close on click outside or Escape

### Active filter chips

**Location:** Horizontal row below the top bar. Only visible when at least one filter is active.

**Chips:** Each active tag as a dismissable pill: `[tennis ×]`
- Click `×` to remove that filter
- "Clear all" link on the right
- Result count on the right: "3 results"

### Dynamic behavior (faceted search)

**No search + no filters:** Dropdown shows all tags with global counts from SQLite.

**Search active:** Backend returns tag facets alongside search results. Dropdown only shows tags present in search results, with counts scoped to those results.

**Filters active:** Grid filters to matching assets. Tag counts in dropdown update to show co-occurring tags.

**Backend change needed:** The `/api/search` endpoint must return a `facets` field:
```json
{
  "results": [...],
  "facets": {
    "tags": [
      { "tag": "tennis", "count": 3 },
      { "tag": "sports", "count": 1 }
    ]
  }
}
```

Also need a `/api/tags` enhancement or new endpoint that accepts optional `search` and `tags` params to return scoped facet counts.

**Files to change:** `TopBar.tsx` (add filter icon), new `FilterDropdown.tsx` component, new `FilterChips.tsx` component, `App.tsx` (filter state management), `backend/src/routes/search.ts` (add facets), `backend/src/lib/search.ts` (facet query building).

---

## 8. Settings: Modal

Convert from a full-page view to a centered modal.

**Trigger:** Settings gear icon in top bar.

**Modal:** Centered, 600px max-width, 80vh max-height. Backdrop blur. Same content as current SettingsPage (custom fields management).

**Files to change:** `SettingsPage.tsx` (wrap in modal/dialog), `App.tsx` (remove settings view state, add modal state).

---

## 9. Component Inventory

### New components
- `Logo.tsx` — Projector Reveal animated logo
- `AssetPreview.tsx` — hover Quick Look popover
- `FilterDropdown.tsx` — faceted tag filter dropdown
- `FilterChips.tsx` — active filter chips row
- `UploadOverlay.tsx` — global drag-and-drop overlay
- `UploadProgress.tsx` — top bar upload progress indicator

### Deleted components
- `Sidebar.tsx` — replaced by top bar icons + filter dropdown
- `ImportView.tsx` — replaced by global upload
- `AppShell.tsx` — simplified (no sidebar column)

### Heavily modified
- `TopBar.tsx` — logo, search, icon buttons, upload progress, filter trigger
- `AssetCard.tsx` — full rewrite to thumbnail-overlay style
- `AssetGrid.tsx` — CSS grid 3-column layout
- `DetailPanel.tsx` — full-screen layout with video left / info right
- `App.tsx` — new state management, global upload, detail view routing
- `SettingsPage.tsx` — wrapped in modal

### Backend changes
- `search.ts` — add faceted tag counts to search response
- Possibly new `/api/tags/facets` endpoint

---

## 10. Tailwind Config Changes

```js
// Colors — replace indigo palette with obsidian
colors: {
  background: '#0c0c12',    // was #0F0F23
  'bg-gradient-from': '#0c0c12',
  'bg-gradient-to': '#08080c',
  panel: 'rgba(255,255,255,0.03)',  // was #1E1B4B — now transparent
  cta: '#E11D48',            // unchanged
  'cta-hover': '#BE123C',   // unchanged
  text: '#e4e4e7',           // was #F8FAFC — slightly warmer
  'text-muted': '#71717a',  // was #94A3B8 — zinc instead of slate
  'text-faint': '#52525b',  // new — for very subtle text
  border: 'rgba(255,255,255,0.06)',  // was #2D2A5E — now transparent
  'border-hover': 'rgba(255,255,255,0.10)', // was #4C4891
  // Status colors unchanged
}
```

---

## 11. Migration Strategy

This is a visual redesign, not a data model change. No database migrations needed. No API breaking changes (only additions for faceted search).

**Order of implementation:**
1. Color/theme update (tailwind config + index.css) — changes everything at once
2. Layout restructure (remove sidebar, update AppShell, TopBar icons)
3. Logo component
4. Asset cards rewrite
5. Global upload (drag + progress)
6. Faceted filter system (frontend + backend)
7. Hover preview
8. Full-screen detail view
9. Settings modal conversion

Each step is independently deployable and testable.
