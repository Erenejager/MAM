# Media Analysis V2 Audio Map Facet Audit

## 2026-05-02

Purpose:

- make audio-based moments more visible without promoting loud broadcast noise
- review per-second audio facets around known tennis timestamps
- keep output audit-only before event behavior changes

Implemented:

- added reusable script helper:
  - `backend/scripts/lib/audio-facets.mjs`
- added moment-level rollup helper:
  - `summarizeAudioFacetTimeline`
- updated audio map audit:
  - `backend/scripts/audit-v2-audio-map.mjs`
- added per-row facet outputs:
  - `audioFacets`
  - `contextFacets`
  - `opportunityFacets`
  - `reasons`
- added focused review controls:
  - `--time=MM:SS`
  - `--candidate=candidate_window_id`
  - `--timeline-radius=N`
- candidate timelines now print compact rollup fields:
  - `audioMomentOpportunity`
  - `primaryAnchor`
  - `suppressiveTail`
- candidate adjudication packets now include `audio.rollup`
- added transcript-review rollup beside audio rollup:
  - helper: `backend/scripts/lib/transcript-rollup.mjs`
  - packet field: `transcript.rollup`
  - request payload includes `transcript.rollup`
  - packet summary table now prints `transcript review`
- added lightweight audio-first candidate audit report:
  - script: `backend/scripts/audit-v2-audio-first-candidates.mjs`
  - input: candidate packet JSON
  - output buckets:
    - `covered_existing_event`
    - `probable_missed_audio_moment`
    - `needs_scoreboard_confirmation`
    - `boundary_or_tail_helper`
    - `post_match_or_recap_suppress`
    - `low_priority_context`
  - `--timeline-limit=N`

Current facet behavior:

- `37:48` break/game:
  - `37:48-37:49` shows `rally_texture,reaction_burst,umpire_or_score_call`
  - opportunity includes `primary_anchor`, `score_or_end_boundary_hint`, and `strengthen_existing_event`
  - interpretation: good audio anchor for an existing confirmed `game_won`
- `40:54` set win:
  - `40:54-40:55` shows `rally_texture`
  - opportunity includes `start_boundary_hint` and `strengthen_existing_event`
  - following seconds are commentator-heavy and marked `suppress_as_primary,tail_context`
  - interpretation: useful boundary support, not a standalone audio result
- `73:57` live point:
  - `73:55-73:56` shows `reaction_burst,umpire_or_score_call`
  - opportunity includes `primary_anchor`, `score_or_end_boundary_hint`, and `strengthen_existing_event`
  - later seconds show commentary/music tail suppression
  - rollup keeps `audioMomentOpportunity=strengthen_existing_event` and `hasSuppressiveTail=true`
  - interpretation: good endpoint anchor with tail separation; tail does not suppress the valid anchor
- `79:41` reviewed live point:
  - after lowering the reaction facet threshold to `0.60`, `79:40-79:41` shows `rally_texture,reaction_burst`
  - opportunity includes `primary_anchor,start_boundary_hint`
  - interpretation: audio-important candidate now surfaces clearly even without confirmed score transition
- `85:02` pressure/setup:
  - `85:01-85:02` shows `rally_texture,commentator_speech,umpire_or_score_call`
  - opportunity includes `start_boundary_hint,score_or_end_boundary_hint,suppress_as_primary,tail_context`
  - interpretation: pressure/setup context; should not become a result by audio alone
- `86:59` / `87:00` post-match package:
  - added `post_match_context` when nearest `match_won` is within `60s`
  - `86:59-87:00` and `87:00-87:01` are now marked `suppress_as_primary`
  - interpretation: loud post-match/graphic audio should stay context, not a new live moment

Latest known-target rollup check:

- generated packets:
  - `/tmp/v2-candidate-packets-transcript-rollup-check.json`
- dry-run request dump:
  - `/tmp/v2-candidate-80-transcript-rollup-request.json`
