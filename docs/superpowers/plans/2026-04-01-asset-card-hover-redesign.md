# Asset Card Hover Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full-overlay hover on asset cards with context-aware behaviors: scrub preview frames in browse mode, and frame-at-match-timestamp with gradient context overlay in search mode.

**Architecture:** Backend adds a preview frames pipeline stage (6 JPEGs at even intervals) and an on-demand frame extraction endpoint. Frontend splits hover logic into two new components: `ScrubPreview` (browse mode — mouse X scrubs through frames) and `SearchContextOverlay` (search mode — gradient overlay with match badges, excerpt, timecodes). `AssetCard` is simplified to delegate hover behavior to these components based on whether search is active.

**Tech Stack:** Backend: fluent-ffmpeg, Fastify, Drizzle (schema migration). Frontend: React 18, Tailwind 3.

**Design spec:** `docs/superpowers/specs/2026-04-01-asset-card-hover-redesign.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/src/db/schema.ts` | Add `framesStatus` column |
| Modify | `backend/src/lib/pipeline.ts` | Add preview frames stage after thumbnail |
| Modify | `backend/src/routes/assets.ts` | Add `GET /api/assets/:id/frame?t=` endpoint |
| Create | `frontend/src/components/assets/ScrubPreview.tsx` | Browse hover: mouse-X scrub through 6 frames, progress bar, timecode tooltip, metadata gradient overlay |
| Create | `frontend/src/components/assets/SearchContextOverlay.tsx` | Search hover: gradient overlay with match badges, transcript excerpt, clickable timecodes |
| Modify | `frontend/src/components/assets/AssetCard.tsx` | Remove old full-overlay hover, integrate ScrubPreview and SearchContextOverlay |

---

## Task 1: Schema Migration — Add framesStatus Column

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: Add framesStatus column to schema**

In `backend/src/db/schema.ts`, add after the `thumbnailStatus` line (line 25):

```ts
  // Preview frames
  framesStatus: text('frames_status').default('pending'),
```

- [ ] **Step 2: Generate migration**

Run: `cd backend && npm run db:generate`
Expected: New migration file created in `backend/drizzle/`

- [ ] **Step 3: Apply migration**

Run: `cd backend && npm run db:migrate`
Expected: Migration applied successfully

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle/
git commit -m "feat: add framesStatus column to assets schema"
```

---

## Task 2: Pipeline — Preview Frames Stage

**Files:**
- Modify: `backend/src/lib/pipeline.ts`

Add a new stage after thumbnail that generates 6 evenly-spaced JPEG frames.

- [ ] **Step 1: Add the generatePreviewFrames function**

In `backend/src/lib/pipeline.ts`, add after the `captureThumbnail` function (after line 92):

```ts
// ─── Stage 2b: Preview frames for scrub preview ──────────────────────────────

function captureFrame(
  filePath: string,
  outputPath: string,
  seekTime: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .screenshots({
        count: 1,
        timemarks: [String(seekTime)],
        filename: basename(outputPath),
        folder: dirname(outputPath),
        size: '?x360',
      })
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err));
  });
}

async function generatePreviewFrames(
  filePath: string,
  assetDir: string,
  durationSeconds: number,
): Promise<void> {
  const frameCount = 6;
  for (let i = 0; i < frameCount; i++) {
    const seekTime = durationSeconds * (i + 0.5) / frameCount;
    const outputPath = resolve(assetDir, `frame_${i}.jpg`);
    await captureFrame(filePath, outputPath, seekTime);
  }
}
```

- [ ] **Step 2: Add the pipeline stage in the orchestrator**

In the `runPipeline` function, add after the thumbnail stage (after the `} catch (err) { ... thumbnailStatus: 'failed' ... }` block, before `// ── Stage 3: Transcription`):

```ts
  // ── Stage 2b: Preview frames (soft failure) ────────────────────────────────
  updateAsset(assetId, { framesStatus: 'processing' });
  try {
    await generatePreviewFrames(filePath, assetDir, meta.durationSeconds);
    updateAsset(assetId, { framesStatus: 'complete' });
  } catch (err) {
    console.error(`[pipeline] Stage 2b (preview frames) failed for ${assetId}:`, err);
    updateAsset(assetId, { framesStatus: 'failed' });
  }
```

