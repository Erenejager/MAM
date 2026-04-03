# OCR Metadata Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract key moments with timecodes from sports video content during ingest using audio analysis, transcript keywords, overlay differencing, and Gemini Flash vision API. Display results in a "Key Moments" tab on the asset detail panel.

**Architecture:** New pipeline stage after transcription, before OpenSearch indexing. Two-pass frame selection (coarse peaks via transcript+audio, refined via overlay diff). Vision API extracts structured metadata. Results validated by consensus + chronological logic. Stored as JSON on the asset, rendered in a new detail panel tab.

**Tech Stack:** ffmpeg (audio/frame extraction), @google/generative-ai (Gemini Flash), Drizzle (schema), React (Key Moments tab)

**Spec:** `docs/superpowers/specs/2026-04-03-ocr-metadata-extraction-design.md`

---

## File Map

### Backend — New Files
- `backend/src/lib/ocr/audio-peaks.ts` — Pass 1: extract audio, compute RMS energy per window
- `backend/src/lib/ocr/transcript-scoring.ts` — Pass 1: score transcript segments against keyword list
- `backend/src/lib/ocr/peak-detection.ts` — Pass 1: combine scores, find peaks, merge nearby
- `backend/src/lib/ocr/overlay-diff.ts` — Pass 2: extract frames in windows, compare overlay zones
- `backend/src/lib/ocr/vision-api.ts` — Pass 3: send frames to Gemini Flash, parse responses
- `backend/src/lib/ocr/result-processing.ts` — Pass 4: consensus, chronological validation, build timeline
- `backend/src/lib/ocr/index.ts` — Orchestrator: runs all passes, returns key moments

### Backend — Modified Files
- `backend/src/db/schema.ts` — Add OCR columns to assets table
- `backend/src/lib/pipeline.ts` — Add OCR stage after transcription
- `backend/src/bootstrap/validate-env.ts` — Warn if GEMINI_API_KEY missing
- `backend/.env.example` — Add GEMINI_API_KEY

### Frontend — New Files
- `frontend/src/components/detail/KeyMomentsList.tsx` — Key Moments tab component

### Frontend — Modified Files
- `frontend/src/types/asset.ts` — Add OCR fields to Asset interface
- `frontend/src/components/detail/DetailPanel.tsx` — Add third tab

---

## Task 1: Schema + Environment Setup

**Files:**
- Modify: `backend/src/db/schema.ts`
- Modify: `backend/src/bootstrap/validate-env.ts`
- Modify: `backend/.env.example`

- [ ] **Step 1: Add OCR columns to schema**

In `backend/src/db/schema.ts`, add after the `searchIndexStatus` line (around line 37):

```typescript
  // OCR / Key Moments
  ocrStatus: text('ocr_status').default('pending'),
  ocrError: text('ocr_error'),
  ocrSport: text('ocr_sport'),
  ocrCompetition: text('ocr_competition'),
  ocrPlayers: text('ocr_players'),
  ocrKeyMoments: text('ocr_key_moments'),
```

- [ ] **Step 2: Generate and apply migration**

```bash
cd backend
npm run db:generate
npm run db:migrate
```

Expected: New migration file in `backend/drizzle/` with ALTER TABLE statements.

- [ ] **Step 3: Add GEMINI_API_KEY warning to validate-env.ts**

In `backend/src/bootstrap/validate-env.ts`, add before the final error check block:

```typescript
  // GEMINI_API_KEY — optional, OCR stage skipped if missing
  if (!process.env.GEMINI_API_KEY) {
    console.warn(
      '  ⚠ GEMINI_API_KEY is not set — OCR key moments extraction will be skipped.\n' +
      '    Get your API key from https://aistudio.google.com/apikey',
    );
  }
```

- [ ] **Step 4: Add to .env.example**

Append to `backend/.env.example`:

```bash
GEMINI_API_KEY=               # Optional — enables OCR key moments extraction via Gemini Flash
```

- [ ] **Step 5: Update Asset type in frontend**

In `frontend/src/types/asset.ts`, add after `searchIndexStatus`:

```typescript
  ocrStatus: 'pending' | 'processing' | 'complete' | 'skipped' | 'failed';
  ocrError: string | null;
  ocrSport: string | null;
  ocrCompetition: string | null;
  ocrPlayers: string | null;
  ocrKeyMoments: string | null;
```

