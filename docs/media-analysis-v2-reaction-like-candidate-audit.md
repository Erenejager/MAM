# Media Analysis V2 Reaction-Like Candidate Audit

Reference result:

- `/tmp/media-analysis-v2-context-audio-hints-2026-04-30-v3/media_analysis_v2/result.json`

Command:

- `node backend/scripts/audit-v2-reaction-like-candidates.mjs /tmp/media-analysis-v2-context-audio-hints-2026-04-30-v3/media_analysis_v2/result.json --limit=30`

Purpose:

- run the timeline/audio profile across the whole media
- rank likely reaction/action anchors from context-adjusted audio summaries
- compare candidates to current V2 events, raw audio peaks, and reaction episodes
- create a short review queue for direct video validation before adding promotion logic

## Initial Review Queue

These are the first candidates worth checking directly in the video.

| priority | time | suggested label | manual review label | why review |
| ---: | --- | --- | --- | --- |
| 1 | `37:48-37:49` | `possible_missed_key_moment` | `live_key_moment` / `game_won` | Djokovic wins a point to break in set 1; score moves from `3-4 30-40` to `3-5`; commentator says `Djokovic breaks` |
| 2 | `79:37-79:45` | `unclear` | `live_key_moment` / `point_won` for Alcaraz | set 2, score `2-4 30-40` for Djokovic; point starts, Alcaraz wins the point at about `79:41` |
| 3 | `85:01-85:02` | `unclear` | `between_points` / `pressure_state` | set 2, score `2-5 0-40`; Djokovic has three match points; this is between points, next serve starts at about `85:13` |
| 4 | `40:54-40:55` | `unclear` | `live_key_moment` / `set_won` | set 1, score `3-5 0-40` for Djokovic; Djokovic wins the point and the set at about `40:54` |
| 5 | `86:59-87:01` | `recap_tail` | `broadcast_graphic_or_animation` | broadcaster animation after the match; do not promote as a live key moment |
| 6 | `71:40-71:41` | `commentary_false_positive` | pending | high audio peak but context says speech-dominant recap/commentary |

## Manual Review Implications

- `37:48-37:49` should become a missed `game_won` candidate, not just an audio reaction.
- `40:54-40:55` should improve the set-winning anchor/result detection; current `set_won` is anchored earlier at `40:32.5`, while manual review confirms the live set-ending point occurs around `40:54`.
- `79:37-79:45` shows that reaction-like candidates can identify live point results even when the transcript is noisy; the winner can be Alcaraz when score moves away from Djokovic's break-point chance.
- `85:01-85:02` should not become a result event by itself; it is pressure/between-points context before the next serve at about `85:13`.
- `86:59-87:01` confirms the need for end-of-match broadcast graphic/animation suppression or post-match recap-tail classification.

## Current Event Coverage

The audit also compares current V2 events to top reaction-like candidates.

Strong/close coverage:

- `20:49.5` point: nearby reaction-like candidate at `20:50-20:52`
- `73:57.5` point: nearby reaction-like candidate at `73:55-73:56`
- `81:26.0` game: nearby reaction-like candidate at `81:24-81:25`

Weak/no reaction-like coverage that may need review:

- `4:23.6` opening service break-point save
- `23:15.9` overhead point
- `36:13.4` break-point pressure state
- `40:32.5` set-point/set result
- `69:35.9` rally point
- `75:28.5` incredible point
- `75:57.2` hold for `4-2`
- `86:16.1` match result

This does not mean those events are wrong. Some may be transcript/OCR-led, muted, or anchored before/after the reaction. The point is to inspect whether the timeline can provide a better anchor or whether these events should remain transcript-led.

## Label Set

Use these labels during video review:

- `live_key_moment`
- `better_anchor_for_existing_event`
- `already_captured`
- `possible_missed_key_moment`
- `recap_tail`
- `replay_back_anchor`
- `commentary_false_positive`
- `music_or_changeover`
- `unclear`

## Next Implementation Gate

Do not promote these candidates yet.

After manual review:

- convert confirmed labels into regression tests
- build `reactionLikePeaks` from context reaction score, attack time, low context speech dominance, episode role, and previous/next navigation
- require transcript/OCR/event context before creating or upgrading a key moment
