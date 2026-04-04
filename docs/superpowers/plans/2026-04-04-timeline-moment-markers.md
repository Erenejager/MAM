# Timeline Moment Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render OCR key moments as subtle tick marks on the video progress bar with hover tooltips, click-to-seek floating cards, visibility toggle, and cluster merging.

**Architecture:** Add a `moments` prop to `VideoProgressBar` for rendering tick marks. `VideoPlayer` parses the asset's key moments, merges clusters, manages toggle state, and passes data down. No new files — all changes in two existing components.

**Tech Stack:** React, Lucide icons (Eye/EyeOff), existing CSS patterns (inline styles matching Cinema Dark design system).

---

## File Structure

- **Modify:** `frontend/src/components/detail/VideoProgressBar.tsx` — add tick marks, hover tooltip, floating card, moment click handling
- **Modify:** `frontend/src/components/detail/VideoPlayer.tsx` — parse moments, merge clusters, add toggle state + eye icon button

---

### Task 1: Add Moment Marker Types and Merge Logic to VideoPlayer

**Files:**
- Modify: `frontend/src/components/detail/VideoPlayer.tsx`

- [ ] **Step 1: Add imports and moment type**

At the top of `VideoPlayer.tsx`, add the `useMemo` import and the `Eye`/`EyeOff` icons. Add the merged moment interface and merge function above the component.

Add `useMemo` to the existing React import:
```tsx
import { forwardRef, useEffect, useState, useCallback, useMemo } from 'react';
```

Add `Eye, EyeOff` to the existing lucide import:
```tsx
import { Play, Pause, Volume2, VolumeX, Maximize, Eye, EyeOff } from 'lucide-react';
```

Add these types and the merge function after the imports, before the component:
```tsx
export interface TimelineMoment {
  timestamp: number;
  label: string;
  score: string | null;
  set_period: string | null;
  position: number; // 0-1 ratio on timeline
  count: number;    // 1 = single, >1 = merged cluster
}

function mergeMoments(
  raw: Array<{ timestamp: number; label: string; score: string | null; set_period: string | null }>,
  duration: number,
): TimelineMoment[] {
  if (!duration || duration <= 0) return [];
  const sorted = [...raw].sort((a, b) => a.timestamp - b.timestamp);
  const merged: TimelineMoment[] = [];
  const threshold = 0.01; // 1% of timeline

  for (const m of sorted) {
    const pos = m.timestamp / duration;
    if (pos < 0 || pos > 1) continue;
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

- [ ] **Step 2: Add state and memoized moments inside the component**

Inside the `VideoPlayer` component function, after the existing `useState` declarations (after line 18 `const [videoEl, setVideoEl] = ...`), add:

```tsx
const [momentsVisible, setMomentsVisible] = useState(true);

const moments = useMemo<TimelineMoment[]>(() => {
  if (asset.ocrStatus !== 'complete' || !asset.ocrKeyMoments) return [];
  try {
    const parsed = JSON.parse(asset.ocrKeyMoments);
    if (!Array.isArray(parsed)) return [];
    return mergeMoments(parsed, duration);
  } catch {
    return [];
  }
}, [asset.ocrStatus, asset.ocrKeyMoments, duration]);

const hasMoments = moments.length > 0;
```

- [ ] **Step 3: Pass moments to VideoProgressBar**

Change the `<VideoProgressBar>` usage from:
```tsx
<VideoProgressBar videoRef={videoRefObj} />
```
to:
```tsx
<VideoProgressBar
  videoRef={videoRefObj}
  moments={momentsVisible ? moments : []}