- [ ] **Step 3: Verify backend compiles**

Run: `cd backend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/pipeline.ts
git commit -m "feat: pipeline stage 2b — generate 6 preview frames for scrub hover"
```

---

## Task 3: Backend — On-Demand Frame Extraction Endpoint

**Files:**
- Modify: `backend/src/routes/assets.ts`

Add `GET /api/assets/:id/frame?t=` that extracts a single frame at the given timestamp, caches it, and serves it.

- [ ] **Step 1: Add the frame endpoint**

In `backend/src/routes/assets.ts`, add this route inside the `assetRoutes` function (after the `GET /api/assets/:id` route, around line 107):

```ts
  /**
   * GET /api/assets/:id/frame?t=:seconds — extract and serve a single frame
   * Caches to {STORAGE_ROOT}/{id}/frame_t{seconds}.jpg
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { t?: string };
  }>('/api/assets/:id/frame', async (request, reply) => {
    const { id } = request.params;
    const tParam = request.query.t;

    if (tParam == null || tParam === '') {
      return reply.status(400).send({ error: 'Missing t query parameter' });
    }

    const seconds = parseFloat(tParam);
    if (!isFinite(seconds) || seconds < 0) {
      return reply.status(400).send({ error: 'Invalid t parameter' });
    }

    const asset = db.select().from(assets).where(eq(assets.id, id)).get();
    if (!asset) {
      return reply.status(404).send({ error: 'Asset not found' });
    }

    const storageRoot = process.env.STORAGE_ROOT!;
    const roundedT = Math.round(seconds);
    const cachedFilename = `frame_t${roundedT}.jpg`;
    const cachedPath = resolve(storageRoot, id, cachedFilename);

    // Check cache
    const { existsSync } = await import('node:fs');
    if (existsSync(cachedPath)) {
      return reply.sendFile(cachedFilename, resolve(storageRoot, id));
    }

    // Extract frame via ffmpeg
    const filePath = resolve(storageRoot, asset.filepath);
    const { basename: bn, dirname: dn } = await import('node:path');
    const ffmpeg = (await import('fluent-ffmpeg')).default;

    try {
      await new Promise<void>((res, rej) => {
        ffmpeg(filePath)
          .screenshots({
            count: 1,
            timemarks: [String(seconds)],
            filename: bn(cachedPath),
            folder: dn(cachedPath),
            size: '?x360',
          })
          .on('end', () => res())
          .on('error', (err: Error) => rej(err));
      });

      return reply.sendFile(cachedFilename, resolve(storageRoot, id));
    } catch (err) {
      request.log.error(err, 'Frame extraction failed');
      return reply.status(404).send({ error: 'Frame extraction failed' });
    }
  });
```

- [ ] **Step 2: Verify backend compiles**

Run: `cd backend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/assets.ts
git commit -m "feat: GET /api/assets/:id/frame?t= — on-demand frame extraction with cache"
```

---

## Task 4: ScrubPreview Component (Browse Hover)

**Files:**
- Create: `frontend/src/components/assets/ScrubPreview.tsx`

Mouse-X scrubs through 6 frames, shows progress bar + timecode tooltip + metadata gradient overlay.

- [ ] **Step 1: Create ScrubPreview component**

