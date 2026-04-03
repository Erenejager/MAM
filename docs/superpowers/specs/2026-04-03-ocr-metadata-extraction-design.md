# OCR Metadata Extraction — Design Spec

## Goal

Automatically extract key moments with timecodes from video content during ingest using audio analysis, transcript keywords, overlay differencing, and a vision LLM. Results are stored as structured metadata and displayed in a new "Key Moments" tab on the asset detail panel. Clicking a moment seeks the video player to that timecode.

## Architecture Overview

```
Ingest pipeline (existing stages):
  ffprobe → thumbnail → preview frames → transcription
                                              ↓
New OCR stage:                     uses transcript data
  Pass 1: Coarse peak detection (transcript keywords + audio energy)
  Pass 2: Precision refinement (overlay diff in ±15s windows)
  Pass 3: Vision API on selected frames
  Pass 4: Merge into key moments timeline
                                              ↓
                                    OpenSearch indexing
```

Soft-fail: if `GEMINI_API_KEY` is missing or the API fails, stage is skipped, asset still reaches 'ready'.

## Frame Selection: Two-Pass Approach

### Pass 1 — Coarse Peak Detection (< 5 seconds)

Uses data already available from previous pipeline stages. No frame extraction yet.

**Transcript keyword scoring (weight 0.6):**

Scan Whisper segments for universal action words:

```
goal, scores, point, wins, winner, save, miss,
match, set, game, round, half, period, quarter,
break, penalty, foul, card, knockout, finish,
champion, victory, defeat, record, final, ace,
try, conversion, birdie, eagle, hole, lap
```

