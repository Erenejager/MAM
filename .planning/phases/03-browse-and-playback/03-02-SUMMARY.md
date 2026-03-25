---
phase: 03-browse-and-playback
plan: 02
subsystem: ui
tags: [react, tanstack-query, typescript, tailwind, framer-motion, lucide-react, clsx]

# Dependency graph
requires:
  - phase: 02-ingest-pipeline
    provides: Asset schema fields (all columns on assets table)
provides:
  - Asset, TranscriptSegment, TagCount TypeScript interfaces
  - cn() class merging utility
  - formatDuration, formatFileSize, formatDate, formatTimecode utilities
  - API client functions for all asset CRUD operations
  - TanStack Query hooks for assets, single asset, tags, delete, and tag patching
  - useTagFilter hook for tag selection state
  - QueryClientProvider wrapping the app
affects: [03-03-plan, 03-04-plan]

# Tech tracking
tech-stack:
  added: [framer-motion, lucide-react, clsx, tailwind-merge]
  patterns:
    - TanStack Query v5 with queryKey arrays and refetchInterval callback pattern
    - API client as thin fetch wrappers returning typed promises
    - Polling hook (useAsset) stops automatically when status leaves 'ingesting'
    - Mutation hooks invalidate both affected resource and related collections

key-files:
  created:
    - frontend/src/types/asset.ts
    - frontend/src/lib/cn.ts
    - frontend/src/lib/formatters.ts
    - frontend/src/lib/api.ts
    - frontend/src/hooks/useAssets.ts
    - frontend/src/hooks/useTagFilter.ts
  modified:
    - frontend/package.json
    - frontend/src/main.tsx

key-decisions:
  - "TanStack Query v5 refetchInterval uses callback form — (query) => query.state.data?.status === 'ingesting' ? 4000 : false"
  - "API base path is '/api' (no hardcoded port) — works for both Vite proxy dev and production"
  - "main.tsx updated to staleTime 30s and retry 1 — balances freshness with request volume"

patterns-established:
  - "Query keys: ['assets'] for list, ['assets', id] for single, ['tags'] for tag counts"
  - "Mutation onSuccess always invalidates both the affected resource key and collections"
  - "cn() is the single class merge utility — never concatenate Tailwind classes manually"

requirements-completed: [BRWS-01, PLAY-04]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 3 Plan 02: Foundation Layer Summary

**TanStack Query v5 hooks, Asset TypeScript types, API client, and utility functions as shared foundation for browse-and-playback UI plans**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T16:07:50Z
- **Completed:** 2026-03-25T16:09:38Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Installed framer-motion, lucide-react, clsx, tailwind-merge on top of existing @tanstack/react-query
- Created complete Asset TypeScript interface mirroring all backend schema columns with correct nullable types
- Built 5 TanStack Query hooks covering list, single (with 4s polling), tags, delete, and tag patch operations
- Created cn() utility, 4 formatter functions, and API client with all CRUD functions

## Task Commits

Each task was committed atomically:

1. **Task 1: Install frontend dependencies and create types + utilities** - `49015ef` (feat)
2. **Task 2: Create TanStack Query hooks and wire QueryClientProvider** - `d96d94e` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `frontend/src/types/asset.ts` - Asset, TranscriptSegment, TagCount interfaces matching backend schema
- `frontend/src/lib/cn.ts` - cn() utility combining clsx + tailwind-merge
- `frontend/src/lib/formatters.ts` - formatDuration, formatFileSize, formatDate, formatTimecode
- `frontend/src/lib/api.ts` - fetch wrappers for fetchAssets, fetchAsset, fetchTags, deleteAsset, patchAssetTags
- `frontend/src/hooks/useAssets.ts` - useAssets, useAsset, useTags, useDeleteAsset, usePatchTags
- `frontend/src/hooks/useTagFilter.ts` - useTagFilter with toggleTag and clearTags
- `frontend/package.json` - added framer-motion, lucide-react, clsx, tailwind-merge
- `frontend/src/main.tsx` - updated QueryClient to staleTime 30s + retry 1

## Decisions Made
- Used TanStack Query v5's callback form for refetchInterval — allows polling while status is 'ingesting', stops automatically on terminal status
- API base path set to '/api' without port — works via Vite proxy in dev and directly in production
- Kept QueryClientProvider in main.tsx (already existed from Phase 1 foundation), updated options only

## Deviations from Plan

None - plan executed exactly as written. The existing main.tsx already had QueryClientProvider from Phase 1 foundation work; the update just adjusted defaultOptions to match plan spec.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All foundation types, hooks, and utilities are ready for import by UI plans 03-03 and 03-04
- TypeScript compiles cleanly (npx tsc --noEmit: no errors)
- Frontend build passes (npm run build: 187.80 kB bundle, built in 3.25s)
- Query key conventions established: ['assets'] / ['assets', id] / ['tags']

---
*Phase: 03-browse-and-playback*
*Completed: 2026-03-25*
