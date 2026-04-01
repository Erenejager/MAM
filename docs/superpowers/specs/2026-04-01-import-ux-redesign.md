# Import UX Redesign

**Date:** 2026-04-01
**Status:** Approved
**Scope:** Import pill badge, import progress view, completion flow, time estimates

---

## 1. Import Pill Badge (TopBar)

The Import pill in the TopBar nav has three visual states:

### Idle (nothing happening)
- Default pill styling, no badge, no animation
- Same as other nav pills (Library, Settings)

### Ingesting (pipeline active)
- Pill border: `1px solid rgba(225,29,72,0.2)`
- Pill background: `rgba(225,29,72,0.08)`
- Text color: `#E11D48`
- Pulsing dot: 6px circle, `#E11D48`, `animation: pulse 1.5s ease-in-out infinite` — appended after the "Import" text with 6px left margin
- No badge count while ingesting

### Completed (unseen imports)
- Default pill styling (not CTA-colored)
- Badge: CTA red pill (`#E11D48` background, white text, 8px font-size, font-weight 600, border-radius 99px, padding `1px 5px`) — shows count of imports completed since user last visited the import view
- Badge clears to 0 (and hides) when user navigates to the import view
- Count is session-only state (resets on page reload)

### Data source
- Track `completedSinceLastVisit` counter in App.tsx state
- Ingesting state derived from `useAssets` — `assets.some(a => a.status === 'ingesting')`
- Increment counter when any asset transitions from `ingesting` → `ready` while user is NOT on the import view
- Reset counter to 0 when `view === 'import'`

---

## 2. Progress View: Stage Checklist + Slim Bar

Replace the current single progress bar with a two-part layout:

### Slim overall progress bar (top)
- 3px height, full width of the import card
- Track: `rgba(255,255,255,0.08)`
- Fill: `#E11D48` with `box-shadow: 0 0 6px rgba(225,29,72,0.3)`
- Progress = 25% per completed stage (metadata 25%, thumbnail 50%, transcription 75%, indexing 100%)
- Active stage creeps with CSS animation: `transition: width 700ms ease-out`
- When a stage starts processing, bar advances halfway to the next milestone (e.g., metadata processing = ~12%)

### Timer row (below bar)
- Left-aligned: elapsed time in `MM:SS elapsed` format (Fira Code, 11px, `#e4e4e7`)
- Right-aligned: estimate in `~N min remaining` format (Fira Code, 11px, `#71717a`)
- Estimate logic (see Section 4)

### Stage checklist (below timer)
Four rows, one per pipeline stage, stacked vertically with 8px gap:

**Completed stage row:**
- Container: `padding: 8px 12px`, `background: rgba(255,255,255,0.02)`, `border: 1px solid rgba(255,255,255,0.05)`, `border-radius: 8px`
- Left: green checkmark (`#10B981`, 14px)
- Middle: stage label (`#a1a1aa`, 12px) — "Metadata extracted", "Thumbnail generated", "Audio transcribed", "Search indexed"
- Right: duration (`font-mono`, 10px, `#52525b`) — e.g., "2s", "4s", "1:12"

**Active stage row (glass card):**
- Container: `padding: 8px 12px`, `background: rgba(225,29,72,0.06)`, `border: 1px solid rgba(225,29,72,0.15)`, `border-radius: 8px`, `box-shadow: 0 0 12px rgba(225,29,72,0.08)`
- Left: CTA spinner (14px, `border: 2px solid #E11D48`, `border-top-color: transparent`, `animation: spin 1s linear infinite`)
- Middle: active label (`#e4e4e7`, 12px) — "Extracting metadata...", "Generating thumbnail...", "Transcribing audio...", "Indexing for search..."

**Pending stage row:**
- Container: same as completed but dimmer
- Left: hollow circle (`#52525b`, 14px, `&#9675;`)
- Middle: stage label (`#52525b`, 12px)

**Failed stage row:**
- Container: `border: 1px solid rgba(225,29,72,0.15)`
- Left: red X icon (`#E11D48`, 14px)
- Middle: stage label + error (`#E11D48`, 12px) — e.g., "Transcription failed"
- Soft failures (transcription, indexing) don't block the overall import

### Stage-to-status mapping

