# OCR Pipeline Redesign: Specialized Passes with Structured Score Extraction

**Date:** 2026-04-07
**Status:** Draft
**Context:** The current OCR pipeline delegates too many jobs to each LLM call. The vision pass returns free-text scores, and a blind curation pass tries to structure them. This redesign separates scoreboard reading from event classification within a single merged vision call, adds per-frame score consensus, and simplifies all downstream stages.

## Problem

The current pipeline has a structural flaw: the LLM that sees the frames (`analyzeFrames`) returns scores as free-text strings (`"6-3, 5-3, 40-15"`). The curation LLM (`curateKeyMoments`) — which never sees any frames — is then responsible for parsing those strings into structured data (`sets: [[6,3],[5,3]]`, `game_score: "40-15"`, `serving: "Sinner"`). This means:

1. The vision LLM does 6 jobs in one prompt (read score, classify frame, describe event, judge importance, extract metadata, identify players) — accuracy degrades with prompt complexity
2. The curation LLM structures scores from text while simultaneously deduplicating, filtering, and rewriting labels — too many jobs, error-prone
3. Score reading at 360p loses small scoreboard text (game scores, serving indicators)
4. No per-frame independent score readings — no consensus possible
5. No score delta detection — replay detection is a brittle string heuristic
6. No confidence scoring — impossible to distinguish reliable scores from hallucinated ones

## Solution

Redesign the vision pass to return **per-frame structured scores** alongside event descriptions, in a single merged call at 720p. Score consensus and confidence are computed in code. All downstream stages receive structured, validated score data and never touch score fields.

---

## Pipeline Architecture

### Current (3 Gemini calls)

```
Peaks → identifyMatch (vision, 360p)
      → analyzeFrames (vision, 360p)        ← 6 jobs in 1 prompt, free-text scores
      → curateKeyMoments (text)              ← 4 jobs in 1 prompt, structures scores blind
```

### Proposed (3 Gemini calls)

```
Peaks → identifyMatch (vision, 360p)        ← unchanged
      → analyzeWithScores (vision, 720p)    ← 2 separated sections: scores + event
      → curateKeyMoments (text)              ← simplified: only labels + moment_type
```

| Pass | Job | Sees frames? | Resolution | Touches scores? |
|------|-----|-------------|-----------|----------------|
| identifyMatch | Sport/players/competition | Yes (3 samples) | 360p | No |
| analyzeWithScores | Per-frame score reading + event description | Yes (3 frames) | 720p | Yes — primary source |
| curateKeyMoments | Deduplicate, filter, rewrite labels, classify moment_type | No | N/A | No — scores locked |

---

## `analyzeWithScores` Prompt Design

The prompt has two clearly separated sections with distinct purposes.

### Context Header

```
Sport: Tennis
Players: Sinner vs Alcaraz
Competition: Australian Open
Player 1 (P1): Sinner, Player 2 (P2): Alcaraz
Crowd energy: very high (crowd roaring)
Commentary at this moment: "and he breaks! Sinner takes the lead"
```

Transcript text and audio energy level are provided as context. They help the LLM make better event descriptions and importance judgments.

### Section A — Scoreboard Reading

```
SECTION 1: SCOREBOARD READING
For EACH of the 3 frames, read the scoreboard independently.
Do NOT use commentary or crowd energy to infer scores.
Read ONLY what is visible on the scoreboard graphic.
If the scoreboard is not visible or not readable, set "visible": false.

For tennis:
- "sets": array of [P1_games, P2_games] per set. P1 is always first.
  Example: P1 won set 1 6-3, current set 2-1 → [[6, 3], [2, 1]]
- "game_score": point score in current game ("40-15", "AD-40", "deuce") or null if between games
- "serving": who is serving ("Sinner" or "Alcaraz") or null if not visible
- "visible": true if scoreboard is readable
```

### Section B — Event Description

```
SECTION 2: EVENT DESCRIPTION
Now compare the 3 frames. What happened between them?
Use the frames, commentary, and crowd energy to describe the event.

Classify the frame type:
- live_play: Active gameplay with scoreboard visible
- replay: Slow-motion replay (replay graphics, slow movement, no live scoreboard)
- celebration: Player celebrating, fist pump, crowd reaction
- close_up: Close-up of player face/equipment — no scoreboard
- graphics: Full-screen graphic, stats overlay, interview, pre-match ceremony
- other: Anything else

Classify importance:
- CRITICAL: Match point won, set won, championship point, decisive break
- SIGNIFICANT: Break of serve, break point, momentum shift, challenge/review, injury timeout
- ROUTINE: Regular point, standard serve hold
- FILLER: Replay, crowd shots, graphics overlay, pre-match ceremony
```

