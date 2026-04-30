# Media Analysis V2 Audio Profile Audit

Reference result:

- `/tmp/media-analysis-v2-context-audio-hints-2026-04-30-v3/media_analysis_v2/result.json`

Command:

- `node backend/scripts/audit-v2-audio-profile.mjs /tmp/media-analysis-v2-context-audio-hints-2026-04-30-v3/media_analysis_v2/result.json`

Purpose:

- inspect `0.5s` frames, `1s` summaries, `5s` summaries, raw audio peaks, and reaction episodes around known tennis timestamps
- keep this pass observable-only; do not promote events from these scores yet

## Compact Review

| time | 5s window | raw shape | context shape | raw rally | ctx rally | raw reaction | ctx reaction | raw speech | ctx speech | suppression | speech density | first read |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| `23:07` | `23:05-23:10` | `medium_rally` | `recap_only` | `0.603` | `0.523` | `0.513` | `0.473` | `0.576` | `0.854` | `high_speech_density`, `speech_dominance` | `0.794` | fixed by context: speech-heavy slow-motion/recap no longer reads as live rally shape |
| `73:57` | `73:55-74:00` | `medium_rally` | `medium_rally` | `0.556` | `0.476` | `0.737` | `0.697` | `0.492` | `0.732` | none | `0.687` | good: strong reaction survives moderate excited commentary |
| `74:27` | `74:25-74:30` | `medium_rally` | `recap_only` | `0.584` | `0.234` | `0.465` | `0.290` | `0.564` | `0.914` | `high_speech_density`, `speech_dominance` | `1.000` | fixed by context: speech-heavy recap tail no longer looks like live medium rally |
| `81:27` | `81:25-81:30` | `unknown` | `recap_only` | `0.517` | `0.517` | `0.425` | `0.425` | `0.587` | `0.812` | `weak_reaction_burst`, `speech_dominance` | `0.643` | warning: useful episode anchor, but context says transcript-heavy; promotion should require event/episode evidence |
| `82:22` | `82:20-82:25` | `unknown` | `unknown` | `0.506` | `0.386` | `0.381` | `0.261` | `0.595` | `0.595` | `music_bed`, `weak_reaction_burst` | `0.000` | good warning case: sustained post-point/replay energy should back-anchor instead of creating a fresh event |

## Findings

- The fine audio profile is useful for timing: `73:57` has a clear `0.5s` attack at about `73:55.5-73:56.0`, and the `5s` summary correctly has the highest `reactionBurstScore` among the nearby windows.
- The current reaction episode grouping is doing the right structural thing for `73:57 -> 74:27`: primary anchor stays at `73:58`, while the later `74:28` peak is a tail.
- Signal-only `pointShapeHint` is not safe enough by itself. `23:07` and `74:27` both appear as raw `medium_rally`, but the context-adjusted layer correctly converts them to `recap_only`.
- `speechDominanceScore` now has a context-adjusted companion that blends transcript `speechDensity` and cues. Later passes should still add stronger voice/harmonic features.
- `musicBedScore` is useful as a suppression warning around `81:27` and `82:22`, but it should be treated as a context flag rather than a hard reject.

## Next Tuning Step

- Add `reactionLikePeaks` from:
  - high `reactionBurstScore`
  - strong attack time
  - lower context-adjusted speech/commentary dominance
  - episode primary role
  - previous/next summary navigation
