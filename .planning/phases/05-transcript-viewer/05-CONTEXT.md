# Phase 5: Transcript Viewer - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Enhance the existing transcript viewer so users can read the full transcript alongside the player and navigate the video by clicking any spoken line. Add a tab-based layout, in-transcript search, and production polish. Requirements: PLAY-02 (scrollable transcript with timestamps), PLAY-03 (click to seek).

Note: Full-text search across all assets is Phase 6 (SRCH-02). This phase covers only in-transcript search within a single asset's detail panel.

</domain>

<decisions>
## Implementation Decisions

### Transcript layout
- Add a tab/toggle below the video player: "Info" (metadata + custom fields) and "Transcript"
- When "Transcript" tab is active, transcript gets the full remaining panel height (no max-h-[40vh] cap)
- When "Info" tab is active, show current metadata/custom fields layout (transcript hidden)
- Video player stays pinned at top of panel regardless of active tab
- Default tab: "Info" (user switches to "Transcript" when they want it)

### Active segment highlighting
- Keep current style: 2px CTA left border + CTA/20 background tint on active segment
- No karaoke-style word-level highlighting

### Segment density
- Keep current compact style: text-sm, py-2 padding
- Timestamps on every segment (font-mono text-xs, left of text)

### Search within transcript
- Search input field at the top of the Transcript tab (only visible when Transcript tab is active)
- Typing filters by highlighting matching segments — all segments remain visible
- Matched words get a yellow/accent highlight within the segment text
- Match count displayed (e.g., "3 of 12 matches")
- Up/down arrows or Enter to jump between matches (scroll to next match)
- Clicking a highlighted match segment still seeks the video (existing behavior preserved)

### Segment grouping
- Flat list — no paragraph breaks, no chapters, no collapsing
- Simple continuous scroll with auto-scroll to active segment (existing behavior)

### Claude's Discretion
- Search input styling (icon, placeholder text, clear button)
- Match highlight color (suggest amber/yellow for visibility against Cinema Dark)
- Tab component styling (underline vs pill vs border)
- Keyboard shortcut for focusing search (e.g., Ctrl+F intercept or just clicking)
- Transition animation between tabs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing transcript implementation
- `frontend/src/components/detail/TranscriptList.tsx` — Current transcript component with sync, seek, auto-scroll, status states
- `frontend/src/components/detail/DetailPanel.tsx` — Panel layout, tab placement location (between VideoPlayer and content)
- `frontend/src/types/asset.ts` — TranscriptSegment interface (text, start, end fields)

### Design system
- `design-system/mam/MASTER.md` — Cinema Dark colors, typography, component patterns
- `CLAUDE.md` — Video player uses native `<video>`, transcript sync via `timeupdate` event

### Backend transcript format
- `backend/src/lib/pipeline.ts` — Groq transcription output format (segments array with start/end/text)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TranscriptList.tsx`: Full transcript component — fetch, sync, seek, auto-scroll, status states. Needs refactoring into tab + search, not rewrite.
- `DetailPanel.tsx`: Currently renders VideoPlayer → MetadataSection → CustomFieldsSection → TranscriptList in a single scroll. Tab logic goes here.
- `formatTimecode()` in `lib/formatters.ts`: Already used by TranscriptList for segment timestamps.
- `cn()` in `lib/cn.ts`: Class merge utility for conditional styles.

### Established Patterns
- TanStack Query for data fetching (but TranscriptList uses plain fetch — keep or migrate is Claude's choice)
- Framer Motion for animations (available for tab transitions)
- Lucide icons (Search icon available)

### Integration Points
- `DetailPanel.tsx` line 55-61: Tab logic inserts between VideoPlayer and the content area
- `videoRef` shared between VideoPlayer and TranscriptList — must be preserved across tab switches
- `useAsset` hook in DetailPanel already provides the asset data

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for tab components and search highlighting.

</specifics>

<deferred>
## Deferred Ideas

- Transcript export as SRT or plain text (PLAY-V2-01 equivalent — future phase)
- Speaker diarization / speaker labels (requires Groq model change)
- Waveform visualization synced with transcript (EXP-V2-01)

</deferred>

---

*Phase: 05-transcript-viewer*
*Context gathered: 2026-03-30*
