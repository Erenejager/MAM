# Tennis Score Template — Structured Key Moments

**Date:** 2026-04-07
**Status:** Approved (conversational design review)

## Problem

Gemini returns free-text score fields with no consistent format. Examples from a single match:
- `"Set 1: 0-0, Alcaraz leads 40-15"`
- `"Set 1: Djokovic 3-2"`
- `"Alcaraz 3-3, Djokovic leads 0-40 in game"`
- `"Djokovic leads 1-0 sets (6-3)"`

Additionally:
- No distinction between scores **read from screen** vs **guessed from commentary**
- No detection of slow-mo/replay/celebration frames beyond a weak all-N/A check
- Missing scores are left as `null` instead of interpolated from surrounding moments

## Solution

Three changes to the OCR pipeline, applied in order:

### 1. Vision Prompt — Add `score_visible` and `frame_type`

In `vision-api.ts`, add two fields to the JSON schema Gemini returns:

```json
{
  "score_visible": true,
  "frame_type": "live_play"
}
```

- `score_visible` (boolean): Is the scoreboard/score overlay visible in the frame?
- `frame_type` (enum): `"live_play"` | `"replay"` | `"celebration"` | `"close_up"` | `"graphics"` | `"other"`

Update `VisionResult` interface to include these fields.

Update the replay filter in `result-processing.ts` to use `frame_type === "replay"` instead of the fragile all-N/A heuristic.

### 2. Curation Prompt — Tennis-Specific Structured Output

Replace the generic curation prompt with sport-aware branching. For tennis, request:

```json
{
  "timestamp_str": "M:SS",
  "label": "short label (max 12 words)",
  "moment_type": "break_of_serve|set_won|match_won|break_point|break_point_saved|ace|match_point|rally|hold|deuce|tiebreak|challenge|injury_timeout",
  "sets": [[6, 3], [5, 3]],
  "game_score": "40-15",
  "serving": "Djokovic",
  "set_period": "Set 2"
}
```

Fields:
- `moment_type`: categorizes what happened (used as UI badge)
- `sets`: array of `[p1_games, p2_games]` per set (completed + current). `null` if unknown.
- `game_score`: point score within the current game. `null` if between games.
- `serving`: who is serving. `null` if unknown.

For non-tennis sports, keep the existing free-text `score` field (future templates can be added per sport).

### 3. Post-Processing — Score Chain Interpolation

New function `interpolateScores()` in `result-processing.ts`, runs after curation:

1. Walk moments chronologically
2. If `sets` is non-null → mark `score_source: "visible"`
3. If `sets` is null → carry forward last known `sets` value, mark `score_source: "interpolated"`
4. Generate `score_display` deterministically from `sets` + `game_score`:
   - Between games: `"6-3, 5-3"` (just set scores)
   - During game: `"6-3, 5-3 (40-15)"` (with point score)
   - Set won: `"6-3"` (completed set only)
   - Match won: `"6-3, 7-5"` (all completed sets)

### 4. KeyMoment Interface Update

```typescript
interface KeyMoment {
  timestamp: number;
  label: string;
  score: string | null;        // kept for backward compat / non-tennis
  score_display: string | null; // new: deterministic formatted string
  sets: [number, number][] | null;
  game_score: string | null;
  serving: string | null;
  moment_type: string | null;
  score_source: 'visible' | 'inferred' | 'interpolated' | null;
  set_period: string | null;
  game_time: string | null;
  frame_type: string | null;
  transcript: string;
  audio_energy: number;
  startTime?: number;
  endTime?: number;
  peakTime?: number;
}
```

### 5. Frontend Display

In `KeyMomentsList.tsx`, update each moment card:

```
┌──────────────────────────────────────────────────────┐
│ 2:18  SET 1  ●         0-0 (40-15)    BREAK POINT   │
│       Alcaraz earns first break point                │
└──────────────────────────────────────────────────────┘
```

- Line 1: timecode | set badge | score confidence dot (● visible, ○ interpolated) | score_display | moment_type badge
- Line 2: label
- `moment_type` rendered as uppercase badge with accent color for critical types (SET WON, MATCH WON, BREAK) and muted for routine (HOLD, DEUCE)

## Scope

- Tennis template only (other sports keep existing behavior)
- Backend pipeline changes + frontend display update
- Re-run on Alcaraz match to validate

## Files Changed

- `backend/src/lib/ocr/vision-api.ts` — prompt + interface
- `backend/src/lib/ocr/result-processing.ts` — curation prompt, interpolation, KeyMoment type
- `frontend/src/components/detail/KeyMomentsList.tsx` — display
- `frontend/src/types/` — shared types if needed