- [ ] **Step 6: Install Gemini SDK**

```bash
cd backend
npm install @google/generative-ai
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle/ backend/src/bootstrap/validate-env.ts backend/.env.example backend/package.json backend/package-lock.json frontend/src/types/asset.ts
git commit -m "feat: add OCR schema columns, Gemini SDK, and env setup"
```

---

## Task 2: Transcript Keyword Scoring

**Files:**
- Create: `backend/src/lib/ocr/transcript-scoring.ts`

- [ ] **Step 1: Create transcript scoring module**

```typescript
// backend/src/lib/ocr/transcript-scoring.ts

const ACTION_KEYWORDS = new Set([
  'goal', 'scores', 'point', 'wins', 'winner', 'save', 'miss',
  'match', 'set', 'game', 'round', 'half', 'period', 'quarter',
  'break', 'penalty', 'foul', 'card', 'knockout', 'finish',
  'champion', 'victory', 'defeat', 'record', 'final', 'ace',
  'try', 'conversion', 'birdie', 'eagle', 'hole', 'lap',
]);

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface WindowScore {
  windowStart: number; // seconds
  windowEnd: number;
  transcriptScore: number; // 0 or 1
  matchedKeyword: string | null; // the keyword that matched, if any
  transcriptText: string; // the segment text in this window
}

/**
 * Score 10-second windows of the video based on transcript keyword presence.
 * Returns a score array covering the full duration.
 */
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

    // Find segments that overlap this window
    const overlapping = segments.filter(
      (s) => s.end > windowStart && s.start < windowEnd,
    );
    const combinedText = overlapping.map((s) => s.text).join(' ').toLowerCase();
    const words = combinedText.split(/\s+/);

    let matchedKeyword: string | null = null;
    for (const word of words) {
      // Strip punctuation from edges
      const clean = word.replace(/^[^a-z]+|[^a-z]+$/g, '');
      if (ACTION_KEYWORDS.has(clean)) {
        matchedKeyword = clean;
        break;
      }
    }

    results.push({
      windowStart,
      windowEnd,
      transcriptScore: matchedKeyword ? 1 : 0,
      matchedKeyword,
      transcriptText: overlapping.map((s) => s.text).join(' ').trim(),
    });
  }

  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/lib/ocr/transcript-scoring.ts
git commit -m "feat: add transcript keyword scoring for OCR peak detection"
```

---

## Task 3: Audio Energy Analysis

**Files:**
- Create: `backend/src/lib/ocr/audio-peaks.ts`

- [ ] **Step 1: Create audio energy module**

```typescript
// backend/src/lib/ocr/audio-peaks.ts

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Extract raw PCM audio and compute RMS energy per 10-second window.
 * Uses ffmpeg to output raw 16-bit signed LE mono at 8kHz.
 * Entire audio fits in memory: 3 hours at 8kHz mono 16-bit = ~165MB.
 * For a 5-min video it's ~5MB.
 */
export async function computeAudioEnergy(
  filePath: string,
  durationSeconds: number,
): Promise<number[]> {
  const sampleRate = 8000;
  const windowSize = 10; // seconds
  const samplesPerWindow = sampleRate * windowSize;
  const windowCount = Math.ceil(durationSeconds / windowSize);

  // Extract raw PCM audio via ffmpeg to stdout
  const { stdout } = await execFileAsync(
    'ffmpeg',
    [
      '-i', filePath,
      '-ac', '1',           // mono
      '-ar', String(sampleRate),
      '-f', 's16le',        // raw 16-bit signed little-endian
      '-vn',                // no video
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 200 * 1024 * 1024 },
  );

  const samples = new Int16Array(
    stdout.buffer,
    stdout.byteOffset,
    stdout.byteLength / 2,
  );

  // Compute RMS energy per window
  const energies: number[] = [];
  for (let w = 0; w < windowCount; w++) {
    const start = w * samplesPerWindow;
    const end = Math.min(start + samplesPerWindow, samples.length);
    if (start >= samples.length) {
      energies.push(0);
      continue;
    }
    let sumSq = 0;
    for (let i = start; i < end; i++) {
      sumSq += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSq / (end - start));
    energies.push(rms);
  }

  // Normalize to 0-1
  const maxEnergy = Math.max(...energies, 1); // avoid division by zero
  return energies.map((e) => e / maxEnergy);
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/lib/ocr/audio-peaks.ts
git commit -m "feat: add audio RMS energy extraction for OCR peak detection"
```

