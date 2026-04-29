# Media Analysis V2 Log

## 2026-04-20

Changed:

- established the new `media-analysis-v2` pipeline as the active V2 path
- added the canonical V2 plan document
- collapsed `analysis_point` generation from per-window emission to segment-level analysis emission
- tightened tennis `point_won` heuristics, then revised them to use full window evidence instead of transcript text alone

Verified:

- `npx vitest run src/__tests__/media-analysis-v2.test.ts`
- repeated reruns on asset `3936415e-cded-4b32-a264-03b12a33d73f`

Observed baselines and rerun results:

- previous noisy tennis run:
  - `54` events
  - `35` `point_won`
  - `18` `analysis_point`
  - `1` `ace`
- after `analysis_point` cleanup:
  - generated at `2026-04-20T21:15:15.686Z`
  - `37` events
  - `35` `point_won`
  - `1` `analysis_point`
  - `1` `ace`
- after stronger tennis tightening plus window-supported inference:
  - generated at `2026-04-20T21:34:06.647Z`
  - `21` events
  - `19` `point_won`
  - `1` `analysis_point`
  - `1` `ace`

Interpretation:

- `analysis_point` cleanup clearly improved output quality and should be kept
- the latest tennis `point_won` tightening overshot and likely hurt recall
- current V2 direction is better than the original noisy state, but the latest `point_won` logic is too conservative

Decision:

- keep the `analysis_point` cleanup
- keep the move toward window-based tennis inference
- do not keep the latest aggressive `point_won` behavior as the final version
- next step is to recover recall with a middle-ground tennis event rule

## 2026-04-23

Changed:

- split overloaded tennis `point_won` detections into more specific V2 event types:
  - `pressure_state`
  - `game_won`
  - `set_won`
  - `match_won`
- kept `analysis_point` cleanup unchanged
- filtered tennis `Goal!` transcription noise while preserving real tennis context around it
- fixed keyword matching so `ace` no longer matches substrings inside words such as `race` or `face`
- added transcript fallback player extraction for tennis live matches
- added conservative player-aware filtering for non-participant-only context
- added safe same-type semantic dedupe across same or adjacent segments
- added heuristic tennis sequence links:
  - `pressure_state leads_to result`
  - `point_won confirms game_won`
- added deterministic tennis label focusing and selective label rewrites
- added optional OCR context confirmation evidence using `ocr_context` evidence refs, distinct from direct `vision` LLM evidence
- added OCR context support status in evidence notes:
  - `supports`
  - `weak_support`
  - `conflicts`

Verified:

- `npx vitest run src/__tests__/media-analysis-v2.test.ts`
- `npm run build` in `backend`
- `npm run build` in `frontend` after relation-type expansion
- repeated reruns on asset `3936415e-cded-4b32-a264-03b12a33d73f`

Latest reference result:

- output: `/tmp/media-analysis-v2-alcaraz-djokovic-label-rewrite-v2/media_analysis_v2/result.json`
- profile:
  - `sport`: `tennis`
  - `players`: `["Djokovic", "Alcaraz"]`
- counts:
  - `246` segments
  - `17` events
  - `7` `point_won`
  - `3` `game_won`
  - `4` `pressure_state`
  - `1` `analysis_point`
  - `1` `set_won`
  - `1` `match_won`
- relation counts:
  - `12` `primary`
  - `1` `commentary_on`
  - `3` `leads_to`
  - `1` `confirms`

Current interpretation:

- transcript-only heuristics are now good enough for the reference asset to stop broad phrase filtering
- more phrase filters are likely to overfit and remove useful editorial signal
- the next improvement should add score/OCR/audio confirmation hooks rather than continue deleting transcript events

OCR confirmation rerun:

- output: `/tmp/media-analysis-v2-alcaraz-djokovic-ocr-status/media_analysis_v2/result.json`
- counts stayed stable:
  - `246` segments
  - `17` events
- OCR context evidence attached to `12` events
- OCR support statuses:
  - `9` `supports`
  - `3` `weak_support`
  - `0` `conflicts`
- weak support caught cases where OCR labels were useful but score/period fields were suspicious, including:
  - `Takes opening set 6-3` with context label `Set 1` but context period `Set 2`
  - `Djokovic saves break point and holds for 4-2` with OCR label saying `leads 4-3`

OCR confidence rerun:

- old output: `/tmp/media-analysis-v2-alcaraz-djokovic-ocr-status/media_analysis_v2/result.json`
- new output: `/tmp/media-analysis-v2-alcaraz-djokovic-ocr-confidence/media_analysis_v2/result.json`
- structural counts stayed identical:
  - `17` events -> `17`
  - `12` OCR-backed events -> `12`
- event ids, labels, timing, and relations stayed unchanged
- only event confidence changed
- biggest confidence increases:
  - `event_17` `match_won`: `0.64` -> `0.95`
  - `event_15` `game_won`: `0.64` -> `0.95`
  - `event_5` `point_won`: `0.78` -> `0.92`
  - `event_10` `pressure_state`: `0.78` -> `0.91`
  - `event_6` `pressure_state`: `0.78` -> `0.89`
- other increases:
  - `event_0` `point_won`: `0.78` -> `0.86`
  - `event_12` `point_won`: `0.78` -> `0.84`
  - `event_14` `pressure_state`: `0.80` -> `0.85`
  - `event_8` `set_won`: `0.64` -> `0.68`
  - `event_9` `point_won`: `0.95` -> `0.98`
- unchanged despite OCR evidence:
  - `event_11` `point_won`: stayed `0.78` because OCR was `weak_support`
  - `event_13` `game_won`: stayed `0.78` because OCR was `weak_support`

Interpretation:

- the confirmation layer is structurally stable on the reference asset
- OCR confidence shaping is working as intended:
  - `supports` raises confidence
  - `weak_support` leaves confidence unchanged
  - `conflicts` would lower confidence, but none appeared in this rerun
- the strongest OCR-confirmed result events now stand out more clearly without changing event identity or topology

Agent-facing reliability update:

- kept `result.events` in chronological order for recap/narrative use
- removed the earlier `topEvents` direction as the main downstream abstraction
- added per-event agent-facing reliability metadata instead:
  - `ocrSupportStatus`
  - `reliabilityRank`
- reliability ranking is now a separate derived signal, not a global reorder of the timeline
- reliability currently prefers:
  - OCR support status
  - event confidence
  - relation type
  - evidence strength
  - importance
- summary output now exposes:
  - `ocrSupportCounts`
  - `reliabilityCounts`

Decision:

- do not spend the next session on event chaining / highlight grouping yet
- agent-facing ranking is good enough as scaffolding for now
- the next session should return to core key-moment quality:
  - event correctness
  - timing accuracy
  - boundary accuracy
  - replay/duplicate suppression

OCR score-transition update:

- added tennis score-state parsing inside OCR confirmation:
  - `scoreBefore`
  - `scoreAfter`
  - current `score`
- OCR evidence can now annotate parsed score movement:
  - `transition=supports_result`
  - `transition=supports_state`
  - `transition=conflicts_result`
- OCR evidence metadata now includes structured `scoreTransitionStatus`
- OCR evidence metadata now includes structured `selectedBy`:
  - `transition_match`
  - `label_match`
  - `timing_match`
  - `conflict_match`
- summary output now includes `scoreTransitionCounts`
- summary output now includes `selectedByCounts`
- pressure-state score recognition now covers `0-40`, `15-40`, `40-0`, and `40-15`
- single-score snapshots can now support pressure states or matching result scores when full before/after transitions are unavailable
- result events can be supported by score movement even when the OCR label is generic
- result events stay weak when nearby OCR score context remains a pressure state
- this is still observability-first: `selectedBy` explains why OCR evidence was attached, but does not change selection or rejection behavior yet

Verified:

- `npx vitest run src/__tests__/media-analysis-v2.test.ts`
- `npm run build` in `backend`
- OCR-aware reference rerun with existing moments symlinked into `/tmp/media-analysis-v2-selectedby-summary-ref`

Latest reference result:

- output: `/tmp/media-analysis-v2-ranked-ocr-ref/media_analysis_v2/result.json`
- `246` segments
- `17` events
- `12` OCR-backed events
- OCR support:
  - `9` `supports`
  - `3` `weak_support`
  - `0` `conflicts`
- score transition metadata:
  - `3` `supports_result`
  - `2` `supports_state`
  - `7` `unknown`
- OCR selection reason metadata:
  - `7` `label_match`
  - `5` `transition_match`
  - `0` `timing_match`
  - `0` `conflict_match`
- event ids, labels, timing, and relations stayed stable

OCR ranking update:

- OCR context selection now ranks candidates separately from evidence confidence
- `transition_match` receives a small selection-rank boost, so real score movement can beat weaker label/timing-only evidence
- `conflict_match` receives a selection-rank penalty, so stale pressure-score context does not outrank valid non-score OCR evidence
- missing score remains neutral; label matches can still be selected when no score transition is available
- stale/conflicting score evidence remains weak support instead of hard rejection
- reference rerun stayed stable against the previous selected-by run:
  - `0` selected OCR context changes
  - same `246` segments
  - same `17` events
  - same OCR support and score-transition counts

OCR transition-over-label update:

- true score transitions can now override misleading OCR label wording
  - example covered by test: event is `set_won`, OCR label says `wins match`, but score moves `5-3 -> 6-3`
  - result: selected as `transition_match` / `supports_result`
- set-win transition detection is stricter:
  - `set_won` no longer treats any game-score movement as a completed set result
  - it now needs a matching result score, a set-score change, or a terminal point reset
- reference rerun changed one OCR interpretation:
  - output: `/tmp/media-analysis-v2-transition-over-label-ref/media_analysis_v2/result.json`
  - `event_8` stayed attached to `ocr-context:11`
  - status stayed `weak_support`
  - transition changed from `supports_result` to `conflicts_result`
  - selectedBy changed from `transition_match` to `conflict_match`
  - confidence changed from `0.68` to `0.64`
- this is expected: the OCR label says `Djokovic wins Set 1 6-3`, but the score context is already Set 2 / `3-6, 2-5 (15-40)`, so it should not be treated as score-transition support for the opening-set event

OCR scoped score-matching update:

- result-score matching now uses event scope instead of a single generic score slot
  - `game_won` matches the current game score
  - `set_won` matches a terminal current set/game score, not a historical set score with an active point score
  - `match_won` can match multi-set score snapshots such as `6-3, 6-2`
- added regression coverage for:
  - multi-set match-result OCR snapshots
  - historical set score plus active point score not supporting a `set_won` event
- reference rerun stayed stable against the transition-over-label run:
  - output: `/tmp/media-analysis-v2-scoped-score-ref/media_analysis_v2/result.json`
  - `0` selected OCR context changes
  - same `246` segments
  - same `17` events
  - same OCR support and score-transition counts

Tennis boundary / recap suppression update:

- added focused handling for adjacent tennis hold-result wording where the score follows `three holds on the board`
  - reference wording: `so three holds on the board ... to the bench to 2-1`
  - resulting event: `Third hold of the set moves score to 2-1`
- tightened the hold-board matcher so a score that appears before the hold-board wording does not create a false game result
- added changeover/bench recap suppression for slow-motion/rest coverage after a game result
- added backward anchoring for game/set/match recaps toward the live pressure or result beat
- cleaned noisy match-result score text such as `C3 is 2-2, 6-3, 6-2.`
- verified:
  - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
  - `npm run build` in `backend`
  - OCR-aware reference rerun with existing moments symlinked into `/tmp/media-analysis-v2-ocr-verify-2026-04-28-anchorfix`
- latest reference result:
  - output: `/tmp/media-analysis-v2-ocr-verify-2026-04-28-anchorfix/media_analysis_v2/result.json`
  - `246` segments
  - `16` events
  - `11` OCR-backed events
  - OCR support: `8 supports`, `3 weak_support`, `0 conflicts`
  - score transition metadata: `2 supports_result`, `2 supports_state`, `1 conflicts_result`, `6 unknown`
  - selected-by metadata: `6 label_match`, `4 transition_match`, `1 conflict_match`, `0 timing_match`
- reference comparison versus `/tmp/media-analysis-v2-scoped-score-ref`:
  - added `game_won` at `12:04`: `Third hold of the set moves score to 2-1`
  - the `2-1` hold now spans `11:58` to `12:04`; the later bench wording is treated as recap text
  - changed opening-game break-point saved from `game_won` to `point_won`
  - removed stale saved-break-point recap: `still can't quite believe...`
  - removed later recap-only `What a point.`
  - set result anchor moved from `2467.526` to `2432.5`
  - `4-2` hold anchor moved from `4566.208` to `4557.168`
  - third break anchor moved from `4901.295` to `4885.958`
- remaining caveat:
  - the new `12:04` hold has no OCR support because the existing OCR context does not cover that interval
  - compact moment inspection found no OCR moment peaks between `10:50` and `13:00`
  - nearest later OCR moment is `moment/3` at `14:20`, already into the next game with score `2-1 (0-15)`
