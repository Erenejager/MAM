---
phase: 06-search
verified: 2026-03-30T21:17:00Z
status: human_needed
score: 13/13 must-haves verified
re_verification: false
human_verification:
  - test: "Type a query in the search bar and press Enter"
    expected: "Matching asset cards appear with title/description text highlighted in amber marks"
    why_human: "Cannot verify React rendering and visual highlight appearance programmatically"
  - test: "Search for a word spoken in a video transcript"
    expected: "A transcript excerpt appears below the card with amber-highlighted matching words and a timecode link (e.g., '0:42')"
    why_human: "Requires a real OpenSearch instance with indexed transcript data to return highlights"
  - test: "Click the timecode link on a transcript excerpt card"
    expected: "The detail panel opens (or switches) to the Transcript tab and the video seeks to that exact moment"
    why_human: "Requires real browser interaction — video seek and tab switch involve DOM state changes"
  - test: "Click a tag in the sidebar while a search query is active"
    expected: "Results narrow to only assets matching BOTH the query AND the selected tag (AND logic)"
    why_human: "Requires real OpenSearch data with multiple assets and multiple tags to observe AND composition"
  - test: "Press Ctrl+K (or Cmd+K on Mac) from anywhere in the app"
    expected: "The search bar receives focus"
    why_human: "Keyboard focus behavior cannot be verified without a running browser"
  - test: "Click the X button to clear the search input"
    expected: "The full asset grid returns, showing all assets"
    why_human: "State transition from search mode to full grid requires live UI"
  - test: "Search for a nonsense term (e.g., 'xyznonexistent123')"
    expected: "Shows 'No videos match xyznonexistent123' message with a search icon"
    why_human: "Requires OpenSearch to return zero hits; verifying the empty-state render requires a live app"
  - test: "Start the backend without OpenSearch running (or stop the OpenSearch process)"
    expected: "The search bar still shows, and an amber 'Search unavailable -- showing all videos' banner appears below the top bar when a query is submitted"
    why_human: "Requires controlling OpenSearch availability; verifying banner render needs a running frontend"
---

# Phase 6: Search Verification Report

**Phase Goal:** Users can find any asset by title, tag, description, or spoken word in the transcript -- the core value of the application is fully delivered
**Verified:** 2026-03-30T21:17:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

All truths from Plan 01 and Plan 02 `must_haves` frontmatter are verified below.

#### Plan 01 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /api/search?q=word returns matching asset IDs with highlight fragments | VERIFIED | `backend/src/routes/search.ts:36` registers `GET /api/search`; returns `{ results }` array with `id`, `score`, `highlights` per hit |
| 2 | Transcript highlights include a resolved timestamp from transcript.json segments | VERIFIED | Route reads `transcript.json`, calls `resolveTranscriptTimestamp`, sets `transcriptMatch.timestamp` (lines 63-84) |
| 3 | Tag filter in search uses AND logic (each selected tag must be present) | VERIFIED | `buildSearchQuery` maps each tag to an individual `{ term: { tags: tag } }` clause in `filter[]` -- not a `terms` array; test at line 50-57 confirms two separate term objects |
| 4 | OpenSearch unavailable returns 503 with structured error, not unhandled crash | VERIFIED | Catch block checks for `ECONNREFUSED`/`connect`/`ConnectionError` and returns `reply.status(503).send({ error: 'search_unavailable' })` (lines 99-108); test passes at line 171 |
| 5 | Empty query returns empty results array (no OpenSearch call) | VERIFIED | `buildSearchQuery` returns `null` for empty/whitespace; route returns `{ results: [] }` immediately without calling `opensearchClient.search` (line 41-43) |
| 6 | Frontend has a useSearch hook that calls the search endpoint via TanStack Query | VERIFIED | `frontend/src/hooks/useSearch.ts` uses `useQuery` with `queryKey: ['search', query, tags]`, calls `searchAssets`, `enabled: query.trim().length > 0` |

