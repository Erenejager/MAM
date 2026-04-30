# Media Analysis V2 Audio Peak Audit

Reference asset:

- `3936415e-cded-4b32-a264-03b12a33d73f`

Input result:

- `/tmp/media-analysis-v2-ocr-verify-2026-04-28-anchorfix/media_analysis_v2/result.json`

Audit command:

- `node backend/scripts/audit-v2-audio-peaks.mjs /tmp/media-analysis-v2-ocr-verify-2026-04-28-anchorfix/media_analysis_v2/result.json /home/clawdbot/.mam/storage/3936415e-cded-4b32-a264-03b12a33d73f`

## Summary

- `1046` timeline windows
- `16` current V2 events
- `101` raw local audio peaks
- `40` medium/high priority audit rows

The first audit confirms the planned approach: audio peaks are useful for timing and missed-candidate discovery, but too noisy to promote directly into tennis results.

## Classification

### Existing Events Supported By Audio

These peaks should be used as timing/evidence support for existing V2 events.

| Time | Current event | Notes |
| --- | --- | --- |
| `3:07` | `point_won`: first break points saved | OCR score moves `0-0 (15-40)` -> `0-0 (30-40)` nearby. Good support. |
| `12:07` | `game_won`: third hold to `2-1` | Confirms the corrected `11:58`-`12:04` hold boundary. Still no OCR coverage for the actual result window. |
| `20:47` | `point_won`: forehand point of the match | Strong transcript and audio support. |
| `40:32` | `pressure_state` / `set_won` | Current anchoring uses set-point state. Later OCR at `40:54` supports set result. |
| `75:22` | `point_won`: incredible point at `30-40` | Audio supports existing point event. OCR is later and probably recap/result-adjacent. |
| `75:57` | `game_won`: Djokovic holds for `4-2` | Audio supports corrected earlier hold/result anchor. |
| `81:27` | `game_won`: third break, one game from victory | Audio supports live break/result beat. |
| `86:17` | `match_won`: Djokovic wins `6-3, 6-2` | Audio and OCR support match result. |

### Likely Missed Or Under-Represented Candidates

These should be reviewed manually against video/OCR before promotion logic is added.

| Time | Evidence | Initial interpretation |
| --- | --- | --- |
| `14:12` | OCR `2-1 (0-15)`, serve/drop shot language | Likely point event after the `2-1` hold. Could remain below highlight threshold unless confirmed as notable. |
| `19:02` | OCR `2-2 (40-30)`, great backhand / forced volley | Possible point candidate. Needs score movement review. |
| `21:42` | OCR `2-2 (40-40)`, missed volley | Possible point candidate. Could be ordinary point unless score context matters. |
| `23:27` | OCR says Djokovic brilliant overhead winner | Strong candidate for reaction-led `point_won`; transcript has OCR/ASR noise with repeated `Goal`. |
| `28:47` | OCR `3-3 (15-0)`, brilliant volley | Possible point candidate. Needs result-vs-highlight decision. |
| `34:52` | OCR `4-3 (30-15)`, `What a return` | Possible point candidate. Needs confirmation. |
| `36:02` | OCR `4-3 (40-15)`, break-point pressure language | Likely `pressure_state`, not result. |
| `37:52` | OCR `5-3`, break language | Possible game/break result, but OCR/context attribution may be noisy. Needs review. |
| `43:02` | OCR label: Alcaraz incredible angled shot winner | Strong reaction-led point candidate. |
| `54:12` | OCR label: Djokovic breaks serve | Likely `game_won` candidate if transcript/OCR confirm live break, but may already be structurally represented later/elsewhere. |
| `64:42` | OCR label: Alcaraz faces break point | Likely `pressure_state`, not result. |
| `69:52` | OCR label: Alcaraz wins spectacular rally | Strong reaction-led point candidate. |
| `72:32` | OCR `3-6, 2-5 (15-40)`, first break chances | Likely `pressure_state`, not result. |
| `73:57` | Later OCR label: Alcaraz anticipates pass, earns break points | Strong live-point candidate, but later OCR is slow-motion recap context and should not confirm the live endpoint by itself. |
| `77:02` | OCR label: Alcaraz reacts after losing point | Possible low-confidence `crowd_reaction` or point candidate; label is vague. |
| `78:32` | Strong audio, serve/coverage language, no OCR nearby | Candidate only; needs OCR sampling before promotion. |
| `79:17` | OCR label: Djokovic has break point | `pressure_state`, not result. |
| `80:17` | OCR label: Djokovic holds break point / `8th break point` transcript | `pressure_state`, not result. |

### Recap, Secondary, Or Crowd-Only Peaks

These should not create fresh primary tennis result events.

