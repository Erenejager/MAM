# Phase 5: Transcript Viewer - Research

**Researched:** 2026-03-30
**Domain:** React UI — tab layout, text search/highlight, transcript sync
**Confidence:** HIGH

## Summary

Phase 5 enhances the existing transcript viewer with a tab-based layout, in-transcript search with match highlighting, and full-height transcript panel. The existing `TranscriptList.tsx` already implements segment fetching, active segment highlighting, click-to-seek, and auto-scroll. The work is purely frontend refactoring and feature addition — no backend changes required.

The primary challenge is refactoring `DetailPanel.tsx` to introduce a tab system (Info vs Transcript) while preserving the shared `videoRef` across tab switches, and adding a text search system with match navigation inside the transcript. All libraries needed are already installed (React 18, Lucide, Tailwind 3). No new dependencies are required.

**Primary recommendation:** Refactor `DetailPanel.tsx` to add tab state management, extract transcript into its own tab panel with full remaining height, and build the search/highlight system as a custom hook (`useTranscriptSearch`) that wraps the existing segment data.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Tab layout: "Info" and "Transcript" tabs below video player, default to "Info"
- Video player stays pinned above tabs regardless of active tab
- Active segment highlighting: 2px CTA left border + CTA/20 background tint (existing style, no karaoke)
- Segment density: text-sm, py-2, timestamps on every segment (existing compact style)
- Search: input at top of Transcript tab, highlights matching words (all segments remain visible), match count, up/down navigation
- Segment grouping: flat list, no paragraphs/chapters/collapsing
- Tab content switches immediately (no slide animation)

### Claude's Discretion
- Search input styling (icon, placeholder text, clear button)
- Match highlight color (suggest amber/yellow for visibility against Cinema Dark)
- Tab component styling (underline vs pill vs border)
- Keyboard shortcut for focusing search
- Transition animation between tabs

### Deferred Ideas (OUT OF SCOPE)
- Transcript export as SRT or plain text (PLAY-V2-01 equivalent)
- Speaker diarization / speaker labels
- Waveform visualization synced with transcript
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLAY-02 | User can view a scrollable transcript with timestamps alongside the player | Existing TranscriptList already renders segments with timestamps; refactor into tab layout with full-height panel removes the max-h-[40vh] cap |
| PLAY-03 | User can click a transcript line to seek the player to that timestamp | Already implemented in TranscriptList.handleSeek(); must be preserved through refactoring and search enhancement |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^18.3.0 | UI framework | Project standard |
| Tailwind CSS | 3.x | Styling | Project standard, locked (no v4) |
| Lucide React | ^1.6.0 | Icons (Search, X, ChevronUp, ChevronDown) | Already used project-wide |
| TypeScript | ESM | Type safety | Project standard |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Framer Motion | ^12.38.0 | Tab transitions (optional) | Only if tab switch animation desired — CONTEXT says immediate switch |
| TanStack Query | ^5.95.2 | Data fetching | TranscriptList currently uses plain fetch — migration optional |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-built tabs | Radix Tabs / Headless UI | Not worth adding a dependency for 2 tabs — ARIA is straightforward to implement manually |
| Custom search highlight | mark.js / react-highlight-words | Overkill — simple string split/match is sufficient for local transcript search |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Component Structure
```
frontend/src/components/detail/
  DetailPanel.tsx          # Add tab state, restructure layout
  TranscriptList.tsx       # Refactor: remove status states, accept segments as prop
  TranscriptSearch.tsx     # NEW: search input + match navigation controls
  TranscriptSegment.tsx    # NEW (optional): extracted segment button with highlight support
  MetadataSection.tsx      # Unchanged
  CustomFieldsSection.tsx  # Unchanged
  VideoPlayer.tsx          # Unchanged

frontend/src/hooks/
  useTranscriptSearch.ts   # NEW: search logic, match indices, navigation
```