#### Plan 02 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 7 | User can type a query in the top search bar and press Enter to search | VERIFIED | `SearchInput.tsx`: `<form onSubmit={handleSubmit}>` calls `onSearch(trimmed)` on submit |
| 8 | User can press Cmd/Ctrl+K from anywhere to focus the search bar | VERIFIED | `SearchInput.tsx:19-22`: `useEffect` adds `keydown` listener checking `(e.metaKey \|\| e.ctrlKey) && e.key === 'k'` |
| 9 | Matching assets appear as cards with highlighted title, description, and tags | VERIFIED | `AssetCard.tsx:67,116`: uses `titleHighlight` to call `renderHighlight()` on title; renders `descHighlight` with `renderHighlight()`; `isTagHighlighted()` applies amber styling to matching tags |
| 10 | Cards with transcript matches expand to show a quoted excerpt with amber highlight and a clickable timecode | VERIFIED | `AssetCard.tsx:170-177`: renders `<TranscriptExcerpt>` when `searchResult?.transcriptMatch` exists; `TranscriptExcerpt.tsx:17`: uses `bg-amber-500/30 text-amber-200` for highlights |
| 11 | Clicking a timecode opens the detail panel on the Transcript tab and seeks the video to that timestamp | VERIFIED | `App.tsx:39-42`: `handleTimecodeClick` sets `selectedAssetId` and `pendingSeek`; `DetailPanel.tsx:41-56`: `useEffect` on `initialTab` sets active tab; second `useEffect` on `seekTimestamp` does `videoRef.current.currentTime = seekTimestamp` with `setTimeout(0)` |
| 12 | Clearing the search returns to the full grid view | VERIFIED | `SearchInput.tsx:37-40`: `handleClear` sets value to `''` and calls `onClear()`; `App.tsx:37`: `handleClearSearch` sets `searchQuery` to `''`; `useSearch` is `enabled` only when query is non-empty, so `searchResultMap` becomes `undefined` and grid shows all assets |
| 13 | Tag filters AND-compose with search (both persist independently) | VERIFIED | `App.tsx:22`: `useSearch(searchQuery, selectedTags)` passes `selectedTags` to hook; `buildSearchQuery` adds each tag as a separate filter term alongside the text query |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/lib/search.ts` | Query builder and timestamp resolver | VERIFIED | Exports `buildSearchQuery` and `resolveTranscriptTimestamp`; 88 lines; substantive implementation |
| `backend/src/routes/search.ts` | GET /api/search endpoint | VERIFIED | Exports `searchRoutes`; 111 lines; full OpenSearch integration with error handling |
| `backend/src/__tests__/search.test.ts` | Tests for query construction and segment matching | VERIFIED | 11 tests, all passing (`npx vitest run` exits 0) |
| `frontend/src/types/asset.ts` | SearchResult and SearchResponse interfaces | VERIFIED | Contains `SearchResult`, `SearchTranscriptMatch`, `SearchResponse` at lines 59-73 |
| `frontend/src/hooks/useSearch.ts` | useSearch TanStack Query hook | VERIFIED | Exports `useSearch`; 12 lines; wired to `searchAssets` with `enabled` guard |
| `frontend/src/lib/api.ts` | searchAssets API function | VERIFIED | Contains `searchAssets` at line 95; handles 503 gracefully |
| `frontend/src/components/layout/SearchInput.tsx` | Search bar component | VERIFIED | 65 lines; `onSearch`/`onClear` props; Ctrl+K listener; `onSubmit` form; placeholder "Search videos... (Ctrl+K)" |
| `frontend/src/components/assets/TranscriptExcerpt.tsx` | Transcript excerpt component | VERIFIED | 50 lines; `renderHighlight` with `<em>` parsing; `formatTimecode`; `bg-amber-500/30`; `onTimecodeClick` with `stopPropagation` |
| `frontend/src/App.tsx` | Search state lifted to App | VERIFIED | Contains `searchQuery` state, `useSearch`, `handleTimecodeClick`, `pendingSeek` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backend/src/routes/search.ts` | `backend/src/lib/search.ts` | `import buildSearchQuery, resolveTranscriptTimestamp` | WIRED | Line 5: `import { buildSearchQuery, resolveTranscriptTimestamp } from '../lib/search.js'` -- both functions called in route handler |
| `backend/src/routes/search.ts` | `backend/src/bootstrap/opensearch.ts` | `opensearchClient.search` | WIRED | Line 4: `import { opensearchClient }`, line 46: `opensearchClient.search({ index: 'mam-assets', body: queryBody })` |
| `backend/src/index.ts` | `backend/src/routes/search.ts` | `server.register(searchRoutes)` | WIRED | Line 13: `import { searchRoutes }`, line 43: `await server.register(searchRoutes)` |
| `frontend/src/hooks/useSearch.ts` | `frontend/src/lib/api.ts` | `import searchAssets` | WIRED | Line 2: `import { searchAssets } from '../lib/api'`, line 8: `queryFn: () => searchAssets(query, tags)` |
| `frontend/src/App.tsx` | `frontend/src/components/layout/TopBar.tsx` | `onSearch=` and `onClearSearch=` props | WIRED | App.tsx lines 49-53: passes `onSearch={handleSearch}`, `onClearSearch={handleClearSearch}`, `searchQuery={searchQuery}`, `searchUnavailable={searchUnavailable}` |
| `frontend/src/App.tsx` | `frontend/src/components/assets/AssetGrid.tsx` | `searchQuery=` and `searchResults=` props | WIRED | App.tsx lines 79-81: passes `searchQuery={searchQuery}`, `searchResults={searchResultMap}`, `onTimecodeClick={handleTimecodeClick}` |
| `frontend/src/components/assets/AssetCard.tsx` | `frontend/src/components/assets/TranscriptExcerpt.tsx` | renders TranscriptExcerpt when transcriptMatch exists | WIRED | Line 7: `import { TranscriptExcerpt }`, lines 170-177: rendered conditionally on `searchResult?.transcriptMatch` |
| `frontend/src/components/assets/AssetGrid.tsx` | `frontend/src/App.tsx` | `onTimecodeClick` callback | WIRED | AssetGrid line 16: prop defined; App.tsx line 81: `onTimecodeClick={handleTimecodeClick}` passed in |
| `frontend/src/App.tsx` | `frontend/src/components/detail/DetailPanel.tsx` | `initialTab=` and `seekTimestamp=` props | WIRED | App.tsx lines 97-99: passes `initialTab={pendingSeek?.tab}`, `seekTimestamp={pendingSeek?.timestamp}`, `onOpened={() => setPendingSeek(null)}` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SRCH-01 | 06-01, 06-02 | User can full-text search across title, description, and tags | SATISFIED | `buildSearchQuery` uses `multi_match` on `['title^3', 'description^2', 'transcript']`; UI renders highlights via `renderHighlight()` in AssetCard |
| SRCH-02 | 06-01, 06-02 | User can search spoken words within transcripts | SATISFIED | `multi_match` includes `transcript` field; route resolves `transcript.json` segment timestamps; `TranscriptExcerpt` renders the excerpt |
| SRCH-03 | 06-01, 06-02 | Search results show highlighted matching excerpts with a timecode link | SATISFIED | OpenSearch highlight config with `<em>` tags; `TranscriptExcerpt` parses tags into amber `<mark>` elements; timecode link triggers video seek |
| SRCH-04 | 06-01, 06-02 | User can filter search results by tag | SATISFIED | `buildSearchQuery` adds individual `{ term: { tags } }` filter clauses; `useSearch` receives `selectedTags` from App.tsx; sidebar tag clicks compose with active search |

