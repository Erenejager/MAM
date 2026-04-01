# Detail Panel Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser-native video controls with custom glass-morphism controls, restructure the info tab as a collapsible accordion, upgrade transcript segment styling with glass card active state and auto-seek on search navigation, and add draggable panel resize with localStorage persistence.

**Architecture:** The detail panel's existing 60/40 flex split becomes a `ResizablePanelGroup` (already installed via shadcn). VideoPlayer gets a new `VideoProgressBar` child component and inline glass play overlay. MetadataSection wraps its three logical sections (editable metadata, file details, custom fields) in collapsible disclosures using plain `useState` toggles with CSS height transitions (no new Radix dependency). TranscriptList gets updated segment styling and auto-seek on search navigation. All changes are scoped to `frontend/src/components/detail/`.

**Tech Stack:** React 18, Tailwind 3 (glass tokens already configured), framer-motion (for play overlay fade), react-resizable-panels (via shadcn/ui `resizable.tsx`), lucide-react icons.

**Design spec:** `docs/superpowers/specs/2026-04-01-detail-panel-refinement-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/components/detail/VideoProgressBar.tsx` | Thin progress bar on video edge + expand-on-hover scrubber + time tooltip |
| Modify | `frontend/src/components/detail/VideoPlayer.tsx` | Remove native controls, add glass play overlay, compact controls bar, integrate VideoProgressBar |
| Modify | `frontend/src/components/detail/MetadataSection.tsx` | Wrap editable metadata, file details, and custom fields in collapsible accordion sections |
| Modify | `frontend/src/components/detail/CustomFieldsSection.tsx` | Remove outer wrapper (MetadataSection now manages the section) |
| Modify | `frontend/src/components/detail/TranscriptList.tsx` | Glass card active segment styling, past/future opacity, auto-seek on search navigate |
| Modify | `frontend/src/components/detail/DetailPanel.tsx` | Replace flex 60/40 with ResizablePanelGroup, custom glass resize handle, localStorage persistence |

---

## Task 1: VideoProgressBar Component

**Files:**
- Create: `frontend/src/components/detail/VideoProgressBar.tsx`

This is a standalone progress bar with expand-on-hover scrubber and time tooltip. It receives the video ref and renders at the bottom edge of the video container.

- [ ] **Step 1: Create VideoProgressBar with basic progress tracking**

```tsx
// frontend/src/components/detail/VideoProgressBar.tsx
import { useEffect, useRef, useState, useCallback } from 'react';

interface VideoProgressBarProps {
  videoRef: React.RefObject<HTMLVideoElement>;
}

export function VideoProgressBar({ videoRef }: VideoProgressBarProps) {
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tooltipTime, setTooltipTime] = useState(0);
  const [tooltipX, setTooltipX] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  // Sync progress with video timeupdate
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.duration && isFinite(video.duration)) {
        setProgress(video.currentTime / video.duration);
        setDuration(video.duration);
      }
    };

    const onLoadedMetadata = () => {
      if (video.duration && isFinite(video.duration)) {
        setDuration(video.duration);
      }
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    // Init if already loaded
    if (video.duration && isFinite(video.duration)) {
      setDuration(video.duration);
      setProgress(video.currentTime / video.duration);
    }

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [videoRef]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getTimeFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const bar = barRef.current;
      if (!bar || !duration) return 0;
      const rect = bar.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      return (x / rect.width) * duration;
    },
    [duration]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      setTooltipX(x);
      setTooltipTime(getTimeFromEvent(e));
    },
    [getTimeFromEvent]
  );

  const handleSeek = useCallback(
    (e: React.MouseEvent) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = getTimeFromEvent(e);
    },
    [videoRef, getTimeFromEvent]
  );

  // Global mouse handlers for drag
  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const bar = barRef.current;
      const video = videoRef.current;
      if (!bar || !video || !duration) return;
      const rect = bar.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const time = (x / rect.width) * duration;
      video.currentTime = time;
      setTooltipX(x);
      setTooltipTime(time);
    };

    const onMouseUp = () => setDragging(false);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging, duration, videoRef]);

  const expanded = hovered || dragging;
  const barHeight = expanded ? 6 : 3;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-10"
      style={{ height: 20 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (!dragging) setHovered(false); }}
      onMouseMove={handleMouseMove}
    >
      {/* Time tooltip */}
      {expanded && (
        <div
          className="absolute font-mono text-[10px] px-[6px] py-[2px] rounded-md pointer-events-none"
          style={{
            bottom: barHeight + 8,
            left: tooltipX,
            transform: 'translateX(-50%)',
            background: 'rgba(15,15,30,0.95)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#e4e4e7',
          }}
        >
          {formatTime(tooltipTime)}
        </div>
      )}

      {/* Progress bar */}
      <div
        ref={barRef}
        className="absolute bottom-0 left-0 right-0 cursor-pointer"
        style={{
          height: barHeight,
          transition: 'height 150ms ease-out',
          background: 'rgba(255,255,255,0.08)',
        }}
        onClick={handleSeek}
        onMouseDown={(e) => {
          handleSeek(e);
          setDragging(true);
        }}
        role="slider"
        aria-label="Video progress"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        aria-valuetext={formatTime(currentTime)}
      >
        {/* Fill */}
        <div
          className="h-full"
          style={{
            width: `${progress * 100}%`,
            background: '#E11D48',
            boxShadow: '0 0 6px rgba(225,29,72,0.3)',
          }}
        />

        {/* Scrubber dot */}
        {expanded && (
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
            style={{
              left: `${progress * 100}%`,
              transform: `translate(-50%, -50%)`,
              width: 16,
              height: 16,
              background: '#E11D48',
              border: '2px solid rgba(255,255,255,0.2)',
              boxShadow: '0 0 10px rgba(225,29,72,0.5)',
            }}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to VideoProgressBar

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/detail/VideoProgressBar.tsx
git commit -m "feat: add VideoProgressBar component with expand-on-hover scrubber and time tooltip"
```

