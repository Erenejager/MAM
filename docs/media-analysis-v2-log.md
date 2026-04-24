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
