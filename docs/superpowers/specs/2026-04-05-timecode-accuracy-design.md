# OCR Pipeline Timecode Accuracy Improvements

## Problem

Moment timestamps are +-5-15s off from where events actually happen. Root causes:
- Transcript timestamps bucketed into 10s windows, discarding Whisper's ~0.5s precision
- Overlay diff scans only scoreboard zones (35% of frame), extracting ~30 frames per peak
- Fixed silence threshold (0.15) fails on loud broadcasts, fallback is a hardcoded +-10s/+5s window
- Curation timestamp matching uses fuzzy +-30s lookup that can snap to the wrong moment
- Binary keyword scoring (0 or 1) treats "match point" and "tackle" identically

## Strategy

- Measure first: benchmark script with manually annotated tennis match before any code changes
- Implement incrementally: one change at a time, measure after each
- Tennis first: simpler sport (discrete points, clear crowd reactions), adapt to football after
- Zero additional Gemini API calls across all changes

## Implementation Priority

| Priority | Change | Expected Impact |
|----------|--------|-----------------|
| 1 | Benchmark script | Enables measurement of all subsequent changes |
| 2 | C1: 5s windows | Coarse error +-5s -> +-2.5s |
| 3 | Transcript-anchored timestamps | Biggest gain: +-1-3s with sport offsets |
| 4 | C5: Weighted keywords | Better peak selection, enables transcript anchoring |
| 5 | C3: Adaptive silence threshold | Fixes end-time detection + no-keyword start-time fallback |
| 6 | C4: Index-based curation matching | Eliminates rounding mismatches |
| 7 | C2: Lighter overlay diff | Fewer ffmpeg calls, same accuracy |

---

## 1. Benchmark Script

A CLI script for measuring pipeline accuracy against ground truth.

**Input:** Asset ID + manually annotated moments `{ label, actualTimestamp }`

**Output:** Comparison table and error statistics:
```
Moment              | Pipeline  | Actual  | Error
Ace at 23:42        | 23:45     | 23:42   | +3s
Break of serve      | 15:20     | 15:17   | +3s
Match point         | 1:05:30   | 1:05:28 | +2s

Average error: 4.2s | Median: 3.0s | Max: 8.1s
```

**Usage:** Annotate one tennis match (~10-15 moments). Re-run after each pipeline change to measure improvement.

---

## 2. C1 — Reduce Window Size 10s -> 5s

**Files:** `backend/src/lib/ocr/transcript-scoring.ts`, `backend/src/lib/ocr/audio-peaks.ts`

Change `windowSize = 10` to `windowSize = 5` in both:
- `transcript-scoring.ts:46` — transcript window scoring
- `audio-peaks.ts:69` — coarse audio energy computation

Maximum coarse error drops from +-5s to +-2.5s. Peak detection gets better separation — two events 8s apart no longer merge into one bucket.

No downstream changes needed. Peak detection, overlay diff, and all subsequent stages consume the array output regardless of window size. `computeMaxPeaks` already caps peak count.

---

## 3. Transcript-Anchored Timestamps

The single biggest accuracy improvement. Uses Whisper's segment-level timestamps (~0.5s accuracy) instead of discarding them into 10s buckets.

### 3a. Store keyword segment timestamp

**File:** `backend/src/lib/ocr/transcript-scoring.ts`

When a keyword matches in a window, also store the original transcript segment's `start` timestamp as `keywordTimestamp`. This is the precise moment the commentator began speaking the keyword.

### 3b. Carry through pipeline

Add `keywordTimestamp: number | null` to all pipeline types:
- `CoarsePeak` (peak-detection.ts)
- `RefinedPeak` (overlay-diff.ts)
- `VisionResult` (vision-api.ts)
- `KeyMoment` (result-processing.ts)

This field must never be overwritten by downstream stages — it is the transcript ground truth.

### 3c. New start-time logic

**File:** `backend/src/lib/ocr/moment-boundaries.ts`

Replace the backward silence scan as the primary start-time mechanism:

Notes:
- `keywordTimestamp` = the Whisper segment start time when the commentator said the keyword
- `peakTimestamp` = the coarse peak time (midpoint of the winning audio+transcript window)
- "crowd-heavy" categories = ace, double_fault, goal, match_point, set_point, break_point, penalty

```
if keywordTimestamp AND peakTimestamp both exist:
  if abs(keywordTimestamp - peakTimestamp) < 6s:
    anchorTime = 0.6 * keywordTimestamp + 0.4 * peakTimestamp
  else:
    if keyword category is crowd-heavy:
      anchorTime = peakTimestamp
    else:
      anchorTime = keywordTimestamp
  startTime = anchorTime - sportOffset(sport, keyword.category)
  clamp to [peakTimestamp - 15s, peakTimestamp - 1s]
else if keywordTimestamp only:
  startTime = keywordTimestamp - sportOffset(sport, keyword.category)
  clamp to [peakTimestamp - 15s, peakTimestamp - 1s]
else:
  startTime = silence scan backward (existing fallback, using adaptive threshold from C3)
```

