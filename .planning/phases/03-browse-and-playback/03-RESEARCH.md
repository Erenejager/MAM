# Phase 3: Browse and Playback - Research

**Researched:** 2026-03-24
**Domain:** React frontend (data fetching, layout, animation) + Fastify backend (list/delete/patch endpoints)
**Confidence:** HIGH

## Summary

Phase 3 builds the primary user-facing UI: a library browser with asset cards, tag filtering sidebar, video playback in a slide-in detail panel, and asset deletion. The backend needs three new endpoints (`GET /api/assets`, `DELETE /api/assets/:id`, `PATCH /api/assets/:id`), and the frontend needs to be built from the current bare stub into a full application shell with TanStack Query for data fetching, Framer Motion for panel/card animations, and Lucide for icons.

The existing codebase provides a solid foundation: the DB schema has all necessary fields (status columns, tags JSON, metadata), `@fastify/static` already handles range requests for video serving, and the Tailwind config includes all design system tokens. The main work is frontend component architecture and three straightforward backend routes.

**Primary recommendation:** Build backend endpoints first (simple Drizzle queries), then construct the frontend shell (sidebar + main + detail panel layout), then wire data fetching with TanStack Query, then add interactivity (context menu, delete confirmation, tag filtering, transcript sync).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Card layout**: Thumbnail left (240-280px fixed width), info column right with title, duration, tags (2-line wrap then clip), file size, codec/resolution, date imported, status badge
- **Card click**: Opens detail panel (slide-in from right), does NOT navigate to a separate route
- **Detail panel**: 40% viewport width; content: video player, full metadata, inline-editable tags, transcript with segment list
- **Delete trigger**: Right-click context menu on card (no hover buttons)
- **Delete confirmation**: Two buttons: "Remove from library" (DB only) vs "Delete file + library" (DB + disk)
- **Post-deletion**: Card fades out via Framer Motion, remaining cards reflow
- **Tag sidebar**: 240px left sidebar, alphabetical tags with count badges, AND filtering, accent fill for active tags
- **Transcript sync**: `HTMLVideoElement.currentTime` + `timeupdate` event, auto-scroll active segment, click to seek
- **Status polling**: TanStack Query `refetchInterval` 3-5s while `transcriptionStatus !== 'ready'`
- **Sort order**: Date imported descending (simplest default)

### Claude's Discretion
- No items marked for Claude's discretion in CONTEXT.md

### Deferred Ideas (OUT OF SCOPE)
- Full-text search bar (Phase 4)
- Custom fields display in detail panel (Phase 5)
- Bulk selection / bulk delete
- Sort order controls in the grid

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BRWS-01 | User sees full-width asset cards with thumbnail, title, duration, tags, and transcript preview | Card layout spec in CONTEXT.md; all fields exist in `assets` schema; `GET /api/assets` endpoint needed |
| BRWS-03 | User can filter the asset list by clicking a tag in the sidebar | Tags stored as JSON array in `assets.tags`; SQLite `json_each()` for server-side filtering; tag sidebar spec in CONTEXT.md |
| BRWS-04 | User can delete an asset from the library (with option to also delete the file) | Right-click context menu; `DELETE /api/assets/:id?deleteFile=true\|false`; Framer Motion fade-out |
| PLAY-01 | User can play a video in-app via click (no autoplay) | Native `<video>` in detail panel; `@fastify/static` already serves with range requests at `/storage/` |
| PLAY-04 | User can see transcription status per asset | Per-stage status columns in schema (`transcription_status`); status badge on card; TanStack Query polling |

</phase_requirements>

## Standard Stack

### Core (Frontend - to install)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-query | 5.95.2 | Server state management, polling | De facto standard for React data fetching; handles caching, refetch intervals, optimistic updates |
| framer-motion | 12.38.0 | Panel slide-in, card fade-out, transitions | Locked in STATE.md; needed for detail panel animation and delete fade-out |
| lucide-react | 1.6.0 | Icons | MASTER.md mandates Lucide icons exclusively (no emojis) |
| clsx | 2.1.1 | Conditional class merging | Tiny utility, standard React pattern for dynamic classNames |
| tailwind-merge | 3.5.0 | Tailwind class dedup | Prevents conflicting Tailwind classes; pairs with clsx |

### Already Installed (Frontend)
| Library | Version | Purpose |
|---------|---------|---------|
| react | 18.3.x | UI framework |
| tailwindcss | 3.4.x | Styling (Tailwind 3 locked) |
| vite | 5.4.x | Build tool |

