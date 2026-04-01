# Detail Panel Refinement — Video Controls, Info Panel, Transcript Panel

**Date:** 2026-04-01
**Status:** Approved
**Scope:** Detail panel internals — video player controls, info tab layout, transcript tab behavior, panel resize
**Parent spec:** `2026-04-01-liquid-glass-redesign.md` (this refines sections 4.Video Player, 4.Info Tab, 4.Transcript Tab)

---

## 1. Video Player Controls

### Layout: Hybrid (Slim Bar + Controls Bar + Play Overlay)

Three layers working together:

**Thin progress bar (on video edge, always visible):**
- 3px height, sits flush at the bottom edge of the `<video>` element
- CTA red fill (`#E11D48`) with `box-shadow: 0 0 6px rgba(225,29,72,0.3)` glow
- Track background: `rgba(255,255,255,0.08)`
- Always visible during playback — gives a constant progress indicator without obscuring video

**Compact controls bar (below video, always visible):**
- Glass surface: `rgba(15,15,30,0.85)` + `backdrop-filter: blur(16px)`
- Top border: `1px solid rgba(255,255,255,0.05)`
- Height: ~36px (padding 7px 14px)
- Left group: Play/pause icon, timecode in Fira Code monospace (`02:34 / 08:12`, current in `#e4e4e7`, separator + total in `#535370`/`#71717a`)
- Right group: Volume icon, fullscreen icon (both `#71717a`, hover → `#e4e4e7`)
- No skip forward/back buttons — transcript click-to-seek serves that purpose

**Glass play overlay (centered, only when paused):**
- 52px diameter circle
- Background: `rgba(255,255,255,0.07)` + `backdrop-filter: blur(12px)`
- Border: `1px solid rgba(255,255,255,0.1)`
- Shadow: `0 0 20px rgba(225,29,72,0.12)`
- White play triangle centered (with 4px left offset for optical centering)
- Fade in/out on play/pause state change (200ms)
- Click triggers play

### Scrubber: Expand on Hover

**Default state (3px):**
- Thin CTA-filled bar on video bottom edge as described above

**Hover state (expand to 6px):**
- Invisible hit zone: 20px tall, covers the progress bar area
- On mouse enter: bar animates from 3px → 6px height (150ms ease-out)
- Scrubber dot appears: 16px diameter, CTA red, `box-shadow: 0 0 10px rgba(225,29,72,0.5)`, 2px white-alpha border
- Time tooltip appears: glass pill above scrubber (`rgba(15,15,30,0.95)` + `backdrop-filter: blur(8px)`, `1px solid rgba(255,255,255,0.1)`, 6px border-radius, Fira Code 10px)
- Tooltip follows mouse position along the bar, shows time at that position

**Drag behavior:**
- Click anywhere on the hit zone to seek
- Drag the scrubber dot for continuous seeking
- While dragging: tooltip stays visible, bar stays expanded
- On mouse leave (not dragging): bar contracts back to 3px, dot and tooltip fade out (150ms)

---

## 2. Info Panel — Collapsible Accordion

### Structure

Three collapsible sections using `shadcn/collapsible` or a custom accordion (Radix-based):

**Section 1 — Metadata (default: expanded)**
- Header: "METADATA" label (9px, uppercase, letter-spacing 1px, `#e4e4e7`, font-weight 600) + chevron indicator (▾ open, ▸ closed)
- Header background: `rgba(255,255,255,0.03)`
- Content (when expanded):
  - **Title field:** Label (8px, `#71717a`, uppercase, 0.8px letter-spacing) + inline-edit text. Click to focus, shows glass input border. Placeholder: original filename.
  - **Description field:** Same label style + inline-edit textarea. Italic placeholder: "Click to add description..."
  - **Tags:** Label + glass pill list with `×` remove buttons + dashed `+ Add` button that opens combobox
- Each field row separated by `1px solid rgba(255,255,255,0.04)` border
- Field rows get hover state: `border-color` → `border-hover`, `background` → `glass-hover`
- Focus-within state: `border-cta/40` + `box-shadow: 0 0 0 3px rgba(225,29,72,0.1)`

**Section 2 — File Details (default: collapsed)**
- Header: "FILE DETAILS" label + inline summary when collapsed: `1080p · H.264 · 248MB` (Fira Code, 8px, `#71717a`)
- Collapsed summary shows: resolution, codec, file size (dot-separated)
- Content (when expanded): 2-column grid of glass mini-cards, same as current `MetadataSection` grid:
  - Duration, Codec, Resolution, Frame Rate, File Size, Imported date
  - Each cell: `rgba(255,255,255,0.02)` background, 4px border-radius, label 7px `#71717a`, value 10px Fira Code `#e4e4e7`
- Full-width rows below grid: File Hash (truncated with ellipsis), File Path

**Section 3 — Custom Fields (default: collapsed)**
- Header: "CUSTOM FIELDS" label + chevron
- Content: Existing `CustomFieldsSection` component (field name + value pairs, editable)
- Empty state: "No custom fields defined" in italic `#71717a`

### Accordion behavior
- Card container: `1px solid rgba(255,255,255,0.07)`, 8px border-radius
- Sections spaced 6px apart
- Expand/collapse: 200ms ease-out height animation
- Only one section constraint: **none** — multiple sections can be open simultaneously
- State not persisted (resets on panel open — Metadata always starts expanded, others collapsed)

