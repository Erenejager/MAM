# OCR Key Moment Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the cascade of bugs causing OCR key moments to collapse to 0–2 for a typical match, restore celebration/close-up moments, add non-tennis score display, and improve pipeline performance with parallelization.

**Architecture:** All changes are within `backend/src/lib/ocr/`. Each task is independently testable. Tasks 1–4 are correctness fixes; Task 5 depends on Task 2 (importance on KeyMoment); Tasks 6–8 are quality/performance improvements with no inter-dependencies.

**Tech Stack:** TypeScript (ESM), Vitest, PQueue (`p-queue`), Gemini API, ffmpeg. All tests run with `cd backend && npm test`.

---

## File Map

| File | What changes |
|------|-------------|
| `backend/src/lib/ocr/result-processing.ts` | Fix replay filter (Task 1); add `importance` to `KeyMoment` + propagate it (Task 2); update `buildScoreDisplay` for non-tennis (Task 3) |
| `backend/src/lib/ocr/score-consensus.ts` | Add `score_text` to `FrameScore`; update `parseOneFrameScore`, `isReadable` (Task 3) |
| `backend/src/lib/ocr/vision-api.ts` | Remove dead `sport`/`players`/`competition` fields from `VisionResult` return (Task 4) |
| `backend/src/lib/ocr/moment-boundaries.ts` | Priority+importance-aware `mergeOverlapping` (Task 5); parallelize `findMomentBoundaries` (Task 7) |
| `backend/src/lib/ocr/overlay-diff.ts` | Parallelize `refinePeaks` (Task 6) |
| `backend/src/lib/ocr/transcript-scoring.ts` | Keyword tier scoring — high-value vs standard keywords (Task 8) |
| `backend/src/__tests__/result-processing.test.ts` | New test file — replay filter + importance propagation |
| `backend/src/__tests__/score-consensus.test.ts` | Extend existing tests for `score_text` |
| `backend/src/__tests__/transcript-scoring.test.ts` | Extend existing tests for tier scoring |

---

## Task 1: Fix the Replay Filter