---

## Task 4: Peak Detection + Merging

**Files:**
- Create: `backend/src/lib/ocr/peak-detection.ts`

- [ ] **Step 1: Create peak detection module**

```typescript
// backend/src/lib/ocr/peak-detection.ts

import type { WindowScore } from './transcript-scoring.js';

export interface CoarsePeak {
  timestamp: number;     // center of the window, in seconds
  combinedScore: number;
  matchedKeyword: string | null;
  transcriptText: string;
  audioEnergy: number;
}

const MAX_PEAKS = 30;
const MERGE_DISTANCE = 30; // seconds

/**
 * Combine transcript and audio scores, find local peaks, merge nearby.
 * Returns adaptive number of peaks (capped at MAX_PEAKS).
 */
export function detectPeaks(
  transcriptScores: WindowScore[],
  audioEnergies: number[],
): CoarsePeak[] {
  // Compute combined scores
  const combined = transcriptScores.map((ts, i) => ({
    windowStart: ts.windowStart,
    windowEnd: ts.windowEnd,
    combinedScore: 0.6 * ts.transcriptScore + 0.4 * (audioEnergies[i] ?? 0),
    matchedKeyword: ts.matchedKeyword,
    transcriptText: ts.transcriptText,
    audioEnergy: audioEnergies[i] ?? 0,
  }));

  // Find local peaks (higher than both neighbors)
  const peaks: typeof combined = [];
  for (let i = 0; i < combined.length; i++) {
    const prev = combined[i - 1]?.combinedScore ?? 0;
    const curr = combined[i].combinedScore;
    const next = combined[i + 1]?.combinedScore ?? 0;
    if (curr > 0 && curr >= prev && curr >= next) {
      peaks.push(combined[i]);
    }
  }

  // Sort by score descending
  peaks.sort((a, b) => b.combinedScore - a.combinedScore);

  // Merge peaks that are within MERGE_DISTANCE seconds of each other
  const merged: CoarsePeak[] = [];
  for (const peak of peaks) {
    const timestamp = (peak.windowStart + peak.windowEnd) / 2;
    const tooClose = merged.some(
      (m) => Math.abs(m.timestamp - timestamp) < MERGE_DISTANCE,
    );
    if (!tooClose) {
      merged.push({
        timestamp,
        combinedScore: peak.combinedScore,
        matchedKeyword: peak.matchedKeyword,
        transcriptText: peak.transcriptText,
        audioEnergy: peak.audioEnergy,
      });
    }
    if (merged.length >= MAX_PEAKS) break;
  }

  // Sort by timestamp for chronological order
  merged.sort((a, b) => a.timestamp - b.timestamp);

  return merged;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/lib/ocr/peak-detection.ts
git commit -m "feat: add peak detection with merge logic for OCR frame selection"
```

---

## Task 5: Overlay Zone Differencing (Pass 2)

**Files:**
- Create: `backend/src/lib/ocr/overlay-diff.ts`

- [ ] **Step 1: Create overlay diff module**