### Response Schema

```json
{
  "scores": [
    { "visible": true, "sets": [[6,3],[5,2]], "game_score": "40-15", "serving": "Sinner" },
    { "visible": true, "sets": [[6,3],[5,3]], "game_score": null, "serving": null },
    { "visible": true, "sets": [[6,3],[5,3]], "game_score": null, "serving": null }
  ],
  "event": "Sinner breaks serve to lead 5-3",
  "frame_type": "live_play",
  "importance": "critical",
  "set_period": "Set 2",
  "game_time": null,
  "venue": "Rod Laver Arena",
  "broadcaster": "Eurosport"
}
```

---

## Score Consensus Algorithm

Runs in code after Gemini returns. No LLM involved.

### Per-Frame Confidence

Each frame reading is independently assessed:
- `visible: true` + `sets` present → **confident reading**
- `visible: false` or `sets` null → **no reading**

### Consensus Logic

```
Input: 3 frame scores [BEFORE, DURING, AFTER]

1. Filter to frames with confident readings
2. If 0 readable → score: null, confidence: NONE
3. If 1 readable → use that reading, confidence: LOW
4. If 2+ readable → use latest readable frame (prefer AFTER), confidence: HIGH
```

Confidence is about **how sure we are the scoreboard was read correctly**, not about whether frames agree with each other. Two frames can both be HIGH confidence and show different scores — that means the score changed during the 10-second window.

### Score Delta Detection

After consensus, compare BEFORE vs AFTER readings:

```
BEFORE readable + AFTER readable + scores differ → score_changed: true
BEFORE readable + AFTER readable + scores same   → score_changed: false
Either not readable                               → score_changed: null (unknown)
```

Score delta provides a specific description of what changed:
- Total games increased, game_score disappeared → "game won"
- Set count increased → "set won"
- Only game_score changed → "point scored"
- Nothing changed → no scoring event (possible replay, celebration, or routine play)

### Downstream Signal Usage

| Stage | How it uses consensus/delta |
|-------|---------------------------|
| Replay detection | `score_changed === false` + `frame_type !== 'live_play'` → almost certainly replay |
| Curation | Moments with HIGH confidence + `score_changed: true` → protected from filtering |
| Moment boundaries merge | Two moments with different confirmed scores → keep both (genuinely different events) |
| Frontend display | Only show `score_display` when `score_confidence` is `'high'` |
| `fixMomentTypeOrder` | Validate `set_won` count against actual set transitions in score progression |

---

## Updated TypeScript Interfaces

### FrameScore (new)

```typescript
interface FrameScore {
  visible: boolean;
  sets: [number, number][] | null;
  game_score: string | null;
  serving: string | null;
}
```

### VisionResult (modified)

```typescript
interface VisionResult {
  timestamp: number;
  matchedKeyword: string | null;
  transcriptText: string;
  audioEnergy: number;

  // Score data — structured from vision
  frame_scores: [FrameScore | null, FrameScore | null, FrameScore | null];
  consensus: FrameScore | null;
  score_changed: boolean | null;    // null = unknown (frames not readable)
  score_confidence: 'high' | 'low' | 'none';

  // Event data
  sport: string | null;
  players: string[];
  competition: string | null;
  frame_type: 'live_play' | 'replay' | 'celebration' | 'close_up' | 'graphics' | 'other' | null;
  set_period: string | null;
  game_time: string | null;
  venue: string | null;
  broadcaster: string | null;
  event: string | null;
  importance: 'critical' | 'significant' | 'routine' | 'filler' | null;
}
```

Removed: `score: string | null`, `score_visible: boolean`

### KeyMoment (modified)

```typescript
interface KeyMoment {
  timestamp: number;
  label: string;
  score_display: string | null;     // deterministic formatted string
  sets: [number, number][] | null;
  game_score: string | null;
  serving: string | null;
  moment_type: string | null;
  score_source: 'visible' | 'interpolated' | null;
  score_confidence: 'high' | 'low' | 'none';
  score_changed: boolean | null;
  frame_type: string | null;
  set_period: string | null;
  game_time: string | null;
  transcript: string;
  audio_energy: number;
  startTime?: number;
  endTime?: number;
  peakTime?: number;
}
```

Removed: `score: string | null` (free-text), `score_visible: boolean`
Added: `score_confidence`, `score_changed`

---

## File-by-File Changes

### `vision-api.ts` — Major rewrite

- `identifyMatch()`: unchanged
- `analyzeFrames()` → renamed to `analyzeWithScores()`
- New two-section prompt (Section A: scores, Section B: event)
- Frame extraction at 720p (change ffmpeg `-vf scale=-1:720` for this pass only — see note below)
- New response parser: extracts `scores[]` array separately from event fields
- New functions: `parseFrameScores()`, `computeConsensus()`, `detectScoreDelta()`
- Returns updated `VisionResult` with structured score fields

