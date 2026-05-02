# Media Analysis V2 Next

## Immediate Task

Improve key-moment correctness and boundaries before building more agent/highlight abstractions.

## Next Session Handoff

Current saved state:

- Audio-profile upgrade stage 1 is implemented:
  - frame-level spectral fields are now emitted: `spectralCentroid`, `spectralRolloff`, `spectralFlatness`, `spectralFlux`
  - 1s/5s summaries now aggregate spectral centroid, flatness, and flux
  - new class-score fields are emitted beside the older heuristic scores:
    - `crowdScore`
    - `commentatorScore`
    - `umpireScore`
    - `playerVocalizationScore`
    - `musicScore`
  - transcript-context adjustment carries the new class scores without removing old fields
  - new audit script: `backend/scripts/audit-v2-audio-map.mjs`
  - verification completed:
    - `npm run build` in `backend`
    - `npx vitest run src/__tests__/media-analysis-v2.test.ts` with `89` passing tests
- YOLO scoreboard detection is wired into V2 as an optional gated stage.
- Audit OCR sampling can run YOLO with `--detect-scoreboard`.
- Full-pipeline reference smoke completed with `60` scoreboard samples and `31` visible scoreboard frames.
- Candidate adjudication packets can be generated for LLM validation:
  - `backend/scripts/audit-v2-candidate-adjudication-packets.mjs`
  - latest output path used: `/tmp/v2-candidate-adjudication-packets.json`
- Candidate packets can now be sent to an audit-only LLM adjudication runner:
  - `backend/scripts/audit-v2-adjudicate-candidates.mjs`
  - latest top-five output: `/tmp/v2-candidate-adjudications-top5.json`
  - latest known-target output with per-image scoreboard readings: `/tmp/v2-candidate-adjudications-known-targets-readings.json`
  - latest redacted request dump: `/tmp/v2-candidate-known-target-llm-requests-readings.json`
  - API/model used in tests: `gemini-2.5-flash-lite` through Google Gemini's OpenAI-compatible `/chat/completions` endpoint with `GEMINI_API_KEY`

Continue with:

1. Manually review the adjudication JSON before trusting it.
2. Keep output audit-only: do not mutate V2 events from LLM rows yet.
3. Re-test known review targets when packet construction or prompts change:
   - `37:48` break/game confirmation
   - `40:54` set win with stale/mixed OCR risk
   - `1:13:57` audio-led big point
   - `1:15:57` hold for 4-2
   - `1:21:27` break near victory
4. Current LLM output fields:
   - `is_key_moment`
   - `moment_type`
   - `is_live_action`
   - `is_replay_or_recap`
   - `scoreboard_readable`
   - `score_before`
   - `score_after`
   - `score_changed`
   - `winner`
   - `confidence`
   - `reasoning`
5. Use `auditFlags` in the adjudication output to identify rows needing manual review before any promotion/suppression wiring.
6. Keep improving the LLM evidence packet before downstream wiring:
   - V2 event labels and nearby events must remain explicitly marked as hypotheses.
   - Legacy OCR free-text notes should stay out of the LLM prompt; structured score fields are safer.
   - Require per-image `scoreboard_readings` so scoreboard mistakes can be audited.
   - Preserve redacted request dumps when changing prompt/schema.
   - Current payload cleanup:
     - transcript now includes timed `beforeSegments`, `aroundSegments`, and `afterSegments`
     - raw `candidateWindow` pipeline ids are converted into a simpler `candidate` object with timecodes
     - pipeline event hypotheses no longer include internal confidence/status/reliability fields
     - legacy structured score evidence is excluded by default and only sent with `--include-legacy-score-evidence`
     - LLM-facing transcript is now sent as one deduped `transcript.segments` timeline, not overlapping before/around/after buckets
     - current and nearby event hypotheses are sent as `pipelineEventContext.current`, `nearbyBefore`, and `nearbyAfter`; nearby groups exclude events already present in `current`
     - selected scoreboard frames now include `timecode` and `secondsFromAudioAnchor`, and image attachment labels include the same timing context
7. Only after manual review, wire trusted adjudication output into promotion or suppression logic.

Latest grouped-context known-target run:

- output: `/tmp/v2-candidate-adjudications-known-targets-event-context.json`
- request dump: `/tmp/v2-candidate-known-target-llm-requests-event-context.json`
- evaluator: `/tmp/v2-candidate-known-targets-event-context-eval.json`
- current status: 3/5 clean pass; remaining issues are score normalization at `37:52` and set-win before/after handling at `40:57`

Scoreboard extraction direction:

- require per-frame extraction before adjudication:
  - `scoreboard_available`
  - `scoreboard_readable`
  - rows with `player`, `isServing`, flexible ordered `scoreColumns`, and uncertainty fields
  - `scoreColumns` uses zero-based left-to-right `columnIndex` and `kind`: `set_score`, `current_set_games`, `point_score`, `tiebreak_points`, or `unknown`
- require `scoreboard_transition` derived from per-frame readings
- removed free-form `score_before`, `score_after`, and `score_changed` from the LLM response schema
- structured transition is now the only score-change surface
- latest known-target no-freeform run: `/tmp/v2-candidate-adjudications-known-targets-no-freeform-score.json`
- evaluator: `/tmp/v2-candidate-known-targets-no-freeform-score-eval.json`
- current status: 4/5 clean pass; `40:57` is correct as `set_won`/`Djokovic` but remains flagged because no visible before/after transition is available in the attached frames
- fallback correction for detector misses:
  - before/action and reaction samples can now be attached as full-frame scoreboard-search evidence when YOLO misses the compact scoreboard
  - fallback metadata keeps detector visibility separate from visual truth
  - `40:57` now has readable full-frame `40:54` and `40:57` evidence and returns transition `true/set/Djokovic`
- latest fallback artifacts:
  - packets: `/tmp/v2-candidate-adjudication-packets-timed-fallback.json`
  - focused full-frame output: `/tmp/v2-candidate-43-full-frame-fallback-result-retry.json`
  - focused request dump: `/tmp/v2-candidate-43-full-frame-fallback-llm-request-retry.json`
  - previous lower-left focused output: `/tmp/v2-candidate-43-scorebug-fallback-v2.json`
  - known-target output: `/tmp/v2-candidate-adjudications-known-targets-scorebug-fallback.json`
  - evaluator: `/tmp/v2-candidate-known-targets-scorebug-fallback-eval.json`
- latest full-frame fallback known-target run:
  - batch output: `/tmp/v2-candidate-adjudications-known-targets-full-frame-point-rule.json`
  - request dump: `/tmp/v2-candidate-known-target-llm-requests-full-frame-point-rule.json`
  - focused retry for batch 503: `/tmp/v2-candidate-80-full-frame-point-rule.json`
  - combined result: 5/5 expected type/winner with no audit flags
  - prompt/audit guard added for point-score row comparison, so `40/30 -> 40/40` is assigned to the row that changed from `30` to `40`