---

## Task 2: Custom Video Controls in VideoPlayer

**Files:**
- Modify: `frontend/src/components/detail/VideoPlayer.tsx`

Replace the native `controls` attribute with: a compact controls bar below the video, a glass play overlay when paused, and the VideoProgressBar on the video's bottom edge.

- [ ] **Step 1: Rewrite VideoPlayer with custom controls**

Replace the entire content of `frontend/src/components/detail/VideoPlayer.tsx` with:

```tsx
// frontend/src/components/detail/VideoPlayer.tsx
import { forwardRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Asset } from '../../types/asset';
import { VideoProgressBar } from './VideoProgressBar';

interface VideoPlayerProps {
  asset: Asset;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer({ asset }, ref) {
    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    // Use a local ref when forwarded ref is a callback
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

    const videoRefCb = useCallback(
      (el: HTMLVideoElement | null) => {
        setVideoEl(el);
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as React.MutableRefObject<HTMLVideoElement | null>).current = el;
      },
      [ref]
    );

    // Keep a stable RefObject for VideoProgressBar
    const videoRefObj = { current: videoEl } as React.RefObject<HTMLVideoElement>;

    const posterUrl = asset.thumbnailPath
      ? `/storage/${asset.id}/thumbnail.jpg`
      : undefined;

    // Sync play state
    useEffect(() => {
      if (!videoEl) return;
      const onPlay = () => setPlaying(true);
      const onPause = () => setPlaying(false);
      const onTimeUpdate = () => {
        setCurrentTime(videoEl.currentTime);
        if (videoEl.duration && isFinite(videoEl.duration)) setDuration(videoEl.duration);
      };
      const onLoadedMetadata = () => {
        if (videoEl.duration && isFinite(videoEl.duration)) setDuration(videoEl.duration);
      };

      videoEl.addEventListener('play', onPlay);
      videoEl.addEventListener('pause', onPause);
      videoEl.addEventListener('timeupdate', onTimeUpdate);
      videoEl.addEventListener('loadedmetadata', onLoadedMetadata);
      return () => {
        videoEl.removeEventListener('play', onPlay);
        videoEl.removeEventListener('pause', onPause);
        videoEl.removeEventListener('timeupdate', onTimeUpdate);
        videoEl.removeEventListener('loadedmetadata', onLoadedMetadata);
      };
    }, [videoEl]);

    const togglePlay = () => {
      if (!videoEl) return;
      if (videoEl.paused) videoEl.play();
      else videoEl.pause();
    };

    const toggleMute = () => {
      if (!videoEl) return;
      videoEl.muted = !videoEl.muted;
      setMuted(videoEl.muted);
    };

    const toggleFullscreen = () => {
      if (!videoEl) return;
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoEl.requestFullscreen();
      }
    };

    const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
      <div className="w-full h-full flex flex-col">
        {/* Video container with progress bar overlay */}
        <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center">
          <video
            ref={videoRefCb}
            src={`/storage/${asset.filepath}`}
            poster={posterUrl}
            className="w-full h-full object-contain"
            onClick={togglePlay}
          />

          {/* Glass play overlay — only when paused */}
          <AnimatePresence>
            {!playing && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
                aria-label="Play video"
              >
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 52,
                    height: 52,
                    background: 'rgba(255,255,255,0.07)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 0 20px rgba(225,29,72,0.12)',
                  }}
                >
                  <Play size={22} className="text-white ml-[4px]" fill="white" />
                </div>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Progress bar on video bottom edge */}
          <VideoProgressBar videoRef={videoRefObj} />
        </div>

        {/* Compact controls bar */}
        <div
          className="shrink-0 flex items-center justify-between px-[14px]"
          style={{
            height: 36,
            background: 'rgba(15,15,30,0.85)',
            backdropFilter: 'blur(16px)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {/* Left group: play + timecode */}
          <div className="flex items-center gap-[8px]">
            <button
              onClick={togglePlay}
              className="text-[#71717a] hover:text-[#e4e4e7] transition-colors cursor-pointer"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause size={16} /> : <Play size={16} fill="#71717a" />}
            </button>
            <span className="font-mono text-xs tabular-nums select-none">
              <span className="text-[#e4e4e7]">{formatTime(currentTime)}</span>
              <span className="text-[#535370]"> / </span>
              <span className="text-[#71717a]">{formatTime(duration)}</span>
            </span>
          </div>

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
        </div>
      </div>
    );
  }
);
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to VideoPlayer

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/detail/VideoPlayer.tsx
git commit -m "feat: custom glass video controls — play overlay, compact bar, scrubber integration"
```

