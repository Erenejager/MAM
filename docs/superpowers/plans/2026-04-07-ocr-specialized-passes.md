# OCR Specialized Passes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the OCR vision pass to return per-frame structured scores with consensus, simplify curation to never touch scores, and propagate confidence/delta signals downstream.

**Architecture:** Replace `analyzeFrames()` with `analyzeWithScores()` — a two-section prompt that reads scoreboards per-frame (structured) and describes events separately. Score consensus and confidence are computed in code. Curation only handles labels and moment_type. All downstream stages use structured score data.

**Tech Stack:** TypeScript (ESM), Gemini 2.5 Flash API, ffmpeg, vitest

---

### Task 1: Add FrameScore type and score consensus functions

**Files:**
- Create: `backend/src/lib/ocr/score-consensus.ts`
- Create: `backend/src/__tests__/score-consensus.test.ts`

- [ ] **Step 1: Write failing tests for parseOneFrameScore**

```typescript
// backend/src/__tests__/score-consensus.test.ts
import { describe, it, expect } from 'vitest';
import { parseOneFrameScore, computeConsensus, detectScoreDelta } from '../lib/ocr/score-consensus.js';

describe('parseOneFrameScore', () => {
  it('returns structured score when visible with valid sets', () => {
    const raw = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner' };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({
      visible: true,
      sets: [[6, 3], [5, 2]],
      game_score: '40-15',
      serving: 'Sinner',
    });
  });

  it('returns null sets when visible is false', () => {
    const raw = { visible: false, sets: null, game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({ visible: false, sets: null, game_score: null, serving: null });
  });

  it('returns null sets when sets array is invalid', () => {
    const raw = { visible: true, sets: 'garbage', game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({ visible: true, sets: null, game_score: null, serving: null });
  });

  it('filters out invalid set entries', () => {
    const raw = { visible: true, sets: [[6, 3], 'bad', [5, 2]], game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({ visible: true, sets: [[6, 3], [5, 2]], game_score: null, serving: null });
  });

  it('returns null sets when sets array is empty after filtering', () => {
    const raw = { visible: true, sets: ['bad', 'worse'], game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({ visible: true, sets: null, game_score: null, serving: null });
  });

  it('handles null input gracefully', () => {
    const result = parseOneFrameScore(null);
    expect(result).toBeNull();
  });

  it('handles undefined input gracefully', () => {
    const result = parseOneFrameScore(undefined);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/__tests__/score-consensus.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement parseOneFrameScore**

```typescript
// backend/src/lib/ocr/score-consensus.ts
export interface FrameScore {
  visible: boolean;
  sets: [number, number][] | null;
  game_score: string | null;
  serving: string | null;
}