- latest full-pipeline checkpoint:
  - result: `/tmp/media-analysis-v2-full-pipeline-full-frame-check/media_analysis_v2/result.json`
  - packets: `/tmp/v2-candidate-adjudication-packets-full-pipeline-check.json`
  - adjudications: `/tmp/v2-candidate-adjudications-full-pipeline-known-targets.json`
  - request dump: `/tmp/v2-candidate-full-pipeline-known-target-requests.json`
  - pipeline: `246` segments, `18` events, scoreboard detector `complete`, `60` samples, `31` visible frames
  - known-target adjudication: 5/5 expected type/winner, no audit flags, no Gemini failures

Near-term audio follow-up:

- next audio-profile validation step:
  - rerun a full V2 analysis on the reference match so the saved result includes the new spectral/class-score fields
  - run `node backend/scripts/audit-v2-audio-map.mjs <result.json> --limit=80 --min-score=0.5`
  - review the output sections:
    - top reaction moments
    - top rally texture
    - top crowd moments
    - top player-vocalization spikes
    - suppressed speech or music
    - strong audio without candidate or event
  - compare missed/false-positive clusters before changing `event-candidates.ts`
  - only after that, add audio-first candidate paths for strong reaction/crowd spikes, rally-followed-by-reaction patterns, and player vocalization during active play
  - keep old score fields and existing candidate behavior until the audit shows reliable thresholds
- implemented compact `audio.timeline` in candidate adjudication packets, separate from score confirmation
- current shape: one-second points from roughly `-8s` to `+24s` around the audio anchor with `timecode`, `secondsFromAudioAnchor`, `phaseHint`, energy/reaction/rally/speech/applause scores, and suppression hints
- audio timeline now also carries per-second facet arrays:
  - `audioFacets`
  - `contextFacets`
  - `opportunityFacets`
  - `facetReasons`
- candidate packets now include `audio.rollup`, a compact moment-level summary of the per-second facets:
  - `primaryAnchorTimecode`
  - `bestReaction`
  - `bestRally`
  - `preAnchorFacets`
  - `anchorFacets`
  - `postAnchorFacets`
  - `hasSuppressiveTail`
  - `suppressAsPrimary`
  - `audioMomentOpportunity`
- candidate packets now include `transcript.rollup`, a compact text-cue summary:
  - `transcriptFacets`
  - `cueCounts`
  - `aroundCueCounts`
  - `afterCueCounts`
  - `cueExamples`
  - `transcriptReview`
- latest rollup validation artifacts:
  - packets: `/tmp/v2-candidate-packets-transcript-rollup-check.json`
  - request dump: `/tmp/v2-candidate-80-transcript-rollup-request.json`
- current rollup check:
  - known/live rows mostly classify as audio `strengthen_existing_event`
  - post-match rows classify as audio `post_match_context`
  - `candidate_window_89` surfaces as audio `probable_audio_moment` with transcript `action_or_score_context`
- audio-first candidate audit report added:
  - `backend/scripts/audit-v2-audio-first-candidates.mjs`
  - latest command: `node backend/scripts/audit-v2-audio-first-candidates.mjs /tmp/v2-candidate-packets-transcript-rollup-check.json --limit=30`
  - latest bucket counts:
    - `covered_existing_event=10`
    - `needs_scoreboard_confirmation=1`
    - `boundary_or_tail_helper=2`
    - `post_match_or_recap_suppress=2`
  - current top audio-first review row:
    - `candidate_window_89` at `1:19:42`
    - `needs_scoreboard_confirmation`
    - no current event
    - `3` visible scoreboard samples
  - LLM adjudication for `candidate_window_89`:
    - output: `/tmp/v2-candidate-89-audio-first-adjudication-max4200.json`
    - request dump: `/tmp/v2-candidate-89-audio-first-request-max4200.json`
    - result: `point_won`, winner `Alcaraz`, live action, no audit flags
    - scoreboard transition: Alcaraz point score `30 -> 40`, Djokovic stayed `40`
- new reusable audit helper:
  - `backend/scripts/lib/audio-facets.mjs`
  - `backend/scripts/lib/transcript-rollup.mjs`
- audio map audit now supports focused per-timecode and per-candidate inspection:
  - `--time=MM:SS`
  - `--candidate=candidate_window_id`
  - `--timeline-radius=N`
- latest notes:
  - `docs/media-analysis-v2-audio-map-facet-audit.md`
- implemented audio-aware scoreboard sampling for future detector runs:
  - `pre_point_score_context`
  - `reaction_peak`
  - `score_update_candidate`
  - `late_settle_score_check`
  - `next_point_setup_score_check`
- adjudication prompt now tells Gemini:
  - reaction frames may still show pre-update score
  - compare pre-point frames against update/late/setup frames
  - use `changed=false` only when late after evidence is readable and unchanged
  - use `changed=null` / `unknown` when frame timing is insufficient
- next validation step:
  - done: reran the full V2 pipeline with scoreboard detector enabled so the new sample labels are extracted
  - final result: `/tmp/media-analysis-v2-audio-aware-scoreboard-tail-run/media_analysis_v2/result.json`
  - final packets: `/tmp/v2-candidate-adjudication-packets-audio-aware-tail-fullrun.json`
  - final all-15 adjudication: `/tmp/v2-candidate-adjudications-audio-aware-tail-all15.json`
  - final request dump: `/tmp/v2-candidate-audio-aware-tail-all15-requests.json`
  - result: `15/15` Gemini adjudications, `0` failures
  - fixed row: `candidate_window_14` now confirms `game_won` / `Djokovic` from `1-1` to `1-2`
  - remaining evidence gaps: `candidate_window_4`, `candidate_window_20`, and `candidate_window_98` still have readable frames but no visible score transition
- next implementation step:
  - first, run the audio-first audit + LLM adjudication on the full packet set and any newly surfaced audio candidates
  - compare LLM results against `audio.rollup`, `transcript.rollup`, and current V2 events
  - then add promotion tiers that distinguish confirmed scoreboard transitions from transcript/audio-led moments with static or missing scoreboard transition evidence
  - consider broader visual search for flagged true moments where detector/Gemini still cannot see the update
- guardrail: readable scoreboard transitions remain primary for what happened; audio timeline only helps temporality and action boundaries

## Stop Point - 2026-05-02

Session completed:

- Added per-second audio facet derivation:
  - `backend/scripts/lib/audio-facets.mjs`
- Added transcript cue rollup:
  - `backend/scripts/lib/transcript-rollup.mjs`
- Added moment-level audio rollup in candidate packets:
  - `audio.rollup`
