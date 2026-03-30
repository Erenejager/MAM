# Phase 6: Search - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Full-text search across metadata and transcript content, with highlighted excerpts and timecode links. Users can find any asset by title, tag, description, or spoken word in the transcript — the core value of the application. Requirements: SRCH-01, SRCH-02, SRCH-03, SRCH-04.

</domain>

<decisions>
## Implementation Decisions

### Search results display
- Search acts as a filter on the existing card grid — same layout as browse, narrowed to matching assets
- Consistent with how tag filtering already works (grid narrows, not a separate view)
- Cards expand to show transcript excerpt when there's a transcript match
- All matched fields highlighted: title, description, tags, AND transcript excerpt (amber highlight, same style as Phase 5)
- Best match only per card — single transcript excerpt with timecode; badge shows total match count (e.g., "3 matches")

### Search bar behavior
- Submit on Enter (not live/debounce) — avoids hammering OpenSearch on every keystroke
- Centered search input in TopBar: MAM logo left, wide search input centered
- Keyboard shortcut: Cmd/Ctrl+K to focus search bar from anywhere
- No results: friendly message "No videos match 'query'" with suggestion to try different terms
- OpenSearch unavailable: banner warning "Search unavailable" but grid still works (shows all assets)
- Clearing the search returns to full grid view

### Tag + search interaction
- AND logic — selected tags narrow results first, then search filters within that subset
- Example: tag "interview" + search "budget" = only interviews mentioning "budget"
- Tag sidebar always shows global counts (no aggregation query per search)
- Tag filters persist across searches; search persists across tag changes

### Transcript timecode links
- Clicking timecode on a search result card: opens detail panel + auto-switches to Transcript tab + seeks video to that timestamp
- Transcript excerpt format: quoted with ellipsis — "...matching **word** in context..." with amber highlight
- Timecode displayed as a small clickable link below the excerpt
- Reuses Phase 5 transcript viewer for detail panel behavior (auto-scroll, segment highlighting)

### Claude's Discretion
- OpenSearch query structure (multi_match, bool query, etc.)
- Search result relevance scoring
- Excerpt extraction algorithm (how much context around the match)
- Loading state design while search is running
- Transition animation when cards expand/collapse for excerpts
- Search input clear button design

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OpenSearch backend
- `backend/src/bootstrap/opensearch.ts` — Index mapping: title (text), description (text), tags (keyword), transcript (text), duration_seconds (float)
- `backend/src/routes/assets.ts` — Existing PATCH with partial OpenSearch update; pipeline indexing on ingest
- `backend/src/lib/pipeline.ts` — How assets are indexed to OpenSearch after transcription

### Frontend components
- `frontend/src/components/layout/TopBar.tsx` — Currently just logo; search input goes here
- `frontend/src/components/assets/AssetCard.tsx` — Card layout that needs transcript excerpt expansion
- `frontend/src/components/detail/DetailPanel.tsx` — Tab-based panel with Info/Transcript tabs (Phase 5)
- `frontend/src/components/detail/TranscriptList.tsx` — Transcript viewer with search highlighting (Phase 5)
- `frontend/src/hooks/useAssets.ts` — TanStack Query hooks for asset fetching
- `frontend/src/hooks/useTagFilter.ts` — Tag filter state management (AND logic)

### Design system
- `design-system/mam/MASTER.md` — Cinema Dark tokens, layout spec, component patterns
- `CLAUDE.md` — OpenSearch is non-fatal, SQLite is source of truth, search degrades gracefully

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useTagFilter` hook: AND-based tag filtering — search results need to compose with this
- `escapeRegex()` in `lib/escapeRegex.ts`: Safe regex for client-side highlight rendering
- Phase 5 amber highlight `<mark>` pattern in `TranscriptList.tsx`: Reuse for search result highlights
- `formatTimecode()` in `lib/formatters.ts`: Format seconds to timecode for excerpt display
- `cn()` in `lib/cn.ts`: Conditional class merging

### Established Patterns
- TanStack Query for all data fetching (`useAsset`, `useAssets`)
- Framer Motion for animations (card fade-out, panel slide-in)
- OpenSearch client singleton in `bootstrap/opensearch.ts`
- Fire-and-forget OpenSearch updates on PATCH (partial doc update)

### Integration Points
- `TopBar.tsx`: Search input component mounts here
- `App.tsx`: Search state needs to flow from TopBar → asset grid (likely via lifted state or context)
- `AssetCard.tsx`: Needs conditional rendering for transcript excerpt section
- `DetailPanel.tsx`: Needs to accept initial tab + seek timestamp for timecode link click-through
- Backend needs new `GET /api/search?q=...&tags=...` endpoint that queries OpenSearch

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for OpenSearch querying and result rendering.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-search*
*Context gathered: 2026-03-30*
