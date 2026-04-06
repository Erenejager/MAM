# Pipeline Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the OCR pipeline to store rich per-moment context (audio curve, key frames, word-level transcript, score deltas) on disk, feed word-level transcript timestamps back into peak detection for better precision, pass score deltas to the curation prompt, and add a lightweight frontend inspection panel.

**Architecture:** New Pass 5 ("Context Enrichment") runs after curation + boundaries. It extracts and persists context data to `{STORAGE_ROOT}/{uuid}/moments/{index}/`. Transcript scoring gains word-level keyword anchoring from Whisper segments. Curation prompt receives score transition data. A new DB column `ocrEnriched` tracks enrichment status. Frontend gets an expandable "Context" drawer per moment.

**Tech Stack:** TypeScript (ESM), Fastify, ffmpeg (frame extraction), Drizzle ORM (migration), React + Tailwind CSS 3 (frontend inspection UI)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/lib/ocr/transcript-scoring.ts` | Modify | Add `keywordTimestamp` to `WindowScore`, use word-level Whisper timestamps |
| `backend/src/lib/ocr/peak-detection.ts` | Modify | Use `keywordTimestamp` when available instead of window midpoint |
| `backend/src/lib/ocr/result-processing.ts` | Modify | Pass score delta info to curation prompt |
| `backend/src/lib/ocr/context-enrichment.ts` | Create | New Pass 5 — extract + store audio curve, frames, transcript segments, context.json |
| `backend/src/lib/ocr/index.ts` | Modify | Wire Pass 5 into pipeline after boundaries |
| `backend/src/db/schema.ts` | Modify | Add `ocrEnriched` column |
| `backend/drizzle/` | Generate | New migration for `ocrEnriched` column |
| `backend/src/lib/pipeline.ts` | Modify | Set `ocrEnriched` after successful enrichment |
| `backend/src/routes/assets.ts` | Modify | Serve moment context data via new endpoint |
| `frontend/src/components/detail/MomentContext.tsx` | Create | Expandable context drawer (audio sparkline, frame strip, transcript segments) |
| `frontend/src/components/detail/VideoPlayer.tsx` | Modify | Wire MomentContext into moment timeline |
| `backend/src/__tests__/transcript-scoring.test.ts` | Create | Tests for word-level anchoring |
| `backend/src/__tests__/context-enrichment.test.ts` | Create | Tests for enrichment pass |

---

### Task 1: Add `keywordTimestamp` to Transcript Scoring

**Files:**
- Modify: `backend/src/lib/ocr/transcript-scoring.ts`
- Create: `backend/src/__tests__/transcript-scoring.test.ts`

Currently `scoreTranscript` divides the video into 10s windows and returns a binary 1/0 if a keyword is found. The timestamp used for the peak is the window midpoint `(windowStart + windowEnd) / 2`. This task adds word-level precision: when a keyword is found, use the Whisper segment's `start` time as `keywordTimestamp`.

The `TranscriptSegment` type already has `start` and `end` fields from Groq Whisper. We need to track which segment contained the matched keyword.

- [ ] **Step 1: Write failing test for keywordTimestamp**

Create `backend/src/__tests__/transcript-scoring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { scoreTranscript, type TranscriptSegment } from '../lib/ocr/transcript-scoring.js';