---

## Task 3: Collapsible Accordion in MetadataSection

**Files:**
- Modify: `frontend/src/components/detail/MetadataSection.tsx`
- Modify: `frontend/src/components/detail/CustomFieldsSection.tsx`

Wrap editable metadata, file details, and custom fields in collapsible sections. Metadata defaults open, file details and custom fields default closed. File details shows a collapsed summary line.

- [ ] **Step 1: Update MetadataSection with collapsible accordion**

Replace the entire content of `frontend/src/components/detail/MetadataSection.tsx` with:

```tsx
// frontend/src/components/detail/MetadataSection.tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Asset } from '../../types/asset';
import { formatDuration, formatFileSize, formatDate } from '../../lib/formatters';
import { InlineEditText } from './InlineEditText';
import { InlineEditTextarea } from './InlineEditTextarea';
import { TagEditor } from './TagEditor';
import { CustomFieldsSection } from './CustomFieldsSection';
import { usePatchAsset, usePatchTags } from '../../hooks/useAssets';
import { toast } from 'sonner';

interface MetadataSectionProps {
  asset: Asset;
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  collapsedSummary,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  collapsedSummary?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-[6px] px-md py-[6px] cursor-pointer bg-[rgba(255,255,255,0.03)] hover:bg-glass-hover transition-colors"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown size={12} className="text-text-muted shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-text-muted shrink-0" />
        )}
        <span className="text-[9px] uppercase tracking-[1px] text-[#e4e4e7] font-semibold">
          {title}
        </span>
        {!open && collapsedSummary && (
          <span className="text-[8px] font-mono text-[#71717a] ml-auto truncate">
            {collapsedSummary}
          </span>
        )}
      </button>
      <div
        className="overflow-hidden transition-all duration-200 ease-out"
        style={{
          maxHeight: open ? 1000 : 0,
          opacity: open ? 1 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function MetadataSection({ asset }: MetadataSectionProps) {
  const patchAsset = usePatchAsset();
  const patchTags = usePatchTags();

  const parsedTags = JSON.parse(asset.tags ?? '[]') as string[];

  const handleSaveTitle = async (newValue: string) => {
    try {
      await patchAsset.mutateAsync({ id: asset.id, data: { title: newValue || undefined } });
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    }
  };

  const handleSaveDescription = async (newValue: string) => {
    try {
      await patchAsset.mutateAsync({ id: asset.id, data: { description: newValue || undefined } });
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    }
  };

  const handleTagsChange = async (newTags: string[]) => {
    try {
      await patchTags.mutateAsync({ id: asset.id, tags: newTags });
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    }
  };

  // Build collapsed summary for file details
  const resolution = asset.width && asset.height ? `${asset.height}p` : null;
  const codec = asset.codec ?? null;
  const size = formatFileSize(asset.fileSize);
  const fileDetailsSummary = [resolution, codec, size].filter(Boolean).join(' \u00B7 ');

  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.07)] overflow-hidden flex flex-col gap-[6px]">
      {/* Section 1: Metadata (default open) */}
      <CollapsibleSection title="Metadata" defaultOpen>
        <div>
          {/* Title */}
          <div className="px-md py-sm border-b border-[rgba(255,255,255,0.04)] hover:border-border-hover hover:bg-glass-hover focus-within:border-cta/40 focus-within:shadow-[0_0_0_3px_rgba(225,29,72,0.1)] transition-all duration-150">
            <label className="text-[#71717a] text-[8px] uppercase tracking-[0.8px] font-sans block mb-[3px]">
              Title
            </label>
            <InlineEditText
              value={asset.title}
              onSave={handleSaveTitle}
              placeholder={asset.originalFilename}
              ariaLabel="Edit title"
            />
          </div>
          {/* Description */}
          <div className="px-md py-sm border-b border-[rgba(255,255,255,0.04)] hover:border-border-hover hover:bg-glass-hover focus-within:border-cta/40 focus-within:shadow-[0_0_0_3px_rgba(225,29,72,0.1)] transition-all duration-150">
            <label className="text-[#71717a] text-[8px] uppercase tracking-[0.8px] font-sans block mb-[3px]">
              Description
            </label>
            <InlineEditTextarea
              value={asset.description}
              onSave={handleSaveDescription}
              placeholder="Click to add description..."
              ariaLabel="Edit description"
            />
          </div>
          {/* Tags */}
          <div className="px-md py-sm">
            <label className="text-[#71717a] text-[8px] uppercase tracking-[0.8px] font-sans block mb-[3px]">
              Tags
            </label>
            <TagEditor tags={parsedTags} onTagsChange={handleTagsChange} />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 2: File Details (default closed) */}
      <CollapsibleSection title="File Details" collapsedSummary={fileDetailsSummary}>
        <div>
          <div className="grid grid-cols-2 gap-0">
            {[
              { label: 'Duration', value: formatDuration(asset.durationSeconds) },
              { label: 'Codec', value: asset.codec ?? '\u2014' },
              { label: 'Resolution', value: asset.width && asset.height ? `${asset.width}\u00D7${asset.height}` : '\u2014' },
              { label: 'Frame Rate', value: asset.frameRate ? `${asset.frameRate} fps` : '\u2014' },
              { label: 'File Size', value: formatFileSize(asset.fileSize) },
              { label: 'Imported', value: formatDate(asset.createdAt) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[rgba(255,255,255,0.02)] border border-glass-border rounded m-[3px] p-sm">
                <span className="text-[#71717a] text-[7px] block leading-none mb-[2px]">{label}</span>
                <span className="text-[#e4e4e7] font-mono text-[10px] leading-tight">{value}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-glass-border">
            <div className="px-md py-xs border-b border-glass-border">
              <span className="text-[#71717a] text-[7px] block leading-none mb-[2px]">File Hash</span>
              <span className="text-[#e4e4e7] font-mono text-[11px] break-all leading-tight">
                {asset.fileHash ? asset.fileHash.substring(0, 16) + '\u2026' : '\u2014'}
              </span>
            </div>
            <div className="px-md py-xs">
              <span className="text-[#71717a] text-[7px] block leading-none mb-[2px]">File Path</span>
              <span className="text-[#e4e4e7] font-mono text-[11px] break-all leading-tight">
                {asset.filepath}
              </span>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 3: Custom Fields (default closed) */}
      <CollapsibleSection title="Custom Fields">
        <CustomFieldsSection assetId={asset.id} />
      </CollapsibleSection>
    </div>
  );
}
```

