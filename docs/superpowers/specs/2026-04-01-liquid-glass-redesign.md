# MAM UI Redesign — Liquid Glass Cinema Dark

**Date:** 2026-04-01
**Status:** Approved
**Scope:** Full frontend restructure & elevation — all views
**Direction:** Restructure & Elevate with Glassy & Layered component style
**Reference mockup:** `.superpowers/brainstorm/5378-1775050597/content/liquid-glass-mockup.html`

---

## Design Principles

1. **Liquid Glass** — All surfaces use `backdrop-filter: blur()` with semi-transparent backgrounds. Layered depth through glass panels, not flat color blocks.
2. **CTA Glow** — Red accent (#E11D48) gets `box-shadow` glow on interactive elements. Soft red halos on selected/active states.
3. **Cinema Dark Foundation** — Base palette unchanged: background #0a0a14, panel surfaces rgba(255,255,255,0.03), text #e4e4e7, muted #71717a.
4. **Pro-tool UX** — Keyboard-first navigation, command palette, resizable panels. Feels like DaVinci Resolve meets Arc browser.

---

## 1. Layout: Sidebar + Inline Top Bar

### Collapsible Sidebar (left)
- **Width:** 56px collapsed (icon-only), 200px expanded
- **Toggle:** Hover to peek, click pin icon to lock expanded
- **Items:** Library (grid icon), Import (upload icon + badge count), Settings (gear icon)
- **Active indicator:** Left red bar (3px) + CTA-subtle background on active item
- **Bottom:** Help/shortcuts icon (dimmed)
- **Surface:** `rgba(15,15,30,0.8)` + `backdrop-filter: blur(20px)` + right border

**Components:** `shadcn/sidebar`, `shadcn/tooltip` (for collapsed icon labels)

### Inline Top Bar
- **Height:** 52px
- **Left:** View title (e.g., "Library") in Fira Code
- **Center:** Search trigger — compact glassy input showing "Search assets..." with Cmd+K badge. Clicking opens command palette overlay
- **Right:** Grid/list view toggle, sort button
- **Surface:** `rgba(15,15,30,0.6)` + `backdrop-filter: blur(20px)` + bottom border

### Filter Bar (below top bar, conditional)
- **Visible when:** Filters are active
- **Content:** Glassy pill chips with X to remove, "+ Filter" button to add, asset count on right
- **Chips:** Active filters use CTA-subtle bg + CTA border. Add button uses glass surface + dashed border on hover

---

## 2. Command Palette (Ctrl+K)

Full-screen overlay with centered glassy modal.

- **Overlay:** `rgba(0,0,0,0.5)` + `backdrop-filter: blur(4px)`, click-outside dismisses
- **Modal:** 520px wide, `rgba(20,20,35,0.9)` + `backdrop-filter: blur(24px)`, 16px border-radius
- **Search input:** Top row with search icon, auto-focused, no border
- **Groups:** "Recent" (last opened assets), "Actions" (Import, Filter, Settings), "Assets" (search results)
- **Items:** Icon + label + right-aligned keyboard shortcut
- **Active item:** CTA-subtle background + CTA text color
- **Keyboard:** Arrow keys navigate, Enter selects, Escape closes

**Components:** `shadcn/command` (cmdk), `shadcn/dialog`

---

## 3. Asset Cards (Library Grid)

### Grid Layout
- **Columns:** 4 (responsive: 3 at <1200px, 2 at <900px)
- **Gap:** 12px
- **Cards:** 16:9 aspect ratio, 12px border-radius

### Card Anatomy
- **Base:** Glass border (`rgba(255,255,255,0.07)`), panel background
- **Thumbnail:** Full bleed with bottom gradient fade to black
- **Duration badge:** Top-right, glass pill with monospace text
- **Status badge:** Top-left, color-coded glass pill (Ready=green, Transcribing=amber pulse, Error=red)
- **Tags:** Bottom-left, small glass pills above title
- **Title:** Bottom, white, truncated with ellipsis

### Card States
- **Hover:** Border brightens, translateY(-2px), deep shadow, frosted glass overlay appears with:
  - Title (full, not truncated)
  - Technical metadata row (codec, resolution, file size)
  - Action buttons: "Open" (CTA primary + glow), "Edit tags" (ghost glass)
- **Selected:** CTA border + outer CTA glow ring
- **Loading:** Shimmer skeleton with glass surface

### Context Menu (right-click)
- **Items:** Open, Edit tags, Add to collection, Rename, Delete (red, separated)

**Components:** `shadcn/context-menu`, `shadcn/skeleton`, `shadcn/hover-card`

---

## 4. Detail Panel

Slides in from right when an asset is opened. Replaces fixed 60/40 layout with resizable split.

### Structure
- **Left (resizable, default 60%):** Video player
- **Right (resizable, default 40%):** Metadata + transcript tabs
- **Resize handle:** Thin vertical bar with grip dots, glass surface

### Video Player
- **Player:** Native `<video>` (unchanged)
- **Play button overlay:** Centered, glass circle with CTA glow shadow
- **Controls bar:** Bottom gradient, custom progress bar with CTA fill + glow, glass time badges
- **Progress bar:** 3px height, CTA red fill with `box-shadow: 0 0 6px` glow, draggable scrubber

### Tabs (Info / Transcript)
- **Tab bar:** Two tabs with animated CTA underline indicator (2px, glowing)
- **Active tab:** CTA color text
- **Inactive tab:** Dim text

### Info Tab
- **Title field:** Glass input, editable on click, focus ring uses CTA glow
- **Description field:** Glass textarea, italic placeholder "Click to add description..."
- **Tags:** Glass pill list with X remove + dashed "+ Add" button that opens combobox
- **File Details:** 2-column grid of glass mini-cards (Duration, Codec, Resolution, Frame Rate, File Size, Imported date)
- **Custom Fields:** Below file details, same glass input style

### Transcript Tab
- **Search:** Glass input at top with match counter + prev/next buttons
- **Segments:** Clickable rows with monospace timecodes, active segment has left CTA border + subtle highlight
- **Auto-scroll:** Smooth scroll to active segment during playback

**Components:** `shadcn/resizable`, `shadcn/tabs`, `shadcn/separator`, `shadcn/sonner` (toast notifications)

---

## 5. Import View

### Drop Zone
- **Surface:** Large centered glass card with dashed border
- **Idle:** Upload icon + "Drop video here" + "or click to browse" subtitle
- **Drag active:** Border becomes CTA red + pulsing glow, icon animates upward
- **Glass treatment:** `backdrop-filter: blur(12px)`, subtle inner shadow

### Upload Queue (multi-file)
- **Per-file card:** Glass surface showing:
  - File name (truncated)
  - File size
  - Animated progress bar (CTA fill, stages labeled: Uploading → Extracting metadata → Generating thumbnail → Transcribing → Indexing)
  - Stage label below progress
  - Elapsed time (Fira Code monospace)
- **Complete state:** Green checkmark icon, progress bar turns green
- **Error state:** Red X, error message, retry button

**Components:** `shadcn/progress`, Framer Motion for animations

---

## 6. Tag Editor & Filter System

### Tag Editor (in detail panel and card context menu)
- **Combobox:** Glass dropdown with search input, existing tags with counts, "Create new" option at bottom
- **Selected tags:** Glass pills with X remove
- **Keyboard:** Arrow keys, Enter to select/create, Escape to close

### Filter System
- **Filter button:** In top bar or filter bar "+ Filter" chip
- **Dropdown:** Glass popover with:
  - Tag filter (multi-select with checkboxes)
  - Codec filter (dropdown)
  - Resolution filter (dropdown)
  - Duration range (slider)
- **Active filters:** Shown as chips in filter bar

**Components:** `shadcn/combobox`, `shadcn/badge`, `shadcn/popover`, `shadcn/slider`

---

## 7. Settings Page

### Layout
- **Sectioned cards** instead of flat list. Each section is a glass card.

### Sections
1. **Custom Fields** — Table with field name, type selector (text/number/date/select), delete button. Add field row at bottom with glass input + CTA "Add" button.
2. **Storage** — Read-only info card showing STORAGE_ROOT path, total size, asset count.
3. **Pipeline Status** — Health indicators for OpenSearch (connected/disconnected), Groq API (configured/missing). Glass status pills.
4. **About** — App version, database path.

**Components:** `shadcn/card`, `shadcn/select`, `shadcn/switch`, `shadcn/alert-dialog` (confirm field deletion), `shadcn/table`

---

## 8. Toast Notifications

Replace silent flash states (800ms border color) with proper toast notifications.

- **Position:** Bottom-right
- **Surface:** Glass card with colored left border (green=success, red=error, amber=warning)
- **Content:** Icon + message
- **Auto-dismiss:** 3 seconds for success, persistent for errors with dismiss button

**Component:** `shadcn/sonner`

---

## 9. Glass Surface Token System

Add to Tailwind config:

```
glass: 'rgba(255,255,255,0.03)'
glass-border: 'rgba(255,255,255,0.07)'
glass-hover: 'rgba(255,255,255,0.06)'
glass-strong: 'rgba(255,255,255,0.05)'
```

Backdrop blur utility classes:
- `glass-blur-sm` = `backdrop-filter: blur(8px)`
- `glass-blur` = `backdrop-filter: blur(12px)`
- `glass-blur-lg` = `backdrop-filter: blur(20px)`
- `glass-blur-xl` = `backdrop-filter: blur(24px)`

CTA glow utilities:
- `glow-cta-sm` = `box-shadow: 0 0 8px rgba(225,29,72,0.2)`
- `glow-cta` = `box-shadow: 0 0 12px rgba(225,29,72,0.25)`
- `glow-cta-lg` = `box-shadow: 0 0 24px rgba(225,29,72,0.3)`

---

## 10. ReactBits Components

Install via `npx shadcn@latest add @react-bits/{name}` (requires registry config).

| Component | Used In |
|-----------|---------|
| glass-surface | Every panel, card, dropdown, modal surface |
| spotlight-card | Asset cards — cursor-following light on hover |
| border-glow | Selected asset card, active sidebar item, focused inputs |
| star-border | Upload drop zone active state, command palette border |
| dock | Sidebar navigation — icon magnification on hover |
| animated-list | Grid stagger-in, transcript segments, search results |
| decrypted-text | Logo reveal on load |
| glitch-text | Error states, "Search unavailable" banner |
| count-up | Asset count, upload progress %, storage stats |
| click-spark | CTA button clicks (Import, Add Tag) |
| elastic-slider | Video progress bar scrubber, duration range filter |
| grainient (bg) | Subtle film grain + red gradient ambient background |

---

## 11. shadcn/ui Component List

All components will be installed via `npx shadcn@latest add` and themed to Cinema Dark + liquid glass:

| Component | Used In |
|-----------|---------|
| sidebar | Navigation |
| command | Command palette (Ctrl+K) |
| dialog | Command palette wrapper, confirmations |
| context-menu | Asset card right-click |
| hover-card | Asset card hover preview |
| tabs | Detail panel (Info/Transcript) |
| resizable | Detail panel split |
| combobox | Tag editor |
| popover | Filter dropdowns |
| badge | Tags, filter chips, status |
| progress | Import upload bar |
| sonner | Toast notifications |
| tooltip | Sidebar collapsed labels |
| separator | Section dividers |
| card | Settings sections |
| select | Custom field type picker |
| switch | Settings toggles |
| alert-dialog | Destructive confirmations |
| skeleton | Loading states |
| slider | Duration range filter |
| button | Everywhere — glass ghost + CTA glow variants |
| input | Search, inline edit fields |
| scroll-area | Transcript list, tag dropdown |

---

## 12. Animation & Transitions

- **Panel slide:** Detail panel slides from right, 300ms ease-out
- **Card hover:** translateY(-2px), 250ms, shadow deepens
- **Command palette:** Fade in overlay + scale-in modal (95% → 100%), 200ms
- **Tab indicator:** Translate-x slide, 200ms
- **Toast:** Slide-in from right, 300ms spring
- **Filter chips:** Scale-in on add (0.95 → 1), fade-out on remove
- **Sidebar expand:** Width transition 200ms ease
- **All animations:** Respect `prefers-reduced-motion`

---

## 13. What Stays Unchanged

- **Video player:** Native `<video>` with custom controls (not a library)
- **Backend API:** No backend changes needed
- **React Query hooks:** All existing data hooks remain
- **Tailwind 3:** Locked, no upgrade
- **Desktop-only:** No mobile breakpoints (1024px minimum)
- **Fonts:** Fira Code + Fira Sans (weights 400, 600)
- **Accessibility:** Focus traps, ARIA, keyboard nav, reduced motion — all preserved
