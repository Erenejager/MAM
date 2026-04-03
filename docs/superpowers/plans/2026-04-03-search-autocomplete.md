# Search Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add debounced, SQLite-backed autocomplete suggestions to the existing TopBar search dropdown — matching asset titles/filenames and tags as the user types.

**Architecture:** New `GET /api/suggest` endpoint queries SQLite with `LIKE` for title/filename and `json_each` for tags. New `useSuggest` hook handles 300ms debounce, AbortController cancellation, and session-scoped Map cache. TopBar dropdown replaces its client-side asset filter with hook results and adds loading/empty/keyboard states.

**Tech Stack:** Fastify route + better-sqlite3 raw SQL, React hook with native fetch, existing TopBar component.

**Spec:** `docs/superpowers/specs/2026-04-03-search-autocomplete-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/routes/suggest.ts` | Create | Suggest endpoint — SQLite query, response shaping |
| `backend/src/index.ts` | Modify (line 75) | Register suggest route |
| `frontend/src/lib/api.ts` | Modify (end of file) | `fetchSuggestions()` API function |
| `frontend/src/hooks/useSuggest.ts` | Create | Debounce + cache + abort logic |
| `frontend/src/components/layout/TopBar.tsx` | Modify (lines 1-2, 40, 105-112, 161, 175-221) | Wire hook, render suggestions, keyboard nav |

---

### Task 1: Backend — Suggest Endpoint

**Files:**
- Create: `backend/src/routes/suggest.ts`
- Modify: `backend/src/index.ts:14-15,75`

- [ ] **Step 1: Create the suggest route file**

Create `backend/src/routes/suggest.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { sqlite } from '../db/index.js';

interface Suggestion {
  type: 'asset' | 'tag';
  id: string | null;
  text: string;
}

export async function suggestRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Querystring: { q?: string };
  }>('/api/suggest', async (request) => {
    const q = (request.query.q ?? '').trim().toLowerCase();
    if (q.length < 2) {
      return { suggestions: [] };
    }

    const pattern = `%${q}%`;

    // Asset matches: title or original_filename contain the query
    const assetRows = sqlite
      .prepare(
        `SELECT id, COALESCE(title, original_filename) AS text
         FROM assets
         WHERE status != 'error'
           AND (LOWER(title) LIKE ? OR LOWER(original_filename) LIKE ?)
         ORDER BY
           CASE WHEN LOWER(COALESCE(title, original_filename)) LIKE ? THEN 0 ELSE 1 END,
           updated_at DESC
         LIMIT 8`,
      )
      .all(pattern, pattern, q + '%') as { id: string; text: string }[];

    // Tag matches: individual tag values from JSON arrays
    const tagRows = sqlite
      .prepare(
        `SELECT DISTINCT value AS text
         FROM assets, json_each(assets.tags)
         WHERE LOWER(value) LIKE ?
         ORDER BY
           CASE WHEN LOWER(value) LIKE ? THEN 0 ELSE 1 END,
           value
         LIMIT 4`,
      )
      .all(pattern, q + '%') as { text: string }[];

    const suggestions: Suggestion[] = [
      ...assetRows.map((r) => ({ type: 'asset' as const, id: r.id, text: r.text })),
      ...tagRows.map((r) => ({ type: 'tag' as const, id: null, text: r.text })),
    ];

    // Deduplicate: if a tag text matches an asset text exactly, drop the tag
    const assetTexts = new Set(assetRows.map((r) => r.text.toLowerCase()));
    const deduped = suggestions.filter(
      (s) => s.type === 'asset' || !assetTexts.has(s.text.toLowerCase()),
    );

    return { suggestions: deduped.slice(0, 10) };
  });
}
```

- [ ] **Step 2: Register the route in index.ts**

In `backend/src/index.ts`, add the import at line 15 (after the search import):

```ts
import { suggestRoutes } from './routes/suggest.js';
```

Add registration after the search routes line (after line 75):

```ts
  // 6d. Register suggest routes (autocomplete via SQLite)
  await server.register(suggestRoutes);
```

- [ ] **Step 3: Verify backend compiles**

Run: `cd backend && npm run build`
Expected: No errors.

- [ ] **Step 4: Manual smoke test**