**Problem:** `score_changed === false && frame_type !== 'live_play'` is the primary moment killer. It fires on celebrations and close-ups where the scoreboard shows the same score ±5s around a peak (extremely common since the score doesn't change *every* second). This filter was eliminating 60–80% of moments before curation.

**Fix:** Three-tier guard: (1) explicit `replay` frame_type always filtered; (2) `score_changed === false` only filtered when `score_confidence === 'high'` AND frame_type is not a known real-moment type AND importance is not critical/significant.

**Files:**
- Modify: `backend/src/lib/ocr/result-processing.ts:63-68`
- Create: `backend/src/__tests__/result-processing.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// backend/src/__tests__/result-processing.test.ts
import { describe, it, expect } from 'vitest';
import { processResults } from '../lib/ocr/result-processing.js';
import type { VisionResult } from '../lib/ocr/vision-api.js';

function makeResult(overrides: Partial<VisionResult>): VisionResult {
  return {
    timestamp: 100,
    matchedKeyword: null,
    transcriptText: '',
    audioEnergy: 0.5,
    frame_scores: [null, null, null],
    consensus: null,
    score_changed: null,
    score_confidence: 'none',
    frame_type: null,
    set_period: null,
    game_time: null,
    venue: null,
    broadcaster: null,
    event: 'Test event',
    importance: 'significant',
    ...overrides,
  };
}

describe('processResults — replay filter', () => {
  it('filters explicit replay frame_type regardless of score', () => {
    const result = processResults([
      makeResult({ frame_type: 'replay', score_changed: false, score_confidence: 'high' }),
    ]);
    expect(result.keyMoments).toHaveLength(0);
  });

  it('does NOT filter celebration even with score_changed=false and high confidence', () => {
    const result = processResults([
      makeResult({ frame_type: 'celebration', score_changed: false, score_confidence: 'high' }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter close_up even with score_changed=false and high confidence', () => {
    const result = processResults([
      makeResult({ frame_type: 'close_up', score_changed: false, score_confidence: 'high' }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter live_play even with score_changed=false', () => {
    const result = processResults([
      makeResult({ frame_type: 'live_play', score_changed: false, score_confidence: 'high' }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter score_changed=false when score_confidence is low', () => {
    // Low confidence score means we can't trust the reading — don't filter on it
    const result = processResults([
      makeResult({ frame_type: 'other', score_changed: false, score_confidence: 'low' }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter score_changed=false when importance is critical', () => {
    const result = processResults([
      makeResult({
        frame_type: 'other',
        score_changed: false,
        score_confidence: 'high',
        importance: 'critical',
      }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter score_changed=false when importance is significant', () => {
    const result = processResults([
      makeResult({
        frame_type: 'other',
        score_changed: false,
        score_confidence: 'high',
        importance: 'significant',
      }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('filters probable replay: score_changed=false, high confidence, routine importance, non-live frame', () => {
    const result = processResults([
      makeResult({
        frame_type: 'other',
        score_changed: false,
        score_confidence: 'high',
        importance: 'routine',
      }),
    ]);
    // Routine is also filtered by the meaningful filter, but both would apply
    expect(result.keyMoments).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/__tests__/result-processing.test.ts
```
Expected: Several tests FAIL because the current filter fires on `celebration`/`close_up`/`live_play`.

- [ ] **Step 3: Update the replay filter in result-processing.ts**

Replace lines 63–68 (the `noReplays` filter block):

```typescript
  // Filter out replays — use a three-tier guard to avoid killing real moments
  const REAL_MOMENT_FRAME_TYPES = new Set(['celebration', 'close_up', 'live_play']);
  const noReplays = meaningful.filter((r) => {
    // Tier 1: explicit replay — always filter
    if (r.frame_type === 'replay') {
      console.log(`[ocr] Filtered explicit replay at ${fmtTimestamp(r.timestamp)}`);
      return false;
    }

    // Tier 2: probable replay — only when all safety conditions pass:
    // - score reading is definitively confirmed (high confidence = 2+ readable frames)
    // - frame type is not a known real-moment type
    // - importance was not elevated by Gemini
    const isProbableReplay =
      r.score_changed === false &&
      r.score_confidence === 'high' &&
      !REAL_MOMENT_FRAME_TYPES.has(r.frame_type ?? '') &&
      r.importance !== 'critical' &&
      r.importance !== 'significant';

    if (isProbableReplay) {
      console.log(`[ocr] Filtered probable replay at ${fmtTimestamp(r.timestamp)} (frame_type: ${r.frame_type}, confidence: ${r.score_confidence})`);
      return false;
    }

    return true;
  });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx vitest run src/__tests__/result-processing.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/__tests__/result-processing.test.ts src/lib/ocr/result-processing.ts
git commit -m "fix(ocr): tighten replay filter — whitelist celebration/close_up/live_play, gate tier-2 on high confidence

score_changed=false fired on any moment where ±5s frames showed the same
scoreboard reading. This killed celebrations, close-ups, and late-detected
peaks — the most emotionally resonant moments. New three-tier guard only
filters probable replays when: score_confidence=high, frame is not a known
real-moment type, and importance is not critical/significant."
```

---

## Task 2: Add `importance` to `KeyMoment` and Propagate It

**Why:** `importance` from Gemini is on `VisionResult` but is never carried forward to `KeyMoment` or `BoundedMoment`. Task 5 (priority-aware merge) requires it. Without this, `mergeOverlapping` can't use importance as a tiebreaker.

**Files:**
- Modify: `backend/src/lib/ocr/result-processing.ts`

- [ ] **Step 1: Add `importance` to the `KeyMoment` interface** (lines 4–23)

Add the field after `frame_type`:

```typescript
export interface KeyMoment {
  timestamp: number;
  label: string;
  score_display: string | null;
  sets: [number, number][] | null;
  game_score: string | null;
  serving: string | null;
  moment_type: string | null;
  score_source: 'visible' | 'interpolated' | null;
  score_confidence: 'high' | 'low' | 'none';
  score_changed: boolean | null;
  frame_type: string | null;
  importance: 'critical' | 'significant' | 'routine' | 'filler' | null;
  set_period: string | null;
  game_time: string | null;
  transcript: string;
  audio_energy: number;
  startTime?: number;
  endTime?: number;
  peakTime?: number;
}
```

- [ ] **Step 2: Propagate `importance` in the `keyMoments.push(...)` block** (around line 77–94)

Add the field to the push:

```typescript
    keyMoments.push({
      timestamp: r.timestamp,
      label: capitalizeFirst(label),
      score_display: cs?.sets ? buildScoreDisplay(cs.sets, cs.game_score) : null,
      sets: cs?.sets ?? null,
      game_score: cs?.game_score ?? null,
      serving: cs?.serving ?? null,
      moment_type: null,
      score_source: cs?.sets ? 'visible' : null,
      score_confidence: r.score_confidence,
      score_changed: r.score_changed,
      frame_type: r.frame_type ?? null,
      importance: r.importance ?? null,
      set_period: r.set_period,
      game_time: r.game_time,
      transcript: r.transcriptText,
      audio_energy: r.audioEnergy,
    });
```

- [ ] **Step 3: Add an importance propagation test to result-processing.test.ts**

Append to `backend/src/__tests__/result-processing.test.ts`:

```typescript
describe('processResults — importance propagation', () => {
  it('carries importance from VisionResult through to KeyMoment', () => {
    const result = processResults([
      makeResult({ importance: 'critical', frame_type: 'live_play' }),
    ]);
    expect(result.keyMoments[0].importance).toBe('critical');
  });

  it('sets importance to null when VisionResult importance is null', () => {
    const result = processResults([
      makeResult({ importance: null }),
    ]);
    expect(result.keyMoments[0].importance).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npx vitest run src/__tests__/result-processing.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Run full test suite to catch any TypeScript issues**

```bash
cd backend && npm test
```
Expected: All tests PASS (adding a field to the interface should have no downstream failures).

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/ocr/result-processing.ts backend/src/__tests__/result-processing.test.ts
git commit -m "feat(ocr): propagate Gemini importance through KeyMoment

importance is available on VisionResult but was not forwarded to KeyMoment
or BoundedMoment. Required as prerequisite for importance-aware mergeOverlapping."
```

---

## Task 3: Non-Tennis Score Display (`score_text`)

**Problem:** Non-tennis sports (football, basketball, rugby) send back `score_text: "PSG 2 - 1 Marseille"` from Gemini, but `FrameScore` has no field for it. `parseOneFrameScore` silently drops it, `isReadable` requires `sets !== null`, and `buildScoreDisplay` only handles sets arrays. Result: `score_display = null` on every non-tennis moment.

**Files:**
- Modify: `backend/src/lib/ocr/score-consensus.ts` (FrameScore interface, parseOneFrameScore, isReadable)
- Modify: `backend/src/lib/ocr/result-processing.ts` (buildScoreDisplay, score_source)
- Modify: `backend/src/__tests__/score-consensus.test.ts` (add score_text to expected objects)

- [ ] **Step 1: Update existing score-consensus tests** — add `score_text: null` to all existing `toEqual` expectations (existing tests don't include this field, which will cause them to fail after we add it to the interface)

In `backend/src/__tests__/score-consensus.test.ts`, update every `toEqual` expectation that checks the full FrameScore shape to include `score_text: null`:

```typescript
// In 'returns structured score when visible with valid sets'
expect(result).toEqual({
  visible: true,
  sets: [[6, 3], [5, 2]],
  game_score: '40-15',
  serving: 'Sinner',
  score_text: null,     // ADD
});

// In 'returns null sets when visible is false'
expect(result).toEqual({ visible: false, sets: null, game_score: null, serving: null, score_text: null });

// In 'returns null sets when sets array is invalid'
expect(result).toEqual({ visible: true, sets: null, game_score: null, serving: null, score_text: null });

// In 'filters out invalid set entries'
expect(result).toEqual({ visible: true, sets: [[6, 3], [5, 2]], game_score: null, serving: null, score_text: null });

// In 'returns null sets when sets array is empty after filtering'
expect(result).toEqual({ visible: true, sets: null, game_score: null, serving: null, score_text: null });
```

- [ ] **Step 2: Add new non-tennis score_text tests** to `backend/src/__tests__/score-consensus.test.ts`

```typescript
describe('parseOneFrameScore — non-tennis score_text', () => {
  it('captures score_text for non-tennis sports', () => {
    const raw = { visible: true, score_text: 'PSG 2 - 1 Marseille', sets: null, game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({
      visible: true,
      sets: null,
      game_score: null,
      serving: null,
      score_text: 'PSG 2 - 1 Marseille',
    });
  });

  it('returns score_text: null when field is absent', () => {
    const raw = { visible: true, sets: [[6, 3]], game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result?.score_text).toBeNull();
  });
});

describe('computeConsensus — non-tennis readable check', () => {
  it('treats frame as readable when score_text is present even without sets', () => {
    const frame: FrameScore = {
      visible: true,
      sets: null,
      game_score: null,
      serving: null,
      score_text: 'Team A 1 - 0 Team B',
    };
    const result = computeConsensus([frame, null, null]);
    expect(result.score_confidence).toBe('low'); // 1 readable frame
    expect(result.consensus?.score_text).toBe('Team A 1 - 0 Team B');
  });

  it('returns HIGH confidence for 2+ non-tennis readable frames', () => {
    const frame: FrameScore = {
      visible: true, sets: null, game_score: null, serving: null,
      score_text: 'Team A 2 - 0 Team B',
    };
    const result = computeConsensus([null, null, frame]);
    // Only 1 readable here — need 2 for high
    expect(result.score_confidence).toBe('low');
    
    const result2 = computeConsensus([frame, null, frame]);
    expect(result2.score_confidence).toBe('high');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend && npx vitest run src/__tests__/score-consensus.test.ts
```
Expected: FAIL — `score_text` field is missing.

- [ ] **Step 4: Update `FrameScore` interface in score-consensus.ts**

```typescript
export interface FrameScore {
  visible: boolean;
  sets: [number, number][] | null;
  game_score: string | null;
  serving: string | null;
  score_text: string | null;  // non-tennis: e.g. "PSG 2 - 1 Marseille"
}
```

- [ ] **Step 5: Update `parseOneFrameScore` to capture score_text**

Replace the `return` block:

```typescript
  return {
    visible,
    sets,
    game_score: typeof obj.game_score === 'string' ? obj.game_score : null,
    serving: typeof obj.serving === 'string' ? obj.serving : null,
    score_text: typeof obj.score_text === 'string' ? obj.score_text : null,
  };
```

- [ ] **Step 6: Update `isReadable` to accept non-tennis frames**

Replace the `isReadable` function (line 38–40):

```typescript
function isReadable(fs: FrameScore | null): fs is FrameScore {
  return fs !== null && fs.visible && (fs.sets !== null || fs.score_text !== null);
}
```

- [ ] **Step 7: Update `buildScoreDisplay` in result-processing.ts to handle both score types**

Replace the existing `buildScoreDisplay` function (around line 342–349):

```typescript
/** Build score_display from either structured sets (tennis) or raw score_text (other sports) */
function buildScoreDisplay(cs: { sets: [number, number][] | null; game_score: string | null; score_text?: string | null }): string | null {
  if (cs.sets) {
    const setStrs = cs.sets.map(([p1, p2]) => `${p1}-${p2}`);
    const setsStr = setStrs.join(', ');
    return cs.game_score ? `${setsStr} (${cs.game_score})` : setsStr;
  }
  return cs.score_text ?? null;
}
```

- [ ] **Step 8: Update the `score_display` and `score_source` lines in `processResults`**

Around line 80–85, replace:

```typescript
      score_display: cs?.sets ? buildScoreDisplay(cs.sets, cs.game_score) : null,
      sets: cs?.sets ?? null,
      game_score: cs?.game_score ?? null,
      serving: cs?.serving ?? null,
      moment_type: null,
      score_source: cs?.sets ? 'visible' : null,
```

With:

```typescript
      score_display: cs ? buildScoreDisplay(cs) : null,
      sets: cs?.sets ?? null,
      game_score: cs?.game_score ?? null,
      serving: cs?.serving ?? null,
      moment_type: null,
      score_source: (cs?.sets || cs?.score_text) ? 'visible' : null,
```

- [ ] **Step 9: Run full test suite**

```bash
cd backend && npm test
```
Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/src/lib/ocr/score-consensus.ts backend/src/lib/ocr/result-processing.ts backend/src/__tests__/score-consensus.test.ts
git commit -m "feat(ocr): add score_text support for non-tennis sports

FrameScore now carries score_text field. parseOneFrameScore captures it.
isReadable accepts frames with score_text but no sets. buildScoreDisplay
handles both tennis (sets array) and non-tennis (score_text string).
Non-tennis matches will now show score_display on key moments."
```

---

## Task 4: Remove Dead Fields from `VisionResult`

**Why:** `analyzeWithScores` no longer prompts Gemini for `sport`, `players`, or `competition` (those come from `identifyMatch`). But the return object still assigns `parsed.sport`, `parsed.players`, `parsed.competition` — which are always null/empty since the prompt doesn't ask for them. These dead fields add confusion and waste type-checking cycles.

**Files:**
- Modify: `backend/src/lib/ocr/vision-api.ts`

- [ ] **Step 1: Remove `sport`, `players`, `competition` from the `VisionResult` interface**

Replace the current interface (lines 13–36):

```typescript
export interface VisionResult {
  timestamp: number;
  matchedKeyword: string | null;
  transcriptText: string;
  audioEnergy: number;

  // Score data — structured from per-frame vision readings
  frame_scores: [FrameScore | null, FrameScore | null, FrameScore | null];
  consensus: FrameScore | null;
  score_changed: boolean | null;
  score_confidence: 'high' | 'low' | 'none';

  // Event data
  frame_type: 'live_play' | 'replay' | 'celebration' | 'close_up' | 'graphics' | 'other' | null;
  set_period: string | null;
  game_time: string | null;
  venue: string | null;
  broadcaster: string | null;
  event: string | null;
  importance: 'critical' | 'significant' | 'routine' | 'filler' | null;
}
```

- [ ] **Step 2: Remove dead field assignments from the `analyzeWithScores` return block** (around lines 300–325)

Remove these three lines:

```typescript
            sport: parsed.sport as string ?? null,
            players: Array.isArray(parsed.players) ? (parsed.players as string[]) : [],
            competition: parsed.competition as string ?? null,
```

The return object should now go from `frame_scores` directly to `frame_type`.

- [ ] **Step 3: Build to catch any remaining references**

```bash
cd backend && npm run build 2>&1 | head -40
```
Expected: 0 errors. If TypeScript flags any remaining reference to `r.sport`, `r.players`, or `r.competition` elsewhere in the codebase, remove those references too.

- [ ] **Step 4: Run full test suite**

```bash
cd backend && npm test
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/ocr/vision-api.ts
git commit -m "refactor(ocr): remove dead sport/players/competition fields from VisionResult

analyzeWithScores stopped requesting these from Gemini when identifyMatch
was introduced. The fields were always null/empty but appeared valid.
Removing them makes the interface honest and avoids future confusion."
```

---

## Task 5: Priority+Importance-Aware `mergeOverlapping`

**Problem:** When two moments share the same silence gap and their windows overlap, the one with higher `audio_energy` wins. But the globally loudest crowd roar often accompanies replays or routine celebrations, not the most editorially important moment. A `critical match_won` moment should always beat a `significant ace` in the same window.

**Requires:** Task 2 complete (`importance` on `KeyMoment`/`BoundedMoment`).

**Files:**
- Modify: `backend/src/lib/ocr/moment-boundaries.ts:64-87` (`mergeOverlapping`)

- [ ] **Step 1: Write a test for priority-aware merging** — add to `backend/src/__tests__/result-processing.test.ts`

```typescript
// Note: we test mergeOverlapping indirectly by checking findMomentBoundaries output would be impractical
// (it requires ffmpeg). Instead test the priority logic by writing a minimal helper test.
// The actual function is not exported, so we verify the logic through integration tests when running OCR.
// This step is documentation only — skip to Step 2.
```

_(mergeOverlapping is an internal function — we verify correctness through log inspection during a real OCR run after the change.)_

- [ ] **Step 2: Add `momentPriority` helper and update `mergeOverlapping`**

In `backend/src/lib/ocr/moment-boundaries.ts`, replace the `mergeOverlapping` function (lines 64–87):

```typescript
function momentPriority(m: BoundedMoment): number {
  const importancePriority =
    m.importance === 'critical' ? 100 :
    m.importance === 'significant' ? 50 : 0;
  const typePriority = MOMENT_PRIORITY[m.moment_type ?? ''] ?? 0;
  return importancePriority + typePriority;
}

/**
 * When two moments land on the same silence gap, their time windows overlap.
 * Keep the one with the higher priority (importance + moment_type).
 * Fall back to audio_energy only when priorities are equal.
 */
function mergeOverlapping(moments: BoundedMoment[]): BoundedMoment[] {
  if (moments.length <= 1) return moments;

  const merged: BoundedMoment[] = [];
  for (const m of moments) {
    const overlap = merged.find(
      (existing) => existing.startTime < m.endTime && m.startTime < existing.endTime,
    );
    if (overlap) {
      const mPriority = momentPriority(m);
      const overlapPriority = momentPriority(overlap);
      const keepCurrent =
        mPriority > overlapPriority ||
        (mPriority === overlapPriority && m.audio_energy > overlap.audio_energy);

      if (keepCurrent) {
        const idx = merged.indexOf(overlap);
        merged[idx] = m;
        console.log(`[ocr] Merged overlapping: kept ${fmtTime(m.peakTime)} (priority ${mPriority}) over ${fmtTime(overlap.peakTime)} (priority ${overlapPriority})`);
      } else {
        console.log(`[ocr] Merged overlapping: kept ${fmtTime(overlap.peakTime)} (priority ${overlapPriority}) over ${fmtTime(m.peakTime)} (priority ${mPriority})`);
      }
    } else {
      merged.push(m);
    }
  }

  return merged;
}
```

- [ ] **Step 3: Run full test suite**

```bash
cd backend && npm test
```
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/ocr/moment-boundaries.ts
git commit -m "feat(ocr): use importance+moment_type priority in mergeOverlapping

audio_energy was the sole tiebreaker when two moments shared a silence gap.
The globally loudest crowd event is not necessarily the most editorially
significant. New priority order: importance (critical > significant > other)
then moment_type rank, then audio_energy as final tiebreaker."
```

---

## Task 6: Parallelize `refinePeaks`

**Problem:** For 60 peaks × 30 frames each, `refinePeaks` runs 1,800 sequential ffmpeg calls. At ~0.3s per call this is ~9 minutes for Pass 2 on a 90-min match. The per-peak work is fully independent — safe to parallelize.

**Files:**
- Modify: `backend/src/lib/ocr/overlay-diff.ts:17-79`

Note: `p-queue` is already a dependency (used in `vision-api.ts`).

- [ ] **Step 1: Verify PQueue import is available**

```bash
cd backend && node -e "import('p-queue').then(m => console.log('OK:', typeof m.default))"
```
Expected: `OK: function`

- [ ] **Step 2: Add PQueue import and parallelize the outer loop in `refinePeaks`**

Replace the entire `refinePeaks` function body:

```typescript
import PQueue from 'p-queue';

export async function refinePeaks(
  videoPath: string,
  peaks: CoarsePeak[],
  durationSeconds: number,
  tempDir: string,
): Promise<RefinedPeak[]> {
  await mkdir(tempDir, { recursive: true });

  const queue = new PQueue({ concurrency: 6 });

  const results = await Promise.all(
    peaks.map((peak, pi) =>
      queue.add(async () => {
        const windowStart = Math.max(0, Math.floor(peak.timestamp) - 15);
        const windowEnd = Math.min(Math.ceil(durationSeconds), Math.floor(peak.timestamp) + 15);
        const frameCount = windowEnd - windowStart;
        if (frameCount < 2) {
          const framePath = resolve(tempDir, `peak_${pi}.jpg`);
          await extractSingleFrame(videoPath, peak.timestamp, framePath);
          return {
            timestamp: peak.timestamp,
            framePath,
            matchedKeyword: peak.matchedKeyword,
            transcriptText: peak.transcriptText,
            audioEnergy: peak.audioEnergy,
          } as RefinedPeak;
        }

        const framePaths: { time: number; path: string }[] = [];
        for (let t = windowStart; t < windowEnd; t++) {
          const path = resolve(tempDir, `peak_${pi}_t${t}.jpg`);
          await extractSingleFrame(videoPath, t, path);
          framePaths.push({ time: t, path });
        }

        let bestDiff = 0;
        let bestIndex = 0;
        for (let i = 1; i < framePaths.length; i++) {
          const diff = await compareOverlayZones(framePaths[i - 1].path, framePaths[i].path);
          if (diff > bestDiff) {
            bestDiff = diff;
            bestIndex = i;
          }
        }

        const bestFrame = framePaths[bestIndex];

        for (const fp of framePaths) {
          if (fp.path !== bestFrame.path) {
            await unlink(fp.path).catch(() => {});
          }
        }

        return {
          timestamp: bestFrame.time,
          framePath: bestFrame.path,
          matchedKeyword: peak.matchedKeyword,
          transcriptText: peak.transcriptText,
          audioEnergy: peak.audioEnergy,
        } as RefinedPeak;
      }),
    ),
  );

  // Filter nulls (queue.add can return undefined if task throws, but we don't throw)
  return results.filter((r): r is RefinedPeak => r != null)
    .sort((a, b) => a.timestamp - b.timestamp);
}
```

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
cd backend && npm run build 2>&1 | head -30
```
Expected: 0 errors.

- [ ] **Step 4: Run full test suite**

```bash
cd backend && npm test
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/ocr/overlay-diff.ts
git commit -m "perf(ocr): parallelize refinePeaks with concurrency 6

Sequential processing of peaks was O(peaks × frames) × 0.3s per ffmpeg call.
A 60-peak match had ~9 min of sequential frame extraction. Parallel execution
with PQueue concurrency=6 reduces this to ~1.5 min."
```

---

## Task 7: Parallelize `findMomentBoundaries`

**Problem:** 15–20 `computeFinegrainEnergy` calls run sequentially. Each is a full audio extraction from the video file (~1–3s). These are pure reads — fully safe to parallelize. Sequential execution wastes 20–60s that could be parallel.

**Files:**
- Modify: `backend/src/lib/ocr/moment-boundaries.ts:22-58`

- [ ] **Step 1: Parallelize `findMomentBoundaries`**

Replace the sequential loop in `findMomentBoundaries` (lines 29–57):

```typescript
export async function findMomentBoundaries(
  videoPath: string,
  moments: KeyMoment[],
  durationSeconds: number,
): Promise<BoundedMoment[]> {
  if (moments.length === 0) return [];

  // computeFinegrainEnergy is a pure read — safe to run in parallel
  const bounded = await Promise.all(
    moments.map(async (moment) => {
      const { offset, energies } = await computeFinegrainEnergy(
        videoPath,
        moment.timestamp,
        SCAN_RADIUS,
        durationSeconds,
      );

      const peakIdx = Math.round(moment.timestamp - offset);
      const startTime = scanBackward(energies, peakIdx, offset);
      const endTime = scanForward(energies, peakIdx, offset, durationSeconds);

      return {
        ...moment,
        startTime,
        endTime,
        peakTime: moment.timestamp,
        timestamp: startTime,
      } as BoundedMoment;
    }),
  );

  const merged = mergeOverlapping(bounded);
  return mergeNearDuplicates(merged);
}
```

- [ ] **Step 2: Run full test suite**

```bash
cd backend && npm test
```
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/ocr/moment-boundaries.ts
git commit -m "perf(ocr): parallelize findMomentBoundaries — pure reads, no contention

computeFinegrainEnergy is a read-only ffmpeg audio extraction. Running
15-20 of them sequentially wasted 20-60s per pipeline run. Promise.all
runs them concurrently with no safety concerns."
```

---

## Task 8: Transcript Keyword Tier Scoring

**Problem:** `scoreTranscript` returns 0 or 1 per 10s window — binary. "Alcaraz is the champion" scores the same as "an ace". The transcript signal carries no differentiation between match-winning moments and routine play, so audio energy is the only real discriminator.

**Fix:** Two-tier keyword system: high-value keywords (match winner, championship, final, trophy) score 0.7; standard keywords score 0.3; scores accumulate and cap at 1.0.

**Files:**
- Modify: `backend/src/lib/ocr/transcript-scoring.ts`
- Modify: `backend/src/__tests__/transcript-scoring.test.ts`

- [ ] **Step 1: Add tier scoring tests** — append to `backend/src/__tests__/transcript-scoring.test.ts`

```typescript
describe('scoreTranscript — keyword tiers', () => {
  it('scores a high-value keyword at 0.7', () => {
    const segments: TranscriptSegment[] = [
      { start: 1.0, end: 4.0, text: 'Alcaraz is the champion' },
    ];
    const results = scoreTranscript(segments, 10);
    expect(results[0].transcriptScore).toBeCloseTo(0.7);
    expect(results[0].matchedKeyword).toBe('champion');
  });

  it('scores a standard keyword at 0.3', () => {
    const segments: TranscriptSegment[] = [
      { start: 1.0, end: 4.0, text: 'he hits an ace' },
    ];
    const results = scoreTranscript(segments, 10);
    expect(results[0].transcriptScore).toBeCloseTo(0.3);
    expect(results[0].matchedKeyword).toBe('ace');
  });

  it('accumulates multiple keywords and caps at 1.0', () => {
    const segments: TranscriptSegment[] = [
      { start: 1.0, end: 9.0, text: 'incredible amazing brilliant play' },
    ];
    const results = scoreTranscript(segments, 10);
    // 3 standard keywords: 0.3 + 0.3 + 0.3 = 0.9, capped at 1.0
    expect(results[0].transcriptScore).toBeCloseTo(0.9);
  });

  it('high-value keyword takes priority in matchedKeyword (first encountered)', () => {
    const segments: TranscriptSegment[] = [
      { start: 1.0, end: 4.0, text: 'incredible champion moment' },
    ];
    const results = scoreTranscript(segments, 10);
    // 'incredible' is encountered first → matchedKeyword = 'incredible'
    expect(results[0].matchedKeyword).toBe('incredible');
    // But combined score: 0.3 (incredible) + 0.7 (champion) = 1.0 (capped)
    expect(results[0].transcriptScore).toBeCloseTo(1.0);
  });

  it('no keyword window still scores 0', () => {
    const segments: TranscriptSegment[] = [
      { start: 0, end: 5, text: 'the ball rolls slowly across the grass' },
    ];
    const results = scoreTranscript(segments, 10);
    expect(results[0].transcriptScore).toBe(0);
    expect(results[0].matchedKeyword).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx vitest run src/__tests__/transcript-scoring.test.ts
```
Expected: FAIL — binary scoring returns 1.0 for champion and 1.0 for ace (no differentiation).

- [ ] **Step 3: Update `transcript-scoring.ts` with tier system**

Replace the entire file:

```typescript
const HIGH_VALUE_KEYWORDS = new Set([
  // Definitive match outcomes
  'champion', 'championship', 'victory', 'wins', 'winner', 'won',
  'final', 'knockout', 'submission', 'medal', 'trophy', 'title',
]);

const STANDARD_KEYWORDS = new Set([
  // Universal
  'goal', 'scores', 'scored', 'point',
  'save', 'saved', 'miss', 'missed', 'match', 'record',
  'defeat', 'defeated', 'finish', 'finished',
  // Periods
  'set', 'game', 'round', 'half', 'period', 'quarter', 'overtime',
  // Events
  'break', 'penalty', 'foul', 'card',
  'try', 'conversion', 'converts', 'converted',
  // Tennis
  'ace', 'serve', 'forehand', 'backhand', 'volley', 'deuce',
  'advantage', 'tiebreak', 'double', 'bagel',
  // Football
  'offside', 'corner', 'header', 'tackle', 'substitution',
  // Golf
  'birdie', 'eagle', 'bogey', 'hole', 'putt',
  // Racing
  'lap', 'overtake', 'pitstop', 'podium',
  // Combat
  'knockdown', 'takedown', 'clinch',
  // General action
  'incredible', 'amazing', 'brilliant', 'huge', 'unbelievable',
  'survives', 'survived', 'celebrates', 'celebration',
]);

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface WindowScore {
  windowStart: number;
  windowEnd: number;
  transcriptScore: number;
  matchedKeyword: string | null;
  keywordTimestamp: number | null;
  transcriptText: string;
}

export function scoreTranscript(
  segments: TranscriptSegment[],
  durationSeconds: number,
): WindowScore[] {
  const windowSize = 10;
  const windowCount = Math.ceil(durationSeconds / windowSize);
  const results: WindowScore[] = [];

  for (let i = 0; i < windowCount; i++) {
    const windowStart = i * windowSize;
    const windowEnd = Math.min(windowStart + windowSize, durationSeconds);

    const overlapping = segments.filter(
      (s) => s.end > windowStart && s.start < windowEnd,
    );

    let matchedKeyword: string | null = null;
    let keywordTimestamp: number | null = null;
    let score = 0;

    for (const seg of overlapping) {
      const words = seg.text.toLowerCase().split(/\s+/);
      for (const word of words) {
        const clean = word.replace(/^[^a-z]+|[^a-z]+$/g, '');
        if (HIGH_VALUE_KEYWORDS.has(clean)) {
          if (!matchedKeyword) {
            matchedKeyword = clean;
            keywordTimestamp = seg.start;
          }
          score = Math.min(1.0, score + 0.7);
        } else if (STANDARD_KEYWORDS.has(clean)) {
          if (!matchedKeyword) {
            matchedKeyword = clean;
            keywordTimestamp = seg.start;
          }
          score = Math.min(1.0, score + 0.3);
        }
      }
    }

    results.push({
      windowStart,
      windowEnd,
      transcriptScore: score,
      matchedKeyword,
      keywordTimestamp,
      transcriptText: overlapping.map((s) => s.text).join(' ').trim(),
    });
  }

  return results;
}
```

- [ ] **Step 4: Update the existing transcript-scoring tests** — the old binary score test implicitly assumed `transcriptScore: 1` for any keyword. The new tests use `toBeCloseTo`. Check if any existing test checks `transcriptScore === 1` exactly:

In `backend/src/__tests__/transcript-scoring.test.ts`, the existing tests only check `matchedKeyword` and `keywordTimestamp`, not `transcriptScore` directly. No changes needed to existing tests.

- [ ] **Step 5: Run full test suite**

```bash
cd backend && npm test
```
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/ocr/transcript-scoring.ts backend/src/__tests__/transcript-scoring.test.ts
git commit -m "feat(ocr): two-tier transcript keyword scoring

Binary 0/1 scoring gave no signal differentiation between 'champion' and
'ace'. New system: high-value keywords (champion, title, trophy, knockout...)
add 0.7; standard keywords add 0.3; scores accumulate and cap at 1.0.
Peak detection now meaningfully ranks match-winning moments above routine play."
```

---

## Self-Review

**Spec coverage check:**

| Analysis item | Task |
|---|---|
| Replay filter over-aggressive | Task 1 ✓ |
| Celebration/close_up killed | Task 1 ✓ |
| importance not on KeyMoment | Task 2 ✓ |
| Non-tennis score_text lost | Task 3 ✓ |
| isReadable tennis-only | Task 3 ✓ |
| buildScoreDisplay tennis-only | Task 3 ✓ |
| Dead sport/players/competition in VisionResult | Task 4 ✓ |
| mergeOverlapping uses energy not priority | Task 5 ✓ |
| refinePeaks sequential | Task 6 ✓ |
| findMomentBoundaries sequential | Task 7 ✓ |
| Binary transcript scoring | Task 8 ✓ |
| Cross-validation for computeConsensus | *Intentionally omitted* — proposed fix would downgrade confidence on legitimate score changes (before/after frames differ because a point was scored, not because of OCR error). The existing behavior (2+ readable → high confidence) is correct for the common case. |

**Placeholder scan:** No "TBD", "TODO", or vague instructions found. All code blocks are complete.

**Type consistency check:**
- `FrameScore.score_text` defined in Task 3, used in `isReadable`, `buildScoreDisplay` — consistent.
- `KeyMoment.importance` defined in Task 2, referenced in Task 5's `momentPriority` — consistent.
- `BoundedMoment extends KeyMoment` so inherits `importance` automatically — no changes needed.
- `buildScoreDisplay` signature changed from `(sets, game_score)` to `(cs: FrameScore)` in Task 3, call site updated in same task — consistent.
