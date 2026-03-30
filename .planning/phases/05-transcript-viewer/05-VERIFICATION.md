---
phase: 05-transcript-viewer
verified: 2026-03-30T14:30:00Z
status: human_needed
score: 6/6 must-haves verified
re_verification: false
human_verification:
  - test: "Play video and watch Transcript tab — active segment highlights with red left border"
    expected: "The currently-playing segment shows bg-cta/20 background and border-l-2 border-cta; list auto-scrolls to keep it in view"
    why_human: "Requires live video playback and timeupdate event firing; cannot verify visually via static analysis"
  - test: "Click Info tab while video is playing, then click Transcript tab"
    expected: "Video continues playing without interruption or seek reset; transcript tab reattaches to same videoRef"
    why_human: "React unmount/remount behavior and videoRef persistence across conditional rendering requires runtime observation"
  - test: "Type a search term, then use Up/Down arrow buttons and Enter/Shift+Enter"
    expected: "Current match has stronger amber highlight (bg-amber-500/50); transcript scrolls to match position; 3-second window suppresses playback auto-scroll"
    why_human: "Scroll priority management via userNavigatingRef timeout and visual amber intensity difference require runtime verification"
  - test: "Open asset with pending or failed transcription, click Transcript tab"
    expected: "Pending shows animated dot + 'Transcription pending...'; failed shows 'Transcription failed' with error message if present"
    why_human: "Depends on real asset transcription status in database; requires running app with seeded data"
---

# Phase 5: Transcript Viewer Verification Report

**Phase Goal:** Transcript viewer — scrollable panel alongside video, timestamped segments, click-to-seek, keyword search within transcript
**Verified:** 2026-03-30T14:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can see a scrollable transcript panel with timecodes alongside the video player | VERIFIED | TranscriptList renders `overflow-y-auto flex-1` container; VideoPlayer rendered above tablist in DetailPanel; segments display `formatTimecode(seg.start)` per row |
| 2 | User can click any transcript segment to seek the video to that timestamp | VERIFIED | `handleSeek` sets `videoRef.current.currentTime = start`; each segment is a `<button onClick={() => handleSeek(seg.start)}>` |
| 3 | Currently-playing transcript segment is visually highlighted with CTA left border | VERIFIED (human confirm) | Active index logic present: `i === activeIndex ? 'bg-cta/20 text-text border-l-2 border-cta'`; timeupdate handler sets activeIndex; runtime behavior needs human check |
| 4 | User can switch between Info and Transcript tabs without losing video playback state | VERIFIED (human confirm) | VideoPlayer rendered outside conditional tab panels (inside `shrink-0` div before tablist); videoRef created in DetailPanel and passed down; transcript fetch lifted to parent — runtime tab-switch must be confirmed by human |
| 5 | User can search within the transcript and see matching words highlighted in amber | VERIFIED | `highlightText()` uses `escapeRegex` + `split(RegExp)` + `<mark>` elements with `bg-amber-500/30` (non-current) and `bg-amber-500/50` (current); `index.css` resets native mark styling |
| 6 | User can navigate between search matches with up/down arrows and Enter/Shift+Enter | VERIFIED | ChevronUp/ChevronDown buttons call `onPrev`/`onNext`; `handleKeyDown` in TranscriptSearch calls `onPrev` on Shift+Enter and `onNext` on Enter; `useTranscriptSearch` implements modular index wrap-around |