Run: `cd backend && npm run dev`
In another terminal: `curl -b <session-cookie> 'http://localhost:3001/api/suggest?q=te'`
Expected: JSON response with `suggestions` array (may be empty if no assets match — that's fine).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/suggest.ts backend/src/index.ts
git commit -m "feat: add /api/suggest endpoint — SQLite autocomplete for titles and tags"
```

---

### Task 2: Frontend — API Function

**Files:**
- Modify: `frontend/src/lib/api.ts` (append after `searchAssets`)

- [ ] **Step 1: Add the Suggestion type and fetch function**

Append to `frontend/src/lib/api.ts` after the `searchAssets` function (before the `// Auth functions` comment at line 121):

```ts
export interface Suggestion {
  type: 'asset' | 'tag';
  id: string | null;
  text: string;
}

export async function fetchSuggestions(
  q: string,
  signal?: AbortSignal,
): Promise<Suggestion[]> {
  const res = await fetch(
    `${API_BASE}/suggest?q=${encodeURIComponent(q)}`,
    { credentials: 'include', signal },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.suggestions ?? [];
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add fetchSuggestions API function"
```

---

### Task 3: Frontend — useSuggest Hook

**Files:**
- Create: `frontend/src/hooks/useSuggest.ts`

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/useSuggest.ts`:

```ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchSuggestions, type Suggestion } from '../lib/api';

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

export function useSuggest(query: string) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const cacheRef = useRef(new Map<string, Suggestion[]>());
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim().toLowerCase();

    // Below minimum — clear and bail
    if (trimmed.length < MIN_CHARS) {
      clearPending();
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    // Cache hit — return instantly
    const cached = cacheRef.current.get(trimmed);
    if (cached) {
      clearPending();
      setSuggestions(cached);
      setIsLoading(false);
      return;
    }

    // Debounce the API call
    clearPending();
    setIsLoading(true);

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const results = await fetchSuggestions(trimmed, controller.signal);
        cacheRef.current.set(trimmed, results);
        setSuggestions(results);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return clearPending;
  }, [query, clearPending]);

  return { suggestions, isLoading };
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useSuggest.ts
git commit -m "feat: add useSuggest hook — debounce, abort, session cache"
```

---

### Task 4: Frontend — Wire Suggestions Into TopBar

**Files:**
- Modify: `frontend/src/components/layout/TopBar.tsx`

This task replaces the client-side asset filter with the `useSuggest` hook, adds loading/empty states, match highlighting, and keyboard navigation.

- [ ] **Step 1: Add imports**

In `TopBar.tsx`, add to the existing lucide import:

```ts
import { Search, X, Upload, Settings, Video, Library, LayoutGrid, List, LogOut, Tag, Loader2 } from 'lucide-react';
```

Add the hook import after the existing imports:

```ts
import { useSuggest } from '../../hooks/useSuggest';
```

- [ ] **Step 2: Replace client-side filter with hook + add keyboard state**

Inside the `TopBar` component function, find and remove the client-side filter block (lines ~105-112):

```ts
  // Filter assets by input for suggestions
  const suggestions = expanded && assets
    ? assets.filter((a) => {
        if (!inputValue.trim()) return true;
        const q = inputValue.toLowerCase();
        return (a.title || a.originalFilename).toLowerCase().includes(q);
      }).slice(0, 6)
    : [];

  const showDropdown = expanded;
```

Replace with:

```ts
  const { suggestions: apiSuggestions, isLoading: suggestLoading } = useSuggest(
    expanded ? inputValue : '',
  );
  const [highlightIndex, setHighlightIndex] = useState(-1);

  // Reset highlight when suggestions change
  useEffect(() => { setHighlightIndex(-1); }, [apiSuggestions]);

  const showDropdown = expanded;
