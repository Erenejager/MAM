# Asset Card Hover Redesign

**Date:** 2026-04-01
**Status:** Approved
**Scope:** Replace the current full-overlay hover on asset cards with two context-aware behaviors: scrub preview for browse mode, and frame-at-match with gradient context overlay for search mode.

---

## 1. Browse Hover: Scrub Preview Strip

When no search is active and the user hovers an asset card, the mouse position (left→right) scrubs through pre-generated preview frames.

### Frame generation (pipeline)

- New pipeline stage after thumbnail: generate 6 evenly-spaced JPEG frames
- Filenames: `frame_0.jpg` through `frame_5.jpg` in the asset's storage directory (`{STORAGE_ROOT}/{assetId}/`)
- Each frame: `?x360` height (same as thumbnail), JPEG quality 80
- Timestamps: `duration * (i + 0.5) / 6` for `i` in `[0..5]` — centers each frame in its sixth of the video
- Pipeline stage: `framesStatus` column (`pending` | `processing` | `complete` | `failed`)
- Soft failure — asset is usable without preview frames; fallback to static thumbnail on hover

### Frontend behavior

**Default state (no hover):** Card looks exactly as it does today — thumbnail, bottom gradient with title, duration badge top-right, status badge top-left.

**Hover state:**
- Mouse X position relative to card width determines which frame (0–5) is displayed
- Frame index: `Math.floor((mouseX / cardWidth) * 6)`, clamped to `[0, 5]`
- The `<img>` src swaps to `/storage/{assetId}/frame_{index}.jpg`
- Smooth: no transition/fade between frames — direct swap for responsive scrub feel
- Fallback: if frames are not available (`framesStatus !== 'complete'`), keep the static thumbnail (no scrub)

**Scrub progress indicator:**
- 3px bar at bottom of card, full width
- Track: `rgba(255,255,255,0.08)`
- Fill: `#E11D48` with `box-shadow: 0 0 6px rgba(225,29,72,0.3)`
- Width: proportional to mouse X position (continuous, not stepped)
- Transition: none (follows mouse directly)

**Timecode tooltip:**
- Glass pill above the progress bar, follows mouse X
- Background: `rgba(15,15,30,0.95)`, `backdrop-filter: blur(8px)`, `1px solid rgba(255,255,255,0.1)`, 4px border-radius
- Font: Fira Code, 9px, `#e4e4e7`
- Shows the timestamp corresponding to the mouse position: `(mouseX / cardWidth) * duration`
- Format: `M:SS`

**Enhanced bottom bar (visible on hover):**
- Bottom gradient enriched from current: add duration, file size, and tag pills
- Title: existing `text-xs font-semibold text-white truncate`
- Below title: `duration · fileSize` in Fira Code 10px `#71717a`
- Below that: tag pills (max 4) — `text-[8px] px-[6px] py-[1px] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] rounded text-[#a1a1aa]`

**Mouse leave:** Revert to original thumbnail, hide progress bar and tooltip.

---

## 2. Search Hover: Frame at Match + Gradient Context Overlay

When a search is active and the user hovers a search result card, the thumbnail swaps to show the video frame at the first transcript match timestamp, and a gradient overlay fades in at the bottom showing match context.

### Frame at match timestamp

- On hover, the card's `<img>` src changes to `/api/assets/{assetId}/frame?t={timestamp}` where `timestamp` is the first transcript match's timestamp (in seconds)
- Backend endpoint: `GET /api/assets/:id/frame?t=:seconds`
  - Uses ffmpeg to extract a single frame at the given timestamp
  - Output: JPEG, `?x360` height
  - Cached to `{STORAGE_ROOT}/{assetId}/frame_t{seconds}.jpg` — served directly on subsequent requests
  - Returns 200 with `Content-Type: image/jpeg`
  - If timestamp is beyond duration or ffmpeg fails, returns 404
- Timestamp badge: top-left of card, `background: rgba(225,29,72,0.9)`, 4px border-radius, `padding: 1px 6px`, Fira Code 9px, white text, `font-weight: 600` — shows `@ M:SS`
- If no transcript match (title/description match only), keep the original thumbnail — no frame swap

### Gradient context overlay (bottom of card)

Fades in on hover over the full-width frame. Frame stays visible through the gradient.

**Container:**
- `position: absolute; bottom: 0; left: 0; right: 0`
- `background: linear-gradient(transparent 0%, rgba(10,10,20,0.7) 25%, rgba(10,10,20,0.92) 100%)`
- `padding: 28px 10px 10px` (generous top padding for gradient fade)
- `opacity: 0` → `opacity: 1` on hover, `transition: opacity 200ms ease-out`