**720p frame extraction:** The frames sent to `analyzeWithScores` need to be 720p. The current pipeline extracts frames in `overlay-diff.ts` at 360p. Two options:
- Option A: Re-extract the 3 context frames (before/during/after) at 720p in `analyzeWithScores` before sending to Gemini
- Option B: Change `overlay-diff.ts` to extract context frames at 720p

**Recommendation: Option A.** Keep overlay diff at 360p (it doesn't need resolution), re-extract the 3 frames at 720p just before the Gemini call. This adds 3 ffmpeg calls per peak but keeps concerns separated — overlay diff doesn't need to know about vision resolution requirements.

### `result-processing.ts` — Simplified

- `processResults()`: reads `consensus`, `score_confidence`, `score_changed` from VisionResult instead of parsing free-text `score`
- `KeyMoment` creation: `sets`, `game_score`, `serving`, `score_display` populated directly from consensus
- Replay detection: `score_changed === false && frame_type !== 'live_play'` replaces the `"n/a"` string heuristic
- `curateKeyMoments()` tennis prompt: **all score structuring instructions removed** — prompt only handles labels, moment_type, deduplication
- `curateKeyMoments()` response format: includes moment index `[#0]` for matching back — match by index instead of timestamp string
- `curateKeyMoments()` response handling: never overwrites score fields, only `label` and `moment_type`
- `validateScoreProgression()`: works on consensus scores from vision — same logic, better input data
- `fixMomentTypeOrder()`: extended to also validate `set_won` — count of `set_won` moments must not exceed number of completed sets visible in score progression

### `overlay-diff.ts` — No changes

Stays at 360p. Pixel comparison for finding best frame doesn't need resolution.

### `moment-boundaries.ts` — Small changes

- `mergeNearDuplicates()`: use `score_changed` + `score_confidence` instead of comparing `score_display` strings to decide if two moments are genuinely different
- Fix comment at line 99 ("60s") to match actual `NEAR_THRESHOLD = 90` constant. **Decision: reduce to 60s** — 90s is too aggressive for tennis, a full game can be played in that window. For non-tennis sports, 90s may be appropriate — but since we're tennis-first, use 60s as the default.

### `context-enrichment.ts` — Small changes

- `scoreBefore`/`scoreAfter`: use `score_display` (structured, from consensus) instead of `score` (free-text, removed)
- `scoreChanged`: use `score_changed` boolean from VisionResult instead of string comparison

### `index.ts` (orchestrator) — No changes

Same pipeline flow, same error handling. Internal interface changes are transparent to the orchestrator.

---

## Backward Compatibility

- The `score: string | null` field is removed from `KeyMoment`. Frontend consumers that read `ocrKeyMoments` from the database will need to use `score_display` instead. Check `KeyMomentsList.tsx` and any other frontend consumers.
- The `score_visible: boolean` field is replaced by `score_confidence`. Frontend should check `score_confidence === 'high'` instead of `score_visible === true`.
- Existing assets with old-format `ocrKeyMoments` JSON will still have `score` and `score_visible` fields. Frontend should handle both formats during transition (check for `score_confidence` presence; if absent, fall back to `score_visible`).

---

## Cost & Performance Impact

**API costs:** Same number of Gemini calls (3 per pipeline run). 720p frames are ~4x more pixels than 360p, so token cost per frame increases. With 3 frames × 60 peaks = 180 frames at 720p vs 360p, expect roughly 2-3x increase in the `analyzeWithScores` pass cost. At Gemini Flash pricing this is still cheap (~$0.20-0.40 per asset vs ~$0.10-0.15 currently).

**Latency:** Re-extracting 3 frames at 720p per peak adds ~180 ffmpeg calls. At 10 concurrency this adds ~20-30 seconds to the pipeline. Acceptable for a background ingest job.

**Accuracy gain:** Per-frame structured scores with consensus eliminates the biggest source of score errors (free-text parsing by a blind LLM). Confidence scoring means wrong scores are hidden rather than displayed. Score delta detection makes replay filtering deterministic.

---

## Non-Tennis Path

For non-tennis sports, the `analyzeWithScores` prompt adapts:
- Section A asks for a simpler score format: `{ "visible": true, "score_text": "PSG 2 - 1 Marseille" }` — still per-frame, still with consensus, but not structured into sets/game_score
- Section B is identical
- Curation path for generic sports is unchanged (already simpler than tennis)
- Score consensus for generic sports: string comparison instead of structured comparison

This design is tennis-first but extensible. Generic sport structured scores can be added per-sport later.