```

Also remove the `useAssets` import and the `const { data: assets } = useAssets();` line (around line 44) since the client-side filter no longer needs the full asset list.

- [ ] **Step 3: Add keyboard navigation handler**

Replace the existing `onKeyDown` on the input (line ~161):

```ts
onKeyDown={(e) => { if (e.key === 'Escape') setExpanded(false); }}
```

With:

```ts
onKeyDown={(e) => {
  if (e.key === 'Escape') {
    setExpanded(false);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    setHighlightIndex((i) =>
      i < apiSuggestions.length - 1 ? i + 1 : 0,
    );
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setHighlightIndex((i) =>
      i > 0 ? i - 1 : apiSuggestions.length - 1,
    );
  } else if (e.key === 'Enter' && highlightIndex >= 0) {
    e.preventDefault();
    const picked = apiSuggestions[highlightIndex];
    if (picked.type === 'asset' && picked.id) {
      handleSelectAsset(picked.id);
    } else {
      setInputValue(picked.text);
      onSearch(picked.text);
      setExpanded(false);
    }
  }
}}
```

- [ ] **Step 4: Add highlight helper function**

Add this helper inside the component, before the return statement:

```ts
  /** Bold the substring that matches the query */
  const highlightMatch = (text: string) => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="text-text font-semibold">{text.slice(idx, idx + q.length)}</span>
        {text.slice(idx + q.length)}
      </>
    );
  };
```

- [ ] **Step 5: Replace the suggestion rendering section**

Find the `{/* Asset suggestions */}` block (lines ~204-221) and replace it entirely:

```tsx
                  {/* Suggestions */}
                  {inputValue.trim().length >= 2 && (
                    <div className="px-sm pb-sm border-t border-glass-border mt-xs pt-sm">
                      <div className="text-[9px] font-semibold text-text-dim uppercase tracking-wider mb-xs flex items-center gap-xs">
                        {suggestLoading ? (
                          <>
                            <Loader2 size={10} className="animate-spin" />
                            Searching...
                          </>
                        ) : apiSuggestions.length > 0 ? (
                          `${apiSuggestions.length} match${apiSuggestions.length === 1 ? '' : 'es'}`
                        ) : (
                          `No matches for "${inputValue.trim()}"`
                        )}
                      </div>
                      {apiSuggestions.map((s, i) => (
                        <button
                          key={s.type + (s.id ?? s.text)}
                          onClick={() => {
                            if (s.type === 'asset' && s.id) {
                              handleSelectAsset(s.id);
                            } else {
                              setInputValue(s.text);
                              onSearch(s.text);
                              setExpanded(false);
                            }
                          }}
                          className={`w-full flex items-center gap-sm px-sm py-xs text-xs text-text-muted hover:bg-glass-hover hover:text-text rounded-md transition-colors ${
                            i === highlightIndex ? 'bg-glass-hover text-text' : ''
                          }`}
                        >
                          {s.type === 'asset' ? (
                            <Video size={13} className="opacity-50 shrink-0" />
                          ) : (
                            <Tag size={13} className="opacity-50 shrink-0" />
                          )}
                          <span className="truncate">{highlightMatch(s.text)}</span>
                        </button>
                      ))}
                    </div>
                  )}
```

- [ ] **Step 6: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/layout/TopBar.tsx
git commit -m "feat: wire useSuggest into TopBar — live autocomplete with keyboard nav"
```

---

### Task 5: Integration Test

**Files:**
- Modify: `frontend/src/components/layout/TopBar.tsx` (only if issues found)
- Modify: `backend/src/routes/suggest.ts` (only if issues found)

- [ ] **Step 1: Build backend**

Run: `cd backend && npm run build`
Expected: No errors.

- [ ] **Step 2: Build frontend**

Run: `cd frontend && npm run build`
Expected: No errors.

- [ ] **Step 3: Manual end-to-end test**

With both servers running:
1. Open `http://localhost:5173`
2. Log in
3. Click search bar or press Ctrl+K
4. Type a single character — verify no suggestions appear yet
5. Type 2+ characters matching an asset title — verify suggestions appear after ~300ms with a loading spinner
6. Verify matched text is bolded in suggestions
7. Verify tag suggestions show a tag icon, asset suggestions show a video icon
8. Press Arrow Down / Arrow Up — verify highlight moves
9. Press Enter on a highlighted asset — verify navigation to detail panel
10. Press Enter on a highlighted tag — verify it fills the search input and triggers search
11. Press Escape — verify dropdown closes
12. Type the same query again — verify results appear instantly (cached, no loading spinner)
13. Type something with no matches — verify "No matches" message appears

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: search autocomplete integration fixes"
```