- Added transcript rollup in candidate packets:
  - `transcript.rollup`
- Updated packet generation and adjudication prompt/request payloads to carry these rollups.
- Fixed packet generation `--include-no-scoreboard` so the broader audit includes candidate windows with no detector rows.
- Added audit-only `--anchor-mode=rollup-earlier`:
  - keeps raw audio peak as source identity
  - uses rollup anchor only when it is earlier than the raw audio peak
  - prevents positive-delta drift into recap/next-point moments
- Added audio-first candidate triage report:
  - `backend/scripts/audit-v2-audio-first-candidates.mjs`
- Added uncovered-audio manual-review report:
  - `backend/scripts/audit-v2-uncovered-audio-candidates.mjs`
- Added audit-only promotion tier report:
  - `backend/scripts/audit-v2-promotion-tiers.mjs`
- Added raw audio highlight scanner:
  - `backend/scripts/audit-v2-audio-highlight-candidates.mjs`
- Added audit notes:
  - `docs/media-analysis-v2-audio-map-facet-audit.md`
- Validated the surfaced audio-first row:
  - `candidate_window_89` at `1:19:42`
  - LLM result: `point_won`, winner `Alcaraz`, live action, no audit flags
  - scoreboard transition: Alcaraz point score `30 -> 40`, Djokovic stayed `40`

Important artifacts:

- packet file with audio/transcript rollups:
  - `/tmp/v2-candidate-packets-transcript-rollup-check.json`
- broader packet file including no-scoreboard candidates:
  - `/tmp/v2-candidate-packets-transcript-rollup-full-audio-first.json`
- rollup-earlier anchor packet file:
  - `/tmp/v2-candidate-packets-rollup-earlier-anchor.json`
- audio-first audit command:
  - `node backend/scripts/audit-v2-audio-first-candidates.mjs /tmp/v2-candidate-packets-transcript-rollup-check.json --limit=30`
- audio-first adjudication output:
  - `/tmp/v2-candidate-89-audio-first-adjudication-max4200.json`
- audio-first request dump:
  - `/tmp/v2-candidate-89-audio-first-request-max4200.json`

Next recommended session:

1. Generate the broader audit packet set when the source V2 result changes:
   - `node backend/scripts/audit-v2-candidate-adjudication-packets.mjs /tmp/media-analysis-v2-audio-aware-scoreboard-tail-run/media_analysis_v2/result.json --output=/tmp/v2-candidate-packets-transcript-rollup-full-audio-first.json --limit=200 --include-no-scoreboard`
2. Run the audio-first audit:
   - `node backend/scripts/audit-v2-audio-first-candidates.mjs /tmp/v2-candidate-packets-transcript-rollup-full-audio-first.json --limit=100`
3. Current broad-audit result:
   - packets: `26`
   - target rows: only `candidate_window_89`
   - no `probable_missed_audio_moment` rows
4. Current rollup-earlier anchor result:
   - bucket counts unchanged
   - `candidate_window_89` shifted `1:19:42 -> 1:19:40` and still adjudicates cleanly as `point_won` for Alcaraz
   - `candidate_window_43` shifted `40:57 -> 40:54`
   - `candidate_window_42` stayed at `40:32`, avoiding drift into `candidate_window_43`
5. Shifted known-candidate validation:
   - `candidate_window_43` at `40:54`: clean `set_won` / Djokovic
   - `candidate_window_40` at `37:48`: clean `game_won` / Djokovic
   - `candidate_window_14` at `12:05`: clean `game_won` / Djokovic
   - `candidate_window_22` at `23:02`: clean `point_won` / Djokovic
   - `candidate_window_80` at `1:13:55`: clean `point_won` / Djokovic after retrying transient Gemini `503`
   - artifacts:
     - `/tmp/v2-known-shifted-rollup-earlier-adjudication.json`
     - `/tmp/v2-candidate-80-rollup-earlier-anchor-adjudication.json`
6. Next implementation step: design promotion tiers, still audit-only at first:
   - confirmed scoreboard transition
   - probable audio/transcript moment
   - boundary/helper only
   - suppress/post-match/recap

Promotion tier audit:

- Command:
  - `node backend/scripts/audit-v2-promotion-tiers.mjs /tmp/v2-candidate-packets-pre-score-rollup-earlier-audio-first.json --adjudication=/tmp/v2-candidate-89-rollup-earlier-anchor-adjudication.json --adjudication=/tmp/v2-known-shifted-rollup-earlier-adjudication.json --adjudication=/tmp/v2-candidate-80-rollup-earlier-anchor-adjudication.json --limit=100`
- Current tier counts:
  - `confirmed_scoreboard_transition=6`
  - `covered_existing_event=9`
  - `boundary_or_tail_helper=7`
  - `suppress_recap_or_post_match=4`
- Important split:
  - confirmed existing-event validation:
    - `candidate_window_80`, `candidate_window_43`, `candidate_window_40`, `candidate_window_14`, `candidate_window_22`
  - confirmed future-promotion candidate:
    - `candidate_window_89`

Raw Audio Highlight Scan:

- Command:
  - `node backend/scripts/audit-v2-audio-highlight-candidates.mjs /tmp/media-analysis-v2-pre-score-baseline-issues-run/media_analysis_v2/result.json --limit=80 --min-score=0.24 --cluster-gap=4`
- This scans every audio-profile second and clusters highlight-like audio, including already-covered candidates.
- Top covered rows:
  - `1:19:40`
  - `1:13:55`
  - `37:48`
  - `40:54`
- Top uncovered/near-uncovered rows to review:
  - `1:20` - currently `possible_audio_highlight_candidate`
  - `11:33` - `weak_rally_texture`
  - `1:05:03` - `weak_rally_texture`
  - `1:17:43` - `weak_rally_texture`
  - `39:27` - `weak_rally_texture`
  - `1:10:57` - `low_priority_audio_context`
  - `1:12:53` - `low_priority_audio_context`
- Next tuning question:
  - should `possible_audio_highlight_candidate` require stronger reaction/crowd than the current `1:20` row has?
- Manual validation:
  - `1:10:57` and `1:17:43` are valid points but not long/important rallies
  - both are after point end, with loudness boosted by referee/umpire speech
  - tuning implication: umpire/referee speech should not upgrade a highlight candidate without stronger rally/reaction/crowd
- Tightened scanner result:
  - `strong_audio_highlight_candidate` requires long rally (`rallySeconds >= 5`) plus strong reaction/crowd/player signal
  - ordinary valid points stay low priority
  - latest rerun has no uncovered strong/possible highlight candidates
  - top rows are covered known moments or weak/low-priority uncovered context

Manual validation queue:

- Latest stricter uncovered-audio command:
  - `node backend/scripts/audit-v2-uncovered-audio-candidates.mjs /tmp/media-analysis-v2-pre-score-baseline-issues-run/media_analysis_v2/result.json --limit=20 --min-review=0.28 --min-distance=20`
- These are not LLM-confirmable yet because most have no scoreboard frames; validate against video manually:
  - `1:10:57`
  - `11:33`
  - `1:04:20` (`Deuce`)
  - `39:27`
  - `1:12:53`
  - `1:17:37`
- If manual review marks any as real missed moments, next step is to add a temporary packet path for arbitrary audio-map timecodes so we can sample frames around that time and adjudicate them like normal candidates.

Manual validation result:

- `1:12:21`: recap/slow-motion tail, not live point; next point starts around `1:12:48`
- `1:17:43`: end of quick basic point, not a strong rally
- `27:40`: end of quick point
- `28:44`: end of point / small rally
- `5:40`: end of first game / end of point
- `15:37`: just after point end
- `1:04:20`: between point end and next point start
- Tuning implication:
  - do not treat high `rallyTextureScore` alone as a missed-moment signal
  - require stronger reaction/crowd, score-change evidence, or transcript result language before promotion
  - otherwise classify as boundary/tail/manual-review, not probable missed moment
- Implemented in `backend/scripts/audit-v2-uncovered-audio-candidates.mjs`:
  - `rally_texture` alone => `boundary_or_tail_helper`
  - transcript score/result cue without strong reaction/crowd or visible scoreboard => no promotion
  - visible scoreboard plus strong reaction/crowd or score/result text => `needs_scoreboard_confirmation`
  - strong reaction/crowd plus action transcript => `manual_review_audio_transcript`
  - commentary-dominant rows remain `manual_review_commentary_or_recap_risk`

Transcript validation:

- Helper:
  - `backend/scripts/audit-v2-transcript-validation.mjs`
- Latest command:
  - `node backend/scripts/audit-v2-transcript-validation.mjs /tmp/media-analysis-v2-pre-score-baseline-issues-run/media_analysis_v2/result.json --times=1:12:21,1:17:43,27:40,28:44,5:40,15:37,1:04:20 --window=25`
- Conclusion:
  - transcript is useful context but not primary truth
  - timing can drift around point tails and next-point setup
  - noisy ASR can create fake score/action cues
  - transcript cues should not promote a candidate unless paired with strong reaction/crowd or visual scoreboard evidence

## Current Baseline

Reference asset:

- `3936415e-cded-4b32-a264-03b12a33d73f`

Latest good transcript-only result:

- `17` events
- players extracted as `["Djokovic", "Alcaraz"]`
- `set_won` present
- `match_won` present
- heuristic links present:
  - `pressure_state -> set_won`
  - `pressure_state -> point_won`
  - `point_won -> game_won`
  - `pressure_state -> game_won`

Latest OCR-context result:

- output: `/tmp/media-analysis-v2-alcaraz-djokovic-ocr-status/media_analysis_v2/result.json`
- `17` events
- `12` events with OCR context evidence
- OCR statuses:
  - `9` `supports`
  - `3` `weak_support`
  - `0` `conflicts`

Latest OCR-confidence result:

- output: `/tmp/media-analysis-v2-alcaraz-djokovic-ocr-confidence/media_analysis_v2/result.json`
- `17` events
- `12` OCR-backed events
- ids, labels, timing, and relations unchanged from the OCR-status rerun
- confidence-only changes:
  - strongest lifts landed on `match_won`, `game_won`, and top `point_won` / `pressure_state` events
  - `weak_support` cases stayed flat
  - `0` `conflicts`

Latest OCR score-transition and selection-reason result:

- output: `/tmp/media-analysis-v2-scoped-score-ref/media_analysis_v2/result.json`
- `17` events
- `12` OCR-backed events
- OCR statuses:
  - `9` `supports`
  - `3` `weak_support`
  - `0` `conflicts`
- score transition metadata:
  - `2` `supports_result`
  - `2` `supports_state`
  - `1` `conflicts_result`
  - `7` `unknown`
- OCR selection reason metadata:
  - `7` `label_match`
  - `4` `transition_match`
  - `0` `timing_match`
  - `1` `conflict_match`
- event ids, labels, and relations stayed stable
- OCR evidence notes now include transition hints when score movement is parsed:
  - `transition=supports_result`
  - `transition=supports_state`
  - `transition=conflicts_result`
- OCR evidence notes now include selection-reason hints:
  - `selectedBy=transition_match`
  - `selectedBy=label_match`
- OCR evidence metadata now exposes `scoreTransitionStatus`
- OCR evidence metadata now exposes `selectedBy`
- summary output now exposes `scoreTransitionCounts`
- summary output now exposes `selectedByCounts`
- single-score snapshots can now support pressure states or matching result scores when full before/after transitions are unavailable
- selection-reason metadata is observability only for now; do not use it to hard-reject replay/stale-score cases without a separate weighting pass

Latest OCR ranking result:

- OCR context selection now uses a separate candidate rank, while evidence confidence still reports the support score
- `transition_match` is preferred over weaker label/timing-only matches when both are plausible
- `conflict_match` is penalized in selection rank but still attachable as weak support when no better OCR context exists
- missing score remains neutral, which keeps replay/stale-score use cases graceful
- reference rerun stayed stable:
  - `0` selected OCR context changes versus `/tmp/media-analysis-v2-selectedby-summary-ref`
  - same `246` segments
  - same `17` events
  - same `9 supports`, `3 weak_support`, `0 conflicts`

Latest OCR transition-over-label result:

- score transitions can override misleading OCR label wording when the parsed score actually matches the event
- `set_won` transition parsing is stricter and no longer treats every game-score movement as set-result support
- reference rerun changed one interpretation without changing the selected OCR context:
  - `event_8` stayed on `ocr-context:11`
  - status stayed `weak_support`
  - transition changed from `supports_result` to `conflicts_result`
  - selectedBy changed from `transition_match` to `conflict_match`
- this keeps the stale/replay case graceful: the moment is not rejected, but it is no longer counted as a supporting score transition

Latest OCR scoped score-matching result:

- result-score matching now uses event scope instead of a generic first score:
  - `game_won` checks the current game score
  - `set_won` avoids historical set-score support when an active point score is present
  - `match_won` can match full multi-set snapshots such as `6-3, 6-2`
- reference rerun stayed stable versus `/tmp/media-analysis-v2-transition-over-label-ref`:
  - `0` selected OCR context changes
  - same `246` segments
  - same `17` events
  - same `9 supports`, `3 weak_support`, `0 conflicts`

Latest tennis boundary / recap suppression result:

- output: `/tmp/media-analysis-v2-ocr-verify-2026-04-28-anchorfix/media_analysis_v2/result.json`
- `246` segments
- `16` events
- `11` OCR-backed events
- OCR statuses:
  - `8` `supports`
  - `3` `weak_support`
  - `0` `conflicts`
