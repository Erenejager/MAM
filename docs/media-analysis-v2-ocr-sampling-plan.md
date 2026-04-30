# Media Analysis V2 OCR Sampling Plan

Purpose:

- sample OCR around V2-owned reaction-like audio anchors
- use before/anchor/after score reads to validate score transitions
- keep attribution unchanged until OCR evidence is reviewed

Command:

```bash
node backend/scripts/audit-v2-ocr-sampling-plan.mjs /tmp/media-analysis-v2-reaction-like-promotion-2026-04-30-v3/media_analysis_v2/result.json /home/clawdbot/.mam/storage/3936415e-cded-4b32-a264-03b12a33d73f --limit=25 --min-score=0.52
```

Optional frame extraction smoke command:

```bash
node backend/scripts/audit-v2-ocr-sampling-plan.mjs /tmp/media-analysis-v2-reaction-like-promotion-2026-04-30-v3/media_analysis_v2/result.json /home/clawdbot/.mam/storage/3936415e-cded-4b32-a264-03b12a33d73f --limit=1 --min-score=0.52 --extract-frames=/tmp/v2-ocr-sampling-audio-aware-smoke
```

Frame extraction writes JPEG samples and a `manifest.json` grouped by candidate anchor. Each frame has a `sampleLabel` and `sampleSource`.

Audio-aware sampling pattern:

- anchor is the strongest attack time from the reaction-like `1s` audio profile group
- sample labels:
  - `setup_or_quiet_before`
  - `action_or_rally_context`
  - `reaction_start`
  - `reaction_peak`
  - `scoreboard_settle`
  - `tail_or_context_check`
- fixed fallback offsets are still used only to fill gaps:
  - `-10s`
  - `-5s`
  - `-2s`
  - anchor
  - `+2s`
  - `+5s`
  - `+10s`
  - `+15s`

Manual anchor coverage from the current reference:

| time | sampled anchor | review class | audio-aware samples | current read |
| --- | --- | --- | --- | --- |
| `37:48` | `37:48.3` | `result_phrase_needs_ocr` | setup/quiet, action/rally, reaction start/peak, scoreboard settle, tail/context check | legacy OCR only has later `? -> 5-3` context |
| `40:54` | `40:54.8` | `pressure_needs_before_after_ocr` | action/rally, setup/quiet, reaction start/peak, scoreboard settle, tail/context check | legacy OCR context is stale/mixed and not sufficient |
| `79:41` | `79:40.3` | `reaction_anchor_needs_ocr` | setup/quiet, action/rally, reaction start/peak, scoreboard settle, tail/context check | no useful legacy before/after OCR score read |
| `85:02` | `85:01.8` | `pressure_needs_before_after_ocr` | setup/quiet, action/rally, reaction start/peak, scoreboard settle, tail/context check | no useful legacy OCR; should verify no score transition |
| `86:59` | `87:00.3` | `post_match_or_graphic_check` | setup/quiet, action/rally, reaction start/peak, scoreboard settle, tail/context check | should verify post-match/graphic, not a live event |

Manual video validation:

- `79:40.3` anchor:
  - validated as a good point/reaction sampling set
  - `79:49`-`79:56` shows replay
  - earlier selected samples are good
- `40:54.8` anchor:
  - validated as correct for the set-ending point
  - `40:59`-`41:09` does not show replay; it shows player bench and spectators
  - keep the late sample, but treat it as broadcast tail/context, not replay-specific

Conclusion:

- the manifest identifies the right review targets
- legacy OCR contexts are not reliable enough for this pass because they were sampled by the old moment pipeline, not by V2 reaction anchors
- next implementation should execute OCR on these exact sample times and store per-anchor reads before using them for attribution