```tsx
// frontend/src/components/assets/ScrubPreview.tsx
import { useState, useCallback } from 'react';
import type { Asset } from '../../types/asset';
import { formatDuration, formatFileSize, formatDate } from '../../lib/formatters';

interface ScrubPreviewProps {
  asset: Asset;
  containerRef: React.RefObject<HTMLElement>;
}

function formatRelativeDate(isoDate: string | null): string {
  if (!isoDate) return '';
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Imported today';
  if (days === 1) return 'Imported yesterday';
  if (days < 30) return `Imported ${days} days ago`;
  return `Imported ${formatDate(isoDate)}`;
}

export function ScrubPreview({ asset, containerRef }: ScrubPreviewProps) {
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const [progressX, setProgressX] = useState(0);
  const [tooltipX, setTooltipX] = useState(0);

  const duration = asset.durationSeconds ?? 0;
  const framesAvailable = asset.framesStatus === 'complete';
  const tags: string[] = asset.tags ? JSON.parse(asset.tags) : [];

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const ratio = x / rect.width;
      setProgressX(ratio);
      setTooltipX(x);
      if (framesAvailable) {
        setFrameIndex(Math.min(Math.floor(ratio * 6), 5));
      }
    },
    [containerRef, framesAvailable]
  );

  const handleMouseLeave = useCallback(() => {
    setFrameIndex(null);
    setProgressX(0);
  }, []);

  const currentTime = progressX * duration;
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // Build metadata line
  const metaParts: string[] = [];
  if (duration) metaParts.push(formatDuration(duration));
  if (asset.width && asset.height) metaParts.push(`${asset.height}p`);
  if (asset.codec) metaParts.push(asset.codec.toUpperCase());
  if (asset.fileSize) metaParts.push(formatFileSize(asset.fileSize));
  const metaLine = metaParts.join(' \u00B7 ');

  return (
    <div
      className="absolute inset-0 z-[2]"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Scrub frame image */}
      {frameIndex !== null && framesAvailable && (
        <img
          src={`/storage/${asset.id}/frame_${frameIndex}.jpg`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Timecode tooltip */}
      {frameIndex !== null && (
        <div
          className="absolute pointer-events-none font-mono text-[9px] px-[6px] py-[1px] z-[4]"
          style={{
            bottom: 'calc(30% + 12px)',
            left: tooltipX,
            transform: 'translateX(-50%)',
            background: 'rgba(15,15,30,0.95)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            color: '#e4e4e7',
          }}
        >
          {formatTime(currentTime)}
        </div>
      )}

      {/* Scrub progress bar */}
      {frameIndex !== null && (
        <div
          className="absolute left-0 right-0 z-[5]"
          style={{ bottom: '30%', height: 3, background: 'rgba(255,255,255,0.08)' }}
        >
          <div
            className="h-full"
            style={{
              width: `${progressX * 100}%`,
              background: '#E11D48',
              boxShadow: '0 0 6px rgba(225,29,72,0.3)',
            }}
          />
        </div>
      )}

      {/* Metadata gradient overlay */}
      <div
        className="absolute bottom-0 left-0 right-0 z-[3] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col gap-[3px]"
        style={{
          background: 'linear-gradient(transparent 0%, rgba(10,10,20,0.7) 25%, rgba(10,10,20,0.93) 100%)',
          padding: '28px 10px 14px',
        }}
      >
        <div className="text-xs font-semibold text-white truncate">
          {asset.title || asset.originalFilename}
        </div>
        <div className="font-mono text-[10px] text-[#71717a]">{metaLine}</div>
        <div className="text-[10px] text-[#52525b]">{formatRelativeDate(asset.createdAt)}</div>
        {tags.length > 0 && (
          <div className="flex gap-[4px] flex-wrap mt-[1px]">
            {tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="text-[8px] px-[6px] py-[1px] rounded bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] text-[#a1a1aa]"
              >
                {tag}
              </span>
            ))}
            {tags.length > 4 && <span className="text-[8px] text-[#52525b]">+{tags.length - 4}</span>}
          </div>
        )}
        {asset.description && (
          <div className="text-[10px] text-[#71717a] italic truncate">{asset.description}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `framesStatus` to the Asset type**

In `frontend/src/types/asset.ts`, add `framesStatus: string;` to the `Asset` interface (alongside the other status fields).

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/assets/ScrubPreview.tsx frontend/src/types/asset.ts
git commit -m "feat: ScrubPreview component — scrub frames + metadata gradient overlay"
```

---

## Task 5: SearchContextOverlay Component (Search Hover)

**Files:**
- Create: `frontend/src/components/assets/SearchContextOverlay.tsx`

Gradient overlay with match badges, transcript excerpt, clickable timecodes.

- [ ] **Step 1: Create SearchContextOverlay component**