| Stage | Status field | Processing label | Completed label |
|-------|-------------|-----------------|-----------------|
| Metadata | `metadataStatus` | Extracting metadata... | Metadata extracted |
| Thumbnail | `thumbnailStatus` | Generating thumbnail... | Thumbnail generated |
| Transcription | `transcriptionStatus` | Transcribing audio... | Audio transcribed |
| Indexing | `searchIndexStatus` | Indexing for search... | Search indexed |

### Stage timing
- Each stage records its start time when it transitions to `processing`
- When it completes, duration = `now - stageStartTime`
- Displayed as seconds ("4s") or minutes:seconds ("1:12") if >= 60s

---

## 3. Completion: Toast + Immediate Reset

When the asset reaches `status: 'ready'`:

### Import view behavior
- Immediately reset to the idle drop zone state (no 2.5s delay)
- User can drag another file right away

### Toast notification
- Use Sonner (already installed) with a custom toast component
- Position: bottom-right (existing Sonner config)
- Duration: 8 seconds, dismissible

**Toast layout:**
- Glass card: `background: rgba(15,15,30,0.95)`, `backdrop-filter: blur(16px)`, `border: 1px solid rgba(255,255,255,0.1)`, `border-radius: 10px`, `padding: 12px`, `box-shadow: 0 4px 20px rgba(0,0,0,0.4)`
- Left: thumbnail image (48x48px, 6px border-radius, `object-fit: cover`). Fallback: gray placeholder with film icon
- Right content:
  - Title: asset title or filename (11px, `#e4e4e7`, font-weight 600, truncate with ellipsis)
  - Subtitle: "Import complete · {duration} · {fileSize}" (10px, `#71717a`)
  - Action: "View asset" link (10px, `#E11D48`, underline, click navigates to library with asset selected)

### Soft failure handling
- If transcription or indexing failed but asset is `ready`:
  - Toast still shows (import succeeded)
  - Subtitle notes: "Import complete · transcription failed" in `#F59E0B` (amber)

---

## 4. Time Estimation

### Approach: file-size heuristic with rolling averages

**Estimate calculation:**
- Store per-stage average durations in `localStorage` key `mam-import-estimates`
- Format: `{ metadata: { avgMsPerMb: number, samples: number }, thumbnail: { ... }, transcription: { ... }, indexing: { ... } }`
- After each import, update averages: `newAvg = ((oldAvg * samples) + thisDuration) / (samples + 1)`
- File size is known at upload time from the `File` object

**Estimate display:**
- Before first import (no stored data): show "Estimating..."
- With stored data: `remainingMs = sum of (avgMsPerMb * fileSizeMb) for remaining stages`
- Display as: `~1 min remaining`, `~30s remaining`, `< 10s remaining`
- Update every poll cycle (2.5s)
- Once final stage starts: show "Almost done..." instead of a time

**Recording stage durations:**
- Track `stageStartedAt` timestamp when a stage transitions to `processing`
- When stage transitions to `complete`/`failed`/`skipped`, compute `durationMs = Date.now() - stageStartedAt`
- Only record `complete` durations in the rolling average (not failures)
- File size comes from the uploaded `File.size` (bytes) — convert to MB for the ratio

---

## 5. Component Changes

| Component | Change |
|-----------|--------|
| `ImportView.tsx` | Replace progress bar with checklist + slim bar; add time estimate display; reset immediately on completion; fire toast |
| `TopBar.tsx` | Remove hardcoded badge; add dynamic badge from `completedSinceLastVisit` prop; add pulse state from `isIngesting` prop |
| `App.tsx` | Track `completedSinceLastVisit` counter; pass `isIngesting` and badge count to TopBar |
| New: `ImportStageChecklist.tsx` | Stage checklist component with completed/active/pending/failed row states |
| New: `useImportEstimate.ts` | Hook for time estimation: reads/writes localStorage averages, computes remaining time |

---

## 6. Accessibility

- Stage checklist: `role="list"`, each row `role="listitem"`
- Active stage spinner: `aria-label="Processing"` + visually hidden status text
- Toast: Sonner handles `aria-live="polite"` automatically
- Pulsing dot on Import pill: `aria-label="Import in progress"` on the pill button
- Time estimate: `aria-live="polite"` region that updates every 10s (not every 2.5s — reduce noise)