```typescript
// backend/src/lib/ocr/overlay-diff.ts

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CoarsePeak } from './peak-detection.js';

const execFileAsync = promisify(execFile);

export interface RefinedPeak {
  timestamp: number;       // exact second from overlay diff
  framePath: string;       // path to the extracted JPEG frame for vision API
  matchedKeyword: string | null;
  transcriptText: string;
  audioEnergy: number;
}

/**
 * For each coarse peak, extract frames in a ±15s window and find the frame
 * with the largest overlay zone change. Returns the refined timestamp and
 * the frame JPEG path for vision API.
 */
export async function refinePeaks(
  videoPath: string,
  peaks: CoarsePeak[],
  durationSeconds: number,
  tempDir: string,
): Promise<RefinedPeak[]> {
  await mkdir(tempDir, { recursive: true });
  const results: RefinedPeak[] = [];

  for (let pi = 0; pi < peaks.length; pi++) {
    const peak = peaks[pi];
    const windowStart = Math.max(0, Math.floor(peak.timestamp) - 15);
    const windowEnd = Math.min(Math.ceil(durationSeconds), Math.floor(peak.timestamp) + 15);
    const frameCount = windowEnd - windowStart;
    if (frameCount < 2) {
      // Window too small, use the peak timestamp directly
      const framePath = resolve(tempDir, `peak_${pi}.jpg`);
      await extractSingleFrame(videoPath, peak.timestamp, framePath);
      results.push({
        timestamp: peak.timestamp,
        framePath,
        matchedKeyword: peak.matchedKeyword,
        transcriptText: peak.transcriptText,
        audioEnergy: peak.audioEnergy,
      });
      continue;
    }

    // Extract frames at 1-second intervals in the window
    const framePaths: { time: number; path: string }[] = [];
    for (let t = windowStart; t < windowEnd; t++) {
      const path = resolve(tempDir, `peak_${pi}_t${t}.jpg`);
      await extractSingleFrame(videoPath, t, path);
      framePaths.push({ time: t, path });
    }

    // Compare overlay zones between consecutive frames
    let bestDiff = 0;
    let bestIndex = 0;
    for (let i = 1; i < framePaths.length; i++) {
      const diff = await compareOverlayZones(framePaths[i - 1].path, framePaths[i].path);
      if (diff > bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
    }

    // The best frame is the one AFTER the biggest change (shows the new state)
    const bestFrame = framePaths[bestIndex];

    // Clean up all frames except the one we're keeping
    for (const fp of framePaths) {
      if (fp.path !== bestFrame.path) {
        await unlink(fp.path).catch(() => {});
      }
    }

    results.push({
      timestamp: bestFrame.time,
      framePath: bestFrame.path,
      matchedKeyword: peak.matchedKeyword,
      transcriptText: peak.transcriptText,
      audioEnergy: peak.audioEnergy,
    });
  }

  return results;
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

/**
 * Compare two frames in overlay zones only (top 15% + bottom 20%).
 * Returns normalized difference (0-1).
 */
async function compareOverlayZones(
  pathA: string,
  pathB: string,
): Promise<number> {
  const [bufA, bufB] = await Promise.all([readFile(pathA), readFile(pathB)]);

  // Use ffmpeg to extract raw pixel data for comparison
  // Compare by running both through ffmpeg and getting raw RGB
  const [rawA, rawB] = await Promise.all([
    extractRawPixels(pathA),
    extractRawPixels(pathB),
  ]);

  if (rawA.length !== rawB.length || rawA.length === 0) return 0;

  // Assume 640x360 output (from scale=-1:360, most videos are 16:9)
  const width = 640;
  const height = 360;
  const bytesPerPixel = 3; // RGB
  const rowBytes = width * bytesPerPixel;

  // Overlay zones: top 15% (rows 0-53) + bottom 20% (rows 288-359)
  const topEnd = Math.floor(height * 0.15);
  const bottomStart = Math.floor(height * 0.80);

  let totalDiff = 0;
  let pixelCount = 0;

  for (let y = 0; y < topEnd; y++) {
    const offset = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      if (offset + x < rawA.length && offset + x < rawB.length) {
        totalDiff += Math.abs(rawA[offset + x] - rawB[offset + x]);
        pixelCount++;
      }
    }
  }

  for (let y = bottomStart; y < height; y++) {
    const offset = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      if (offset + x < rawA.length && offset + x < rawB.length) {
        totalDiff += Math.abs(rawA[offset + x] - rawB[offset + x]);
        pixelCount++;
      }
    }
  }

  if (pixelCount === 0) return 0;
  return totalDiff / (pixelCount * 255); // normalize to 0-1
}

async function extractRawPixels(imagePath: string): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    'ffmpeg',
    [
      '-i', imagePath,
      '-vf', 'scale=640:360',
      '-pix_fmt', 'rgb24',
      '-f', 'rawvideo',
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/lib/ocr/overlay-diff.ts
git commit -m "feat: add overlay zone differencing for precise timecode refinement"
```

---

## Task 6: Gemini Vision API Integration

**Files:**
- Create: `backend/src/lib/ocr/vision-api.ts`

- [ ] **Step 1: Create vision API module**

```typescript
// backend/src/lib/ocr/vision-api.ts

import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFile } from 'node:fs/promises';
import type { RefinedPeak } from './overlay-diff.js';

export interface VisionResult {
  timestamp: number;
  matchedKeyword: string | null;
  transcriptText: string;
  audioEnergy: number;
  // From Gemini
  sport: string | null;
  players: string[];
  competition: string | null;
  score: string | null;
  set_period: string | null;
  game_time: string | null;
  venue: string | null;
  broadcaster: string | null;
  event: string | null;
}

const PROMPT = `Analyze this video frame from a sports broadcast. Extract any visible information.
Return JSON only with these fields (omit any field you cannot clearly see):