- score transition metadata:
  - `2` `supports_result`
  - `2` `supports_state`
  - `1` `conflicts_result`
  - `6` `unknown`
- OCR selection reason metadata:
  - `6` `label_match`
  - `4` `transition_match`
  - `0` `timing_match`
  - `1` `conflict_match`
- key reference behavior:
  - the hold starts at `11:58`, ends/anchors at `12:04`, and is present as `game_won`: `Third hold of the set moves score to 2-1`
  - the later `12:34` bench/changeover coverage does not emit a second primary event
  - the bench mention is treated as recap text and no longer controls the event timing
  - the `12:04` hold currently has no OCR support because the existing OCR moments do not cover that interval
    - no OCR moment peaks between `10:50` and `13:00`
    - nearest later OCR moment is `moment/3` at `14:20`, already into the next game with score `2-1 (0-15)`
- comparison versus `/tmp/media-analysis-v2-scoped-score-ref`:
  - opening-game break-point saved changed from `game_won` to `point_won`
  - stale saved-break-point recap was removed
  - later `What a point` recap was removed
  - match-result label is cleaned from `C3 is 2-2, 6-3, 6-2.` to `6-3, 6-2.`
  - set, hold, and break result anchors moved earlier toward the live pressure/result beats

Latest agent-facing reliability change:

- `result.events` should stay chronological
- event-level derived metadata now includes:
  - `ocrSupportStatus`
  - `reliabilityRank`
- reliability is for agent trust/selection, not recap order
- `topEvents` should not be the main downstream abstraction for chronology

## Keep

- segment-level `analysis_point` cleanup
- tennis event taxonomy:
  - `pressure_state`
  - `point_won`
  - `game_won`
  - `set_won`
  - `match_won`
- safe same-type semantic dedupe only
- player extraction fallback
- player-aware non-participant filtering
- current deterministic label rewrites where they preserve attribution/context
- chronological event order as the default timeline view
- reliability as derived metadata rather than event reordering

## Do Not Do Next

- do not continue adding broad phrase filters as the primary quality lever
- do not dedupe cross-type events by time alone
- do not treat heuristic links as final truth
- do not require OCR to be present for V2 to run
- do not build full event chains / highlight grouping yet
- do not optimize for agent recap/highlight formatting before raw key moments improve

## Deferred Until Event Quality Stabilizes

- V2 replaces the legacy OCR key-moment path; do not invest further in the old OCR moments as the long-term source of truth
- keep the new V2 API/app scaffolding committed, but do not spend the next pass on:
  - key-moments panel rendering
  - search / indexing integration
  - library/detail visibility polish
  - ingest-stage wiring for V2 visibility
- review those deferred integration points again after the next quality pass, because the right UI/indexing shape may change as event structure and evidence evolve
- replace the current coarse-only audio path with a layered tennis audio profile
  - current V2 audio is one normalized RMS energy value per `5s` window
  - this is useful for coarse reaction timing, but too coarse to understand rally texture, short/long points, commentator bumps, umpire announcements, music/changeover beds, or replay tails
  - keep `5s` windows for transcript/OCR/segment alignment, but add finer `0.5s`-`1s` audio frames underneath them
  - do not collapse fine audio back into only one `5s` energy value; preserve sub-window summaries so previous/next frame navigation can estimate action start, reaction start, tail, and break/recap context
  - audio remains evidence, not final truth: it can propose boundaries and sound type, but transcript/OCR/video/LLM adjudication must decide event meaning

## Change

Focus the next pass on raw key-moment quality rather than downstream agent abstractions.

The next pass should improve:

- anchor placement
- start/end boundaries
- result-vs-state classification accuracy
- replay / duplicate suppression
- stronger confirmation from OCR plus future audio/crowd signals
- score-change parsing beyond the first tennis transition pass

Confirmed reference case:

- Around `12:04`, Djokovic wins/holds for `2-1`.
- Around `12:34`, the broadcast shows slow-motion / bench / changeover coverage while players rest between games.
- The `12:34` coverage should not emit a fresh primary event.
- Crowd noise / audio energy before the bench coverage should be used as a backward-looking anchor signal: when a changeover/bench recap is detected, look earlier for the likely game-ending crowd peak or score/result beat rather than treating the bench segment as the moment.

## Next Quality Pass

Goal: move from transcript-led event detection toward multisignal event evidence without losing precision.

Critical review before implementation:

- Do not let audio peaks become confirmed tennis events by themselves. Audio can identify likely reaction timing, but it cannot distinguish point, game, set, match, replay, or recap without transcript/OCR context.
- Do not replace the current V2 flow. `timelineIndex`, segment classification, event taxonomy, validation, linking, OCR evidence, and reliability metadata are already useful and should be extended.
- Do not depend on legacy OCR moments as the long-term source of truth. Existing `moments/*/context.json` can be used for audit only; V2 should eventually sample score/OCR evidence around V2-owned candidate windows.
- Do not use a global mean threshold as the trigger. Broadcast loudness varies, and sustained crowd beds or music can sit above the mean for long periods. Use local baseline, local maxima, percentile rank, and grouping.
- Do not merge close tennis points by time alone. Consecutive points can be close; grouping should merge only the same reaction shape, not unrelated nearby events.
- Do not promote non-live broadcast coverage to primary live events. Replays, slow motion, bench/changeover, studio, player close-ups, and filler shots often overlap; classify the live/replay relationship and the broadcast context as separate facets instead of separate event types.
- Do not discard next-point setup windows just because transcript is stale. They may be valuable start-boundary evidence for the next point, even when they must not create a duplicate result for the previous point.
- Do not create standalone crowd/atmosphere highlights by default. Most meaningful crowd peaks are evidence for a point/result endpoint or a replay/recap; only keep standalone crowd reactions when no linked tennis event is available and the peak is editorially useful.
- Do not treat scoreboard presence or absence as a replay detector by itself. Replays can include scoreboard graphics, and non-replay bench/changeover/player-closeup coverage can have no scoreboard.
- Do not make LLM calls the first detector. Use deterministic signals to find candidate windows, then use an LLM only for ambiguous or high-value adjudication.

Order of work:

1. Audit audio/crowd peaks on the reference asset. Done for the reference tennis asset.
   - produce a compact table of peak timestamp, audio energy, nearby transcript, nearby OCR context, current event, and likely interpretation
   - include windows with strong audio but no current event, and current events with weak/missing audio support
   - separate live crowd reaction from replay, changeover, studio, applause, and generic crowd bed
2. Add reusable V2 audio peak metadata. Implemented.
   - calculate local baseline, local spike score, percentile rank, peak shape, and grouped peak id
   - expose the metadata for inspection before changing event generation
   - attach peak evidence to existing nearby events where it supports timing