### Already Installed (Backend)
| Library | Version | Purpose |
|---------|---------|---------|
| fastify | 4.x | HTTP server |
| drizzle-orm | 0.36.x | Database ORM |
| @fastify/static | 7.x | File serving with range requests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @tanstack/react-query | SWR | TanStack has better polling support (`refetchInterval`) and is already decided in STATE.md |
| framer-motion | CSS transitions | CSS is simpler but cannot do layout animations (card reflow after delete) or `AnimatePresence` exit animations |
| Custom context menu | @radix-ui/react-context-menu | Radix would be more accessible but adds dependency; since shadcn/ui is planned, can use its context menu component |

**Installation:**
```bash
cd frontend
npm install @tanstack/react-query framer-motion lucide-react clsx tailwind-merge
```

## Architecture Patterns

### Recommended Frontend Structure
```
frontend/src/
  components/
    layout/
      AppShell.tsx          # Top bar + sidebar + main + detail panel grid
      Sidebar.tsx           # Tag filter sidebar (240px)
      TopBar.tsx            # Search placeholder (Phase 4) + app title
    assets/
      AssetCard.tsx         # Single card: thumbnail left, info right
      AssetGrid.tsx         # Scrollable list of AssetCard
      AssetContextMenu.tsx  # Right-click menu (Delete option)
      StatusBadge.tsx       # Status indicator (pending/processing/complete/failed)
    detail/
      DetailPanel.tsx       # Slide-in panel container (Framer Motion)
      VideoPlayer.tsx       # Native <video> with custom controls
      MetadataSection.tsx   # Full metadata display
      TagEditor.tsx         # Inline tag add/remove
      TranscriptList.tsx    # Scrollable segments, click-to-seek
    shared/
      DeleteDialog.tsx      # Confirmation modal with two delete options
  hooks/
    useAssets.ts            # TanStack Query: list, single, delete, patch
    useTagFilter.ts         # Tag selection state management
  lib/
    api.ts                  # fetch wrapper: base URL, JSON helpers
    cn.ts                   # clsx + tailwind-merge utility
    formatters.ts           # Duration, file size, date formatting
  types/
    asset.ts                # Asset type matching backend schema
```

### Pattern 1: TanStack Query for Data + Polling
**What:** All server data accessed via TanStack Query hooks. Status polling uses `refetchInterval` that activates conditionally.
**When to use:** Every API call from the frontend.
**Example:**
```typescript
// hooks/useAssets.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useAssets(tags?: string[]) {
  return useQuery({
    queryKey: ['assets', { tags }],
    queryFn: () => fetchAssets(tags),
  });
}

export function useAsset(id: string | null) {
  return useQuery({
    queryKey: ['assets', id],
    queryFn: () => fetchAsset(id!),
    enabled: !!id,
    // Poll while any status is not terminal
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const isProcessing = data.status === 'ingesting';
      return isProcessing ? 4000 : false; // 4s polling
    },
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deleteFile }: { id: string; deleteFile: boolean }) =>
      fetch(`/api/assets/${id}?deleteFile=${deleteFile}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}