### Pattern 1: Tab State in DetailPanel
**What:** Local `useState<'info' | 'transcript'>('info')` in DetailPanel controls which tab content renders. VideoPlayer renders above the tab bar in both states. Tab content uses conditional rendering (not unmount/remount).
**When to use:** Always — this is the locked decision.
**Example:**
```typescript
const [activeTab, setActiveTab] = useState<'info' | 'transcript'>('info');

return (
  <div className="h-full flex flex-col bg-panel">
    {/* Header with close button */}
    <div className="overflow-y-auto flex-1 flex flex-col">
      <div className="p-4 shrink-0">
        <VideoPlayer asset={asset} videoRef={videoRef} />
      </div>
      {/* Tab bar */}
      <div role="tablist" className="flex border-b border-border px-4 shrink-0">
        <button role="tab" aria-selected={activeTab === 'info'} ...>Info</button>
        <button role="tab" aria-selected={activeTab === 'transcript'} ...>Transcript</button>
      </div>
      {/* Tab content */}
      <div role="tabpanel" className="flex-1 flex flex-col min-h-0">
        {activeTab === 'info' ? (
          <div className="p-4 flex flex-col gap-6 overflow-y-auto">
            <MetadataSection ... />
            <CustomFieldsSection ... />
          </div>
        ) : (
          <TranscriptPanel asset={asset} videoRef={videoRef} />
        )}
      </div>
    </div>
  </div>
);
```

### Pattern 2: Search with Text Highlighting via `<mark>`
**What:** Split segment text by search query to produce alternating text/match spans. Wrap matches in `<mark>` elements with amber highlight classes. Track all match positions for navigation.
**When to use:** When search input has a value.
**Example:**
```typescript
function highlightText(text: string, query: string, matchIndices: { segIdx: number; matchIdx: number }, currentMatch: number) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
  return parts.map((part, i) => {
    if (part.toLowerCase() === query.toLowerCase()) {
      const isCurrentMatch = /* check global match index */;
      return (
        <mark key={i} className={cn(
          'rounded-sm px-0.5',
          isCurrentMatch
            ? 'bg-amber-500/50 text-amber-100'
            : 'bg-amber-500/30 text-amber-200'
        )}>{part}</mark>
      );
    }
    return part;
  });
}
```

### Pattern 3: useTranscriptSearch Hook
**What:** Custom hook encapsulating search state, match computation, and navigation.
**When to use:** Inside the transcript tab panel.
**Example:**
```typescript
interface UseTranscriptSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  matches: Array<{ segmentIndex: number; matchIndex: number }>;
  currentMatchIdx: number;
  goToNext: () => void;
  goToPrev: () => void;
  totalMatches: number;
}

function useTranscriptSearch(segments: TranscriptSegment[]): UseTranscriptSearchReturn {
  const [query, setQuery] = useState('');
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const result: Array<{ segmentIndex: number; matchIndex: number }> = [];
    const lowerQuery = query.toLowerCase();
    segments.forEach((seg, segIdx) => {
      const text = seg.text.toLowerCase();
      let startPos = 0;
      let matchInSeg = 0;
      while ((startPos = text.indexOf(lowerQuery, startPos)) !== -1) {
        result.push({ segmentIndex: segIdx, matchIndex: matchInSeg });
        startPos += lowerQuery.length;
        matchInSeg++;
      }
    });
    return result;
  }, [segments, query]);

  // Reset current match when query changes
  useEffect(() => { setCurrentMatchIdx(0); }, [query]);

  const goToNext = () => setCurrentMatchIdx(i => (i + 1) % matches.length);
  const goToPrev = () => setCurrentMatchIdx(i => (i - 1 + matches.length) % matches.length);

  return { query, setQuery, matches, currentMatchIdx, goToNext, goToPrev, totalMatches: matches.length };
}
```

### Pattern 4: Auto-scroll Priority Management
**What:** Two competing auto-scroll sources: (1) active segment during playback, (2) current match during search navigation. Search navigation should take priority when the user is actively navigating matches.
**When to use:** Always in the transcript panel.
**Implementation:** Use a ref (`userNavigating`) that is set to `true` when search navigation occurs and reset after a timeout (e.g., 3 seconds) or when video playback resumes without user interaction.