3. Add explicit candidate status for audio-led moments. Started conservatively.
   - audio-only peak first tries to attach to a nearby live/replay candidate; only becomes low-confidence `crowd_reaction` when it cannot be linked
   - audio plus nearby tennis context can become candidate `point_won`; current first case is the reviewed live `73:57` point ending
   - audio plus OCR score movement can later promote to `point_won`, `game_won`, `set_won`, or `match_won`
   - non-live coverage peaks must not create fresh primary live events; first replay back-anchor guard is implemented
   - later replay/slow-motion OCR context with pressure-like score text and no score transition must not confirm audio-led point results
   - next-point setup with stale transcript should be stored as possible start-boundary evidence for the next rally, not as a previous-point result
4. Add a compact window-facet classifier before broader promotion. Packet layer implemented; promotion use is still pending.
   - classify `playPhase`: `live_action`, `live_reaction`, `between_points`, `changeover_or_break`, `unknown`
   - classify `contentMode`: `live_view`, `replay_or_slow_motion`, `bench_or_player_closeup`, `crowd_or_atmosphere`, `studio_or_graphic`, `unknown`
   - classify `transcriptRelation`: `current_action`, `previous_action_recap`, `next_point_setup`, `generic`, `unknown`
   - this avoids separate overlapping moment types like replay during changeover; a window can be `changeover_or_break` plus `replay_or_slow_motion`
   - promotion decisions should use the combination of facets, not a single label
   - use `changeover_or_break` as structural evidence for game/set boundaries, especially when it appears shortly after a possible game/set result
   - do not let `changeover_or_break` confirm a result by itself; it should strengthen a nearby result candidate or trigger a backward search for one
   - current implementation stores these facets in `candidateWindows` seeded by audio peaks so later LLM adjudication has a compact packet instead of the whole transcript
5. Rebuild the audio pipeline around tennis audio profiles. Started with observable profile output.
   - add an observable `audioProfile` layer before changing event behavior. Initial implementation done.
     - frame size: start with `0.5s`
     - keep current `5s` `timelineIndex.windows[].audioEnergy` for compatibility
     - add fine-frame features:
       - RMS energy. Implemented.
       - peak energy. Implemented.
       - energy delta / attack slope. Implemented.
       - short-term silence score. Implemented as `silenceRatio`.
       - zero-crossing rate. Implemented.
       - onset count / burst score. Initial burst score and summary burst count implemented.
       - optional first spectral features: centroid, flatness, low/mid/high band energy
     - add rolled-up `1s` and `5s` summaries:
       - energy mean/max/stddev. Implemented.
       - burst count. Implemented.
       - onset rate. Implemented.
       - onset regularity
       - active duration. Implemented.
       - silence ratio. Implemented.
       - sustained loudness duration. Implemented.
       - strongest attack time. Implemented.
   - derive tennis-specific audio hints. Initial observable implementation done on `1s` and `5s` summaries.
     - `rallyTextureScore`. Implemented as signal-only onset/activity/moderate-energy texture.
       - repeated short onsets, moderate energy, low speech dominance
       - useful for estimating whether action was live and whether point was short/long
     - `reactionBurstScore`. Implemented as signal-only attack/high-energy/noisy-onset burst score.
       - sharp attack, high energy delta, noisy/sustained decay, plausible rally/setup before it
       - useful for point-ending anchor selection
     - `speechDominanceScore`. Initial signal-only proxy implemented; later pass should blend transcript overlap and better voice/harmonic features.
       - dense transcript overlap plus voice-like/harmonic texture
       - useful for marking commentator/referee/player speech and avoiding false crowd anchors
     - `musicBedScore`. Initial signal-only proxy implemented from sustained/low-variance/regular onset texture.
       - sustained harmonic/rhythmic energy across many frames
       - useful for changeover/break suppression
     - `umpireAnnouncementScore`. Initial proxy implemented; later pass should use score/transcript cues.
       - short isolated speech burst after action/reaction, often near score cues
       - useful as boundary/score evidence, not as a point result by itself
     - `applauseCrowdScore`. Implemented as reaction/noisy/sustained/burst texture.
       - noisy broad-band sustained response and/or applause-like onsets after action
       - useful as endpoint support
   - derive point-shape hints. Initial observable implementation done as `pointShapeHint`.
     - `short_point`
       - brief action texture followed quickly by reaction
     - `medium_rally`
       - several seconds of rally texture before reaction
     - `long_rally`
       - extended repeated hit/onset texture before reaction
     - `reaction_only`
       - strong endpoint reaction without enough visible/audio action history
     - `recap_only`
       - speech/replay context without a live action lead-in
   - add context-adjusted audio hints. Initial observable implementation done as `summary.context`.
     - raw audio scores remain unchanged
     - context layer blends transcript/window signals:
       - `speechDensity`
       - commentary cue
       - replay cue
       - score cue
     - context layer outputs adjusted rally/reaction/speech/music/crowd scores, adjusted `pointShapeHint`, and suppression reasons
     - current reviewed effect:
       - `23:07` raw `medium_rally` becomes context `recap_only`
       - `73:57` remains context `medium_rally`
       - `74:27` raw `medium_rally` becomes context `recap_only`
       - `82:22` keeps suppression warnings without creating a fresh primary event
   - upgrade audio peak outputs without deleting raw data:
     - keep existing `audioPeaks` as raw coarse loudness peaks
     - add `reactionLikePeaks` or equivalent derived anchors from fine audio profile
     - first whole-media audit script is implemented as `backend/scripts/audit-v2-reaction-like-candidates.mjs`
     - first review queue is recorded in `docs/media-analysis-v2-reaction-like-candidate-audit.md`
     - review candidate labels in video before promotion:
       - `37:48-37:49` confirmed live game-winning break point: Djokovic breaks from `3-4 30-40` to `3-5`
       - `79:37-79:45` confirmed live point: set 2 `2-4 30-40` for Djokovic, Alcaraz wins the point around `79:41`
       - `85:01-85:02` confirmed between-points pressure context: set 2 `2-5 0-40`, three match points, next serve starts around `85:13`
       - `40:54-40:55` confirmed live set-winning point: set 1 `3-5 0-40`, Djokovic wins point and set
       - `86:59-87:01` confirmed broadcaster animation after match; suppress as live key moment
     - use fine-frame attack time instead of only `5s` midpoint where available
     - keep speech/music/replay-heavy local bumps as context tails, not primary anchors
     - regression tests to add before promotion:
       - reaction-like candidate plus score/result transcript at `37:48-37:49` can become `game_won`. Implemented.
       - reaction-like candidate at `40:54-40:55` can correct/improve `set_won` anchor. Implemented.
       - between-points pressure candidate at `85:01-85:02` must not become a result event. Implemented.
       - post-match broadcaster animation at `86:59-87:01` must stay recap/graphic tail. Implemented.
     - latest reference output after this pass:
       - `/tmp/media-analysis-v2-reaction-like-promotion-2026-04-30-v3/media_analysis_v2/result.json`
       - `18` events
       - added `37:48.25` `game_won`: `Djokovic breaks.`
       - moved set result anchor to `40:54.75`
       - no post-match event emitted around `86:59-87:01`
     - remaining manual label not promoted yet:
       - `79:37-79:45` confirmed live point for Alcaraz, but winner attribution needs stronger transcript/OCR/score handling before promotion
   - upgrade `audioReactionEpisodes`:
     - build episode start/end from fine-frame action/reaction/tail structure
     - keep primary anchor as first strong reaction-like burst
     - mark later loud speech/replay/music/commentary as `recap_or_speech_tail` or break context
     - support previous/next navigation across fixed `5s` windows so a point split across windows can still be reconstructed
   - add audit tooling before promotion changes. Implemented as `backend/scripts/audit-v2-audio-profile.mjs`.
     - print fine-frame profile around known timestamps. Implemented.
     - include action texture, reaction burst, speech/music scores, selected anchor, and member roles. Implemented.
     - review first on:
       - `23:07` slow-motion recap. Initial audit recorded in `docs/media-analysis-v2-audio-profile-audit.md`.
       - `73:57` live point ending. Initial audit recorded.
       - `74:27` speech-heavy recap tail. Initial audit recorded.
       - `81:27` live point ending. Initial audit recorded.
       - `82:22` replay/recap/back-anchor case. Initial audit recorded.
   - add regression tests from manual labels before wiring profile scores into event promotion
   - first implementation should be observable only:
     - save `audioProfile`
     - save derived summaries/hints
     - keep event count stable until audit confirms the signals