/>
```

- [ ] **Step 4: Add eye toggle button to controls bar**

In the right group of the controls bar, add the toggle button between the volume button and the fullscreen button. Change this block:

```tsx
{/* Right group: volume + fullscreen */}
<div className="flex items-center gap-[8px]">
  <button
    onClick={toggleMute}
    className="text-[#71717a] hover:text-[#e4e4e7] transition-colors cursor-pointer"
    aria-label={muted ? 'Unmute' : 'Mute'}
  >
    {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
  </button>
  <button
    onClick={toggleFullscreen}
    className="text-[#71717a] hover:text-[#e4e4e7] transition-colors cursor-pointer"
    aria-label="Toggle fullscreen"
  >
    <Maximize size={16} />
  </button>
</div>
```

to:

```tsx
{/* Right group: moments toggle + volume + fullscreen */}
<div className="flex items-center gap-[8px]">
  {hasMoments && (
    <button
      onClick={() => setMomentsVisible((v) => !v)}
      className={`transition-colors cursor-pointer ${
        momentsVisible ? 'text-cta' : 'text-[#52525b] hover:text-[#71717a]'
      }`}
      aria-label="Toggle moment markers"
      aria-pressed={momentsVisible}
    >
      {momentsVisible ? <Eye size={14} /> : <EyeOff size={14} />}
    </button>
  )}
  <button
    onClick={toggleMute}
    className="text-[#71717a] hover:text-[#e4e4e7] transition-colors cursor-pointer"
    aria-label={muted ? 'Unmute' : 'Mute'}
  >
    {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
  </button>
  <button
    onClick={toggleFullscreen}
    className="text-[#71717a] hover:text-[#e4e4e7] transition-colors cursor-pointer"
    aria-label="Toggle fullscreen"
  >
    <Maximize size={16} />
  </button>
</div>
```

- [ ] **Step 5: Verify types compile**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: Type errors for `VideoProgressBar` not accepting `moments` prop yet (expected at this stage).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/detail/VideoPlayer.tsx
git commit -m "feat: add moment merge logic and eye toggle to VideoPlayer"
```

---

### Task 2: Add Tick Marks to VideoProgressBar

**Files:**
- Modify: `frontend/src/components/detail/VideoProgressBar.tsx`

- [ ] **Step 1: Update props interface and add imports**

Change the imports line at the top from:
```tsx
import { useEffect, useRef, useState, useCallback } from 'react';
```
to:
```tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import type { TimelineMoment } from './VideoPlayer';
```

Change the props interface from:
```tsx
interface VideoProgressBarProps {
  videoRef: React.RefObject<HTMLVideoElement>;
}
```
to:
```tsx
interface VideoProgressBarProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  moments?: TimelineMoment[];
}
```

Change the component signature from:
```tsx
export function VideoProgressBar({ videoRef }: VideoProgressBarProps) {
```
to:
```tsx
export function VideoProgressBar({ videoRef, moments = [] }: VideoProgressBarProps) {
```

- [ ] **Step 2: Add tick mark state**

After the existing `useState` declarations (after `const barRef = ...` on line 16), add:

```tsx
const [hoveredMomentIdx, setHoveredMomentIdx] = useState<number | null>(null);
```

- [ ] **Step 3: Render tick marks inside the container div**

Inside the outer container `<div>` (the one with `className="absolute bottom-0 left-0 right-0 z-10"`), after the time tooltip block and before the `{/* Progress bar */}` comment, add the tick marks:

```tsx
{/* Moment tick marks */}
{moments.length > 0 && (
  <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: 20 }}>
    {moments.map((m, i) => {
      const isHovered = hoveredMomentIdx === i;
      const isCluster = m.count > 1;
      return (
        <div
          key={`${m.timestamp}-${i}`}
          className="absolute pointer-events-auto cursor-pointer"
          style={{
            left: `${m.position * 100}%`,
            bottom: barHeight + 2,
            transform: 'translateX(-50%)',
            width: isHovered ? 2 : isCluster ? 3 : 2,
            height: isHovered ? 12 : isCluster ? 9 : 8,
            background: isHovered
              ? '#E11D48'
              : isCluster
                ? 'rgba(225,29,72,0.55)'
                : 'rgba(225,29,72,0.4)',
            borderRadius: 1,
            boxShadow: isHovered ? '0 0 6px rgba(225,29,72,0.4)' : 'none',
            transition: 'height 100ms ease-out, background 100ms ease-out',
          }}
          onMouseEnter={() => setHoveredMomentIdx(i)}
          onMouseLeave={() => setHoveredMomentIdx(null)}
          onClick={(e) => {
            e.stopPropagation();
            const video = videoRef.current;
            if (video) video.currentTime = m.timestamp;
          }}
          role="button"
          aria-label={`Moment at ${formatTime(m.timestamp)}: ${m.label}`}
        />
      );
    })}
  </div>
)}
```

- [ ] **Step 4: Verify types compile**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/detail/VideoProgressBar.tsx
git commit -m "feat: render moment tick marks on progress bar"
```

---

### Task 3: Add Hover Tooltip for Tick Marks

**Files:**
- Modify: `frontend/src/components/detail/VideoProgressBar.tsx`

- [ ] **Step 1: Add moment hover tooltip**

Inside the outer container div, right after the tick marks block added in Task 2 (after the closing `)}` of the moment tick marks), add the moment tooltip:

```tsx
{/* Moment hover tooltip */}
{hoveredMomentIdx !== null && moments[hoveredMomentIdx] && !dragging && (
  <div
    className="absolute pointer-events-none"
    style={{
      left: `${moments[hoveredMomentIdx].position * 100}%`,
      bottom: barHeight + 16,
      transform: 'translateX(-50%)',
      background: 'rgba(15,15,30,0.95)',
      border: '1px solid rgba(225,29,72,0.2)',
      borderRadius: 8,
      padding: '6px 10px',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      whiteSpace: 'nowrap',
      zIndex: 20,
    }}
  >
    <div className="flex items-center gap-[6px]">
      <span className="font-mono text-[11px] font-semibold text-cta">
        {formatTime(moments[hoveredMomentIdx].timestamp)}
      </span>
      <span className="text-[11px] font-semibold text-[#e4e4e7]">
        {moments[hoveredMomentIdx].label}
      </span>
    </div>
    {(moments[hoveredMomentIdx].score || moments[hoveredMomentIdx].set_period) && (
      <div className="text-[10px] text-[#a1a1aa] mt-[1px]">
        {[moments[hoveredMomentIdx].score, moments[hoveredMomentIdx].set_period]
          .filter(Boolean)
          .join(' | ')}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 2: Hide default time tooltip when hovering a moment**

Change the existing time tooltip condition from:
```tsx
{expanded && (
```
to:
```tsx
{expanded && hoveredMomentIdx === null && (
```

This prevents the generic time tooltip from showing when the user is hovering a specific moment tick.

- [ ] **Step 3: Verify types compile**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/detail/VideoProgressBar.tsx
git commit -m "feat: add hover tooltip for moment tick marks"
```

---

### Task 4: Add Floating Card on Click

**Files:**
- Modify: `frontend/src/components/detail/VideoProgressBar.tsx`

- [ ] **Step 1: Add floating card state**

After the `hoveredMomentIdx` state declaration added in Task 2, add:

```tsx
const [floatingCard, setFloatingCard] = useState<{ index: number; fadeOut: boolean } | null>(null);
const floatingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 2: Add showFloatingCard function**

After the `handleKeyDown` callback (around line 129), add:

```tsx
const showFloatingCard = useCallback((index: number) => {
  if (floatingTimerRef.current) clearTimeout(floatingTimerRef.current);
  setFloatingCard({ index, fadeOut: false });
  floatingTimerRef.current = setTimeout(() => {
    setFloatingCard((prev) => prev ? { ...prev, fadeOut: true } : null);
    floatingTimerRef.current = setTimeout(() => {
      setFloatingCard(null);
    }, 300);
  }, 3000);
}, []);
```

- [ ] **Step 3: Clean up timer on unmount**

Add a cleanup effect after the existing useEffect blocks:

```tsx
useEffect(() => {
  return () => {
    if (floatingTimerRef.current) clearTimeout(floatingTimerRef.current);
  };
}, []);
```

- [ ] **Step 4: Update tick mark onClick to show floating card**

In the tick mark div's `onClick` handler from Task 2, change:

```tsx
onClick={(e) => {
  e.stopPropagation();
  const video = videoRef.current;
  if (video) video.currentTime = m.timestamp;
}}
```

to:

```tsx
onClick={(e) => {
  e.stopPropagation();
  const video = videoRef.current;
  if (video) video.currentTime = m.timestamp;
  showFloatingCard(i);
}}
```

- [ ] **Step 5: Render floating card**

Inside the outer container div, after the moment hover tooltip block from Task 3, add:

```tsx
{/* Floating card (post-click) */}
{floatingCard !== null && moments[floatingCard.index] && (
  <div
    className="absolute pointer-events-none"
    style={{
      left: `${moments[floatingCard.index].position * 100}%`,
      bottom: barHeight + 16,
      transform: 'translateX(-50%)',
      background: 'rgba(15,15,30,0.95)',
      border: '1px solid rgba(225,29,72,0.2)',
      borderRadius: 8,
      padding: '6px 10px',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      whiteSpace: 'nowrap',
      zIndex: 20,
      opacity: floatingCard.fadeOut ? 0 : 1,
      transition: 'opacity 300ms ease-out',
    }}
    role="status"
    aria-live="polite"
  >
    <div className="flex items-center gap-[6px]">
      <span className="font-mono text-[11px] font-semibold text-cta">
        {formatTime(moments[floatingCard.index].timestamp)}
      </span>
      <span className="text-[11px] font-semibold text-[#e4e4e7]">
        {moments[floatingCard.index].label}
      </span>
    </div>
    {(moments[floatingCard.index].score || moments[floatingCard.index].set_period) && (
      <div className="text-[10px] text-[#a1a1aa] mt-[1px]">
        {[moments[floatingCard.index].score, moments[floatingCard.index].set_period]
          .filter(Boolean)
          .join(' | ')}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 6: Hide floating card when hovering a different moment**

The hover tooltip and floating card can overlap. The hover tooltip should take priority. Update the moment hover tooltip condition from:
```tsx
{hoveredMomentIdx !== null && moments[hoveredMomentIdx] && !dragging && (
```
to:
```tsx
{hoveredMomentIdx !== null && moments[hoveredMomentIdx] && !dragging && floatingCard?.index !== hoveredMomentIdx && (
```

This hides the hover tooltip when the floating card is already showing for the same moment.

- [ ] **Step 7: Verify types compile**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/detail/VideoProgressBar.tsx
git commit -m "feat: add floating card on moment tick click"
```

---

### Task 5: Final Verification

**Files:** None (testing only)

- [ ] **Step 1: Type check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 2: Build check**

Run: `cd frontend && npm run build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 3: Visual test**

Open the app in the browser, navigate to the Alcaraz vs Djokovic asset (which has 56 key moments). Verify:
- Tick marks appear above progress bar
- Hovering a tick shows tooltip with timecode + label + score
- Clicking a tick seeks the video and shows floating card for ~3s
- Eye icon in controls bar toggles ticks on/off
- Clustered ticks are slightly thicker/brighter

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: timeline moment markers — complete implementation"
```