End-time remains: silence scan forward from peak (unchanged logic, but uses adaptive threshold from C3).

### 3d. Sport offset table

Initial values, tuned empirically from benchmark results:

| Sport | Event Category | Offset (seconds) | Rationale |
|-------|---------------|-------------------|-----------|
| Tennis | Ace, double fault | 1.5 | Serve-to-call ~1-1.5s |
| Tennis | Break/set/match point won | 2.0 | Point ends -> crowd -> commentator |
| Tennis | General point | 2.0 | Same reactive delay |
| Football | Goal | 3.0 | Ball crosses line -> crowd -> commentator |
| Football | Foul/card | 2.0 | Whistle -> commentator identifies |
| Football | Penalty awarded | 4.0 | Decision -> announcement |

These offsets are a config table, not hardcoded constants. Adjust after benchmark measurements.

---

## 4. C5 — Weighted Sport-Specific Keywords

**File:** `backend/src/lib/ocr/transcript-scoring.ts`

### 4a. Replace binary scoring with weighted tiers

Replace `ACTION_KEYWORDS` Set with a Map of `keyword -> { weight, sport, category }`.

**Tiers:**
- **Decisive (1.0):** match point, championship, wins, title, goal, scores, penalty, red card, winner
- **Significant (0.7):** ace, break, deuce, set point, advantage, tiebreak, save, offside, corner, yellow card, header, free kick
- **Routine (0.3):** serve, forehand, backhand, volley, rally, tackle, substitution, foul, clearance, pass
- **Hype (0.4):** incredible, amazing, unbelievable, brilliant, huge (shared across sports)

`transcriptScore` becomes 0.0-1.0. Combined score `0.6 * transcriptScore + 0.4 * audioEnergy` now meaningfully differentiates peaks.

### 4b. Multi-word keyword matching

Current single-word `split(/\s+/)` loop cannot match phrases like "match point" or "red card". Change to scan 1-word, 2-word, and 3-word combinations from the transcript text. Longest match wins (so "match point" takes priority over "match" alone).

### 4c. Category field for transcript anchoring

Each keyword entry includes a `category` field (e.g., "ace", "goal", "foul") used by the transcript anchor (section 3d) to select the correct sport offset.

### 4d. Non-English fallback

If Whisper's detected language is not English, shift the combined score weights from `0.6 transcript + 0.4 audio` to `0.2 transcript + 0.8 audio`. Keywords won't match in other languages, so lean on crowd noise as the primary signal.

---

## 5. C3 — Adaptive Silence Threshold

**File:** `backend/src/lib/ocr/moment-boundaries.ts`

### 5a. Compute per-video threshold

Replace hardcoded `SILENCE_THRESHOLD = 0.15`:

1. Extract full-video 1-second energy values (reuse `computeFinegrainEnergy` or add a full-video variant)
2. Sort all energy values, pick the 20th percentile as the silence threshold
3. Clamp between floor 0.05 and ceiling 0.30

### 5b. Usage

- **End-time detection** (forward scan): all moments use adaptive threshold
- **Start-time detection** (backward scan): only moments without keyword matches (fallback path)

---

## 6. C4 — Index-Based Curation Matching

**File:** `backend/src/lib/ocr/result-processing.ts`

### 6a. Pass index to Gemini

When building the moments list for the curation prompt, include an `id` field (0-based index) with each moment:
```
[0] [23:42] Break of serve | 4-3 | 2nd set
[1] [25:10] Ace | 5-3 | 2nd set
```

### 6b. Gemini returns id

Update the prompt to ask Gemini to return `"id": 0` instead of `"timestamp_str": "23:42"`.

### 6c. Direct mapping

Post-processing maps by id directly. No fuzzy +-30s timestamp matching. Eliminates rounding mismatches entirely.

---

## 7. C2 — Lighter Overlay Diff

**File:** `backend/src/lib/ocr/overlay-diff.ts`

### 7a. Reduce frame extraction

Replace current approach (extract ~30 frames at 1fps in +-15s window) with:
- Extract 5-7 frames at 3-5s intervals around the peak
- Same `compareOverlayZones` pixel-diff logic (scoreboard zones — full-frame adds noise)
- Pick the frame with the biggest visual change

### 7b. Impact

Reduces total ffmpeg frame extractions from ~900 to ~150-200 across all peaks. Scoreboard changes aren't sub-second events, so 3-5s sampling loses nothing.

---

## What We're NOT Doing

- **Pass 4 (Gemini frame scanning for timestamp correction):** Gemini can't reliably distinguish adjacent frames at 360p. Transcript anchoring is cheaper and more precise.
- **Full-frame pixel diff:** Too noisy without tuning. Camera pans, lighting, crowd movement create false positives. Scoreboard zones are sufficient.
- **1-second Gemini frame sampling:** 50x cost increase ($0.04 -> $2/video) for marginal improvement on the wrong bottleneck.
- **Multi-language keyword translation:** Premature. Use audio weight shift for non-English until specific language support is needed.
- **Gemini-based transcript analysis:** Gemini reading the transcript to find event timestamps adds cost for something the transcript already provides directly.
