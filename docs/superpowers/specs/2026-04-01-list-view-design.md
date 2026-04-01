# Asset List View Design

**Date:** 2026-04-01
**Status:** Approved
**Scope:** New table/list view for browsing and searching assets, with a view toggle in the TopBar to switch between grid and list.

---

## 1. View Toggle

A toggle button group in the TopBar, placed between the search bar and the pill nav tabs.

### Layout
- Container: `bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-[6px]` overflow hidden
- Two buttons side by side, no gap
- Active button: `bg-cta/10`, icon color `#E11D48`
- Inactive button: icon color `#52525b`, hover `#71717a`
- Divider: `1px solid rgba(255,255,255,0.07)` between the two buttons
- Each button: `padding: 5px 10px`

### Icons
- Grid view: `LayoutGrid` from lucide-react (the current card grid)
- List view: `List` from lucide-react (the new table view)

### State
- `viewMode: 'grid' | 'list'` stored in App.tsx state
- Persisted to `localStorage` key `mam-view-mode`
- Default: `'grid'` (current behavior)
- Passed to `AssetGrid` which renders either the card grid or the table

---

## 2. Browse Table (List View — No Search Active)

A compact table showing one asset per row with sortable column headers.

### Columns

| Column | Width | Content | Font | Color | Sortable |
|--------|-------|---------|------|-------|----------|
| Thumbnail | 40px | Tiny thumbnail (40×24, 3px border-radius) | — | — | No |
| Title | flex:1 | Title or filename, truncated | 10px, font-weight 500 | `#e4e4e7` (hover row) / `#a1a1aa` (default) | Yes |
| Description | 160px | Description snippet, italic, truncated. "—" if empty | 9px, italic | `#52525b` | No |
| Duration | 50px | `M:SS` or `H:MM:SS` | 9px, Fira Code | `#a1a1aa` (hover) / `#71717a` | Yes |
| Imported | 60px | Relative date: "3d ago", "1w ago", "Mar 15" | 9px | `#52525b` | Yes (default sort: newest first) |
| Tags | 80px | Tag pills (max 2), `+N` overflow | 7px | `#71717a` pills | No |
| Transcript | 16px | Status dot: green `#10B981` (ready), amber `#F59E0B` (processing), gray `#94A3B8` (none/pending) | — | — | No |

### Column Headers
- Font: 7px, uppercase, `letter-spacing: 0.5px`
- Color: `#52525b`, active sort column: `#71717a`
- Sort indicator: `↓` (descending) or `↑` (ascending) appended to active column
- Click header to cycle: ascending → descending → no sort (back to default: newest first)
- Bottom border: `1px solid rgba(255,255,255,0.05)`

### Row Styling
- Height: ~34px
- Alternating subtle background: even rows `rgba(255,255,255,0.02)`, odd rows transparent
- Border-radius: 4px per row
- Spacing: 1px gap between rows

### Row States
- **Default:** Title `#a1a1aa`, duration/date `#52525b`
- **Hover:** Background `rgba(255,255,255,0.03)`, border `1px solid rgba(255,255,255,0.07)`, title brightens to `#e4e4e7`, duration brightens to `#a1a1aa`. Thumbnail popup appears (see Section 4).
- **Selected:** Background `rgba(225,29,72,0.04)`, border `1px solid rgba(225,29,72,0.12)`, title `#e4e4e7`
- **Ingesting:** Thumbnail placeholder with `···`, metadata columns show `—`, amber pulsing dot in transcript column

---

## 3. Search Table (List View — Search Active)

Two-line rows: top line shows title + basic metadata, bottom line shows match context.

### Top Line (same as browse row)
- Thumbnail (40×24), Title (flex:1), Duration, Resolution, Size — same styling as browse

### Bottom Line (match context, indented 48px from left)
- **Match source badges:** `font-size: 6px`, `padding: 0 3px`, `bg-cta/12`, `border: 1px solid cta/18`, `border-radius: 2px`, `color: #E11D48`. Labels: "Title", "Description", "Transcript ×N"
- **Transcript excerpt:** `font-size: 8px`, `color: #71717a`, truncated to 1 line. Matching terms highlighted with `background: rgba(225,29,72,0.2)`, `color: #e4e4e7`
- **Timecodes:** Fira Code `font-size: 7px`, `color: #E11D48`, `padding: 0 3px`, `bg-cta/6`, `border-radius: 2px`, clickable. Max 3 timecodes, `+N more` if more.

### Row Styling
- Each result: `padding: 7px 10px`, `border-radius: 5px`
- Alternating: even rows `bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]`, odd rows transparent
- Gap: 4px between rows

### Bottom Line Visibility
- Always visible for search results (not just on hover)
- Title-only matches: bottom line shows badge + "title match" in italic `#52525b`

---

## 4. Row Hover — Thumbnail Popup

On hover in both browse and search table, a larger thumbnail pops up above the tiny inline thumbnail.

### Popup
- Size: 160×90px
- Position: anchored to the tiny thumbnail, appears above it (bottom edge of popup aligns with top of row), shifted right so it doesn't cover the thumbnail
- Background: the actual thumbnail image (`/storage/{id}/thumbnail.jpg`), `object-fit: cover`
- Border-radius: 6px
- Border: `1px solid rgba(255,255,255,0.1)`
- Shadow: `0 8px 24px rgba(0,0,0,0.5)`
- z-index: 20 (above other rows)
- Duration badge: bottom-right corner of popup, `background: rgba(0,0,0,0.7)`, `border-radius: 3px`, `padding: 0 4px`, Fira Code 8px `#a1a1aa`

### Behavior
- Appears on row hover after 200ms delay (avoids flicker when scanning)
- Disappears immediately on mouse leave
- No animation (instant appear after delay)

---

## 5. Component Structure

| Component | Responsibility |
|-----------|---------------|
| New: `AssetTableView.tsx` | The table layout: column headers, row rendering, sort state |
| New: `AssetTableRow.tsx` | Single row: thumbnail, columns, hover state, thumbnail popup |
| New: `SearchTableRow.tsx` | Two-line search result row: top line + match context bottom line |
| New: `ThumbnailPopup.tsx` | The 160×90 popup preview on hover |
| Modify: `AssetGrid.tsx` | Accept `viewMode` prop, render either card grid or table |
| Modify: `TopBar.tsx` | Add view toggle buttons |
| Modify: `App.tsx` | Add `viewMode` state with localStorage persistence, pass to components |

---

## 6. Accessibility

- Table: `role="table"`, header row `role="row"`, column headers `role="columnheader"` with `aria-sort`
- Rows: `role="row"`, cells `role="cell"`
- Sort: `aria-sort="ascending"` / `"descending"` / `"none"` on active column header
- Thumbnail popup: `aria-hidden="true"` (decorative preview)
- View toggle: `role="radiogroup"`, each button `role="radio"` with `aria-checked`
- Keyboard: Enter/Space on row opens detail panel, Tab navigates between rows