- [ ] **Step 2: Update CustomFieldsSection to remove its outer wrapper**

The `CustomFieldsSection` currently wraps itself in a section card. Since `MetadataSection` now manages the outer accordion container, update it to render just its inner content. Read `CustomFieldsSection.tsx` first. If it already renders a bare list of fields without a card wrapper, no changes needed. If it has an outer card/section wrapper, remove it so only the field rows render.

- [ ] **Step 3: Remove CustomFieldsSection from DetailPanel**

In `frontend/src/components/detail/DetailPanel.tsx`, the info tab currently renders `<MetadataSection>` and `<CustomFieldsSection>` separately. Remove the `<CustomFieldsSection>` import and usage since `MetadataSection` now embeds it. The info tab content becomes:

```tsx
{activeTab === 'info' && (
  <div className="flex-1 overflow-y-auto p-sm">
    <MetadataSection asset={asset} />
  </div>
)}
```

Also remove the `CustomFieldsSection` import at the top of the file.

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/detail/MetadataSection.tsx frontend/src/components/detail/CustomFieldsSection.tsx frontend/src/components/detail/DetailPanel.tsx
git commit -m "feat: collapsible accordion info panel — metadata expanded, file details + custom fields collapsed"
```

---

## Task 4: Glass Card Transcript Segments with Auto-Seek

**Files:**
- Modify: `frontend/src/components/detail/TranscriptList.tsx`

Update segment styling: past segments at 50% opacity, active segment gets glass card with CTA glow, future segments normal opacity. Add auto-seek when navigating transcript search matches (video pauses on seek).

- [ ] **Step 1: Update TranscriptList segment styling and add auto-seek on search navigate**

In `frontend/src/components/detail/TranscriptList.tsx`, make these changes:

**A. Update the segment button className (around line 177-183).**

Replace the current segment button styling:

```tsx
className={cn(
  'w-full text-left px-md py-xs cursor-pointer transition-colors duration-150 border-b border-glass-border',
  i === activeIndex
    ? 'bg-glass-hover border-l-2 border-l-cta'
    : 'hover:bg-glass-hover'
)}
```

With the new glass card styling with past/future opacity:

```tsx
className={cn(
  'w-full text-left cursor-pointer transition-all duration-150',
  'px-[10px] py-[7px]',
  i === activeIndex
    ? 'rounded-lg'
    : 'hover:bg-[rgba(255,255,255,0.03)]',
  i < activeIndex && i !== activeIndex && 'opacity-50'
)}
style={i === activeIndex ? {
  background: 'rgba(225,29,72,0.06)',
  border: '1px solid rgba(225,29,72,0.15)',
  boxShadow: '0 0 12px rgba(225,29,72,0.08)',
} : undefined}
```

**B. Update the timecode/text color classes.** The timecode span (around line 185-189):

Replace:
```tsx
i === activeIndex ? 'text-cta' : 'text-text-dim'
```
With:
```tsx
i === activeIndex ? 'text-cta' : 'text-[#71717a]'
```

The text span (around line 191-194):

Replace:
```tsx
i === activeIndex ? 'text-text' : 'text-text-muted'
```
With:
```tsx
i === activeIndex ? 'text-[#e4e4e7]' : i < activeIndex ? 'text-[#71717a]' : 'text-[#94A3B8]'
```

**C. Update the segment list container.** Replace the outer `<div className="overflow-y-auto flex-1">` (line 171) with:

```tsx
<div className="overflow-y-auto flex-1 px-[8px] py-[4px] flex flex-col gap-[2px]">
```

**D. Remove the old `border-b border-glass-border` from the segment button className** since segments now use gap spacing instead of borders.

**E. Add auto-seek on search navigation.** After the existing search match navigation scroll `useEffect` (around line 83-95), update it to also seek the video and pause:

Replace the existing effect:
```tsx
useEffect(() => {
    if (totalMatches === 0) return;
    const match = matches[currentMatchIdx];
    if (!match) return;
    const el = segmentRefs.current.get(match.segmentIndex);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    userNavigatingRef.current = true;
    clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userNavigatingRef.current = false;
    }, 3000);
  }, [currentMatchIdx, matches, totalMatches]);