```

### Pattern 2: Layout with Animated Detail Panel
**What:** CSS Grid layout with conditional right panel. Framer Motion handles slide-in/out.
**When to use:** The main app shell.
**Example:**
```typescript
// AppShell layout concept
<div className="h-screen grid grid-rows-[auto_1fr]">
  <TopBar />
  <div className="grid grid-cols-[240px_1fr] overflow-hidden">
    <Sidebar />
    <div className="relative flex overflow-hidden">
      <div className={cn(
        "flex-1 overflow-y-auto transition-all duration-300",
        selectedAsset ? "mr-[40vw]" : ""
      )}>
        <AssetGrid />
      </div>
      <AnimatePresence>
        {selectedAsset && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed top-0 right-0 h-full w-[40vw] bg-panel border-l border-border"
          >
            <DetailPanel assetId={selectedAsset} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </div>
</div>
```

### Pattern 3: Tag Filtering with SQLite json_each()
**What:** Server-side AND filtering using SQLite JSON functions. Tags sent as query params.
**When to use:** `GET /api/assets?tags=interview&tags=raw`
**Example (backend):**
```typescript
// For AND filtering: asset must have ALL selected tags
// Using raw SQL with Drizzle's sql`` template
import { sql } from 'drizzle-orm';

// Each tag requires a json_each subquery match
function buildTagFilter(tags: string[]) {
  if (!tags.length) return undefined;
  // For AND: all tags must be present
  return sql`(
    SELECT COUNT(DISTINCT value) FROM json_each(${assets.tags})
    WHERE value IN (${sql.join(tags.map(t => sql`${t}`), sql`, `)})
  ) = ${tags.length}`;
}
```

### Pattern 4: Custom Context Menu
**What:** Right-click handler on cards to show a positioned dropdown menu.
**When to use:** Asset deletion trigger.
**Key details:**
- Prevent default browser context menu with `onContextMenu`
- Position menu at cursor coordinates
- Close on click-outside or Escape
- Only "Delete" option for Phase 3

### Pattern 5: Transcript Sync with timeupdate
**What:** Video `timeupdate` event drives active segment highlighting and auto-scroll.
**When to use:** Detail panel with transcript.
**Example:**
```typescript
function TranscriptList({ segments, videoRef }: Props) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => {
      const t = video.currentTime;
      const idx = segments.findIndex(
        (s, i) => t >= s.start && (i === segments.length - 1 || t < segments[i + 1].start)
      );
      setActiveIndex(idx);
    };
    video.addEventListener('timeupdate', handler);
    return () => video.removeEventListener('timeupdate', handler);
  }, [segments, videoRef]);

  // Auto-scroll active segment into view
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = listRef.current?.children[activeIndex] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  return (
    <div ref={listRef} className="overflow-y-auto max-h-[40vh]">
      {segments.map((seg, i) => (
        <button
          key={i}
          onClick={() => { videoRef.current!.currentTime = seg.start; }}
          className={cn(
            "w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors",
            i === activeIndex
              ? "bg-cta/20 text-text border-l-2 border-cta"
              : "text-text-muted hover:bg-panel"
          )}
        >
          <span className="font-mono text-xs text-text-muted mr-2">
            {formatTimecode(seg.start)}
          </span>
          {seg.text}
        </button>
      ))}
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Do NOT use `useEffect` for data fetching** -- use TanStack Query exclusively. It handles caching, deduplication, and background refetching.
- **Do NOT store server data in useState** -- TanStack Query is the single source of truth for server state. Local state is only for UI state (selected asset, open menus).
- **Do NOT use `scale` transforms on hover** -- MASTER.md forbids layout-shifting hovers. Use color/border/glow changes.
- **Do NOT build a router** -- CONTEXT.md specifies panel-based navigation, not route-based. No react-router-dom needed.
- **Do NOT autoplay video** -- PLAY-01 explicitly requires click-to-play only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Data fetching + caching | Custom fetch hooks with useState | TanStack Query | Handles stale data, background refetch, cache invalidation, polling |
| Exit animations | CSS-only transitions | Framer Motion `AnimatePresence` | CSS cannot animate elements being removed from DOM |
| Class name merging | String concatenation | `clsx` + `tailwind-merge` | Handles conditional classes and deduplicates conflicting Tailwind utilities |
| Time formatting | Manual math | Simple utility (see Code Examples) | Edge cases with hours, zero-padding |
| File size formatting | Manual division | Simple utility (see Code Examples) | Consistent units (KB, MB, GB) |

**Key insight:** The main "don't hand-roll" risk in this phase is data fetching. TanStack Query eliminates a class of bugs around stale data, race conditions, and polling lifecycle that are painful to solve with raw `useEffect` + `fetch`.

## Common Pitfalls

### Pitfall 1: Layout Shift When Thumbnails Load
**What goes wrong:** Cards jump in size as thumbnail images load, causing a janky CLS experience.
**Why it happens:** Image dimensions not reserved before load.
**How to avoid:** Set explicit `width` and `height` (or `aspect-ratio`) on thumbnail containers. Use `bg-panel` as placeholder color. The thumbnail is always 240-280px wide; set a fixed aspect ratio (16:9 = `aspect-video`).
**Warning signs:** Visual jumps when scrolling the asset list.

### Pitfall 2: Context Menu Positioning at Viewport Edges
**What goes wrong:** Right-click near the bottom or right edge causes the context menu to overflow offscreen.
**Why it happens:** Menu positioned at raw cursor coordinates without boundary checking.
**How to avoid:** After calculating position, check if menu would overflow viewport bounds and adjust (flip up/left if needed). Measure menu dimensions after render.
**Warning signs:** Menu partially hidden at screen edges.

### Pitfall 3: Video Not Seeking (Missing Range Requests)
**What goes wrong:** Video plays from start but seeking/scrubbing does not work.
**Why it happens:** Server not returning HTTP 206 Partial Content responses.
**How to avoid:** `@fastify/static` already handles range requests automatically. Verify the `<video>` `src` points to `/storage/{uuid}/original.{ext}`. Do NOT proxy the file through a custom route that doesn't handle `Range` headers.
**Warning signs:** Video plays but scrub bar jumps back to current position.

### Pitfall 4: TanStack Query Polling Never Stops
**What goes wrong:** API calls continue indefinitely even after transcription completes.
**Why it happens:** `refetchInterval` function doesn't check the latest data correctly.
**How to avoid:** Use the callback form of `refetchInterval` that receives the query object. Check `query.state.data` for terminal status. Return `false` to stop polling.
**Warning signs:** Network tab shows continuous GET requests for a completed asset.

### Pitfall 5: Stale Tag Counts After Deletion
**What goes wrong:** Tag sidebar shows outdated counts after an asset is deleted.
**Why it happens:** Tag list query not invalidated when an asset is deleted.
**How to avoid:** In the `useDeleteAsset` mutation's `onSuccess`, invalidate both `['assets']` and `['tags']` query keys.
**Warning signs:** Tag count shows "interview (5)" but only 4 assets have that tag.

### Pitfall 6: Framer Motion AnimatePresence Not Triggering Exit
**What goes wrong:** Detail panel disappears instantly instead of sliding out.
**Why it happens:** `AnimatePresence` requires direct children with unique `key` props, and the child must be conditionally rendered (not hidden with CSS).
**How to avoid:** Always wrap conditional Framer Motion elements in `<AnimatePresence>` and give each a stable `key`. Use conditional rendering (`{show && <motion.div .../>}`), not `display: none`.
**Warning signs:** Panel appears with animation but disappears without.

## Code Examples

### Backend: GET /api/assets with Tag Filtering
```typescript
// In backend/src/routes/assets.ts
fastify.get<{
  Querystring: { tags?: string | string[] }
}>('/api/assets', async (request, reply) => {
  const { tags } = request.querystring;

  // Normalize tags to array
  const tagList = tags
    ? (Array.isArray(tags) ? tags : [tags])
    : [];

  let query;
  if (tagList.length > 0) {
    // AND filter: asset must contain ALL requested tags
    query = db
      .select()
      .from(assets)
      .where(
        sql`(
          SELECT COUNT(DISTINCT value)
          FROM json_each(${assets.tags})
          WHERE value IN (${sql.join(tagList.map(t => sql`${t}`), sql`, `)})
        ) = ${tagList.length}`
      )
      .orderBy(sql`${assets.createdAt} DESC`)
      .all();
  } else {
    query = db
      .select()
      .from(assets)
      .orderBy(sql`${assets.createdAt} DESC`)
      .all();
  }

  return query;
});
```

### Backend: DELETE /api/assets/:id
```typescript
fastify.delete<{
  Params: { id: string };
  Querystring: { deleteFile?: string };
}>('/api/assets/:id', async (request, reply) => {
  const { id } = request.params;
  const deleteFile = request.query.deleteFile === 'true';

  const asset = db.select().from(assets).where(eq(assets.id, id)).get();
  if (!asset) {
    return reply.status(404).send({ error: 'Asset not found' });
  }

  // Delete DB record
  db.delete(assets).where(eq(assets.id, id)).run();

  // Optionally delete files from disk
  if (deleteFile) {
    const storageRoot = process.env.STORAGE_ROOT!;
    const assetDir = resolve(storageRoot, id);
    await rm(assetDir, { recursive: true, force: true });
  }

  return reply.status(204).send();
});
```

### Backend: PATCH /api/assets/:id (Tag Editing)
```typescript
fastify.patch<{
  Params: { id: string };
  Body: { tags?: string[] };
}>('/api/assets/:id', async (request, reply) => {
  const { id } = request.params;
  const { tags } = request.body;

  const asset = db.select().from(assets).where(eq(assets.id, id)).get();
  if (!asset) {
    return reply.status(404).send({ error: 'Asset not found' });
  }

  if (tags !== undefined) {
    db.update(assets)
      .set({ tags: JSON.stringify(tags), updatedAt: new Date().toISOString() })
      .where(eq(assets.id, id))
      .run();
  }

  // Return updated asset
  return db.select().from(assets).where(eq(assets.id, id)).get();
});
```

### Frontend: cn() Utility
```typescript
// lib/cn.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Frontend: Format Utilities
```typescript
// lib/formatters.ts
export function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
```

### Frontend: Asset TypeScript Type
```typescript
// types/asset.ts
export interface Asset {
  id: string;
  originalFilename: string;
  filepath: string;
  fileSize: number | null;
  fileHash: string | null;
  status: 'ingesting' | 'ready' | 'error';
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  bitrate: number | null;
  frameRate: number | null;
  metadataStatus: string;
  thumbnailPath: string | null;
  thumbnailStatus: string;
  transcriptPath: string | null;
  transcriptText: string | null;
  transcriptionStatus: 'pending' | 'processing' | 'ready' | 'failed';
  transcriptionError: string | null;
  searchIndexStatus: string;
  title: string | null;
  description: string | null;
  tags: string; // JSON string of string[]
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| useEffect + fetch | TanStack Query v5 | 2023 | Eliminates manual loading/error state, provides caching + polling |
| Framer Motion v6-10 API | Framer Motion v12 (motion component) | 2025 | Same `motion.div` API; v12 is stable and backward-compatible |
| react-query v3 | @tanstack/react-query v5 | 2023 | New package name, `useQuery` options object API (no positional args) |

**Deprecated/outdated:**
- `react-query` (old package name): Use `@tanstack/react-query` (v5)
- Framer Motion `useAnimation` for simple cases: Prefer declarative `animate`/`exit` props

## Open Questions

1. **Tags endpoint: dedicated or derived?**
   - What we know: Tags are stored as JSON arrays in each asset row. The sidebar needs all unique tags with counts.
   - What's unclear: Whether to create a dedicated `GET /api/tags` endpoint or derive tags client-side from the asset list.
   - Recommendation: Create a `GET /api/tags` endpoint using `SELECT value, COUNT(*) as count FROM assets, json_each(assets.tags) GROUP BY value ORDER BY value`. This is more efficient than parsing all assets client-side, especially as the library grows.

2. **Transcript loading: embedded or separate fetch?**
   - What we know: `transcript_text` is in the assets table (full text). Transcript segments with timestamps are in `transcript.json` files.
   - What's unclear: Whether to embed segment data in the asset response or fetch the JSON file separately.
   - Recommendation: Fetch the transcript JSON file separately (`/storage/{uuid}/transcript.json`) only when the detail panel opens. This keeps the asset list response small. The `transcriptText` field (plain text) on the asset is for search indexing, not for UI display with timestamps.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 (backend), Vitest (to add for frontend) |
| Config file | `backend/vitest.config.ts` (exists), `frontend/vitest.config.ts` (needs creation) |
| Quick run command | `cd backend && npx vitest run src/__tests__/assets-api.test.ts -x` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BRWS-01 | GET /api/assets returns all assets with metadata fields | unit | `cd backend && npx vitest run src/__tests__/assets-api.test.ts -x` | No - Wave 0 |
| BRWS-03 | GET /api/assets?tags=x filters by tag (AND logic) | unit | `cd backend && npx vitest run src/__tests__/assets-api.test.ts -x` | No - Wave 0 |
| BRWS-04 | DELETE /api/assets/:id removes record; deleteFile removes disk | unit | `cd backend && npx vitest run src/__tests__/assets-api.test.ts -x` | No - Wave 0 |
| PLAY-01 | Video src URL uses /storage/ prefix for range-request serving | manual-only | Manual: click card, verify video plays and seeks | N/A |
| PLAY-04 | Asset response includes transcriptionStatus field | unit | `cd backend && npx vitest run src/__tests__/assets-api.test.ts -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx vitest run src/__tests__/assets-api.test.ts -x`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/__tests__/assets-api.test.ts` -- covers BRWS-01, BRWS-03, BRWS-04, PLAY-04 (GET/DELETE/PATCH endpoints)
- [ ] Test fixtures: seed helper to insert test asset rows with known tags/status values

## Sources

### Primary (HIGH confidence)
- Project codebase: `backend/src/db/schema.ts`, `backend/src/routes/assets.ts`, `backend/src/index.ts` -- verified all schema fields and existing routes
- `design-system/mam/MASTER.md` -- verified layout spec, component CSS, status colors, anti-patterns
- `.planning/phases/03-browse-and-playback/03-CONTEXT.md` -- locked user decisions
- npm registry: verified package versions via `npm view` (2026-03-24)

### Secondary (MEDIUM confidence)
- TanStack Query `refetchInterval` callback form -- documented in training data, consistent with v5 API
- Framer Motion `AnimatePresence` + `motion.div` API -- stable since v4, unchanged in v12
- SQLite `json_each()` function -- SQLite built-in JSON1 extension, well-documented

### Tertiary (LOW confidence)
- None -- all critical claims verified against codebase or npm registry

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified via npm, versions confirmed
- Architecture: HIGH -- patterns derived directly from locked CONTEXT.md decisions and existing codebase
- Pitfalls: HIGH -- based on known React/video/animation patterns and project-specific constraints

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable stack, no fast-moving dependencies)