Each 10-second window gets a transcript_score (0 or 1 — contains keyword or doesn't).

**Audio energy scoring (weight 0.4):**

- Extract audio via ffmpeg as raw PCM (mono, 8kHz — tiny output even for long videos)
- Compute RMS energy per 10-second window
- Normalize to 0-1 relative to that video's own min/max

**Combined score per window:**

```
score = 0.6 * transcript_score + 0.4 * audio_score
```

**Peak selection:**

- Find local peaks in the combined score
- Merge peaks within 30 seconds of each other (keep the loudest)
- Keep ALL surviving peaks (adaptive — count scales with content)
- Cap at 30 maximum for cost control

**Output:** List of approximate timestamps (±10s accuracy).

### Pass 2 — Precision Refinement (< 15 seconds)

For each coarse peak, pinpoint the exact timecode using overlay zone differencing.

**Per peak:**

1. Extract frames in a ±15 second window at 1-second intervals (30 frames per peak)
2. Frames at 360p resolution (640x360), sufficient for comparison
3. Compute pixel difference between consecutive frames in overlay zones only:
   - Top 15% of frame (scoreboards, score bugs)
   - Bottom 20% of frame (name tags, lower-thirds, replay markers)
4. Find the frame with the largest overlay change within the window
5. That frame = the exact timecode + the frame sent to the vision API

**Resource usage:**

- Up to 30 peaks × 30 frames = 900 frames worst case
- Only 2 frames in memory at a time (~1.4MB)
- Frames are temp files, deleted after comparison
- Processing: ~10-15 seconds on a 4GB RAM server for any video length

**Output:** Refined timestamps + extracted JPEG frames ready for API.

## Vision API

**Model:** Gemini 2.5 Flash

**Prompt (sport-agnostic):**

```
Analyze this video frame from a sports broadcast. Extract any visible information.
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
}
```

**Adaptive frame count:** Sends however many frames Pass 2 produced (typically 5-25, capped at 30).

**Cost per asset:** $0.01-0.06 depending on content density.

## Result Processing

### Step 1: Discard Empty Responses

For each Gemini response, discard if:
- No meaningful fields returned (no sport, no score, no players, no event)
- Frame was a crowd shot, black frame, or ad break with nothing to extract

### Step 2: Establish Consensus

From all valid responses, determine ground truth by majority vote:
- **Sport**: most frequent value across frames → becomes the reference
- **Players/teams**: names appearing in 3+ frames → confirmed. Names in 1-2 frames only → dropped
- **Competition**: most frequent value → confirmed

Any frame that contradicts the consensus (e.g., says "football" when 90% say "tennis") is dropped entirely.

### Step 3: Chronological Validation

Scores must progress logically through time:
- Sort remaining moments by timestamp
- Walk through the sequence — each score must be reachable from the previous one
- A score that regresses without a set/half/period change is a misread → drop that moment
- Example: 1-0, 2-0, 1-1, 3-0 → the "1-1" is inconsistent, dropped

### Step 4: Build Key Moments Timeline

Only moments that survived all three filters become key moments:

```json
[
  {
    "timestamp": 82,
    "label": "Break point",
    "score": "4-3",
    "set_period": "2nd set",
    "players": ["Sinner", "Lehecka"],
    "competition": "Miami Open 2026",
    "transcript": "break point for Sinner now",
    "audio_energy": 0.91
  },
  {
    "timestamp": 88,
    "label": "Service break",
    "score": "5-3",
    "set_period": "2nd set",
    "players": ["Sinner", "Lehecka"],
    "transcript": "and he converts it, Sinner breaks",
    "audio_energy": 0.95
  }
]
```

**Label derivation:** The `event` field from the vision API becomes the label. If the vision API didn't return an event, the highest-scoring transcript keyword in that window is used. If neither, the moment is dropped — a moment without a label isn't useful.

**Sport and competition metadata:** Extracted from consensus (step 2). Stored as top-level fields on the asset, not per-moment.

## Schema Changes

Add to `assets` table in `backend/src/db/schema.ts`:

```typescript
ocrStatus: text('ocr_status').default('pending'),
ocrError: text('ocr_error'),
ocrSport: text('ocr_sport'),                // consensus sport type
ocrCompetition: text('ocr_competition'),     // consensus tournament/league
ocrPlayers: text('ocr_players'),             // JSON array of detected player/team names
ocrKeyMoments: text('ocr_key_moments'),      // JSON array of timestamped events
```

Migration: `npm run db:generate` + `npm run db:migrate`

## Environment

```bash
GEMINI_API_KEY=your_key_here   # Optional — OCR skipped if missing
```

Add to `.env.example`. Warn (not fail) in `validate-env.ts`.

Dependency: `@google/generative-ai` npm package.

## Detail Panel: Key Moments Tab

### Tab Bar

Current:
```
[ Info ] [ Transcript ]
```

New:
```
[ Info ] [ Transcript ] [ Key Moments ]
```

Tab only appears when `ocrStatus === 'complete'` and `ocrKeyMoments` is non-empty. If OCR was skipped or failed, the tab is hidden — no empty state needed.

### Tab Content

**Header area:**
- Sport badge (e.g., "Tennis") if `ocrSport` is set
- Competition name if `ocrCompetition` is set
- Player/team names if `ocrPlayers` is set

**Moments list:**
- Vertical timeline of key moments, ordered by timestamp
- Each entry:
  ```
  [22:43]  Goal — Mbappé scores, 2-0
  [38:12]  Yellow card — Rodri
  [67:05]  Substitution
  [78:34]  Goal — Haaland, 2-1
  [89:02]  Full time — 2-1
  ```
- Timecode is clickable — seeks the video player to that timestamp
- Same seek mechanism as transcript tab (sets `HTMLVideoElement.currentTime`)
- Active moment highlighted based on current playback position (same pattern as transcript sync)

**Loading state:**
- If `ocrStatus === 'processing'`, show "Analyzing content..." with spinner in the tab content

### Styling

- Follows existing design system (Cinema Dark)
- Timecodes in `text-cta` color (red accent), clickable
- Labels in `text-text` (white)
- Score/details in `text-text-muted` (grey)
- Active moment gets `bg-glass-hover` highlight
- Consistent with transcript tab styling and interaction patterns

## Test Plan

### Phase 1: Standalone proof-of-concept
- Take one existing asset
- Run Pass 1 (transcript keywords + audio peaks)
- Run Pass 2 (overlay diff refinement)
- Send frames to Gemini Flash
- Print raw results + merged key moments
- Evaluate: accuracy, noise level, timecode precision

### Phase 2: Pipeline integration
- Add schema columns + migration
- Implement OCR stage in pipeline.ts (after transcription, before OpenSearch)
- Test with new upload end-to-end

### Phase 3: Key Moments tab UI
- Add third tab to detail panel
- Render key moments list with clickable timecodes
- Wire timecode click to video player seek
- Highlight active moment during playback

## Cost Estimates

| Scale | Avg frames/asset | API cost | Processing time |
|-------|-----------------|----------|-----------------|
| 1 asset (test) | 10 | $0.01 | ~20 seconds |
| 100 assets | 12 avg | $1-2 | batch overnight |
| 10,000 assets | 15 avg | $100-200 | batch over days |
| 1,000,000 assets | 15 avg | $10,000-20,000 | batch over weeks |

Per-ingest (new upload): $0.01-0.06, < 30 seconds total processing.

## Out of Scope (MVP)

- Sport-specific parsing or validation rules
- Backfill endpoint for existing assets
- Vector search integration
- Agent integration (timeline data is stored for future use)
- Score progression tracking across moments
- Editing/deleting individual key moments from the UI
- Exporting key moments as chapter markers