{
  "sport": "sport name",
  "players": ["player or team names visible"],
  "competition": "tournament or league name",
  "score": "current score as displayed",
  "set_period": "set, half, round, period, quarter if visible",
  "game_time": "match clock or elapsed time if visible",
  "venue": "venue name if visible",
  "broadcaster": "network or channel if visible",
  "event": "what is happening (e.g. goal, break point, replay, timeout)"
}`;

/**
 * Send each refined peak's frame to Gemini Flash and parse the response.
 * Processes sequentially to respect rate limits.
 */
export async function analyzeFrames(
  peaks: RefinedPeak[],
): Promise<VisionResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const results: VisionResult[] = [];

  for (const peak of peaks) {
    try {
      const imageBuffer = await readFile(peak.framePath);
      const base64 = imageBuffer.toString('base64');

      const response = await model.generateContent([
        PROMPT,
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64,
          },
        },
      ]);

      const text = response.response.text();
      // Extract JSON from response (may be wrapped in markdown code fences)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        continue; // skip unparseable response
      }

      const parsed = JSON.parse(jsonMatch[0]);

      results.push({
        timestamp: peak.timestamp,
        matchedKeyword: peak.matchedKeyword,
        transcriptText: peak.transcriptText,
        audioEnergy: peak.audioEnergy,
        sport: parsed.sport ?? null,
        players: Array.isArray(parsed.players) ? parsed.players : [],
        competition: parsed.competition ?? null,
        score: parsed.score ?? null,
        set_period: parsed.set_period ?? null,
        game_time: parsed.game_time ?? null,
        venue: parsed.venue ?? null,
        broadcaster: parsed.broadcaster ?? null,
        event: parsed.event ?? null,
      });
    } catch {
      // Skip failed frames silently — soft fail per frame
      continue;
    }
  }

  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/lib/ocr/vision-api.ts
git commit -m "feat: add Gemini Flash vision API integration for frame analysis"
```

---

## Task 7: Result Processing (Consensus + Validation)

**Files:**
- Create: `backend/src/lib/ocr/result-processing.ts`

- [ ] **Step 1: Create result processing module**

```typescript
// backend/src/lib/ocr/result-processing.ts

import type { VisionResult } from './vision-api.js';

export interface KeyMoment {
  timestamp: number;
  label: string;
  score: string | null;
  set_period: string | null;
  game_time: string | null;
  transcript: string;
  audio_energy: number;
}

export interface OcrOutput {
  sport: string | null;
  competition: string | null;
  players: string[];
  keyMoments: KeyMoment[];
}

/**
 * Process vision API results through consensus, chronological validation,
 * and build the final key moments timeline.
 */
export function processResults(results: VisionResult[]): OcrOutput {
  if (results.length === 0) {
    return { sport: null, competition: null, players: [], keyMoments: [] };
  }

  // Step 1: Discard empty responses
  const valid = results.filter(
    (r) => r.sport || r.score || r.players.length > 0 || r.event,
  );

  if (valid.length === 0) {
    return { sport: null, competition: null, players: [], keyMoments: [] };
  }

  // Step 2: Establish consensus
  const sport = mostFrequent(valid.map((r) => r.sport).filter(Boolean) as string[]);
  const competition = mostFrequent(
    valid.map((r) => r.competition).filter(Boolean) as string[],
  );

  // Players: count occurrences (case-insensitive), keep those in 3+ frames
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
    .filter((p) => p.count >= 3 || valid.length < 5) // relax threshold for few frames
    .map((p) => p.original);

  // Drop frames that contradict sport consensus
  const consistent = sport
    ? valid.filter((r) => !r.sport || r.sport.toLowerCase() === sport.toLowerCase())
    : valid;

  // Step 3: Chronological validation
  const sorted = [...consistent].sort((a, b) => a.timestamp - b.timestamp);
  const chronoValid = validateChronology(sorted);

  // Step 4: Build key moments
  const keyMoments: KeyMoment[] = [];
  for (const r of chronoValid) {
    // Label: prefer vision event, fallback to transcript keyword
    const label = r.event ?? r.matchedKeyword ?? null;
    if (!label) continue; // drop moments without a label

    keyMoments.push({
      timestamp: r.timestamp,
      label: capitalizeFirst(label),
      score: r.score,
      set_period: r.set_period,
      game_time: r.game_time,
      transcript: r.transcriptText,
      audio_energy: r.audioEnergy,
    });
  }

  return { sport, competition, players: confirmedPlayers, keyMoments };
}

function mostFrequent(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v.toLowerCase().trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  // Return original casing from first match
  return values.find((v) => v.toLowerCase().trim() === best) ?? null;
}

/**
 * Validate chronological score progression.
 * Drop moments where the score regresses without a period change.
 */
function validateChronology(sorted: VisionResult[]): VisionResult[] {
  if (sorted.length <= 1) return sorted;

  const result: VisionResult[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];

    // If no scores, keep the moment (event-only moments are fine)
    if (!curr.score || !prev.score) {
      result.push(curr);
      continue;
    }

    // If period changed, score can reset — allow it
    if (curr.set_period && prev.set_period && curr.set_period !== prev.set_period) {
      result.push(curr);
      continue;
    }

    // Same period: check that score didn't regress
    // Simple heuristic: sum of all digits in score should be >= previous
    const prevSum = digitSum(prev.score);
    const currSum = digitSum(curr.score);

    if (currSum >= prevSum) {
      result.push(curr);
    }
    // else: score regressed without period change — drop as misread
  }

  return result;
}

function digitSum(score: string): number {
  const digits = score.match(/\d+/g);
  if (!digits) return 0;
  return digits.reduce((sum, d) => sum + parseInt(d, 10), 0);
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/lib/ocr/result-processing.ts
git commit -m "feat: add result processing with consensus and chronological validation"
```