- selected rows:
  - `candidate_window_40`: audio `strengthen_existing_event`, transcript `result_supported`
  - `candidate_window_43`: audio `strengthen_existing_event`, transcript `generic_or_noisy` with `pressure_text`
  - `candidate_window_80`: audio `strengthen_existing_event`, transcript `generic_or_noisy` with `pressure_text`
  - `candidate_window_83`: audio `strengthen_existing_event`, transcript `pressure_or_setup`
  - `candidate_window_91`: audio `strengthen_existing_event`, transcript `result_supported`
  - `candidate_window_4`: audio `strengthen_existing_event`, transcript `pressure_or_setup`
  - `candidate_window_20`: audio `strengthen_existing_event`, transcript `action_or_score_context`
  - `candidate_window_98`: audio `post_match_context`, transcript `generic_or_noisy`
  - `candidate_window_100`: audio `post_match_context`, transcript `generic_or_noisy`
  - `candidate_window_89`: audio `probable_audio_moment`, transcript `action_or_score_context`
- audio-first audit command:
  - `node backend/scripts/audit-v2-audio-first-candidates.mjs /tmp/v2-candidate-packets-transcript-rollup-check.json --limit=30`
- latest bucket counts:
  - `covered_existing_event=10`
  - `needs_scoreboard_confirmation=1`
  - `boundary_or_tail_helper=2`
  - `post_match_or_recap_suppress=2`
- key audio-first row:
  - `candidate_window_89` at `1:19:42`
  - bucket: `needs_scoreboard_confirmation`
  - audio: `probable_audio_moment`
  - transcript: `action_or_score_context`
  - current event: none
  - visible scoreboards: `3`
- LLM adjudication for `candidate_window_89`:
  - first run hit the default `2200` completion-token cap and returned `parse_failed`
  - retry with `--max-tokens=4200` succeeded
  - output: `/tmp/v2-candidate-89-audio-first-adjudication-max4200.json`
  - request dump: `/tmp/v2-candidate-89-audio-first-request-max4200.json`
  - result: `point_won`, winner `Alcaraz`, live action, not replay/recap
  - scoreboard transition: Alcaraz point score `30 -> 40`, Djokovic stayed `40`
  - audit flags: none

Commands used:

```bash
node backend/scripts/audit-v2-audio-map.mjs /tmp/media-analysis-v2-audio-aware-scoreboard-tail-run/media_analysis_v2/result.json --time=37:48 --timeline-radius=8 --limit=1 --timeline-limit=0
node backend/scripts/audit-v2-audio-map.mjs /tmp/media-analysis-v2-audio-aware-scoreboard-tail-run/media_analysis_v2/result.json --time=40:54 --timeline-radius=8 --limit=1 --timeline-limit=0
node backend/scripts/audit-v2-audio-map.mjs /tmp/media-analysis-v2-audio-aware-scoreboard-tail-run/media_analysis_v2/result.json --time=73:57 --timeline-radius=8 --limit=1 --timeline-limit=0
node backend/scripts/audit-v2-audio-map.mjs /tmp/media-analysis-v2-audio-aware-scoreboard-tail-run/media_analysis_v2/result.json --time=79:41 --timeline-radius=4 --limit=1 --timeline-limit=0
node backend/scripts/audit-v2-audio-map.mjs /tmp/media-analysis-v2-audio-aware-scoreboard-tail-run/media_analysis_v2/result.json --time=85:02 --timeline-radius=8 --limit=1 --timeline-limit=0
node backend/scripts/audit-v2-audio-map.mjs /tmp/media-analysis-v2-audio-aware-scoreboard-tail-run/media_analysis_v2/result.json --time=86:59 --timeline-radius=4 --limit=1 --timeline-limit=0
```

Next:

- validate rollups across all known-target packets, not only the first sample batch
- next use this audit report to choose which audio-first candidates should go to LLM adjudication first