### Anti-Patterns to Avoid
- **Unmounting VideoPlayer on tab switch:** This would destroy the video element and lose playback state. VideoPlayer must render above the tab bar, always mounted.
- **Using `dangerouslySetInnerHTML` for highlight:** Split-and-map with React elements is safer and avoids XSS.
- **Regex without escaping:** Search query must be escaped before use in `RegExp` — special characters like `(`, `)`, `.` would break the split.
- **Debouncing local search:** The UI-SPEC says "debounce not required for local string matching" — this is correct since it is a simple in-memory string search over a finite segment list. Do not add debounce.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab ARIA behavior | Custom ARIA from scratch | Follow WAI-ARIA Tabs Pattern | Keyboard nav (arrow keys, Home/End) has specific expectations |
| Regex escaping | Manual character replacement | `escapeRegex()` utility function | Edge cases with special chars; standard 1-liner |
| Scroll into view | Custom scroll offset calculations | `scrollIntoView({ block: 'nearest', behavior: 'smooth' })` | Native browser API handles all edge cases |

**Key insight:** This phase has no complex problems requiring external libraries. The tab system is 2 tabs with straightforward ARIA. The search is local string matching. All primitives exist in React and the browser.

## Common Pitfalls

### Pitfall 1: VideoPlayer Unmount on Tab Switch
**What goes wrong:** If VideoPlayer is rendered inside the tab content area, switching tabs unmounts it, losing playback position and requiring re-buffering.
**Why it happens:** Natural instinct to put everything inside tab panels.
**How to avoid:** Render VideoPlayer ABOVE the tab bar, outside any conditional rendering. The tab bar and tab panels go below the video.
**Warning signs:** Video restarts when switching tabs.

### Pitfall 2: Stale videoRef After Tab Switch
**What goes wrong:** If the transcript tab re-mounts TranscriptList, the `timeupdate` event listener may reference stale segments or the effect may not re-attach.
**Why it happens:** React re-runs effects on mount but the video element is the same ref.
**How to avoid:** Keep TranscriptList mounted but visually hidden (e.g., `display: none` or conditional rendering with preserved state via a parent hook). Alternatively, lift segment fetching and sync logic to the parent so TranscriptList receives segments as props.
**Warning signs:** Active segment highlighting stops working after tab switch.

### Pitfall 3: Mark Element Default Styling
**What goes wrong:** `<mark>` has browser-default yellow background that clashes with Cinema Dark theme.
**Why it happens:** Forgetting to override native mark styles.
**How to avoid:** Add `mark { background: transparent; color: inherit; }` to `index.css` as specified in the UI-SPEC, then apply Tailwind classes.
**Warning signs:** Bright yellow rectangles instead of subtle amber tint.

### Pitfall 4: Search Match Index Tracking Across Segments
**What goes wrong:** Match navigation (next/prev) skips matches or navigates to wrong segment because match indices are computed per-segment but navigation is global.
**Why it happens:** Conflating per-segment match index with global match index.
**How to avoid:** Build a flat array of all matches with both `segmentIndex` and within-segment `matchIndex`. The `currentMatchIdx` indexes into this flat array.
**Warning signs:** "3 of 12" counter but clicking next jumps to wrong segment.

### Pitfall 5: Layout Height — Transcript Not Filling Panel
**What goes wrong:** Transcript panel doesn't fill remaining height, leaving dead space or not scrolling properly.
**Why it happens:** Missing `flex-1 min-h-0` on the tab content container. Without `min-h-0`, flex children with overflow won't shrink properly.
**How to avoid:** The flex column chain must be: `h-full flex flex-col` on outer container, `flex-1 min-h-0 overflow-y-auto` on the transcript scroll container.
**Warning signs:** Transcript either overflows the panel or has a fixed height with empty space below.

### Pitfall 6: Auto-scroll Fighting User During Search
**What goes wrong:** User navigates to a search match, but the `timeupdate` handler immediately scrolls back to the active segment.
**Why it happens:** Both auto-scroll effects running simultaneously.
**How to avoid:** Implement scroll priority — when user triggers search navigation, suppress playback auto-scroll for a brief period (use a ref flag).
**Warning signs:** Transcript jumps back and forth between match and active segment.

## Code Examples