---

## Task 8: OCR Orchestrator

**Files:**
- Create: `backend/src/lib/ocr/index.ts`

- [ ] **Step 1: Create orchestrator**

```typescript
// backend/src/lib/ocr/index.ts

import { resolve } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { scoreTranscript, type TranscriptSegment } from './transcript-scoring.js';
import { computeAudioEnergy } from './audio-peaks.js';
import { detectPeaks } from './peak-detection.js';
import { refinePeaks } from './overlay-diff.js';
import { analyzeFrames } from './vision-api.js';
import { processResults, type OcrOutput } from './result-processing.js';

/**
 * Run the full OCR pipeline on a video asset.
 *
 * @param videoPath - Absolute path to the original video file
 * @param durationSeconds - Video duration (from ffprobe metadata)
 * @param transcriptSegments - Whisper transcript segments (from previous pipeline stage)
 * @param assetDir - Asset storage directory for temp files
 */
export async function runOcrPipeline(
  videoPath: string,
  durationSeconds: number,
  transcriptSegments: TranscriptSegment[],
  assetDir: string,
): Promise<OcrOutput> {
  const tempDir = resolve(assetDir, 'ocr_temp');

  try {
    // Pass 1: Coarse peak detection
    const transcriptScores = scoreTranscript(transcriptSegments, durationSeconds);
    const audioEnergies = await computeAudioEnergy(videoPath, durationSeconds);
    const coarsePeaks = detectPeaks(transcriptScores, audioEnergies);

    if (coarsePeaks.length === 0) {
      return { sport: null, competition: null, players: [], keyMoments: [] };
    }

    // Pass 2: Precision refinement via overlay diff
    const refinedPeaks = await refinePeaks(
      videoPath,
      coarsePeaks,
      durationSeconds,
      tempDir,
    );

    // Pass 3: Vision API analysis
    const visionResults = await analyzeFrames(refinedPeaks);

    // Pass 4: Result processing
    const output = processResults(visionResults);

    return output;
  } finally {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/lib/ocr/index.ts
git commit -m "feat: add OCR pipeline orchestrator"
```

---

## Task 9: Pipeline Integration

**Files:**
- Modify: `backend/src/lib/pipeline.ts`

- [ ] **Step 1: Add OCR stage to the pipeline**

In `backend/src/lib/pipeline.ts`, add the import at the top with the other imports:

```typescript
import { runOcrPipeline } from './ocr/index.js';
import { readFile } from 'node:fs/promises';
```

Then add the OCR stage **after the transcription stage** (after the transcription try/catch block ends) and **before the OpenSearch indexing stage**:

```typescript
    // ── Stage 4: OCR Key Moments ──────────────────────────────────────
    if (!process.env.GEMINI_API_KEY) {
      updateAsset(assetId, { ocrStatus: 'skipped' });
    } else {
      updateAsset(assetId, { ocrStatus: 'processing' });
      try {
        // Load transcript segments if available
        let segments: { start: number; end: number; text: string }[] = [];
        const transcriptFile = resolve(assetDir, 'transcript.json');
        try {
          const raw = await readFile(transcriptFile, 'utf-8');
          const data = JSON.parse(raw);
          segments = data.segments ?? data;
          if (!Array.isArray(segments)) segments = [];
        } catch {
          // No transcript available — OCR will rely on audio only
        }

        const duration = asset.durationSeconds ?? 0;
        if (duration < 10) {
          // Video too short for meaningful analysis
          updateAsset(assetId, { ocrStatus: 'skipped' });
        } else {
          const result = await runOcrPipeline(
            filePath,
            duration,
            segments,
            assetDir,
          );

          if (result.keyMoments.length === 0) {
            updateAsset(assetId, { ocrStatus: 'complete' });
          } else {
            updateAsset(assetId, {
              ocrStatus: 'complete',
              ocrSport: result.sport,
              ocrCompetition: result.competition,
              ocrPlayers: result.players.length > 0 ? JSON.stringify(result.players) : null,
              ocrKeyMoments: JSON.stringify(result.keyMoments),
            });
          }
        }
      } catch (err) {
        updateAsset(assetId, {
          ocrStatus: 'failed',
          ocrError: err instanceof Error ? err.message : String(err),
        });
      }
    }
```

Update the OpenSearch indexing stage number comment from "Stage 4" to "Stage 5" if it has one.

- [ ] **Step 2: Commit**

```bash
git add backend/src/lib/pipeline.ts
git commit -m "feat: integrate OCR key moments stage into ingest pipeline"
```

---

## Task 10: Key Moments Tab — Frontend Component

**Files:**
- Create: `frontend/src/components/detail/KeyMomentsList.tsx`

- [ ] **Step 1: Create the KeyMomentsList component**

```tsx
// frontend/src/components/detail/KeyMomentsList.tsx

import { useState, useEffect } from 'react';
import { Clock, Trophy, Users, MapPin } from 'lucide-react';
import type { Asset } from '../../types/asset';

interface KeyMoment {
  timestamp: number;
  label: string;
  score: string | null;
  set_period: string | null;
  game_time: string | null;
  transcript: string;
  audio_energy: number;
}

interface KeyMomentsListProps {
  asset: Asset;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export function KeyMomentsList({ asset, videoRef }: KeyMomentsListProps) {
  const [activeIndex, setActiveIndex] = useState(-1);

  const moments: KeyMoment[] = asset.ocrKeyMoments
    ? JSON.parse(asset.ocrKeyMoments)
    : [];
  const players: string[] = asset.ocrPlayers
    ? JSON.parse(asset.ocrPlayers)
    : [];

  // Sync active moment with video playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || moments.length === 0) return;
    const handler = () => {
      const t = video.currentTime;
      let idx = -1;
      for (let i = moments.length - 1; i >= 0; i--) {
        if (t >= moments[i].timestamp) {
          idx = i;
          break;
        }
      }
      setActiveIndex(idx);
    };
    video.addEventListener('timeupdate', handler);
    return () => video.removeEventListener('timeupdate', handler);
  }, [moments, videoRef]);

  const handleSeek = (timestamp: number, index: number) => {
    setActiveIndex(index);
    if (videoRef.current) {
      videoRef.current.currentTime = timestamp;
    }
  };

  const formatTimecode = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  if (asset.ocrStatus === 'processing') {
    return (
      <div className="flex items-center justify-center gap-sm py-xl text-text-dim text-xs">
        <div className="w-3 h-3 border-2 border-cta border-t-transparent rounded-full animate-spin" />
        Analyzing content...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header: sport, competition, players */}
      {(asset.ocrSport || asset.ocrCompetition || players.length > 0) && (
        <div className="px-md py-sm border-b border-glass-border space-y-xs">
          {asset.ocrSport && (
            <div className="flex items-center gap-xs text-xs">
              <Trophy size={11} className="text-cta" />
              <span className="text-text font-semibold">{asset.ocrSport}</span>
              {asset.ocrCompetition && (
                <span className="text-text-muted">— {asset.ocrCompetition}</span>
              )}
            </div>
          )}
          {players.length > 0 && (
            <div className="flex items-center gap-xs text-xs text-text-muted">
              <Users size={11} className="opacity-50" />
              {players.join(' vs ')}
            </div>
          )}
        </div>
      )}

      {/* Moments list */}
      <div className="flex-1 overflow-y-auto px-sm py-sm space-y-[2px]">
        {moments.map((moment, i) => (
          <button
            key={`${moment.timestamp}-${i}`}
            onClick={() => handleSeek(moment.timestamp, i)}
            className={`w-full flex items-start gap-sm px-sm py-xs rounded-md text-left transition-colors cursor-pointer ${
              i === activeIndex
                ? 'bg-glass-hover'
                : 'hover:bg-glass-hover/50'
            }`}
          >
            <span className="font-mono text-[10px] text-cta shrink-0 pt-[2px] min-w-[40px]">
              {formatTimecode(moment.timestamp)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text font-semibold truncate">
                {moment.label}
              </div>
              <div className="flex items-center gap-sm text-[10px] text-text-muted">
                {moment.score && <span>{moment.score}</span>}
                {moment.set_period && <span>· {moment.set_period}</span>}
                {moment.game_time && (
                  <span className="flex items-center gap-[2px]">
                    <Clock size={9} className="opacity-50" />
                    {moment.game_time}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/detail/KeyMomentsList.tsx
git commit -m "feat: add KeyMomentsList component for detail panel tab"
```