| Time | Reason |
| --- | --- |
| `82:22` | Segment classified as `crowd`; transcript says reaction after recent break. Should be `crowd_reaction` or secondary evidence for the break, not a fresh result. |
| `87:02` | Segment classified as `crowd` after match result. Should be secondary post-match crowd reaction, not another match event. |
| `65:07` | Sustained crowd/noise shape around game-score language. Candidate only at most. |

### Likely Noise Or Low-Value Peaks

These should not drive event generation without stronger evidence.

| Time | Reason |
| --- | --- |
| `0:17` | Opening atmosphere and ASR noise. OCR nearby but no clear event. |
| `2:07` | OCR break-point opportunity nearby, but transcript context is noisy. Needs pressure-state review before any event. |
| `34:27` | OCR is 23.5s away and transcript is unrelated historical comparison. |
| `53:52` / `54:32` | Around possible break sequence, but surrounding peaks may be duplicates of the same game context. Review as one group, not separate events. |
| `79:42` | Likely continuation of the break-point sequence near `79:17` / `80:17`. |
| `83:12` / `83:52` | Around match-point context, but unclear whether this is pressure, point, or lead-up noise without video/OCR sampling. |

## Plan Correction From Audit

The first implementation should not be `generate crowd_reaction for every high audio peak`.

Safer first code step:

1. Add a reusable V2 audio peak index with local baseline, percentile rank, spike score, shape, and grouped peak id.
2. Expose peak metadata in the result or summary for inspection.
3. Use the peak index only as evidence for existing events at first.
4. Add new `crowd_reaction` event generation only after tests cover:
   - post-result crowd reaction
   - replay/changeover peaks
   - pressure-state peaks
   - consecutive point peaks
   - vague praise without score/OCR support

## Next Manual Review Targets

Start with these timestamps because they are high-signal and likely to teach the promotion rules:

1. `23:27` Djokovic brilliant overhead winner
2. `43:02` Alcaraz incredible angled shot winner
3. `69:52` Alcaraz spectacular rally
4. `73:57` live point ending; later OCR/slow-motion context says Alcaraz earns break points
5. `82:22` post-break crowd reaction that should stay secondary

## Manual Review Labels

Reviewed high-signal targets:

| Audit time | Manual label | True live action window | Replay / recap window | Score context | Decision |
| --- | --- | --- | --- | --- | --- |
| `23:27` | start of the next point, not the overhead winner itself | previous point started around `22:44` and ended around `23:00` | slow motion from about `23:06` to `23:24`; transcript at `23:27` still refers to the previous point | Set 1, `2-2`, advantage Djokovic after previous `40-40` point | Do not promote `23:27` as a new point highlight. The actual candidate is the previous point ending around `23:00`; `23:27` is next-point setup / stale recap transcript. |
| `43:02` | slow-motion recap of the previous Alcaraz point | point started around `42:32` and ended around `42:52` | slow motion from about `42:59` to `43:18` | Set score `0-0`; point score was `30-0` Alcaraz before, `40-0` Alcaraz after | Do not create primary event at `43:02`. If promoted, anchor the live point ending around `42:52`; mark `43:02` as replay/secondary evidence. |
| `69:52` | slow-motion recap of previous rally won by Alcaraz | point started around `69:05` and ended around `69:38` | slow motion from about `69:50` to `70:16` | Set 2, Djokovic leads games `3-2`; point becomes `30-15` for Alcaraz after the point | Do not create primary event at `69:52`. Candidate live point should anchor near `69:38`; `69:52` is replay/secondary. |
| `73:57` | exact end of live rally point | point started around `73:23` and ended at `73:56`; later slow-motion recap appears around `74:34` | none at the live endpoint | Set 2, Djokovic leads games `3-2`; Djokovic wins the point to get back to `40-40` | Strong primary `point_won` candidate anchored around `73:56`. Later slow-motion OCR context should not be treated as direct confirmation unless score transition evidence is available. |
| `82:22` | recap / slow motion of prior rally that led Djokovic to win the game | rally started around `80:50` and ended around `81:25` | recap from about `81:45` to `82:55` | Djokovic wins the game; score becomes Set 2 `5-2` Djokovic | Keep `82:22` secondary. Primary `game_won` should stay anchored to the live point/game result around `81:25` / existing `81:27` event. |

Rules learned from manual review:

- Strong OCR labels around a peak can still point to replay/slow-motion, not live action.
- Audio peaks during replay can be high-value evidence, but should anchor back to the earlier live point if a primary event is created.
- Transcript near the next serve can still describe the previous point; do not assume transcript timing equals action timing.
- The first promotion rule should prefer live end timing when manual/video context shows a point ended shortly before a replay peak.
- `73:57` is the cleanest test case for a new audio-led primary `point_won`.