**Score:** 6/6 truths verified (4 fully automated, 2 require human runtime confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/lib/escapeRegex.ts` | Regex escape utility | VERIFIED | Exports `escapeRegex`, 3 lines, substantive implementation |
| `frontend/src/hooks/useTranscriptSearch.ts` | Search state, match computation, navigation | VERIFIED | Exports `useTranscriptSearch` and `UseTranscriptSearchReturn`; uses `useMemo` with `indexOf` loop; `goToNext`/`goToPrev` with wrap-around; `useEffect` resets index on query change |
| `frontend/src/components/detail/TranscriptSearch.tsx` | Search input UI with counter and arrows | VERIFIED | Exports `TranscriptSearch`; has `aria-label="Search transcript"`, match counter, ChevronUp/ChevronDown, Clear button, keyboard handler |
| `frontend/src/components/detail/DetailPanel.tsx` | Tab bar with video pinned above | VERIFIED | `role="tablist"` present; `useState<'info' \| 'transcript'>('info')`; ARIA attributes on tabs; VideoPlayer outside conditional rendering; transcript fetch lifted here |
| `frontend/src/components/detail/TranscriptList.tsx` | Segment list with search highlight | VERIFIED | Contains `<mark` elements; `bg-amber-500/30` and `bg-amber-500/50`; `useTranscriptSearch` hook integrated; `segments: TranscriptSegment[]` prop; no `max-h-[40vh]` |
| `frontend/src/index.css` | mark CSS reset | VERIFIED | `mark { background: transparent; color: inherit; }` present at line 36 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `DetailPanel.tsx` | `TranscriptList.tsx` | `segments={segments}` prop | WIRED | Line 154: `segments={segments}` passed from parent's lifted fetch state; `loading={transcriptLoading}` also passed |
| `TranscriptList.tsx` | `useTranscriptSearch.ts` | `useTranscriptSearch` hook call | WIRED | Line 5 import; line 59 destructured call: `const { query, setQuery, matches, currentMatchIdx, goToNext, goToPrev, totalMatches } = useTranscriptSearch(segments)` |
| `TranscriptList.tsx` | `videoRef.current.currentTime` | click handler | WIRED | Line 107: `videoRef.current.currentTime = start` inside `handleSeek`; each segment button calls `onClick={() => handleSeek(seg.start)}` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PLAY-02 | 05-01-PLAN.md | User can view a scrollable transcript with timestamps alongside the player | SATISFIED | Full-height scroll container (`overflow-y-auto flex-1`); `formatTimecode(seg.start)` per segment; tab layout with video pinned; no 40vh cap |
| PLAY-03 | 05-01-PLAN.md | User can click a transcript line to seek the player to that timestamp | SATISFIED | `handleSeek` sets `videoRef.current.currentTime`; every segment button wired to it |

No orphaned requirements: REQUIREMENTS.md traceability table maps only PLAY-02 and PLAY-03 to Phase 5, both covered.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `TranscriptSearch.tsx` | 37, 41 | `placeholder` attribute text | Info | HTML `placeholder` attribute — not a stub pattern, legitimate UI text |
| `useTranscriptSearch.ts` | 20 | `return []` | Info | Legitimate early-return for empty query — not an empty implementation |

No blockers found. No stub implementations. No unconnected state. TypeScript compilation passes with zero errors (verified via `tsc --noEmit`).

### Human Verification Required

#### 1. Active Segment Highlight During Playback

**Test:** Open an asset with a completed transcript, click the Transcript tab, start playing the video.
**Expected:** The segment matching the current playback position shows a red left border (`border-l-2 border-cta`) and tinted background (`bg-cta/20`); as the video plays, the highlighted segment changes and the list auto-scrolls to keep it visible.
**Why human:** Requires live timeupdate events from HTMLVideoElement; static analysis confirms the handler is wired but cannot verify it fires correctly or that the activeIndex update triggers visible re-render in the DOM.

#### 2. Tab Switch Preserves Video Playback

**Test:** Start playing a video in the detail panel, switch to the Info tab, then back to the Transcript tab.
**Expected:** Video continues playing without interruption; playback position is not reset; Transcript tab reattaches to the same videoRef and resumes showing the active segment.
**Why human:** VideoPlayer is rendered outside the conditional tab panels in the JSX, but React's reconciliation behavior across conditional siblings cannot be fully verified statically. Runtime observation needed.

#### 3. Search Match Navigation with Scroll Priority

**Test:** While video is playing, type a search word in the transcript search box. Use the Up/Down arrows to cycle through matches.
**Expected:** Each navigation press scrolls the transcript to the matched segment; the current match shows brighter amber highlight (`bg-amber-500/50`) vs other matches (`bg-amber-500/30`); playback auto-scroll does not override search scroll for at least 3 seconds after last navigation action.
**Why human:** Scroll priority management uses a 3-second timeout on `userNavigatingRef` — the competing scroll sources and the suppression window require real-time interaction to confirm.

#### 4. Transcription Status Messages in Transcript Tab

**Test:** Open an asset whose transcription is `pending` or `failed`, click the Transcript tab.
**Expected:** Pending shows an animated dot and "Transcription pending..."; failed shows "Transcription failed" with the error string if one is stored.
**Why human:** Requires database entries in specific states; cannot be verified without a running instance with seeded data.

### Gaps Summary

No gaps. All six observable truths are satisfied by substantive, wired implementations. Both requirements (PLAY-02, PLAY-03) have clear implementation evidence. TypeScript compiles cleanly. The four human verification items are runtime/visual checks that are structurally correct — they are not blockers, just confirmations.

Commit trail matches SUMMARY claims: `274175a` (Task 1) and `ded9c9e` (Task 2) both exist in git log.

---

_Verified: 2026-03-30T14:30:00Z_
_Verifier: Claude (gsd-verifier)_