---

## Task 11: Wire Key Moments Tab into Detail Panel

**Files:**
- Modify: `frontend/src/components/detail/DetailPanel.tsx`

- [ ] **Step 1: Add import and tab**

At the top of `DetailPanel.tsx`, add the import:

```typescript
import { KeyMomentsList } from './KeyMomentsList';
```

- [ ] **Step 2: Extend the tabs array**

Find the tabs array (around line 83) and make it dynamic based on OCR data:

Replace the static tabs definition with:

```typescript
  const tabs = [
    'info' as const,
    'transcript' as const,
    ...(asset?.ocrStatus === 'complete' && asset?.ocrKeyMoments ? ['moments' as const] : []),
  ];
```

Update the `initialTab` and `activeTab` types to include `'moments'`.

- [ ] **Step 3: Add the tab content**

In the tab content switch/conditional (inside AnimatePresence), add after the transcript tab content:

```tsx
              {activeTab === 'moments' && asset && (
                <KeyMomentsList asset={asset} videoRef={videoRef} />
              )}
```

- [ ] **Step 4: Update tab labels**

In the tab button rendering, update the label display to show "Key Moments" for the `moments` tab:

```typescript
const tabLabels: Record<string, string> = {
  info: 'Info',
  transcript: 'Transcript',
  moments: 'Key Moments',
};
```

Use `tabLabels[tab]` instead of the raw tab name in the button text.

- [ ] **Step 5: Verify build**

```bash
cd frontend
npm run build
```

Expected: Clean build, no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/detail/DetailPanel.tsx
git commit -m "feat: add Key Moments tab to detail panel"
```

---

## Task 12: End-to-End Test

- [ ] **Step 1: Set GEMINI_API_KEY in backend/.env**

Add your Gemini API key to `backend/.env`:

```bash
GEMINI_API_KEY=your_actual_key_here
```

- [ ] **Step 2: Restart backend**

```bash
cd backend
npm run dev
```

Verify no startup errors. Should see the GEMINI_API_KEY warning disappear.

- [ ] **Step 3: Upload a test video**

Upload a short sports video through the import page. Monitor backend logs for:
- "OCR: scoring transcript..." 
- "OCR: computing audio energy..."
- "OCR: detected N peaks"
- "OCR: refining peaks..."
- "OCR: analyzing N frames with Gemini..."
- "OCR: complete — N key moments"

- [ ] **Step 4: Verify Key Moments tab**

Open the asset in the detail panel. Check:
- Third tab "Key Moments" appears
- Header shows sport, competition, players
- Moments list shows timestamped events
- Clicking a timecode seeks the video
- Active moment highlights during playback

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: end-to-end adjustments for OCR pipeline"
```
