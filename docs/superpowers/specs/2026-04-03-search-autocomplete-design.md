# Search Autocomplete — Design Spec

## Purpose

Enrich the existing TopBar search dropdown with real-time suggestions as the user types. The autocomplete acts as a **term validator** — it tells the user whether what they're typing exists in their library before they commit the search with Enter.

No suggestions = probably a typo. Suggestions appearing = term exists, keep going or click one.

## What changes, what stays the same

**Stays the same:**
- TopBar search UI layout and styling (expandable input, dropdown below)
- Actions section in dropdown (Import, Settings, "Search for '...'")
- Pressing Enter triggers the existing full OpenSearch search with grid results
- Clicking a suggestion navigates to that asset's detail panel
- Escape / click-outside closes the dropdown

**Changes:**
- The "Asset suggestions" section currently does a naive `title.includes(query)` on the already-loaded asset list. This gets replaced with debounced API-backed suggestions from a new lightweight endpoint.
- Suggestions show highlighted matching text (bold the matched substring)
- Loading spinner while fetching
- "No matches" message when the API returns empty
- Keyboard navigation (arrow keys + Enter) through suggestions
- Result count shown in section header (e.g., "3 matches")

## Backend

### New endpoint

```
GET /api/suggest?q={query}
```

**Query logic:**
- Return empty array if `q` is missing or fewer than 2 characters
- Search the `assets` table for rows where `title` or `original_filename` contains the query (case-insensitive `LIKE '%query%'`)
- Also search tags: use `json_each(assets.tags)` to match individual tag values
- Return **unique suggestion strings** — deduplicated across title and tag matches
- Limit to 10 results
- Order: exact prefix matches first, then substring matches

**Response format:**
```json
{
  "suggestions": [
    { "type": "asset", "id": "uuid-1", "text": "Cat Video Compilation" },
    { "type": "asset", "id": "uuid-2", "text": "Categorizing Footage" },
    { "type": "tag", "text": "cats" },
    { "type": "tag", "text": "category" }
  ]
}
```

Each suggestion has a `type` so the frontend can render a small icon (video icon for assets, tag icon for tags). Asset suggestions include `id` for direct navigation. Tag suggestions have no `id` — selecting one would fill the search input with that tag.

**SQL approach (single query):**
```sql
-- Asset matches (title or original_filename)
SELECT 'asset' as type, id, COALESCE(title, original_filename) as text
FROM assets
WHERE (title LIKE '%' || ? || '%' OR original_filename LIKE '%' || ? || '%')
  AND status != 'error'
LIMIT 8

UNION ALL

-- Tag matches
SELECT DISTINCT 'tag' as type, NULL as id, value as text
FROM assets, json_each(assets.tags)
WHERE value LIKE '%' || ? || '%'
LIMIT 4
```

Combined limit of 10 results. Assets prioritized (8 max), tags secondary (4 max, or fewer if assets fill up).

**Security:**
- Parameterized query (no string interpolation into SQL)
- The endpoint sits behind the existing auth middleware — no unauthenticated access
- No rate limiting needed — single-user app behind Tailscale

**File:** `backend/src/routes/suggest.ts` — new route file, registered in `index.ts` after auth middleware.

### No new database indexes needed

The `assets` table is small (single-user MAM). A full scan with `LIKE` on title + `json_each` on tags is fast enough. If the library grows to thousands of assets, a covering index on `title` could help, but premature now.

### No OpenSearch involvement

This endpoint queries SQLite only. It works even when OpenSearch is down. The full-text search (Enter) still uses OpenSearch for fuzzy matching, relevance ranking, transcript search, and highlights.

## Frontend

### Debouncing

- 300ms debounce after the user stops typing
- If the user types again within 300ms, cancel the pending timer (and any in-flight fetch via AbortController)
- No API call if query is under 2 characters

### Client-side cache

- `Map<string, Suggestion[]>` stored in a `useRef` inside the hook
- Keyed by the lowercase query string
- If the cache has results for the current query, return them instantly — no API call
- Cache lives for the session (clears on page reload)
- No eviction policy needed — a single user won't generate enough unique queries to matter

### Hook: `useSuggest`

New hook in `frontend/src/hooks/useSuggest.ts`:

```ts
function useSuggest(query: string): {
  suggestions: Suggestion[];
  isLoading: boolean;
}
```

- Manages debounce timer, AbortController, and cache internally
- Returns current suggestions and loading state
- When query changes: check cache -> if miss, start debounce -> fetch -> cache result

### TopBar changes

Minimal changes to `TopBar.tsx`:

1. Import and call `useSuggest(inputValue)`
2. Replace the current client-side filter block (lines 105-112) with the hook's results
3. Add loading spinner next to the "Matching assets" / "X matches" section header
4. Add "No matches for '...'" empty state
5. Add keyboard navigation state (`highlightedIndex`) managed by arrow keys on the input's `onKeyDown`
6. Bold the matching substring in each suggestion's text

**Suggestion rendering:**
- Asset suggestions: video icon + title with match bolded, click navigates to detail
- Tag suggestions: tag icon + tag name with match bolded, click fills the search input with that tag and triggers search

**Keyboard navigation:**
- Arrow Down / Arrow Up: move `highlightedIndex` through suggestion list (wrapping)
- Enter with a highlighted suggestion: select it (navigate or fill input)
- Enter with no highlight: submit the search as today
- Escape: close dropdown

### No changes to existing search flow

The full search (Enter -> OpenSearch -> grid results) is untouched. The autocomplete is purely additive — it enriches the dropdown that appears while typing.

## UX summary

```
User opens search bar (Ctrl+K or click)
  -> Dropdown shows Actions section
  -> No suggestions yet (empty input)

User types "ca" (2+ chars)
  -> 300ms passes
  -> Spinner appears in suggestions section
  -> GET /api/suggest?q=ca
  -> Results arrive: "Cat Video", "Categorizing Footage", tag "cats"
  -> Suggestions section shows "3 matches" header
  -> Each result has the "ca" portion bolded

User types "cat" (appends to query)
  -> Previous debounce cancelled
  -> 300ms passes
  -> Check cache for "cat" — miss
  -> GET /api/suggest?q=cat
  -> Results shown

User presses Arrow Down
  -> First suggestion highlighted

User presses Enter
  -> Navigates to that asset's detail panel

OR User presses Enter with no highlight
  -> Full OpenSearch search runs, grid shows results
```

## Files touched

| File | Change |
|------|--------|
| `backend/src/routes/suggest.ts` | **New** — suggest endpoint |
| `backend/src/index.ts` | Register suggest routes |
| `frontend/src/hooks/useSuggest.ts` | **New** — debounced suggest hook with cache |
| `frontend/src/components/layout/TopBar.tsx` | Replace client-side filter with `useSuggest`, add loading/empty/keyboard states, bold matches |
| `frontend/src/lib/api.ts` | Add `fetchSuggestions()` function |
