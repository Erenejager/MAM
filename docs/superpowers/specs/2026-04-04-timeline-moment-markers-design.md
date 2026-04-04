# Timeline Moment Markers

Render OCR key moments as subtle tick marks on the video progress bar, with hover tooltips, click-to-seek with floating card, toggle visibility, and cluster merging.

## Scope

Changes to `VideoProgressBar.tsx` and `VideoPlayer.tsx` only. No backend changes. No new dependencies.

## Data Source

Key moments come from `asset.ocrKeyMoments` (JSON string, parsed to array). Each moment has:

```ts
{ timestamp: number; label: string; score: string | null; set_period: string | null }
```

Only render markers when `asset.ocrStatus === 'complete'` and `ocrKeyMoments` is non-null.

## Tick Marks

- Positioned above the progress bar at `left: (timestamp / duration) * 100%`
- Default: 2px wide, 8px tall, `rgba(225,29,72,0.4)`, border-radius 1px
- Hovered: 2px wide, 12px tall, `#E11D48`, with `box-shadow: 0 0 6px rgba(225,29,72,0.4)`
- Rendered as absolutely-positioned divs inside the existing progress bar container
- No impact on progress bar hit area or drag behavior

## Cluster Merging

Moments whose positions are within 1% of the timeline are merged into a single marker:

- Width: 3px (vs 2px regular)
- Opacity: `rgba(225,29,72,0.55)` (vs 0.4 regular)
- Height: 9px (vs 8px regular)
- Tooltip shows the first moment in the cluster
- Click seeks to the first moment in the cluster

Merging is computed once when moments array changes (useMemo), not on every render.

## Hover Tooltip

Appears above the hovered tick mark (not the cursor — centered on the tick). Shows:

- Line 1: timecode (pink, mono, bold) + label (white, bold)
- Line 2: score + set_period (muted, smaller)

Styling: `background: rgba(15,15,30,0.95)`, `border: 1px solid rgba(225,29,72,0.2)`, `border-radius: 8px`, `backdrop-filter: blur(12px)`, `box-shadow: 0 4px 16px rgba(0,0,0,0.4)`. Same glass aesthetic as existing time tooltip.

Tooltip does not render when the progress bar's own time tooltip is showing (during drag). Tick hover takes precedence over bar hover when cursor is on a tick.

## Click Behavior

Clicking a tick mark:

1. Seeks video to `moment.timestamp`
2. Shows a floating card above the progress bar at the tick position
3. Card content: same as hover tooltip (timecode + label + score)
4. Card fades out after 3 seconds (opacity transition 300ms)
5. If another tick is clicked before fade completes, the card moves to the new position immediately

Clicking the progress bar (not on a tick) retains normal seek behavior with no floating card.

## Toggle (Eye Icon)

- Small eye icon added to the controls bar, after volume, before fullscreen
- Uses lucide `Eye` / `EyeOff` icons (already in project dependencies)
- ON state: `text-cta` (#E11D48) — Eye icon
- OFF state: `text-[#52525b]` — EyeOff icon
- State stored in component (useState), defaults to ON
- When OFF: all tick marks and floating cards are hidden, toggle icon is muted
- Only rendered when the asset has key moments

## Component Changes

### VideoProgressBar.tsx

New props:
```ts
moments?: Array<{ timestamp: number; label: string; score: string | null; set_period: string | null }>;
momentsVisible?: boolean;
duration: number; // already available internally, but may need to be exposed
```

New internal state:
- `hoveredMomentIndex: number | null`
- `floatingCard: { index: number; opacity: number } | null`

New elements rendered inside the existing container div:
- Tick mark divs (conditionally rendered when `momentsVisible`)
- Tooltip div (when `hoveredMomentIndex !== null`)
- Floating card div (when `floatingCard !== null`)

### VideoPlayer.tsx

- Parse `asset.ocrKeyMoments` and pass as prop to VideoProgressBar
- Add `momentsVisible` state (boolean, default true)
- Add eye icon toggle to controls bar
- Pass merged moments array (computed via useMemo)

## Merge Algorithm

```ts
function mergeMoments(moments, duration) {
  const threshold = 0.01; // 1% of timeline
  const sorted = [...moments].sort((a, b) => a.timestamp - b.timestamp);
  const merged = [];
  
  for (const m of sorted) {
    const pos = m.timestamp / duration;
    const last = merged[merged.length - 1];
    if (last && pos - last.position < threshold) {
      last.count++;
    } else {
      merged.push({ ...m, position: pos, count: 1 });
    }
  }
  return merged;
}
```

Merged markers use thicker/brighter styling. The `count` field distinguishes singles from clusters.

## Accessibility

- Tick marks have `role="button"` and `aria-label="Moment at MM:SS: {label}"`
- Toggle button has `aria-label="Toggle moment markers"` and `aria-pressed`
- Floating card has `role="status"` and `aria-live="polite"`

## Edge Cases

- No moments: no ticks rendered, no toggle shown
- OCR pending/processing/failed: no ticks rendered, no toggle shown
- Video duration 0 or unavailable: no ticks rendered
- Moments outside video duration: filtered out
- Extremely short video with many moments: cluster merging handles density