6. Improve OCR sampling around audio peaks and reaction-like anchors.
   - sample scoreboard frames around high-value audio peaks, not only around transcript keyword peaks
   - prioritize V2-owned OCR sampling around `reactionLikePeaks` and episode primary anchors, not speech/commentary tails
   - build a V2-owned OCR sampling manifest around reaction-like anchors. Implemented as audit-only.
     - script: `backend/scripts/audit-v2-ocr-sampling-plan.mjs`
     - latest notes: `docs/media-analysis-v2-ocr-sampling-plan.md`
     - samples are now audio-aware, not only fixed offsets:
       - `setup_or_quiet_before`
       - `action_or_rally_context`
       - `reaction_start`
       - `reaction_peak`
       - `scoreboard_settle`
       - `tail_or_context_check`
     - fixed offsets are retained only as fallback fill-ins
     - optional frame extraction is available with `--extract-frames=/tmp/path`; it writes candidate JPEGs plus `manifest.json`
     - optional YOLO scoreboard detection is available from the audit with `--detect-scoreboard`; it flattens sampled frames, runs the Docker detector once, and writes `scoreboard-detections.json`
     - the V2 pipeline now has an optional gated scoreboard detection stage:
       - enable with `MAM_SCOREBOARD_DETECTOR_ENABLED=1`
       - outputs are persisted under `media_analysis_v2.scoreboardDetections`
       - summary counts include `scoreboardDetectionSamples` and `scoreboardVisibleFrames`
     - LLM adjudication packet builder is available:
       - script: `backend/scripts/audit-v2-candidate-adjudication-packets.mjs`
       - input: V2 result with `scoreboardDetections`
       - output: JSON packets with audio facts, transcript windows, current event context, selected YOLO crops, and a structured prompt seed
     - current finding: legacy OCR context is too sparse/stale for `40:54` and `79:41`, so V2 must sample exact frames around the reaction-like anchor
     - manual video validation:
       - `79:40.3` samples are good; `79:49`-`79:56` is replay
       - `40:54.8` samples are good; `40:59`-`41:09` is bench/spectator tail, not replay
   - use the audit-only score-context queue before broad attribution:
     - implemented as `backend/scripts/audit-v2-score-context-candidates.mjs`
     - latest notes are in `docs/media-analysis-v2-score-context-audit.md`
     - current finding: `79:41` has a valid audio candidate but lacks reliable transcript score/outcome evidence, so it should wait for OCR/video confirmation
     - current finding: `85:02` is pressure/setup-only and should not become a result event
     - current finding: `86:59` is post-match score context/broadcaster animation and should not emit a live event
   - use OCR before/after score state to reduce `unknown` score transitions
   - keep missing OCR neutral rather than rejecting transcript-supported events
   - record scoreboard visibility separately from replay/recap status, because scoreboard can be present during replay and absent during bench/changeover/player-closeup coverage
7. Add an LLM window adjudication step only for ambiguous/high-value windows.
   - provide previous/current/next transcript, audio peak metadata, audio profile summaries, OCR before/after state, segment type, and known participants
   - include audio facts such as:
     - possible action start
     - possible action end
     - reaction start
     - point duration estimate
     - rally texture score
     - reaction burst score
     - speech/music/commentary dominance
     - episode primary/tail roles
   - request structured output: event type, window facets, anchor time, confidence, and evidence reason
   - use this to adjudicate ambiguous windows, not as a whole-transcript replacement for deterministic evidence
   - use the current wording-based audio-led promotion rules only as temporary conservative guardrails
   - long term, prefer an LLM event-window judge over expanding phrase lists, because commentator style, language, and ASR wording vary heavily
   - deterministic code should still enforce safety after LLM output: no unanchored replay primary events, no unsupported result promotion, and no time-only merging of close real points
8. Convert findings into regression tests before broad tuning.
   - vague praise with no support attaches to nearby candidate or stays low-confidence `crowd_reaction` / no event
   - vague praise plus tennis context and audio can become candidate `point_won`
   - audio peak plus score movement can promote to a result event
   - later recap/changeover language is secondary and does not duplicate the live result
   - adjacent tennis points remain separate when the evidence supports separate moments
   - short-point audio texture does not require a long rally prelude
   - long-rally texture plus reaction can improve clip start/end boundaries
   - music/changeover beds do not create fresh live point events
   - speech-heavy commentator/referee/player bursts do not override a nearby stronger reaction anchor

Edge cases to keep visible:

- commentator reaction arrives seconds after the actual shot
- transcript says `brilliant` / `impressive` without score or shot description
- scoreboard OCR is missing during the actual live result
- scoreboard absence is not proof of replay; it can also mean bench, changeover, player reaction, crowd shot, or camera cutaway
- scoreboard presence is not proof of live play; replay/slow-motion can still carry a scoreboard or score bug
- OCR appears later after the next game has started
- crowd noise is sustained rather than a distinct reaction peak
- replay audio or crowd sweetening looks energetic but is not live play
- changeover/bench/rest coverage describes a result that already happened
- pressure states such as break point, set point, or match point are not automatically results
- game, set, and match results need different score scopes
- same-type duplicate suppression must not merge consecutive real points
- slow-motion peaks can carry the correct event label but the wrong live timestamp
- slow-motion OCR context can be related to the previous point but still be too late to confirm the live endpoint without score transition
- transcript at the next serve can still describe the previous point
- next-point setup can be an important start marker for the next rally even when the transcript still describes the previous point
- bench/changeover and replay/slow-motion often overlap; keep them as facets on one window rather than separate primary moments
- changeover/break windows are useful tennis structure signals because they usually occur between games or sets
- crowd/atmosphere peaks are usually endpoint evidence for nearby tennis moments, not standalone highlights
- audio-led promotion must be able to anchor back from replay/recap peaks to the earlier live point ending

## Verification

1. Run:
   - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
2. Rebuild backend:
   - `npm run build`
3. Rerun reference asset using:
   - video: `/home/clawdbot/.mam/storage/3936415e-cded-4b32-a264-03b12a33d73f/original.mp4`
   - transcript: `/home/clawdbot/.mam/storage/3936415e-cded-4b32-a264-03b12a33d73f/transcript.json`
4. Confirm:
   - key moments are attached to the right tennis outcome/state
   - start/end boundaries align more closely to the actual point or result beat
   - replay/commentary duplicates are reduced
   - OCR/audio/crowd signals improve accuracy without destabilizing event identity

## Working Hypothesis

The next accuracy gain should come from better event truth and better temporal boundaries, not from more downstream ranking or agent-format abstractions. Reliability metadata is sufficient for now; richer chaining should wait until more raw signals are integrated.

## Stop Point - Audio-First Audit Session

Completed in this session:

- Added rollup-earlier anchor mode to packet generation:
  - `--anchor-mode=rollup-earlier`
  - uses `audio.rollup.primaryAnchorTime` only when it is earlier than the raw audio peak
  - prevents positive-delta drift, e.g. `candidate_window_42` does not move into `candidate_window_43`
- Confirmed rollup-earlier anchor did not regress known shifted rows:
  - `candidate_window_43`, `candidate_window_40`, `candidate_window_14`, `candidate_window_22`, `candidate_window_80`
- Validated the only confirmed audio-first missed score event in this match:
  - `candidate_window_89` at `1:19:40`
  - LLM result: `point_won`, winner `Alcaraz`, live action
  - scoreboard transition: Alcaraz point score `30 -> 40`
- Added/tuned audit scripts:
  - `backend/scripts/audit-v2-uncovered-audio-candidates.mjs`
  - `backend/scripts/audit-v2-transcript-validation.mjs`
  - `backend/scripts/audit-v2-promotion-tiers.mjs`
  - `backend/scripts/audit-v2-audio-highlight-candidates.mjs`
- Manual validation showed:
  - high `rallyTextureScore` alone often marks point tails, ordinary short points, recap/slow-motion tails, or between-point context
  - transcript can be accurate but often describes the result after the actual action
  - transcript is support only, not primary promotion evidence
  - referee/umpire speech can inflate audio scores after ordinary points
- Tuned rules:
  - rally-only => boundary/tail or weak texture
  - transcript-only => support only
  - ordinary valid point + weak reaction => low priority
  - long rally + strong reaction/crowd/player signal => highlight candidate
  - visible scoreboard + LLM score transition => confirmed score moment

Current conclusions for this match:

- Confirmed future promotion candidate:
  - `candidate_window_89`
- Confirmed existing-event validation rows:
  - `candidate_window_80`, `candidate_window_43`, `candidate_window_40`, `candidate_window_14`, `candidate_window_22`
- No uncovered strong/possible audio highlight candidates remain after stricter importance tuning.
- The scanner now mostly classifies unselected raw audio as:
  - `weak_rally_texture`
  - `low_priority_audio_context`
  - `boundary_or_tail_helper`
  - `manual_review_commentary_or_recap_risk`

Important artifacts:

- Latest broad packets:
  - `/tmp/v2-candidate-packets-pre-score-rollup-earlier-audio-first.json`
- Rollup-earlier packet file:
  - `/tmp/v2-candidate-packets-rollup-earlier-anchor.json`
- Candidate 89 adjudication:
  - `/tmp/v2-candidate-89-rollup-earlier-anchor-adjudication.json`
- Shifted known-candidate adjudication:
  - `/tmp/v2-known-shifted-rollup-earlier-adjudication.json`
  - `/tmp/v2-candidate-80-rollup-earlier-anchor-adjudication.json`

Commands to resume:

- Audio-first packet triage:
  - `node backend/scripts/audit-v2-audio-first-candidates.mjs /tmp/v2-candidate-packets-pre-score-rollup-earlier-audio-first.json --limit=100`
- Promotion tier report:
  - `node backend/scripts/audit-v2-promotion-tiers.mjs /tmp/v2-candidate-packets-pre-score-rollup-earlier-audio-first.json --adjudication=/tmp/v2-candidate-89-rollup-earlier-anchor-adjudication.json --adjudication=/tmp/v2-known-shifted-rollup-earlier-adjudication.json --adjudication=/tmp/v2-candidate-80-rollup-earlier-anchor-adjudication.json --limit=100`
- Raw audio highlight scan:
  - `node backend/scripts/audit-v2-audio-highlight-candidates.mjs /tmp/media-analysis-v2-pre-score-baseline-issues-run/media_analysis_v2/result.json --limit=50 --min-score=0.24 --cluster-gap=4`

Next recommended work:

1. Run the same audit suite on another match/result before production promotion.
2. If rules generalize, wire audit-only tier output into a saved report artifact.
3. Only then consider promoting `confirmed_scoreboard_transition` rows with no existing event, starting with `candidate_window_89`, behind a gate.
4. Add regression tests for the manually validated cases:
   - rally texture alone is not a missed moment
   - referee/umpire loudness after a point does not create highlight candidate
   - transcript result phrase is support, not anchor truth
   - rollup-earlier anchor avoids positive-delta drift

Unfinished aspects to tackle later:

- Transcript back-anchor logic:
  - result phrases like `good service hold` should confirm context, but anchor should shift back to audio/scoreboard point end
- Arbitrary timecode packet generation:
  - needed if manual review finds raw audio-map moments that are not candidate windows but should be LLM/scoreboard adjudicated
- Full V2 integration:
  - current work is audit-only; no production event mutation yet
- Cross-match validation:
  - current thresholds are tuned on one reference match and may overfit
- Broader visual search:
  - some real moments may still lack readable selected scoreboard frames
- Regression test coverage:
  - new audit rules are not yet codified in backend tests