### Regex Escape Utility
```typescript
// Source: Standard practice
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

### WAI-ARIA Tab Keyboard Navigation
```typescript
// Source: WAI-ARIA Authoring Practices — Tabs Pattern
function handleTabKeyDown(e: React.KeyboardEvent, tabs: string[], activeTab: string, setActiveTab: (t: string) => void) {
  const currentIdx = tabs.indexOf(activeTab);
  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault();
      setActiveTab(tabs[(currentIdx + 1) % tabs.length]);
      break;
    case 'ArrowLeft':
      e.preventDefault();
      setActiveTab(tabs[(currentIdx - 1 + tabs.length) % tabs.length]);
      break;
    case 'Home':
      e.preventDefault();
      setActiveTab(tabs[0]);
      break;
    case 'End':
      e.preventDefault();
      setActiveTab(tabs[tabs.length - 1]);
      break;
  }
}
```

### CSS Reset for Mark Element
```css
/* Add to index.css */
mark {
  background: transparent;
  color: inherit;
}
```

### Sticky Search Input Inside Scroll Container
```typescript
<div className="flex-1 min-h-0 overflow-y-auto">
  <div className="sticky top-0 z-10 bg-panel pb-2 px-4 pt-2">
    <TranscriptSearch ... />
  </div>
  <div ref={listRef}>
    {segments.map((seg, i) => (
      <TranscriptSegment key={i} ... />
    ))}
  </div>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `max-h-[40vh]` transcript cap | `flex-1` full remaining height | This phase | Transcript gets proper space |
| All content in single scroll | Tab-based layout | This phase | Cleaner separation of Info vs Transcript |
| No in-transcript search | Local text search with highlights | This phase | Users can find specific spoken words |

**Deprecated/outdated:**
- None — this phase builds on stable React 18 patterns with no library changes.

## Open Questions

1. **TranscriptList data fetching: keep plain fetch or migrate to TanStack Query?**
   - What we know: TranscriptList uses `useEffect` + `fetch`. All other data fetching uses TanStack Query.
   - What's unclear: Whether consistency matters enough to refactor.
   - Recommendation: Keep plain fetch — it works, the transcript JSON is static per asset, and migration adds no user-facing benefit. Claude's discretion per CONTEXT.md.

2. **Should TranscriptList stay mounted when Info tab is active?**
   - What we know: If unmounted, segments must be re-fetched (or lifted to parent). If mounted but hidden, DOM is larger.
   - What's unclear: Whether re-fetch is noticeable (transcript.json is small and likely cached).
   - Recommendation: Lift segment fetching to the parent (DetailPanel or a shared hook). TranscriptList receives segments as props. This avoids both re-fetch and hidden DOM concerns.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (backend only currently) |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx vitest run` |
| Full suite command | `cd backend && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAY-02 | Scrollable transcript with timestamps alongside player | manual-only | Visual verification in browser | N/A |
| PLAY-03 | Click transcript line to seek video | manual-only | Visual verification in browser | N/A |

**Manual-only justification:** Both requirements are pure frontend UI behaviors (DOM layout, scroll behavior, video seek via click). The project has no frontend test infrastructure (no vitest/jest for React components, no Playwright/Cypress for E2E). Adding frontend test infra is out of scope for this phase.

### Sampling Rate
- **Per task commit:** Visual verification in dev browser — video plays, tabs switch, search highlights work
- **Per wave merge:** Full manual walkthrough of all interaction states
- **Phase gate:** All 3 success criteria verified manually (scrollable transcript with timecodes, click-to-seek, active segment highlighting)

### Wave 0 Gaps
None — this phase is purely frontend UI with no testable backend logic. Manual verification is appropriate given the project's current test infrastructure.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `TranscriptList.tsx`, `DetailPanel.tsx`, `VideoPlayer.tsx`, `asset.ts` — direct code inspection
- `CLAUDE.md` — project architecture and constraints
- `05-CONTEXT.md` — locked user decisions
- `05-UI-SPEC.md` — complete visual/interaction specification

### Secondary (MEDIUM confidence)
- WAI-ARIA Authoring Practices Tabs Pattern — well-established accessibility standard
- React 18 documentation — hooks, refs, conditional rendering patterns

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and verified in package.json
- Architecture: HIGH — existing code is fully inspected, refactoring path is clear
- Pitfalls: HIGH — derived from actual code inspection (videoRef sharing, max-h cap, mark styling)

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable — no moving parts, all frontend React 18 + Tailwind 3)