export function parseOneFrameScore(raw: unknown): FrameScore | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const visible = obj.visible === true;
  let sets: [number, number][] | null = null;

  if (Array.isArray(obj.sets)) {
    const parsed: [number, number][] = [];
    for (const s of obj.sets) {
      if (Array.isArray(s) && s.length === 2 && typeof s[0] === 'number' && typeof s[1] === 'number') {
        parsed.push([s[0], s[1]]);
      }
    }
    sets = parsed.length > 0 ? parsed : null;
  }

  return {
    visible,
    sets,
    game_score: typeof obj.game_score === 'string' ? obj.game_score : null,
    serving: typeof obj.serving === 'string' ? obj.serving : null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/__tests__/score-consensus.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/ocr/score-consensus.ts backend/src/__tests__/score-consensus.test.ts
git commit -m "feat(ocr): add FrameScore type and parseOneFrameScore"
```

---

### Task 2: Implement computeConsensus and detectScoreDelta

**Files:**
- Modify: `backend/src/lib/ocr/score-consensus.ts`
- Modify: `backend/src/__tests__/score-consensus.test.ts`

- [ ] **Step 1: Write failing tests for computeConsensus**

Append to `backend/src/__tests__/score-consensus.test.ts`:

```typescript
describe('computeConsensus', () => {
  it('returns NONE confidence when no frames are readable', () => {
    const frames: [FrameScore | null, FrameScore | null, FrameScore | null] = [
      { visible: false, sets: null, game_score: null, serving: null },
      null,
      { visible: false, sets: null, game_score: null, serving: null },
    ];
    const result = computeConsensus(frames);
    expect(result.consensus).toBeNull();
    expect(result.score_confidence).toBe('none');
  });

  it('returns LOW confidence when only 1 frame is readable', () => {
    const frames: [FrameScore | null, FrameScore | null, FrameScore | null] = [
      null,
      { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner' },
      { visible: false, sets: null, game_score: null, serving: null },
    ];
    const result = computeConsensus(frames);
    expect(result.consensus?.sets).toEqual([[6, 3], [5, 2]]);
    expect(result.score_confidence).toBe('low');
  });

  it('returns HIGH confidence when 2+ frames are readable, prefers AFTER', () => {
    const before: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner' };
    const after: FrameScore = { visible: true, sets: [[6, 3], [5, 3]], game_score: null, serving: null };
    const frames: [FrameScore | null, FrameScore | null, FrameScore | null] = [before, null, after];
    const result = computeConsensus(frames);
    expect(result.consensus?.sets).toEqual([[6, 3], [5, 3]]);
    expect(result.score_confidence).toBe('high');
  });

  it('returns HIGH confidence when all 3 are readable, prefers AFTER', () => {
    const before: FrameScore = { visible: true, sets: [[6, 3], [4, 2]], game_score: '30-0', serving: 'Sinner' };
    const during: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner' };
    const after: FrameScore = { visible: true, sets: [[6, 3], [5, 3]], game_score: null, serving: null };
    const frames: [FrameScore | null, FrameScore | null, FrameScore | null] = [before, during, after];
    const result = computeConsensus(frames);
    expect(result.consensus?.sets).toEqual([[6, 3], [5, 3]]);
    expect(result.score_confidence).toBe('high');
  });

  it('prefers DURING when AFTER is not readable', () => {
    const before: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner' };
    const during: FrameScore = { visible: true, sets: [[6, 3], [5, 3]], game_score: null, serving: null };
    const frames: [FrameScore | null, FrameScore | null, FrameScore | null] = [before, during, null];
    const result = computeConsensus(frames);
    expect(result.consensus?.sets).toEqual([[6, 3], [5, 3]]);
    expect(result.score_confidence).toBe('high');
  });
});

describe('detectScoreDelta', () => {
  it('returns true when BEFORE and AFTER scores differ', () => {
    const before: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner' };
    const after: FrameScore = { visible: true, sets: [[6, 3], [5, 3]], game_score: null, serving: null };
    expect(detectScoreDelta(before, after)).toBe(true);
  });

  it('returns false when BEFORE and AFTER scores are the same', () => {
    const before: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner' };
    const after: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner' };
    expect(detectScoreDelta(before, after)).toBe(false);
  });

  it('returns null when BEFORE is not readable', () => {
    const after: FrameScore = { visible: true, sets: [[6, 3], [5, 3]], game_score: null, serving: null };
    expect(detectScoreDelta(null, after)).toBeNull();
  });

  it('returns null when AFTER is not readable', () => {
    const before: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner' };
    expect(detectScoreDelta(before, null)).toBeNull();
  });

  it('returns null when both are not readable', () => {
    expect(detectScoreDelta(null, null)).toBeNull();
  });

  it('detects game_score change even when sets are the same', () => {
    const before: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '30-15', serving: 'Sinner' };
    const after: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner' };
    expect(detectScoreDelta(before, after)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd backend && npx vitest run src/__tests__/score-consensus.test.ts`
Expected: FAIL — computeConsensus and detectScoreDelta not exported

- [ ] **Step 3: Implement computeConsensus and detectScoreDelta**

Append to `backend/src/lib/ocr/score-consensus.ts`:

```typescript
export interface ConsensusResult {
  consensus: FrameScore | null;
  score_confidence: 'high' | 'low' | 'none';
}

function isReadable(fs: FrameScore | null): fs is FrameScore {
  return fs !== null && fs.visible && fs.sets !== null;
}

export function computeConsensus(
  frames: [FrameScore | null, FrameScore | null, FrameScore | null],
): ConsensusResult {
  const [before, during, after] = frames;
  const readable = [before, during, after].filter(isReadable);

  if (readable.length === 0) {
    return { consensus: null, score_confidence: 'none' };
  }

  if (readable.length === 1) {
    return { consensus: readable[0], score_confidence: 'low' };
  }

  // 2+ readable — prefer AFTER, then DURING, then BEFORE
  const preferred = isReadable(after) ? after : isReadable(during) ? during : before;
  return { consensus: preferred, score_confidence: 'high' };
}

function setsEqual(a: [number, number][] | null, b: [number, number][] | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (a.length !== b.length) return false;
  return a.every((set, i) => set[0] === b[i][0] && set[1] === b[i][1]);
}

export function detectScoreDelta(
  before: FrameScore | null,
  after: FrameScore | null,
): boolean | null {
  if (!isReadable(before) || !isReadable(after)) return null;
  const setsChanged = !setsEqual(before.sets, after.sets);
  const gameScoreChanged = before.game_score !== after.game_score;
  return setsChanged || gameScoreChanged;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/__tests__/score-consensus.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/ocr/score-consensus.ts backend/src/__tests__/score-consensus.test.ts
git commit -m "feat(ocr): add computeConsensus and detectScoreDelta"
```

---

### Task 3: Rewrite vision-api.ts — new prompt and response parser

**Files:**
- Modify: `backend/src/lib/ocr/vision-api.ts`

- [ ] **Step 1: Update VisionResult interface**

Replace the `VisionResult` interface at the top of `backend/src/lib/ocr/vision-api.ts` (lines 6-23) with:

```typescript
import type { FrameScore } from './score-consensus.js';

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

- [ ] **Step 2: Replace buildAnalysisPrompt with buildAnalysisWithScoresPrompt**

Replace the `buildAnalysisPrompt` function (lines 39-89) with the new two-section prompt:

```typescript
function buildAnalysisWithScoresPrompt(ctx: MatchContext, transcriptText: string, audioEnergy: number): string {
  const sportLine = ctx.sport ? `Sport: ${ctx.sport}` : 'Sport: unknown';
  const playersLine = ctx.players.length > 0 ? `Players: ${ctx.players.join(' vs ')}` : '';
  const compLine = ctx.competition ? `Competition: ${ctx.competition}` : '';
  const energyLevel = audioEnergy > 0.7 ? 'very high (crowd roaring)' : audioEnergy > 0.4 ? 'high' : audioEnergy > 0.2 ? 'moderate' : 'low';

  const isTennis = ctx.sport?.toLowerCase() === 'tennis';

  const p1 = ctx.players[0] ?? 'P1';
  const p2 = ctx.players[1] ?? 'P2';

  const scoreInstructions = isTennis
    ? `For tennis:
- "sets": array of [P1_games, P2_games] per set played so far (including current set in progress).
  P1 is ${p1}, P2 is ${p2}. The FIRST number is ALWAYS ${p1}'s games.
  Example: ${p1} won set 1 6-3, current set is 2-1 → [[6, 3], [2, 1]]
- "game_score": point score in current game ("40-15", "AD-40", "deuce") or null if between games
- "serving": who is serving ("${p1}" or "${p2}") or null if not visible
- "visible": true if scoreboard is readable in this frame`
    : `- "score_text": the score as displayed on screen (e.g. "PSG 2 - 1 Marseille"), or null if not visible
- "visible": true if scoreboard is readable in this frame`;

  const scoreExample = isTennis
    ? `{ "visible": true, "sets": [[6, 3], [5, 2]], "game_score": "40-15", "serving": "${p1}" }`
    : `{ "visible": true, "score_text": "Team A 2 - 1 Team B" }`;

  return `You are analyzing 3 frames from a sports broadcast, taken 5 seconds apart (BEFORE → DURING → AFTER).

${sportLine}
${playersLine}
${compLine}
Crowd energy: ${energyLevel}
Commentary at this moment: "${transcriptText || 'none'}"

══════════════════════════════════════
SECTION 1: SCOREBOARD READING
══════════════════════════════════════
For EACH of the 3 frames, read the scoreboard INDEPENDENTLY.
Do NOT use the commentary or crowd energy to guess or infer scores.
Read ONLY what is visible on the scoreboard graphic.
If the scoreboard is not visible or not readable, set "visible": false.

${scoreInstructions}

══════════════════════════════════════
SECTION 2: EVENT DESCRIPTION
══════════════════════════════════════
Now compare the 3 frames. What happened between them?
Use the frames, commentary, and crowd energy to describe the event.

DETERMINE THE FRAME TYPE:
- live_play: Active gameplay with scoreboard visible
- replay: Slow-motion replay (look for replay graphics, slow movement, no live scoreboard)
- celebration: Player celebrating, fist pump, crowd reaction
- close_up: Close-up of player face, equipment, or ball — no scoreboard
- graphics: Full-screen graphic, stats overlay, interview, pre-match ceremony
- other: Anything else

CLASSIFY the importance:
- CRITICAL: Match point won, set/period won, game-winning moment, championship point, decisive goal, red card, knockout
- SIGNIFICANT: Break of serve, penalty, scoring play, momentum shift, challenge/review, key save, injury timeout
- ROUTINE: Regular point, normal play between events, standard serve hold
- FILLER: Replay/slow-motion, crowd shots, player walking, graphics overlay, interview, pre-match ceremony

Return JSON only:
{
  "scores": [
    ${scoreExample},
    ${scoreExample},
    ${scoreExample}
  ],
  "event": "specific description of what happened",
  "frame_type": "live_play|replay|celebration|close_up|graphics|other",
  "importance": "critical|significant|routine|filler",
  "set_period": "set, half, round, period, quarter if visible, or null",
  "game_time": "match clock or elapsed time if visible, or null",
  "venue": "venue name if visible, or null",
  "broadcaster": "network or channel if visible, or null"
}`;
}
```

- [ ] **Step 3: Add 720p frame re-extraction helper**

Add after the `callGemini` function:

```typescript
async function extractFrame720p(videoPath: string, timeSeconds: number, outputPath: string): Promise<void> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  await execFileAsync('ffmpeg', [
    '-ss', String(timeSeconds),
    '-i', videoPath,
    '-frames:v', '1',
    '-vf', 'scale=-1:720',
    '-q:v', '3',
    '-y',
    outputPath,
  ]);
}
```

- [ ] **Step 4: Replace analyzeFrames with analyzeWithScores**

Replace the `analyzeFrames` export function (lines 170-246) with:

```typescript
export async function analyzeWithScores(
  peaks: RefinedPeak[],
  ctx: MatchContext,
  videoPath: string,
): Promise<VisionResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const { resolve } = await import('node:path');
  const { mkdir, unlink } = await import('node:fs/promises');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const queue = new PQueue({ concurrency: 10 });

  const results = await Promise.all(
    peaks.map((peak) =>
      queue.add(async () => {
        try {
          const prompt = buildAnalysisWithScoresPrompt(ctx, peak.transcriptText, peak.audioEnergy);

          // Re-extract 3 frames at 720p for better scoreboard reading
          const tempDir = resolve(peak.framePath, '..');
          const hqBefore = resolve(tempDir, `hq_before_${peak.timestamp}.jpg`);
          const hqDuring = resolve(tempDir, `hq_during_${peak.timestamp}.jpg`);
          const hqAfter = resolve(tempDir, `hq_after_${peak.timestamp}.jpg`);

          const beforeTime = Math.max(0, peak.timestamp - 5);
          const afterTime = peak.timestamp + 5;

          await Promise.all([
            extractFrame720p(videoPath, beforeTime, hqBefore),
            extractFrame720p(videoPath, peak.timestamp, hqDuring),
            extractFrame720p(videoPath, afterTime, hqAfter),
          ]);

          // Load 720p frames
          const imageParts: Array<{ mimeType: string; data: string }> = [];

          try {
            const buf = await readFile(hqBefore);
            imageParts.push({ mimeType: 'image/jpeg', data: buf.toString('base64') });
          } catch { /* before frame may not exist at video start */ }

          const mainBuf = await readFile(hqDuring);
          imageParts.push({ mimeType: 'image/jpeg', data: mainBuf.toString('base64') });

          try {
            const buf = await readFile(hqAfter);
            imageParts.push({ mimeType: 'image/jpeg', data: buf.toString('base64') });
          } catch { /* after frame may not exist at video end */ }

          const parsed = await callGemini(model, prompt, imageParts);

          // Clean up 720p temp frames
          await Promise.all([
            unlink(hqBefore).catch(() => {}),
            unlink(hqDuring).catch(() => {}),
            unlink(hqAfter).catch(() => {}),
          ]);

          if (!parsed) return null;

          // Parse per-frame scores
          const rawScores = Array.isArray(parsed.scores) ? parsed.scores : [];
          const frame_scores: [FrameScore | null, FrameScore | null, FrameScore | null] = [
            parseOneFrameScore(rawScores[0]),
            parseOneFrameScore(rawScores[1]),
            parseOneFrameScore(rawScores[2]),
          ];

          // Compute consensus and delta
          const { consensus, score_confidence } = computeConsensus(frame_scores);
          const score_changed = detectScoreDelta(frame_scores[0], frame_scores[2]);

          const frameType = String(parsed.frame_type ?? '').toLowerCase();
          const validFrameTypes = ['live_play', 'replay', 'celebration', 'close_up', 'graphics', 'other'];

          return {
            timestamp: peak.timestamp,
            matchedKeyword: peak.matchedKeyword,
            transcriptText: peak.transcriptText,
            audioEnergy: peak.audioEnergy,
            frame_scores,
            consensus,
            score_changed,
            score_confidence,
            sport: parsed.sport as string ?? null,
            players: Array.isArray(parsed.players) ? (parsed.players as string[]) : [],
            competition: parsed.competition as string ?? null,
            frame_type: validFrameTypes.includes(frameType)
              ? (frameType as VisionResult['frame_type'])
              : null,
            set_period: parsed.set_period as string ?? null,
            game_time: parsed.game_time as string ?? null,
            venue: parsed.venue as string ?? null,
            broadcaster: parsed.broadcaster as string ?? null,
            event: parsed.event as string ?? null,
            importance: ['critical', 'significant', 'routine', 'filler'].includes(
              String(parsed.importance).toLowerCase(),
            )
              ? (String(parsed.importance).toLowerCase() as VisionResult['importance'])
              : null,
          } as VisionResult;
        } catch {
          return null;
        }
      }),
    ),
  );

  return results.filter((r): r is VisionResult => r !== null);
}
```

- [ ] **Step 5: Add import for score-consensus functions at top of file**

Add after the existing imports:

```typescript
import { parseOneFrameScore, computeConsensus, detectScoreDelta } from './score-consensus.js';
import type { FrameScore } from './score-consensus.js';
```

- [ ] **Step 6: Run build to verify no type errors**

Run: `cd backend && npm run build`
Expected: Compilation errors in files that import `VisionResult` (result-processing.ts) — this is expected, we fix those in Task 4.

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/ocr/vision-api.ts
git commit -m "feat(ocr): replace analyzeFrames with analyzeWithScores — per-frame structured scores at 720p"
```

---

### Task 4: Update result-processing.ts — use structured scores, simplify curation

**Files:**
- Modify: `backend/src/lib/ocr/result-processing.ts`

- [ ] **Step 1: Update KeyMoment interface**

Replace the `KeyMoment` interface (lines 4-23) with:

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
  set_period: string | null;
  game_time: string | null;
  transcript: string;
  audio_energy: number;
  startTime?: number;
  endTime?: number;
  peakTime?: number;
}
```

- [ ] **Step 2: Update processResults to use consensus scores**

Replace the `processResults` function (lines 33-117) with:

```typescript
export function processResults(results: VisionResult[]): OcrOutput {
  if (results.length === 0) {
    return { sport: null, competition: null, players: [], keyMoments: [] };
  }

  const valid = results.filter(
    (r) => r.sport || r.consensus || r.players.length > 0 || r.event,
  );

  if (valid.length === 0) {
    return { sport: null, competition: null, players: [], keyMoments: [] };
  }

  const sport = mostFrequent(valid.map((r) => r.sport).filter(Boolean) as string[]);
  const competition = mostFrequent(
    valid.map((r) => r.competition).filter(Boolean) as string[],
  );

  const playerCounts = new Map<string, { count: number; original: string }>();
  for (const r of valid) {
    for (const p of r.players) {
      const key = p.toLowerCase().trim();
      const existing = playerCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        playerCounts.set(key, { count: 1, original: p });
      }
    }
  }
  const confirmedPlayers = [...playerCounts.values()]
    .filter((p) => p.count >= 3 || valid.length < 5)
    .map((p) => p.original);

  const consistent = sport
    ? valid.filter((r) => !r.sport || r.sport.toLowerCase() === sport.toLowerCase())
    : valid;

  const sorted = [...consistent].sort((a, b) => a.timestamp - b.timestamp);

  // Filter out routine and filler moments
  const meaningful = sorted.filter(
    (r) => !r.importance || r.importance === 'critical' || r.importance === 'significant',
  );

  // Filter out replays — use score_changed + frame_type for reliable detection
  const noReplays = meaningful.filter((r) => {
    const isReplay = r.frame_type === 'replay' ||
      (r.score_changed === false && r.frame_type !== 'live_play');
    if (isReplay) console.log(`[ocr] Filtered replay at ${fmtTimestamp(r.timestamp)}`);
    return !isReplay;
  });

  const keyMoments: KeyMoment[] = [];
  for (const r of noReplays) {
    const label = r.event ?? r.matchedKeyword ?? null;
    if (!label) continue;

    const cs = r.consensus;

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
      set_period: r.set_period,
      game_time: r.game_time,
      transcript: r.transcriptText,
      audio_energy: r.audioEnergy,
    });
  }

  return { sport, competition, players: confirmedPlayers, keyMoments };
}
```

- [ ] **Step 3: Update curateKeyMoments — tennis prompt removes all score instructions**

Replace the `curateKeyMoments` function (lines 150-332) with:

```typescript
export async function curateKeyMoments(output: OcrOutput): Promise<OcrOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || output.keyMoments.length === 0) return output;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const isTennis = output.sport?.toLowerCase() === 'tennis';

  const momentsList = output.keyMoments.map((m, i) => {
    const time = fmtTimestamp(m.timestamp);
    const scorePart = m.score_display
      ? m.score_changed
        ? ` | Score: ${m.score_display} [CHANGED]`
        : ` | Score: ${m.score_display} [unchanged]`
      : '';
    return `[#${i} ${time}] ${m.label}${scorePart}${m.set_period ? ` | ${m.set_period}` : ''}`;
  }).join('\n');

  const tennisPrompt = `You are curating a highlight timeline for a Tennis match.
${output.players.length > 0 ? `Players: ${output.players.join(' vs ')}` : ''}
${output.competition ? `Competition: ${output.competition}` : ''}

Here are ${output.keyMoments.length} candidate moments:

${momentsList}

YOUR JOB:
1. Remove duplicates and near-duplicates (same event described differently, moments <30s apart covering the same thing)
2. Remove moments that are NOT fan-worthy — routine holds, generic "match in progress", replays
3. Moments where the score is UNCHANGED are less likely to be important — scrutinize harder
4. KEEP: break of serve, set/match won, break points, match points, spectacular rallies, momentum shifts
5. Rewrite labels to be SHORT (max 10-12 words). Include WHO did WHAT.
   - BAD: "Carlos Alcaraz wins a crucial point, bringing the score to Deuce"
   - GOOD: "Alcaraz saves break point, back to deuce"
6. Aim for 10-20 moments for a full match

IMPORTANT: Do NOT return any score fields. Scores are already locked from frame analysis.

MOMENT TYPES — classify each moment with exactly one:
break_of_serve, set_won, match_won, break_point, break_point_saved, ace, match_point, rally, hold, deuce, tiebreak, challenge, injury_timeout, double_fault

Return JSON array only — no markdown, no explanation:
[
  { "index": 0, "label": "short label", "moment_type": "break_of_serve" }
]`;

  const genericPrompt = `You are curating a highlight timeline for a ${output.sport ?? 'sports'} match.
${output.players.length > 0 ? `Players: ${output.players.join(' vs ')}` : ''}
${output.competition ? `Competition: ${output.competition}` : ''}

Here are ${output.keyMoments.length} candidate moments:

${momentsList}

YOUR JOB:
1. Remove duplicates and near-duplicates (same event described differently, moments seconds apart covering the same thing)
2. Remove moments that are NOT fan-worthy — routine plays, replays of non-critical moments
3. Moments where the score is UNCHANGED are less likely to be important — scrutinize them harder
4. KEEP: decisive moments, spectacular plays, momentum shifts, match conclusion
5. Rewrite labels to be SHORT (max 10-12 words). Include WHO did WHAT.
   - BAD: "Carlos Alcaraz wins a crucial point"
   - GOOD: "Alcaraz saves break point, back to deuce"
6. Aim for 10-20 moments for a full match, fewer for shorter content

IMPORTANT: Do NOT return any score fields. Scores are already locked from frame analysis.

Return JSON array only — no markdown, no explanation:
[
  { "index": 0, "label": "short label" }
]`;

  const prompt = isTennis ? tennisPrompt : genericPrompt;

  try {
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await model.generateContent([prompt]);
        break;
      } catch (err: unknown) {
        const is429 = err instanceof Error && err.message.includes('429');
        if (!is429 || attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }

    if (!response) return output;

    const text = response.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return output;

    const curated = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;

    if (!Array.isArray(curated) || curated.length === 0) return output;

    // Match curated entries back to originals by index
    const curatedMoments: KeyMoment[] = [];
    for (const c of curated) {
      const index = typeof c.index === 'number' ? c.index : -1;
      const original = index >= 0 && index < output.keyMoments.length
        ? output.keyMoments[index]
        : null;

      if (!original) {
        // Fallback: try timestamp matching if index is missing
        const parts = String(c.timestamp_str ?? '').split(':').map(Number);
        const targetSec = (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
        let best: KeyMoment | null = null;
        let bestDist = 30;
        for (const m of output.keyMoments) {
          const dist = Math.abs(m.timestamp - targetSec);
          if (dist < bestDist) {
            bestDist = dist;
            best = m;
          }
        }
        if (!best) continue;
        curatedMoments.push({
          ...best,
          label: String(c.label),
          moment_type: typeof c.moment_type === 'string' ? c.moment_type : null,
        });
        continue;
      }

      curatedMoments.push({
        ...original,
        label: String(c.label),
        moment_type: typeof c.moment_type === 'string' ? c.moment_type : null,
      });
    }

    // Sort chronologically
    curatedMoments.sort((a, b) => a.timestamp - b.timestamp);

    // Tennis post-processing
    if (isTennis) {
      validateScoreProgression(curatedMoments);
      interpolateScores(curatedMoments);
      deriveSetPeriods(curatedMoments);
      fixMomentTypeOrder(curatedMoments);
    }

    console.log(`[ocr] Curated: ${output.keyMoments.length} → ${curatedMoments.length} moments`);
    return { ...output, keyMoments: curatedMoments };
  } catch (err) {
    console.error('[ocr] Curation pass failed, using uncurated results:', err);
    return output;
  }
}
```

- [ ] **Step 4: Update fixMomentTypeOrder to also validate set_won**

Replace the `fixMomentTypeOrder` function (lines 463-481) with:

```typescript
function fixMomentTypeOrder(moments: KeyMoment[]): void {
  // Only one match_won — the last chronologically
  let lastMatchWonIdx = -1;
  for (let i = moments.length - 1; i >= 0; i--) {
    if (moments[i].moment_type === 'match_won') {
      lastMatchWonIdx = i;
      break;
    }
  }
  if (lastMatchWonIdx >= 0) {
    for (let i = 0; i < lastMatchWonIdx; i++) {
      if (moments[i].moment_type === 'match_won') {
        console.log(`[ocr] Downgraded premature match_won at index ${i} to match_point`);
        moments[i].moment_type = 'match_point';
      }
    }
  }

  // Validate set_won count against actual completed sets in score data
  let maxCompletedSets = 0;
  let setWonCount = 0;
  for (const m of moments) {
    if (m.sets && m.sets.length > 1) {
      const completedSets = m.sets.length - 1; // last set is in progress
      maxCompletedSets = Math.max(maxCompletedSets, completedSets);
    }
    if (m.moment_type === 'set_won') {
      setWonCount++;
      if (setWonCount > maxCompletedSets) {
        console.log(`[ocr] Downgraded excess set_won at ${fmtTimestamp(m.timestamp)} to rally (${setWonCount} set_won but only ${maxCompletedSets} completed sets)`);
        m.moment_type = 'rally';
      }
    }
  }
}
```

- [ ] **Step 5: Remove the old `parseSets` function**

Delete the `parseSets` function (lines 419-428) — it's no longer needed since scores come pre-parsed from `score-consensus.ts`.

- [ ] **Step 6: Run build to verify no type errors**

Run: `cd backend && npm run build`
Expected: Compilation errors in `index.ts` (still calls `analyzeFrames`) — fixed in Task 5.

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/ocr/result-processing.ts
git commit -m "feat(ocr): update result-processing to use structured consensus scores, simplify curation"
```

---

### Task 5: Update orchestrator and moment-boundaries

**Files:**
- Modify: `backend/src/lib/ocr/index.ts`
- Modify: `backend/src/lib/ocr/moment-boundaries.ts`

- [ ] **Step 1: Update index.ts to use analyzeWithScores**

In `backend/src/lib/ocr/index.ts`, replace the import on line 7:

```typescript
// Old:
import { identifyMatch, analyzeFrames } from './vision-api.js';
// New:
import { identifyMatch, analyzeWithScores } from './vision-api.js';
```

Then replace the `analyzeFrames` call (line 45):

```typescript
// Old:
const visionResults = await analyzeFrames(refinedPeaks, matchCtx);
// New:
const visionResults = await analyzeWithScores(refinedPeaks, matchCtx, videoPath);
```

- [ ] **Step 2: Update moment-boundaries near-duplicate threshold and score comparison**

In `backend/src/lib/ocr/moment-boundaries.ts`:

Change the `NEAR_THRESHOLD` constant on line 106:

```typescript
// Old:
const NEAR_THRESHOLD = 90; // seconds between peaks
// New:
const NEAR_THRESHOLD = 60; // seconds between peaks (one tennis game can be played in 90s)
```

Update the comment on line 99 to match.

Then update the score comparison in `mergeNearDuplicates` (lines 116-118):

```typescript
// Old:
const prevScore = prev.score_source === 'visible' ? prev.score_display : null;
const currScore = curr.score_source === 'visible' ? curr.score_display : null;
if (prevScore && currScore && prevScore !== currScore) {
// New:
const bothConfident = prev.score_confidence === 'high' && curr.score_confidence === 'high';
const scoresKnown = prev.score_display && curr.score_display;
if (bothConfident && scoresKnown && prev.score_display !== curr.score_display) {
```

- [ ] **Step 3: Run build to verify no type errors**

Run: `cd backend && npm run build`
Expected: PASS — all types should align now.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/ocr/index.ts backend/src/lib/ocr/moment-boundaries.ts
git commit -m "feat(ocr): wire analyzeWithScores into pipeline, fix near-duplicate threshold to 60s"
```

---

### Task 6: Update context-enrichment to use structured scores

**Files:**
- Modify: `backend/src/lib/ocr/context-enrichment.ts`

- [ ] **Step 1: Update score fields in context building**

In `backend/src/lib/ocr/context-enrichment.ts`, replace the score section of the context object (lines 73-89):

```typescript
    // 4. Context JSON
    const prevScoreDisplay = i > 0 ? moments[i - 1].score_display : null;
    const currentScoreDisplay = moment.score_display;

    const context: MomentContext = {
      label: moment.label,
      score: currentScoreDisplay,
      set_period: moment.set_period,
      game_time: moment.game_time,
      sport,
      competition,
      peakTime,
      suggestedStartTime: moment.startTime,
      suggestedEndTime: moment.endTime,
      scoreBefore: prevScoreDisplay,
      scoreAfter: currentScoreDisplay,
      scoreChanged: moment.score_changed ?? false,
      audioEnergy: moment.audio_energy,
      momentIndex: i,
    };
```

- [ ] **Step 2: Run build to verify**

Run: `cd backend && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/ocr/context-enrichment.ts
git commit -m "fix(ocr): context enrichment uses score_display instead of free-text score"
```

---

### Task 7: Update frontend — KeyMomentsList and VideoProgressBar

**Files:**
- Modify: `frontend/src/components/detail/KeyMomentsList.tsx`
- Modify: `frontend/src/components/detail/VideoProgressBar.tsx`

- [ ] **Step 1: Update KeyMoment interface in KeyMomentsList.tsx**

In `frontend/src/components/detail/KeyMomentsList.tsx`, replace the `KeyMoment` interface (lines 5-19):

```typescript
interface KeyMoment {
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
  set_period: string | null;
  game_time: string | null;
  transcript: string;
  audio_energy: number;
}
```

Then update the score display condition (line 148) to only show HIGH confidence scores:

```typescript
{moment.score_display && moment.score_confidence === 'high' && (
```

- [ ] **Step 2: Update VideoProgressBar.tsx to use score_display instead of score**

In `frontend/src/components/detail/VideoProgressBar.tsx`, find the lines that reference `moments[...].score` (lines 255-257 and 307-309) and replace `.score` with `.score_display`:

```typescript
// Line 255 — replace:
{(moments[hoveredMomentIdx].score || moments[hoveredMomentIdx].set_period) && (
// With:
{(moments[hoveredMomentIdx].score_display || moments[hoveredMomentIdx].set_period) && (

// Line 257 — replace:
{[moments[hoveredMomentIdx].score, moments[hoveredMomentIdx].set_period]
// With:
{[moments[hoveredMomentIdx].score_display, moments[hoveredMomentIdx].set_period]

// Line 307 — replace:
{(moments[floatingCard.index].score || moments[floatingCard.index].set_period) && (
// With:
{(moments[floatingCard.index].score_display || moments[floatingCard.index].set_period) && (

// Line 309 — replace:
{[moments[floatingCard.index].score, moments[floatingCard.index].set_period]
// With:
{[moments[floatingCard.index].score_display, moments[floatingCard.index].set_period]
```

- [ ] **Step 3: Run frontend build to verify**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/detail/KeyMomentsList.tsx frontend/src/components/detail/VideoProgressBar.tsx
git commit -m "feat(frontend): update score display to use structured scores with confidence gating"
```

---

### Task 8: Final integration verification

**Files:** None (verification only)

- [ ] **Step 1: Run full backend build**

Run: `cd backend && npm run build`
Expected: PASS — zero type errors

- [ ] **Step 2: Run all backend tests**

Run: `cd backend && npm test`
Expected: All tests pass including new score-consensus tests

- [ ] **Step 3: Run frontend build**

Run: `cd frontend && npm run build`
Expected: PASS — zero type errors

- [ ] **Step 4: Verify no leftover references to old fields**

Run: `cd /home/clawdbot/MAM && grep -rn "score_visible" backend/src/lib/ocr/ frontend/src/`
Expected: No matches (field fully removed)

Run: `cd /home/clawdbot/MAM && grep -rn "\"score\":" backend/src/lib/ocr/result-processing.ts backend/src/lib/ocr/vision-api.ts`
Expected: No matches for the old free-text score field in these files

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore(ocr): verify clean build after specialized passes migration"
```