**Match source badges:**
- Row of pills showing which fields matched
- Each: `text-[8px] px-[5px] py-[1px] bg-cta/15 border border-cta/20 rounded text-cta`
- Labels: "Title", "Description", "Transcript" — only show badges for fields that actually matched
- If transcript matched, show count: "Transcript ×3"

**Transcript excerpt (if transcript matched):**
- 1-2 lines, `text-[10px] text-[#e4e4e7] line-height-1.4`, clamped with `-webkit-line-clamp: 2`
- Matching terms highlighted: `background: rgba(225,29,72,0.25)`, `color: #fff`, `padding: 0 2px`, `border-radius: 2px`
- Uses the first transcript highlight fragment from the search response

**Clickable timecodes:**
- Row of timecode pills (max 4)
- Each: `font-mono text-[9px] text-cta px-[4px] py-[1px] bg-cta/10 rounded cursor-pointer hover:bg-cta/20`
- Click calls `onTimecodeClick(assetId, timestamp)` — opens detail panel at that moment
- `+N more` text if more than 4 matches: `text-[8px] text-[#52525b]`

**No transcript match (title/description only):**
- No frame swap (keep original thumbnail)
- Gradient overlay still shows with match badges and description excerpt if available
- No timecodes row

---

## 3. Backend: Frame Extraction Endpoint

### `GET /api/assets/:id/frame?t=:seconds`

New route in `backend/src/routes/assets.ts`:

- Parse `t` query param as float (seconds)
- Check if cached file exists: `{STORAGE_ROOT}/{assetId}/frame_t{seconds}.jpg`
  - If exists, serve it with `reply.sendFile()`
  - If not, extract via ffmpeg: `ffmpeg -ss {seconds} -i {input} -frames:v 1 -vf scale=-1:360 -q:v 5 {output}`
  - Cache the result, then serve
- Error handling: if asset not found → 404; if ffmpeg fails → 404; if `t` param missing → 400

### Pipeline: Preview Frames Stage

New stage in `backend/src/lib/pipeline.ts`, runs after thumbnail:

- Generate 6 frames at evenly-spaced timestamps
- Command per frame: `ffmpeg -ss {timestamp} -i {input} -frames:v 1 -vf scale=-1:360 -q:v 5 {output}`
- Output: `{STORAGE_ROOT}/{assetId}/frame_0.jpg` through `frame_5.jpg`
- New column: `framesStatus` (`pending` | `processing` | `complete` | `failed`)
- Soft failure — log error, set `framesStatus = 'failed'`, continue pipeline

### Schema change

Add to `assets` table:
- `framesStatus TEXT DEFAULT 'pending'`

Run `npm run db:generate` and `npm run db:migrate` after schema change.

---

## 4. Component Changes

| Component | Change |
|-----------|--------|
| `AssetCard.tsx` | Remove current full-overlay hover. Add browse scrub logic (mouse X → frame index → img swap). Add search gradient overlay. Conditional on whether search is active. |
| New: `ScrubPreview.tsx` | Encapsulates the scrub preview logic: mouse tracking, frame img swap, progress bar, timecode tooltip. Used by AssetCard in browse mode. |
| New: `SearchContextOverlay.tsx` | The gradient overlay with match badges, excerpt, timecodes. Used by AssetCard in search mode. |
| `backend/src/routes/assets.ts` | Add `GET /api/assets/:id/frame` endpoint |
| `backend/src/lib/pipeline.ts` | Add preview frames stage after thumbnail |
| `backend/src/db/schema.ts` | Add `framesStatus` column |

---

## 5. Storage Layout (updated)

```
{STORAGE_ROOT}/
  {asset-uuid}/
    original.{ext}        ← never mutated after ingest
    thumbnail.jpg          ← generated by ffmpeg (stage 2)
    frame_0.jpg            ← preview frame 1/6 (new stage)
    frame_1.jpg            ← preview frame 2/6
    frame_2.jpg            ← preview frame 3/6
    frame_3.jpg            ← preview frame 4/6
    frame_4.jpg            ← preview frame 5/6
    frame_5.jpg            ← preview frame 6/6
    frame_t42.jpg          ← on-demand frame at 42s (cached)
    transcript.json        ← Groq API output
```

---

## 6. Accessibility

- Scrub preview: `aria-label="Scrub video preview"` on the card during hover
- Timecode tooltip: `aria-hidden="true"` (decorative, position follows mouse)
- Progress bar: `role="slider"`, `aria-valuemin=0`, `aria-valuemax={duration}`, `aria-valuenow={currentTime}`
- Search context overlay: match badges are informational text, timecodes are buttons with `aria-label="Jump to {timecode}"`
- All animations respect `prefers-reduced-motion`: disable frame scrub (stay on thumbnail), disable gradient fade transition