No orphaned requirements -- all four SRCH-0x IDs appear in both plan frontmatter fields and are covered by implementation evidence.

### Anti-Patterns Found

None. Scanned all 9 key files for TODO/FIXME/placeholder comments, empty returns, and stub implementations. No issues found.

### Human Verification Required

#### 1. Title and Description Highlight Rendering

**Test:** Start backend and frontend (`npm run dev` in each). Upload or ingest a video with a known title (e.g., "Budget Review 2025"). Type "budget" in the search bar and press Enter.
**Expected:** The matching card appears. The word "budget" in the title is wrapped in an amber highlight mark. If the asset has a description mentioning "budget", a highlighted description line also appears below the title.
**Why human:** React's `renderHighlight()` splits on `<em>` tags and renders `<mark>` elements. The visual output and correct parsing of OpenSearch highlight fragments requires a live browser and a running OpenSearch instance returning real highlight data.

#### 2. Transcript Excerpt with Amber Highlight and Timecode

**Test:** Search for a word that appears in a video's spoken content (requires OpenSearch to have indexed the transcript). Example: search "quarterly" if that word appears in a transcript.
**Expected:** The asset card expands to show a quoted excerpt like "...the <mark>quarterly</mark> report shows..." with an amber-highlighted word and a timecode link (e.g., "1:23").
**Why human:** Requires real transcript data indexed in OpenSearch and the `transcript.json` file to be present in STORAGE_ROOT for timestamp resolution.