```tsx
// frontend/src/components/assets/SearchContextOverlay.tsx
import { FileText, Type, AlignLeft } from 'lucide-react';
import { formatTimecode } from '../../lib/formatters';
import type { SearchResult } from '../../types/asset';

interface SearchContextOverlayProps {
  searchResult: SearchResult;
  assetId: string;
  onTimecodeClick?: (assetId: string, timestamp: number) => void;
}

function renderHighlightedExcerpt(html: string) {
  const parts = html.split(/(<em>.*?<\/em>)/g);
  return parts.map((part, i) => {
    const match = part.match(/^<em>(.*)<\/em>$/);
    if (match) {
      return (
        <span
          key={i}
          style={{
            background: 'rgba(225,29,72,0.25)',
            color: '#fff',
            padding: '0 2px',
            borderRadius: 2,
          }}
        >
          {match[1]}
        </span>
      );
    }
    return part;
  });
}

export function SearchContextOverlay({
  searchResult,
  assetId,
  onTimecodeClick,
}: SearchContextOverlayProps) {
  const sr = searchResult;
  const hasTitle = sr.highlights?.title?.length;
  const hasDescription = sr.highlights?.description?.length;
  const hasTranscript = sr.highlights?.transcript?.length || sr.transcriptMatch;

  // First transcript excerpt
  const transcriptExcerpt = sr.highlights?.transcript?.[0] ?? sr.transcriptMatch?.text;

  // Collect timecodes
  const timecodes: Array<{ timestamp: number }> = [];
  if (sr.transcriptMatch) {
    timecodes.push({ timestamp: sr.transcriptMatch.timestamp });
  }
  if (sr.transcriptMatches) {
    for (const m of sr.transcriptMatches) {
      if (!timecodes.some(t => t.timestamp === m.timestamp)) {
        timecodes.push({ timestamp: m.timestamp });
      }
    }
  }

  const transcriptCount = sr.transcriptMatch?.matchCount ?? timecodes.length;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-[3] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col gap-[4px]"
      style={{
        background: 'linear-gradient(transparent 0%, rgba(10,10,20,0.7) 25%, rgba(10,10,20,0.92) 100%)',
        padding: '28px 10px 10px',
      }}
    >
      {/* Match source badges */}
      <div className="flex items-center gap-[4px]">
        <span className="text-[8px] text-[#52525b] uppercase tracking-[0.5px]">Match in</span>
        {hasTitle && (
          <span className="inline-flex items-center gap-[3px] text-[8px] px-[5px] py-[1px] rounded bg-cta/15 border border-cta/20 text-cta">
            <Type size={8} />Title
          </span>
        )}
        {hasDescription && (
          <span className="inline-flex items-center gap-[3px] text-[8px] px-[5px] py-[1px] rounded bg-cta/15 border border-cta/20 text-cta">
            <AlignLeft size={8} />Description
          </span>
        )}
        {hasTranscript && (
          <span className="inline-flex items-center gap-[3px] text-[8px] px-[5px] py-[1px] rounded bg-cta/15 border border-cta/20 text-cta">
            <FileText size={8} />Transcript{transcriptCount > 1 ? ` \u00D7${transcriptCount}` : ''}
          </span>
        )}
      </div>

      {/* Transcript excerpt */}
      {transcriptExcerpt && (
        <div
          className="text-[10px] text-[#e4e4e7] leading-[1.4] overflow-hidden"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
        >
          "{renderHighlightedExcerpt(transcriptExcerpt)}"
        </div>
      )}

      {/* Clickable timecodes */}
      {timecodes.length > 0 && onTimecodeClick && (
        <div className="flex items-center gap-[4px] flex-wrap">
          {timecodes.slice(0, 4).map((tc, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTimecodeClick(assetId, tc.timestamp);
              }}
              className="font-mono text-[9px] text-cta px-[4px] py-[1px] bg-cta/10 rounded cursor-pointer hover:bg-cta/20 transition-colors"
              aria-label={`Jump to ${formatTimecode(tc.timestamp)}`}
            >
              {formatTimecode(tc.timestamp)}
            </button>
          ))}
          {timecodes.length > 4 && (
            <span className="text-[8px] text-[#52525b]">+{timecodes.length - 4} more</span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/assets/SearchContextOverlay.tsx
git commit -m "feat: SearchContextOverlay — gradient overlay with match badges, excerpt, timecodes"
```

---