---

## 3. Transcript Panel

### Active Segment: Glass Card Treatment

**Segment list layout:**
- Scrollable container, segments as clickable rows
- Each segment: timecode (Fira Code, 9px) + text (11px, line-height 1.5)
- Padding: 7px 10px per segment, 2px vertical gap between segments
- Container padding: 4px 8px

**Segment states:**

- **Past segments (before active):** 50% opacity. Text `#71717a`, timecode `#71717a`.
- **Active segment (currently playing):**
  - Glass card: 8px border-radius
  - Background: `rgba(225,29,72,0.06)`
  - Border: `1px solid rgba(225,29,72,0.15)`
  - Shadow: `0 0 12px rgba(225,29,72,0.08)`
  - Timecode: `#E11D48`
  - Text: `#e4e4e7`
  - Auto-scrolls into view (smooth, `block: nearest`)
- **Future segments (after active):** Normal opacity. Text `#94A3B8`, timecode `#71717a`.
- **Hover (any segment):** Background → `rgba(255,255,255,0.03)`, cursor pointer

### Search: Auto-Seek on Navigate

**Search bar:**
- Glass input: `rgba(255,255,255,0.03)` background, `1px solid rgba(255,255,255,0.07)`, 6px border-radius
- Search icon (left), input field, match counter (right, Fira Code 9px `#71717a` — e.g., `1/3`), prev/next arrows
- Focus state: border → `rgba(225,29,72,0.3)`, shadow → `0 0 0 3px rgba(225,29,72,0.08)`

**Match highlighting:**
- Regular match: `background: rgba(225,29,72,0.2)`, 2px border-radius, `padding: 0 2px`
- Current match (focused): `background: rgba(225,29,72,0.4)` (brighter), + `box-shadow: 0 0 4px rgba(225,29,72,0.2)`

**Navigation behavior:**
- Prev/next arrows (▲▼) cycle through matches
- **Each navigation step auto-seeks the video** to the matched segment's start timestamp
- Video **pauses** on seek so the user can read context around the match
- Transcript scrolls to show the matched segment
- Keyboard: Enter → next match, Shift+Enter → previous match (when search input is focused)
- User navigating via search suppresses auto-scroll from video `timeupdate` for 3 seconds (existing behavior preserved)

**Screen reader:**
- Live region announces: `"{currentMatch} of {totalMatches} matches"` or `"No matches"`

---

## 4. Panel Resize

### Draggable Split with Glass Handle

**Implementation:** `shadcn/resizable` (already installed, wraps `react-resizable-panels`)

**Default split:** 60% video / 40% info-transcript

**Constraints:**
- Video panel: min 40%, max 75%
- Info/transcript panel: min 25%, max 60%

**Resize handle:**
- Width: 6px
- Background: `rgba(255,255,255,0.03)`
- Borders: `1px solid rgba(255,255,255,0.07)` on both sides
- Grip dots: 3 vertically stacked circles (3px diameter, `rgba(255,255,255,0.15)`), vertically centered
- Cursor: `col-resize`
- Hover state: background → `rgba(255,255,255,0.06)`, grip dots → `rgba(255,255,255,0.3)`
- Active/dragging state: background → `rgba(225,29,72,0.08)`, grip dots → `#E11D48` at 40% opacity

**Persistence:**
- Split ratio saved to `localStorage` key `mam-detail-split`
- Read on component mount, fallback to `[60, 40]` if not set
- Written on `onLayout` callback from `react-resizable-panels`

---

## 5. Component Mapping

| Feature | Component(s) | New/Modified |
|---------|-------------|--------------|
| Video controls bar | `VideoPlayer.tsx` | Modified — replace native controls with custom |
| Progress bar + scrubber | New: `VideoProgressBar.tsx` | New |
| Glass play overlay | Inline in `VideoPlayer.tsx` | New (part of modification) |
| Accordion info panel | `MetadataSection.tsx` | Modified — wrap in accordion |
| Collapsible sections | `shadcn/collapsible` or Radix Accordion | Existing primitive |
| Glass card transcript | `TranscriptList.tsx` | Modified — update segment styling |
| Auto-seek search | `TranscriptList.tsx`, `TranscriptSearch.tsx` | Modified — add seek on navigate |
| Resizable split | `DetailPanel.tsx` | Modified — wrap in ResizablePanelGroup |

---

## 6. Accessibility

- **Progress bar:** `role="slider"`, `aria-label="Video progress"`, `aria-valuemin=0`, `aria-valuemax={duration}`, `aria-valuenow={currentTime}`, `aria-valuetext="{formatted time}"`
- **Play overlay:** `aria-label="Play video"`, visible focus ring
- **Accordion sections:** `aria-expanded`, `aria-controls` on headers
- **Transcript segments:** `role="button"`, `aria-current="true"` on active segment
- **Search navigation:** Live region for match count announcements
- **Resize handle:** `aria-label="Resize video and info panels"`, keyboard arrow support (left/right to resize)
- **All animations:** Respect `prefers-reduced-motion` — disable transitions and auto-scroll behavior