```

With:
```tsx
useEffect(() => {
    if (totalMatches === 0) return;
    const match = matches[currentMatchIdx];
    if (!match) return;
    const el = segmentRefs.current.get(match.segmentIndex);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    // Auto-seek video to matched segment and pause
    const video = videoRef.current;
    const seg = segments[match.segmentIndex];
    if (video && seg) {
      video.currentTime = seg.start;
      video.pause();
    }

    userNavigatingRef.current = true;
    clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userNavigatingRef.current = false;
    }, 3000);
  }, [currentMatchIdx, matches, totalMatches, segments, videoRef]);
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/detail/TranscriptList.tsx
git commit -m "feat: glass card active transcript segment + auto-seek on search navigation"
```

---

## Task 5: Resizable Panel Split with Glass Handle

**Files:**
- Modify: `frontend/src/components/detail/DetailPanel.tsx`

Replace the hardcoded 60/40 flex split with `ResizablePanelGroup` from shadcn. Add a custom glass resize handle with grip dots. Persist split ratio to `localStorage`.

- [ ] **Step 1: Update DetailPanel with resizable panels**

In `frontend/src/components/detail/DetailPanel.tsx`, make these changes:

**A. Add imports** at the top:

```tsx
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui/resizable';
```

**B. Replace the main content div** (the `<div className="flex-1 flex min-h-0 overflow-hidden">` block, lines ~102-157) with:

```tsx
{/* Main content: resizable video left, details right */}
<ResizablePanelGroup
  direction="horizontal"
  className="flex-1 min-h-0"
  autoSaveId="mam-detail-split"