## Task 6: Rewrite AssetCard Hover Behavior

**Files:**
- Modify: `frontend/src/components/assets/AssetCard.tsx`

Remove the old full-overlay hover. Add conditional rendering: ScrubPreview in browse mode, SearchContextOverlay + frame-at-match in search mode.

- [ ] **Step 1: Rewrite AssetCard hover logic**

Read the current `frontend/src/components/assets/AssetCard.tsx`. Then make these changes:

**A. Add imports** at the top:

```tsx
import { ScrubPreview } from './ScrubPreview';
import { SearchContextOverlay } from './SearchContextOverlay';
```

**B. Add state for search hover frame.** Inside the component, after the existing `spotlightPos` state:

```tsx
const [searchFrameSrc, setSearchFrameSrc] = useState<string | null>(null);
const isSearchMode = !!searchResult;
```

**C. On hover in search mode, swap thumbnail to frame at match timestamp.** Add a handler:

```tsx
const handleMouseEnter = useCallback(() => {
  if (isSearchMode && searchResult?.transcriptMatch?.timestamp != null) {
    const t = Math.round(searchResult.transcriptMatch.timestamp);
    setSearchFrameSrc(`/api/assets/${asset.id}/frame?t=${t}`);
  }
}, [isSearchMode, searchResult, asset.id]);

const handleMouseLeave = useCallback(() => {
  setSearchFrameSrc(null);
}, []);
```

Add `onMouseEnter={handleMouseEnter}` and `onMouseLeave={handleMouseLeave}` to the `<article>` element.

**D. Add the search frame image.** After the thumbnail `<img>`, add:

```tsx
{/* Search mode: frame at match timestamp */}
{searchFrameSrc && (
  <img
    src={searchFrameSrc}
    alt=""
    className="absolute inset-0 w-full h-full object-cover z-[1] opacity-0 group-hover:opacity-100 transition-opacity duration-200"
  />
)}

{/* Search mode: timestamp badge */}
{searchFrameSrc && searchResult?.transcriptMatch?.timestamp != null && (
  <div
    className="absolute top-xs left-xs z-[4] opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded px-[6px] py-[1px] font-mono text-[9px] text-white font-semibold"
    style={{ background: 'rgba(225,29,72,0.9)' }}
  >
    @ {formatTimecode(searchResult.transcriptMatch.timestamp)}
  </div>
)}
```

**E. Remove the old hover overlay.** Delete the entire `{/* ── Hover overlay: metadata preview ── */}` div (lines 142-226 in the original). This is the `<div className="absolute inset-0 z-[2] bg-[rgba(15,15,30,0.85)] ...">` block.

**F. Add the new hover components.** In their place, add:

```tsx
{/* Browse mode: scrub preview */}
{!isSearchMode && (
  <ScrubPreview asset={asset} containerRef={articleRef} />
)}

{/* Search mode: context overlay */}
{isSearchMode && searchResult && (
  <SearchContextOverlay
    searchResult={searchResult}
    assetId={asset.id}
    onTimecodeClick={onTimecodeClick}
  />
)}
```

**G. Remove unused imports** that were only used by the old overlay: `Film`, `FileText`, `Type`, `AlignLeft` from lucide-react (check which ones are still needed — `Film` is used for the no-thumbnail placeholder, keep it). Remove the `renderHighlight` and `getMatchSources` helper functions that are now in SearchContextOverlay.

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/assets/AssetCard.tsx
git commit -m "feat: context-aware card hover — scrub preview in browse, match frame + context in search"
```

---

## Summary

| Task | What it does | Files |
|------|-------------|-------|
| 1 | Schema migration — add `framesStatus` column | `schema.ts`, migration |
| 2 | Pipeline — generate 6 preview frames after thumbnail | `pipeline.ts` |
| 3 | Backend — on-demand frame extraction endpoint | `assets.ts` |
| 4 | ScrubPreview component — scrub frames + metadata overlay | New: `ScrubPreview.tsx`, `asset.ts` type |
| 5 | SearchContextOverlay — gradient with badges + excerpt + timecodes | New: `SearchContextOverlay.tsx` |
| 6 | Rewrite AssetCard hover — integrate both components | `AssetCard.tsx` |