describe('scoreTranscript', () => {
  it('returns keywordTimestamp from the segment containing the matched keyword', () => {
    const segments: TranscriptSegment[] = [
      { start: 2.1, end: 4.5, text: 'and he hits an incredible ace' },
      { start: 5.0, end: 8.0, text: 'the crowd goes wild' },
    ];

    const results = scoreTranscript(segments, 20);

    // The keyword "ace" is in the segment starting at 2.1s, which falls in window [0, 10)
    const window0 = results[0];
    expect(window0.matchedKeyword).toBe('ace');
    expect(window0.keywordTimestamp).toBe(2.1);
  });

  it('returns null keywordTimestamp when no keyword matched', () => {
    const segments: TranscriptSegment[] = [
      { start: 0, end: 5, text: 'nothing interesting happening here' },
    ];

    const results = scoreTranscript(segments, 10);
    expect(results[0].matchedKeyword).toBeNull();
    expect(results[0].keywordTimestamp).toBeNull();
  });

  it('uses the earliest keyword-bearing segment when multiple keywords exist in a window', () => {
    const segments: TranscriptSegment[] = [
      { start: 1.0, end: 3.0, text: 'what an incredible shot' },
      { start: 4.0, end: 6.0, text: 'amazing goal by the striker' },
    ];

    const results = scoreTranscript(segments, 10);
    // "incredible" is found first in iteration, but we want the segment start time of the first keyword found
    expect(results[0].keywordTimestamp).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/__tests__/transcript-scoring.test.ts`
Expected: FAIL — `keywordTimestamp` property does not exist on `WindowScore`

- [ ] **Step 3: Add `keywordTimestamp` to WindowScore and scoreTranscript**

Modify `backend/src/lib/ocr/transcript-scoring.ts`:

Add `keywordTimestamp` field to the `WindowScore` interface:

```typescript
export interface WindowScore {
  windowStart: number;
  windowEnd: number;
  transcriptScore: number;
  matchedKeyword: string | null;
  keywordTimestamp: number | null;  // word-level timestamp from Whisper segment
  transcriptText: string;
}
```

Modify the `scoreTranscript` function body. Replace the keyword search loop and result push to track which segment contained the keyword:

```typescript
  for (let i = 0; i < windowCount; i++) {
    const windowStart = i * windowSize;
    const windowEnd = Math.min(windowStart + windowSize, durationSeconds);

    const overlapping = segments.filter(
      (s) => s.end > windowStart && s.start < windowEnd,
    );

    let matchedKeyword: string | null = null;
    let keywordTimestamp: number | null = null;

    // Check each segment individually to preserve word-level timestamp
    for (const seg of overlapping) {
      const words = seg.text.toLowerCase().split(/\s+/);
      for (const word of words) {
        const clean = word.replace(/^[^a-z]+|[^a-z]+$/g, '');
        if (ACTION_KEYWORDS.has(clean)) {
          matchedKeyword = clean;
          keywordTimestamp = seg.start;
          break;
        }
      }
      if (matchedKeyword) break;
    }

    results.push({
      windowStart,
      windowEnd,
      transcriptScore: matchedKeyword ? 1 : 0,
      matchedKeyword,
      keywordTimestamp,
      transcriptText: overlapping.map((s) => s.text).join(' ').trim(),
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/__tests__/transcript-scoring.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/ocr/transcript-scoring.ts backend/src/__tests__/transcript-scoring.test.ts
git commit -m "feat: add word-level keywordTimestamp to transcript scoring"
```

---

### Task 2: Use `keywordTimestamp` in Peak Detection

**Files:**
- Modify: `backend/src/lib/ocr/peak-detection.ts`

Currently the peak timestamp is computed as `(windowStart + windowEnd) / 2` (line 49 of peak-detection.ts). When `keywordTimestamp` is available, use it instead — it's more precise.

- [ ] **Step 1: Import the updated WindowScore type**

No change needed — `WindowScore` is already imported from `transcript-scoring.js` and `keywordTimestamp` was added in Task 1.

- [ ] **Step 2: Use keywordTimestamp when available**

In `backend/src/lib/ocr/peak-detection.ts`, replace the timestamp computation inside the `merged` loop:

Change this line (line 49):
```typescript
    const timestamp = (peak.windowStart + peak.windowEnd) / 2;
```

To:
```typescript
    const timestamp = peak.keywordTimestamp ?? (peak.windowStart + peak.windowEnd) / 2;
```

This requires passing `keywordTimestamp` through the `combined` array. Update the `combined` mapping (around line 26) to include `keywordTimestamp`:

```typescript
  const combined = transcriptScores.map((ts, i) => ({
    windowStart: ts.windowStart,
    windowEnd: ts.windowEnd,
    keywordTimestamp: ts.keywordTimestamp,
    combinedScore: 0.6 * ts.transcriptScore + 0.4 * (audioEnergies[i] ?? 0),
    matchedKeyword: ts.matchedKeyword,
    transcriptText: ts.transcriptText,
    audioEnergy: audioEnergies[i] ?? 0,
  }));
```

And in the merged loop, use it:

```typescript
    const timestamp = peak.keywordTimestamp ?? (peak.windowStart + peak.windowEnd) / 2;
```

- [ ] **Step 3: Run existing tests**

Run: `cd backend && npx vitest run`
Expected: All tests pass (no regressions)

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/ocr/peak-detection.ts
git commit -m "feat: use word-level keywordTimestamp for more precise peak positioning"
```

---

### Task 3: Pass Score Deltas to Curation Prompt

**Files:**
- Modify: `backend/src/lib/ocr/result-processing.ts`

Currently the curation prompt shows each moment as `[M:SS] label | score | set_period`. Scores are snapshots — the LLM can't tell if the score changed. By showing score *transitions* (previous → current), the LLM can deprioritize moments where nothing changed on the scoreboard.

- [ ] **Step 1: Compute score deltas in momentsList formatting**

In `backend/src/lib/ocr/result-processing.ts`, inside `curateKeyMoments`, replace the `momentsList` construction (lines 138-141):

```typescript
  const momentsList = output.keyMoments.map((m, i) => {
    const time = `${Math.floor(m.timestamp / 60)}:${String(Math.floor(m.timestamp % 60)).padStart(2, '0')}`;
    const prevScore = i > 0 ? output.keyMoments[i - 1].score : null;
    const scoreChanged = prevScore && m.score && prevScore !== m.score;
    const scorePart = m.score
      ? scoreChanged
        ? ` | Score: ${prevScore} → ${m.score}`
        : ` | Score: ${m.score} (unchanged)`
      : '';
    return `[${time}] ${m.label}${scorePart}${m.set_period ? ` | ${m.set_period}` : ''}`;
  }).join('\n');
```

- [ ] **Step 2: Add score delta guidance to curation prompt**

In the same function, add a directive to the prompt string. After the line `2. Remove moments that are NOT fan-worthy...`, add:

```
3. Moments where the score is UNCHANGED are less likely to be important — scrutinize them harder. They may be replays, celebrations, or non-scoring events. Don't auto-remove them (a spectacular rally that doesn't change the score IS worth keeping) but raise the bar.
```

Renumber subsequent directives (3→4, 4→5, 5→6, 6→7).

- [ ] **Step 3: Run backend tests**

Run: `cd backend && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/ocr/result-processing.ts
git commit -m "feat: pass score deltas to curation prompt for better filtering"
```

---

### Task 4: Add `ocrEnriched` Database Column

**Files:**
- Modify: `backend/src/db/schema.ts`
- Generate: `backend/drizzle/` (new migration)

- [ ] **Step 1: Add column to schema**

In `backend/src/db/schema.ts`, add after the `ocrKeyMoments` line:

```typescript
  ocrEnriched: integer('ocr_enriched', { mode: 'boolean' }).default(false),
```

- [ ] **Step 2: Generate migration**

Run: `cd backend && npm run db:generate`
Expected: New migration file created in `backend/drizzle/`

- [ ] **Step 3: Apply migration**

Run: `cd backend && npm run db:migrate`
Expected: Migration applied successfully

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle/
git commit -m "feat: add ocrEnriched column for context enrichment tracking"
```

---

### Task 5: Create Context Enrichment Module (Pass 5)

**Files:**
- Create: `backend/src/lib/ocr/context-enrichment.ts`
- Create: `backend/src/__tests__/context-enrichment.test.ts`

This is the core new module. For each curated key moment, it extracts and saves:
1. **Audio curve** — 1s-window energy values ±90s around peak (reuses `computeFinegrainEnergy`)
2. **Key frames** — 15-18 JPEGs: ±30s@5s intervals + ±5s@1s around peak
3. **Transcript segments** — Whisper segments ±60s around peak
4. **Context JSON** — score before/after, sport, period, vision result, silence boundaries

Storage: `{assetDir}/moments/{momentIndex}/`

- [ ] **Step 1: Write failing test for enrichMoments**

Create `backend/src/__tests__/context-enrichment.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichMoments, type EnrichmentInput } from '../lib/ocr/context-enrichment.js';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

// We can't run ffmpeg in unit tests, so mock computeFinegrainEnergy and frame extraction
vi.mock('../lib/ocr/audio-peaks.js', () => ({
  computeFinegrainEnergy: vi.fn().mockResolvedValue({
    offset: 30,
    energies: Array(180).fill(0.5),
  }),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
    cb(null, '', '');
  }),
}));

describe('enrichMoments', () => {
  const testDir = resolve(tmpdir(), `mam-test-enrich-${Date.now()}`);

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
    await mkdir(testDir, { recursive: true });
  });

  it('creates moments directory structure with context.json', async () => {
    const input: EnrichmentInput = {
      videoPath: '/fake/video.mp4',
      assetDir: testDir,
      durationSeconds: 600,
      moments: [
        {
          timestamp: 120,
          label: 'Break of serve',
          score: '3-2',
          set_period: 'Set 1',
          game_time: null,
          transcript: 'What a shot',
          audio_energy: 0.8,
          startTime: 110,
          endTime: 130,
          peakTime: 120,
        },
      ],
      transcriptSegments: [
        { start: 115, end: 118, text: 'incredible shot down the line' },
        { start: 119, end: 122, text: 'and he breaks serve' },
      ],
      sport: 'Tennis',
      competition: 'Roland Garros',
    };

    await enrichMoments(input);

    // Verify context.json was created
    const contextPath = resolve(testDir, 'moments', '0', 'context.json');
    const context = JSON.parse(await readFile(contextPath, 'utf-8'));

    expect(context.label).toBe('Break of serve');
    expect(context.score).toBe('3-2');
    expect(context.sport).toBe('Tennis');
    expect(context.suggestedStartTime).toBe(110);
    expect(context.suggestedEndTime).toBe(130);
    expect(context.peakTime).toBe(120);
  });

  it('stores transcript segments within ±60s of peak', async () => {
    const input: EnrichmentInput = {
      videoPath: '/fake/video.mp4',
      assetDir: testDir,
      durationSeconds: 600,
      moments: [
        {
          timestamp: 300,
          label: 'Goal',
          score: '1-0',
          set_period: 'First Half',
          game_time: '32:00',
          transcript: 'Goal!',
          audio_energy: 0.95,
          startTime: 290,
          endTime: 310,
          peakTime: 300,
        },
      ],
      transcriptSegments: [
        { start: 100, end: 105, text: 'far away segment' },     // outside ±60s
        { start: 250, end: 255, text: 'building up nicely' },    // within ±60s
        { start: 298, end: 302, text: 'he scores a goal' },      // within ±60s
        { start: 350, end: 355, text: 'another segment in range' }, // within ±60s
        { start: 400, end: 405, text: 'too far after' },         // outside ±60s
      ],
      sport: 'Football',
      competition: null,
    };

    await enrichMoments(input);

    const transcriptPath = resolve(testDir, 'moments', '0', 'transcript.json');
    const segments = JSON.parse(await readFile(transcriptPath, 'utf-8'));

    expect(segments).toHaveLength(3);
    expect(segments[0].text).toBe('building up nicely');
    expect(segments[1].text).toBe('he scores a goal');
    expect(segments[2].text).toBe('another segment in range');
  });

  it('computes score delta from previous moment', async () => {
    const input: EnrichmentInput = {
      videoPath: '/fake/video.mp4',
      assetDir: testDir,
      durationSeconds: 600,
      moments: [
        {
          timestamp: 100, label: 'Point 1', score: '15-0', set_period: 'Set 1',
          game_time: null, transcript: '', audio_energy: 0.5,
          startTime: 90, endTime: 110, peakTime: 100,
        },
        {
          timestamp: 200, label: 'Point 2', score: '30-0', set_period: 'Set 1',
          game_time: null, transcript: '', audio_energy: 0.6,
          startTime: 190, endTime: 210, peakTime: 200,
        },
        {
          timestamp: 300, label: 'Point 3', score: '30-0', set_period: 'Set 1',
          game_time: null, transcript: '', audio_energy: 0.4,
          startTime: 290, endTime: 310, peakTime: 300,
        },
      ],
      transcriptSegments: [],
      sport: 'Tennis',
      competition: null,
    };

    await enrichMoments(input);

    const ctx0 = JSON.parse(await readFile(resolve(testDir, 'moments', '0', 'context.json'), 'utf-8'));
    expect(ctx0.scoreBefore).toBeNull();
    expect(ctx0.scoreAfter).toBe('15-0');

    const ctx1 = JSON.parse(await readFile(resolve(testDir, 'moments', '1', 'context.json'), 'utf-8'));
    expect(ctx1.scoreBefore).toBe('15-0');
    expect(ctx1.scoreAfter).toBe('30-0');
    expect(ctx1.scoreChanged).toBe(true);

    const ctx2 = JSON.parse(await readFile(resolve(testDir, 'moments', '2', 'context.json'), 'utf-8'));
    expect(ctx2.scoreBefore).toBe('30-0');
    expect(ctx2.scoreAfter).toBe('30-0');
    expect(ctx2.scoreChanged).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/__tests__/context-enrichment.test.ts`
Expected: FAIL — module `../lib/ocr/context-enrichment.js` does not exist

- [ ] **Step 3: Implement enrichMoments**

Create `backend/src/lib/ocr/context-enrichment.ts`:

```typescript
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import PQueue from 'p-queue';
import { computeFinegrainEnergy } from './audio-peaks.js';
import type { KeyMoment } from './result-processing.js';
import type { TranscriptSegment } from './transcript-scoring.js';

const execFileAsync = promisify(execFile);

const AUDIO_CURVE_RADIUS = 90;       // ±90s around peak
const TRANSCRIPT_RADIUS = 60;        // ±60s around peak
const WIDE_FRAME_RADIUS = 30;        // ±30s at 5s intervals
const WIDE_FRAME_INTERVAL = 5;       // seconds between wide frames
const DENSE_FRAME_RADIUS = 5;        // ±5s at 1s intervals around peak
const FRAME_CONCURRENCY = 10;

export interface EnrichmentInput {
  videoPath: string;
  assetDir: string;
  durationSeconds: number;
  moments: KeyMoment[];
  transcriptSegments: TranscriptSegment[];
  sport: string | null;
  competition: string | null;
}

export interface MomentContext {
  label: string;
  score: string | null;
  set_period: string | null;
  game_time: string | null;
  sport: string | null;
  competition: string | null;
  peakTime: number;
  suggestedStartTime: number | undefined;
  suggestedEndTime: number | undefined;
  scoreBefore: string | null;
  scoreAfter: string | null;
  scoreChanged: boolean;
  audioEnergy: number;
  momentIndex: number;
}

/**
 * Pass 5: Context Enrichment
 * For each curated moment, extracts and persists rich context data to disk.
 * Storage: {assetDir}/moments/{index}/
 */
export async function enrichMoments(input: EnrichmentInput): Promise<void> {
  const { videoPath, assetDir, durationSeconds, moments, transcriptSegments, sport, competition } = input;

  for (let i = 0; i < moments.length; i++) {
    const moment = moments[i];
    const momentDir = resolve(assetDir, 'moments', String(i));
    await mkdir(resolve(momentDir, 'frames'), { recursive: true });

    const peakTime = moment.peakTime ?? moment.timestamp;

    // 1. Audio curve (±90s, 1s windows)
    await extractAudioCurve(videoPath, momentDir, peakTime, durationSeconds);

    // 2. Key frames (±30s@5s + ±5s@1s)
    await extractKeyFrames(videoPath, momentDir, peakTime, durationSeconds);

    // 3. Transcript segments (±60s)
    const nearbySegments = transcriptSegments.filter(
      (s) => s.end > peakTime - TRANSCRIPT_RADIUS && s.start < peakTime + TRANSCRIPT_RADIUS,
    );
    await writeFile(
      resolve(momentDir, 'transcript.json'),
      JSON.stringify(nearbySegments, null, 2),
      'utf-8',
    );

    // 4. Context JSON
    const prevScore = i > 0 ? moments[i - 1].score : null;
    const currentScore = moment.score;
    const scoreChanged = prevScore !== null && currentScore !== null && prevScore !== currentScore;

    const context: MomentContext = {
      label: moment.label,
      score: currentScore,
      set_period: moment.set_period,
      game_time: moment.game_time,
      sport,
      competition,
      peakTime,
      suggestedStartTime: moment.startTime,
      suggestedEndTime: moment.endTime,
      scoreBefore: prevScore,
      scoreAfter: currentScore,
      scoreChanged,
      audioEnergy: moment.audio_energy,
      momentIndex: i,
    };

    await writeFile(
      resolve(momentDir, 'context.json'),
      JSON.stringify(context, null, 2),
      'utf-8',
    );
  }
}

async function extractAudioCurve(
  videoPath: string,
  momentDir: string,
  peakTime: number,
  durationSeconds: number,
): Promise<void> {
  try {
    const { offset, energies } = await computeFinegrainEnergy(
      videoPath,
      peakTime,
      AUDIO_CURVE_RADIUS,
      durationSeconds,
    );
    await writeFile(
      resolve(momentDir, 'audio-curve.json'),
      JSON.stringify({ offset, peakTime, energies }, null, 2),
      'utf-8',
    );
  } catch (err) {
    console.error(`[enrich] Audio curve extraction failed for peak at ${peakTime}:`, err);
    // Non-fatal — write empty curve
    await writeFile(
      resolve(momentDir, 'audio-curve.json'),
      JSON.stringify({ offset: 0, peakTime, energies: [] }),
      'utf-8',
    );
  }
}

async function extractKeyFrames(
  videoPath: string,
  momentDir: string,
  peakTime: number,
  durationSeconds: number,
): Promise<void> {
  const framesDir = resolve(momentDir, 'frames');
  const ffmpegQueue = new PQueue({ concurrency: FRAME_CONCURRENCY });

  // Collect all frame times
  const frameTimes = new Set<number>();

  // Wide frames: ±30s at 5s intervals
  for (let offset = -WIDE_FRAME_RADIUS; offset <= WIDE_FRAME_RADIUS; offset += WIDE_FRAME_INTERVAL) {
    const t = Math.round(peakTime + offset);
    if (t >= 0 && t <= durationSeconds) frameTimes.add(t);
  }

  // Dense frames: ±5s at 1s intervals (overwrites duplicates from wide pass via Set)
  for (let offset = -DENSE_FRAME_RADIUS; offset <= DENSE_FRAME_RADIUS; offset++) {
    const t = Math.round(peakTime + offset);
    if (t >= 0 && t <= durationSeconds) frameTimes.add(t);
  }

  const sortedTimes = [...frameTimes].sort((a, b) => a - b);

  await Promise.all(
    sortedTimes.map((t) => {
      const relOffset = t - Math.round(peakTime);
      const sign = relOffset >= 0 ? '+' : '';
      const filename = `frame_${sign}${String(relOffset).padStart(3, '0')}.jpg`;
      const outputPath = resolve(framesDir, filename);
      return ffmpegQueue.add(() => extractSingleFrame(videoPath, t, outputPath));
    }),
  );
}

async function extractSingleFrame(
  videoPath: string,
  timeSeconds: number,
  outputPath: string,
): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-ss', String(timeSeconds),
    '-i', videoPath,
    '-frames:v', '1',
    '-vf', 'scale=-1:360',
    '-q:v', '3',
    '-y',
    outputPath,
  ]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/__tests__/context-enrichment.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/ocr/context-enrichment.ts backend/src/__tests__/context-enrichment.test.ts
git commit -m "feat: add context enrichment module (Pass 5) — audio curve, frames, transcript, score deltas"
```

---

### Task 6: Wire Pass 5 into Pipeline Orchestrator

**Files:**
- Modify: `backend/src/lib/ocr/index.ts`
- Modify: `backend/src/lib/pipeline.ts`

- [ ] **Step 1: Add enrichment call to OCR pipeline**

In `backend/src/lib/ocr/index.ts`, add the import at the top:

```typescript
import { enrichMoments } from './context-enrichment.js';
```

Export `TranscriptSegment` is already done. The pipeline needs the original segments to pass into enrichment.

Change the function signature to also accept and forward `transcriptSegments`:

The function already receives `transcriptSegments` as a parameter. After the boundary detection block (line 53-62), add the enrichment pass before the return:

```typescript
    // Pass 5: Context enrichment — store rich per-moment data to disk
    if (output.keyMoments.length > 0) {
      console.log(`[ocr] Enriching ${output.keyMoments.length} moments with context data...`);
      try {
        await enrichMoments({
          videoPath,
          assetDir,
          durationSeconds,
          moments: bounded,
          transcriptSegments,
          sport: output.sport,
          competition: output.competition,
        });
        console.log(`[ocr] Context enrichment complete`);
      } catch (err) {
        // Non-fatal — pipeline continues without enrichment
        console.error('[ocr] Context enrichment failed:', err);
      }
    }
```

This goes between the boundary detection return (line 61) and the final `return output` (line 64). Restructure the if block so both bounded moments and enrichment are handled together, returning `{ ...output, keyMoments: bounded }` at the end.

The full modified section (replacing lines 52-64):

```typescript
    // Pass 4: Find moment boundaries — scan audio for silence gaps
    // to shift timestamps from peak (crowd roar) to action start (serve/kick)
    let finalMoments = output.keyMoments;
    if (output.keyMoments.length > 0) {
      console.log(`[ocr] Finding moment boundaries for ${output.keyMoments.length} moments...`);
      const bounded = await findMomentBoundaries(
        videoPath,
        output.keyMoments,
        durationSeconds,
      );
      console.log(`[ocr] Moment boundaries computed — timestamps shifted to action start`);
      finalMoments = bounded;

      // Pass 5: Context enrichment — store rich per-moment data to disk
      console.log(`[ocr] Enriching ${bounded.length} moments with context data...`);
      try {
        await enrichMoments({
          videoPath,
          assetDir,
          durationSeconds,
          moments: bounded,
          transcriptSegments,
          sport: output.sport,
          competition: output.competition,
        });
        console.log(`[ocr] Context enrichment complete`);
      } catch (err) {
        console.error('[ocr] Context enrichment failed:', err);
        // Non-fatal — pipeline result is still valid without enrichment on disk
      }
    }

    return { ...output, keyMoments: finalMoments, enriched: true };
```

Also update the `OcrOutput` interface (in `result-processing.ts`) — actually, instead of changing the return type, we'll track enrichment in the pipeline orchestrator via the DB column. Add `enriched?: boolean` to `OcrOutput`:

In `backend/src/lib/ocr/result-processing.ts`, update the interface:

```typescript
export interface OcrOutput {
  sport: string | null;
  competition: string | null;
  players: string[];
  keyMoments: KeyMoment[];
  enriched?: boolean;
}
```

- [ ] **Step 2: Set ocrEnriched in pipeline.ts**

In `backend/src/lib/pipeline.ts`, in the OCR stage success path (around line 388), after the `updateAsset` call that saves OCR results, add enrichment tracking:

```typescript
        if (result.keyMoments.length === 0) {
          updateAsset(assetId, { ocrStatus: 'complete' });
        } else {
          updateAsset(assetId, {
            ocrStatus: 'complete',
            ocrSport: result.sport,
            ocrCompetition: result.competition,
            ocrPlayers: result.players.length > 0 ? JSON.stringify(result.players) : null,
            ocrKeyMoments: JSON.stringify(result.keyMoments),
            ocrEnriched: result.enriched ?? false,
          });
        }
```

- [ ] **Step 3: Run all backend tests**

Run: `cd backend && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/ocr/index.ts backend/src/lib/ocr/result-processing.ts backend/src/lib/pipeline.ts
git commit -m "feat: wire context enrichment (Pass 5) into OCR pipeline"
```

---

### Task 7: Add API Endpoint for Moment Context Data

**Files:**
- Modify: `backend/src/routes/assets.ts`

The frontend needs to fetch the enriched context data per moment. Add a `GET /api/assets/:id/moments/:index/context` endpoint that serves the stored files.

- [ ] **Step 1: Read the current assets routes to understand patterns**

Read `backend/src/routes/assets.ts` to see existing route patterns and how the Fastify instance is used.

- [ ] **Step 2: Add moment context endpoint**

In `backend/src/routes/assets.ts`, add a route that serves the moment context:

```typescript
  // Serve moment enrichment context
  fastify.get<{
    Params: { id: string; index: string };
    Querystring: { file?: string };
  }>('/api/assets/:id/moments/:index/context', async (req, reply) => {
    const { id, index } = req.params;
    const file = req.query.file ?? 'context.json';

    // Validate index is a number
    if (!/^\d+$/.test(index)) {
      return reply.code(400).send({ error: 'Invalid moment index' });
    }

    // Only serve known enrichment files
    const allowedFiles = ['context.json', 'audio-curve.json', 'transcript.json'];
    if (!allowedFiles.includes(file)) {
      return reply.code(400).send({ error: 'Invalid file requested' });
    }

    const filePath = resolve(storageRoot, id, 'moments', index, file);
    try {
      const content = await readFile(filePath, 'utf-8');
      return reply.type('application/json').send(content);
    } catch {
      return reply.code(404).send({ error: 'Moment context not found' });
    }
  });

  // Serve moment frames
  fastify.get<{
    Params: { id: string; index: string; filename: string };
  }>('/api/assets/:id/moments/:index/frames/:filename', async (req, reply) => {
    const { id, index, filename } = req.params;

    if (!/^\d+$/.test(index)) {
      return reply.code(400).send({ error: 'Invalid moment index' });
    }

    // Only serve jpg files, prevent path traversal
    if (!filename.endsWith('.jpg') || filename.includes('..') || filename.includes('/')) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }

    const filePath = resolve(storageRoot, id, 'moments', index, 'frames', filename);
    try {
      const content = await readFile(filePath);
      return reply.type('image/jpeg').send(content);
    } catch {
      return reply.code(404).send({ error: 'Frame not found' });
    }
  });
```

Make sure `readFile` from `node:fs/promises` is imported (check existing imports at the top of the file — it may already be there).

- [ ] **Step 3: Run backend dev server to smoke test**

Run: `cd backend && npm run build`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/assets.ts
git commit -m "feat: add API endpoints for moment context and frames"
```

---

### Task 8: Add Frontend API Functions

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add API functions for moment context**

In `frontend/src/lib/api.ts`, add functions to fetch moment enrichment data:

```typescript
export async function fetchMomentContext(assetId: string, momentIndex: number): Promise<{
  label: string;
  score: string | null;
  set_period: string | null;
  game_time: string | null;
  sport: string | null;
  competition: string | null;
  peakTime: number;
  suggestedStartTime: number | undefined;
  suggestedEndTime: number | undefined;
  scoreBefore: string | null;
  scoreAfter: string | null;
  scoreChanged: boolean;
  audioEnergy: number;
  momentIndex: number;
}> {
  const res = await fetch(`${BASE}/api/assets/${assetId}/moments/${momentIndex}/context`);
  if (!res.ok) throw new Error('Moment context not found');
  return res.json();
}

export async function fetchMomentAudioCurve(assetId: string, momentIndex: number): Promise<{
  offset: number;
  peakTime: number;
  energies: number[];
}> {
  const res = await fetch(`${BASE}/api/assets/${assetId}/moments/${momentIndex}/context?file=audio-curve.json`);
  if (!res.ok) throw new Error('Audio curve not found');
  return res.json();
}

export async function fetchMomentTranscript(assetId: string, momentIndex: number): Promise<Array<{
  start: number;
  end: number;
  text: string;
}>> {
  const res = await fetch(`${BASE}/api/assets/${assetId}/moments/${momentIndex}/context?file=transcript.json`);
  if (!res.ok) throw new Error('Transcript not found');
  return res.json();
}

export function getMomentFrameUrl(assetId: string, momentIndex: number, filename: string): string {
  return `${BASE}/api/assets/${assetId}/moments/${momentIndex}/frames/${filename}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add frontend API functions for moment context data"
```

---

### Task 9: Build MomentContext Inspection Component

**Files:**
- Create: `frontend/src/components/detail/MomentContext.tsx`

This is a lightweight expandable drawer that shows enriched data per moment: audio sparkline, frame thumbnail strip, transcript segments with timestamps, and score transition.

- [ ] **Step 1: Create MomentContext component**

Create `frontend/src/components/detail/MomentContext.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react';
import {
  fetchMomentContext,
  fetchMomentAudioCurve,
  fetchMomentTranscript,
  getMomentFrameUrl,
} from '../../lib/api';

interface MomentContextProps {
  assetId: string;
  momentIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function MomentContext({ assetId, momentIndex, isOpen, onClose }: MomentContextProps) {
  const [context, setContext] = useState<Awaited<ReturnType<typeof fetchMomentContext>> | null>(null);
  const [audioCurve, setAudioCurve] = useState<Awaited<ReturnType<typeof fetchMomentAudioCurve>> | null>(null);
  const [transcript, setTranscript] = useState<Awaited<ReturnType<typeof fetchMomentTranscript>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    Promise.all([
      fetchMomentContext(assetId, momentIndex).catch(() => null),
      fetchMomentAudioCurve(assetId, momentIndex).catch(() => null),
      fetchMomentTranscript(assetId, momentIndex).catch(() => null),
    ]).then(([ctx, audio, trans]) => {
      if (!ctx) {
        setError('No enrichment data available for this moment');
        return;
      }
      setContext(ctx);
      setAudioCurve(audio);
      setTranscript(trans);
    });
  }, [assetId, momentIndex, isOpen]);

  // Draw audio sparkline
  useEffect(() => {
    if (!audioCurve || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { energies, offset, peakTime } = audioCurve;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#1E1B4B';
    ctx.fillRect(0, 0, w, h);

    if (energies.length === 0) return;

    // Draw energy bars
    const barWidth = w / energies.length;
    for (let i = 0; i < energies.length; i++) {
      const energy = energies[i];
      const barHeight = energy * h;
      const x = i * barWidth;

      // Color: red near peak, slate elsewhere
      const timeSec = offset + i;
      const distFromPeak = Math.abs(timeSec - peakTime);
      ctx.fillStyle = distFromPeak < 5 ? '#E11D48' : '#94A3B8';

      ctx.fillRect(x, h - barHeight, barWidth - 0.5, barHeight);
    }

    // Peak marker line
    const peakIdx = Math.round(peakTime - offset);
    if (peakIdx >= 0 && peakIdx < energies.length) {
      const peakX = peakIdx * barWidth;
      ctx.strokeStyle = '#E11D48';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(peakX, 0);
      ctx.lineTo(peakX, h);
      ctx.stroke();
    }
  }, [audioCurve]);

  if (!isOpen) return null;

  // Compute frame filenames: ±30s@5s + ±5s@1s
  const frameNames: string[] = [];
  if (context) {
    const peak = Math.round(context.peakTime);
    const times = new Set<number>();
    for (let o = -30; o <= 30; o += 5) times.add(o);
    for (let o = -5; o <= 5; o++) times.add(o);
    const sorted = [...times].sort((a, b) => a - b);
    for (const o of sorted) {
      const sign = o >= 0 ? '+' : '';
      frameNames.push(`frame_${sign}${String(o).padStart(3, '0')}.jpg`);
    }
  }

  return (
    <div className="bg-panel border border-border rounded-lg p-4 mt-2 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-slate-50 font-semibold font-fira-code text-sm">
          Moment Context — {context?.label ?? `#${momentIndex}`}
        </h4>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-50 text-sm"
        >
          Close
        </button>
      </div>

      {error && (
        <p className="text-sm text-slate-400">{error}</p>
      )}

      {context && (
        <>
          {/* Score transition */}
          <div className="flex gap-4 text-sm">
            <span className="text-slate-400">Score:</span>
            {context.scoreBefore ? (
              <span className={context.scoreChanged ? 'text-cta' : 'text-slate-400'}>
                {context.scoreBefore} → {context.scoreAfter}
                {context.scoreChanged ? ' (changed)' : ' (unchanged)'}
              </span>
            ) : (
              <span className="text-slate-50">{context.score ?? 'N/A'}</span>
            )}
            {context.set_period && (
              <>
                <span className="text-slate-400">|</span>
                <span className="text-slate-50">{context.set_period}</span>
              </>
            )}
          </div>

          {/* Audio sparkline */}
          {audioCurve && (
            <div>
              <p className="text-xs text-slate-400 mb-1">Audio Energy (±90s around peak)</p>
              <canvas
                ref={canvasRef}
                width={600}
                height={60}
                className="w-full h-[60px] rounded"
              />
            </div>
          )}

          {/* Frame strip */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Key Frames</p>
            <div className="flex gap-1 overflow-x-auto pb-2">
              {frameNames.map((name) => (
                <img
                  key={name}
                  src={getMomentFrameUrl(assetId, momentIndex, name)}
                  alt={name}
                  className="h-16 rounded flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ))}
            </div>
          </div>

          {/* Transcript segments */}
          {transcript && transcript.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-1">Commentary (±60s)</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {transcript.map((seg, i) => {
                  const distFromPeak = Math.abs(seg.start - (context.peakTime));
                  const isNearPeak = distFromPeak < 5;
                  return (
                    <div
                      key={i}
                      className={`text-xs ${isNearPeak ? 'text-slate-50 bg-cta/10 rounded px-1' : 'text-slate-400'}`}
                    >
                      <span className="font-fira-code text-slate-500 mr-2">
                        {Math.floor(seg.start / 60)}:{String(Math.floor(seg.start % 60)).padStart(2, '0')}
                      </span>
                      {seg.text}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/detail/MomentContext.tsx
git commit -m "feat: add MomentContext inspection drawer component"
```

---

### Task 10: Wire MomentContext into VideoPlayer

**Files:**
- Modify: `frontend/src/components/detail/VideoPlayer.tsx`

Add a "Context" button to each moment in the timeline that toggles the MomentContext drawer.

- [ ] **Step 1: Read VideoPlayer.tsx to understand current moment rendering**

Read the file to find where moments are rendered in the timeline and how they're structured.

- [ ] **Step 2: Add MomentContext integration**

Import the component at the top of VideoPlayer.tsx:

```typescript
import { MomentContext } from './MomentContext';
```

Add state to track which moment's context drawer is open:

```typescript
const [openContextIndex, setOpenContextIndex] = useState<number | null>(null);
```

In the moment rendering section (where each moment marker or label is displayed), add a small button to toggle the context drawer:

```tsx
<button
  onClick={(e) => {
    e.stopPropagation();
    setOpenContextIndex(openContextIndex === index ? null : index);
  }}
  className="text-xs text-slate-400 hover:text-cta ml-2"
  title="View enrichment context"
>
  ⓘ
</button>
```

After the moment element, conditionally render the drawer:

```tsx
{openContextIndex === index && (
  <MomentContext
    assetId={assetId}
    momentIndex={index}
    isOpen={true}
    onClose={() => setOpenContextIndex(null)}
  />
)}
```

The exact integration points depend on how VideoPlayer.tsx currently renders moments — consult the file before implementing.

- [ ] **Step 3: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/detail/VideoPlayer.tsx
git commit -m "feat: wire MomentContext drawer into VideoPlayer timeline"
```

---

### Task 11: End-to-End Smoke Test

**Files:** None (validation only)

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: No TypeScript or build errors

- [ ] **Step 3: Run backend build**

Run: `cd backend && npm run build`
Expected: No TypeScript errors

- [ ] **Step 4: Manual smoke test with dev servers**

Start both dev servers (`cd backend && npm run dev` in one terminal, `cd frontend && npm run dev` in another). Upload a video or re-process an existing one. Verify:
- Pipeline logs show "Enriching N moments with context data..."
- `moments/` directory created under the asset folder with subdirectories per moment
- Each moment dir contains `context.json`, `audio-curve.json`, `transcript.json`, `frames/`
- Frontend shows the ⓘ button on moments
- Clicking ⓘ opens the context drawer with audio sparkline, frames, transcript
- Score deltas appear in context ("Score: 15-0 → 30-0 (changed)")

- [ ] **Step 5: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore: cleanup after pipeline enrichment integration"
```