#### 3. Timecode Click Deep-Link

**Test:** On a card with a transcript excerpt (see test 2 above), click the timecode link.
**Expected:** The detail panel opens (or if already open for another asset, switches to the clicked asset) with the Transcript tab active, and the video is already seeked to that exact timestamp. The video playhead position should match the timecode shown.
**Why human:** Video `currentTime` seeking and tab switching involve DOM state that cannot be verified by static analysis. The `setTimeout(0)` mechanism for sequencing the tab switch before seek also requires a real browser event loop.

#### 4. Tag AND-Composition with Active Search

**Test:** With a search query active that returns multiple results, click a tag in the sidebar.
**Expected:** The grid narrows further -- only assets matching BOTH the query text AND having the selected tag are shown. The search query remains in the search bar.
**Why human:** Requires multiple assets with different tag sets and real OpenSearch data to observe the narrowing behavior.

#### 5. Ctrl+K Focus Shortcut

**Test:** Click somewhere else in the page (not the search bar), then press Ctrl+K (or Cmd+K on Mac).
**Expected:** The search input receives focus and the cursor appears in the search field.
**Why human:** Keyboard focus behavior and `document.addEventListener('keydown')` effects require a live browser.

#### 6. Clear Search Returns to Full Grid

**Test:** With search results showing (query active), click the X button in the search bar.
**Expected:** The search input clears, the search bar shows the placeholder text again, and the full asset grid returns showing all assets.
**Why human:** State transition from `searchQuery !== ''` to `searchQuery === ''` causing `searchResultMap` to become `undefined` and `useSearch` to disable requires live UI to observe.

#### 7. Empty Search Results Message

**Test:** Type a nonsense term (e.g., "xyznonexistent123abc") and press Enter.
**Expected:** The grid area shows a search icon, the text "No videos match 'xyznonexistent123abc'", and "Try different search terms" below it.
**Why human:** Requires OpenSearch to respond with zero hits; the empty-state render in AssetGrid requires a live app with real data.

#### 8. Search Unavailable Banner

**Test:** Stop OpenSearch (or point `OPENSEARCH_URL` to a non-existent host), then type a query and press Enter.
**Expected:** An amber banner appears below the top bar reading "Search unavailable -- showing all videos". The full asset grid continues to show all assets normally.
**Why human:** Requires controlling OpenSearch availability at runtime. The 503 error path in `searchAssets` returning `{ results: [], error: 'search_unavailable' }` and the banner render in TopBar need a live environment to confirm.

### Gaps Summary

No automated gaps found. All 13 must-have truths pass verification against the codebase. All 9 key artifacts are substantive (not stubs) and fully wired. All 4 requirements (SRCH-01 through SRCH-04) are satisfied by implementation evidence. All 5 commits documented in the SUMMARYs exist in git history. Both TypeScript compilation checks pass and all 11 backend tests pass.

The 8 human verification items cover visual rendering, real OpenSearch data flows, browser DOM interactions, and keyboard focus -- none of these can be verified by static analysis. They represent normal integration testing, not gaps in the implementation.

---

_Verified: 2026-03-30T21:17:00Z_
_Verifier: Claude (gsd-verifier)_