>
  {/* Left: Video player */}
  <ResizablePanel
    defaultSize={60}
    minSize={40}
    maxSize={75}
    className="flex items-center justify-center bg-black overflow-hidden"
  >
    <VideoPlayer asset={asset} ref={videoRef} />
  </ResizablePanel>

  {/* Custom glass resize handle */}
  <ResizableHandle
    className="w-[6px] bg-[rgba(255,255,255,0.03)] border-x border-[rgba(255,255,255,0.07)] hover:bg-[rgba(255,255,255,0.06)] active:bg-[rgba(225,29,72,0.08)] transition-colors cursor-col-resize relative flex items-center justify-center"
  >
    <div className="flex flex-col gap-[3px]">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-[3px] h-[3px] rounded-full bg-[rgba(255,255,255,0.15)] group-hover:bg-[rgba(255,255,255,0.3)] group-active:bg-[rgba(225,29,72,0.4)] transition-colors"
        />
      ))}
    </div>
  </ResizableHandle>

  {/* Right: Tabbed metadata/transcript */}
  <ResizablePanel
    defaultSize={40}
    minSize={25}
    maxSize={60}
    className="flex flex-col min-h-0 overflow-hidden border-l border-glass-border"
  >
    {/* Tab bar */}
    <div className="shrink-0 flex border-b border-glass-border relative">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`flex-1 py-xs text-xs font-medium capitalize transition-colors duration-200 relative z-10 ${
            activeTab === tab
              ? 'text-cta'
              : 'text-text-dim hover:text-text hover:bg-glass-hover'
          }`}
          role="tab"
          aria-selected={activeTab === tab}
        >
          {tab}
        </button>
      ))}
      {/* Animated underline indicator */}
      <div
        className="absolute bottom-0 h-0.5 bg-cta transition-all duration-300 ease-out"
        style={{
          width: `${100 / tabs.length}%`,
          left: `${(tabs.indexOf(activeTab) * 100) / tabs.length}%`,
        }}
      />
    </div>

    {/* Tab content */}
    {activeTab === 'info' && (
      <div className="flex-1 overflow-y-auto p-sm">
        <MetadataSection asset={asset} />
      </div>
    )}
    {activeTab === 'transcript' && (
      <div className="flex-1 flex flex-col min-h-0">
        <TranscriptList
          asset={asset}
          videoRef={videoRef}
          segments={segments}
          loading={segmentsLoading}
        />
      </div>
    )}
  </ResizablePanel>
</ResizablePanelGroup>
```

**C. Remove the old hardcoded w-[60%]/w-[40%] divs** — they're replaced by the resizable panels above.

**D. Note:** `autoSaveId="mam-detail-split"` on `ResizablePanelGroup` handles localStorage persistence automatically — `react-resizable-panels` reads/writes `localStorage` using this key. No manual `onLayout` handler needed.

- [ ] **Step 2: Remove the old flex width styles and verify**

Make sure the old `<div className="w-[60%]...">` and `<div className="w-[40%]...">` divs are fully removed (replaced by ResizablePanel).

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/detail/DetailPanel.tsx
git commit -m "feat: draggable panel resize with glass handle and localStorage persistence"
```

---

## Summary

| Task | What it does | Files |
|------|-------------|-------|
| 1 | VideoProgressBar — slim bar + hover scrubber + time tooltip | New: `VideoProgressBar.tsx` |
| 2 | Custom video controls — glass play overlay + compact bar | Modify: `VideoPlayer.tsx` |
| 3 | Collapsible accordion — 3 sections with expand/collapse | Modify: `MetadataSection.tsx`, `CustomFieldsSection.tsx`, `DetailPanel.tsx` |
| 4 | Glass transcript segments + auto-seek on search | Modify: `TranscriptList.tsx` |
| 5 | Resizable panel split with glass handle | Modify: `DetailPanel.tsx` |
