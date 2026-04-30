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

Whole-media reaction-like candidate audit:

- added `backend/scripts/audit-v2-reaction-like-candidates.mjs`
- usage:
  - `node backend/scripts/audit-v2-reaction-like-candidates.mjs <media_analysis_v2/result.json> [--limit=60] [--min-score=0.55]`
- the script:
  - scores every `1s` audio summary using context-adjusted reaction/rally/speech scores, attack score, nearby raw peak, and episode role
  - groups adjacent high-scoring seconds into candidate moments
  - compares each candidate to nearby raw audio peaks, reaction episodes, current events, and transcript
  - suggests review labels such as `already_captured`, `possible_missed_key_moment`, `recap_tail`, and `commentary_false_positive`
  - prints current event coverage to identify events with weak/no reaction-like candidate nearby
- first run against:
  - `/tmp/media-analysis-v2-context-audio-hints-2026-04-30-v3/media_analysis_v2/result.json`
- first review queue recorded in:
  - `docs/media-analysis-v2-reaction-like-candidate-audit.md`
- high-value review targets:
  - `37:48-37:49` possible missed break/result moment
  - `79:37-79:45` unclear high-rank candidate
  - `85:01-85:02` match-point pressure/reaction candidate
  - `40:54-40:55` possible set-result tail
  - `86:59-87:01` likely match-result recap tail
- event behavior remains unchanged; this is audit-only

Manual review labels for reaction-like candidates:

- `37:48-37:49`
  - confirmed live key moment
  - Djokovic wins point to win/break the game in set 1
  - score moves from `3-4 30-40` to `3-5`
  - commentator says `Djokovic breaks`
  - implication: candidate should support a missed `game_won`
- `79:37-79:45`
  - confirmed live point context
  - set 2 score is `2-4 30-40` for Djokovic
  - point starts and Alcaraz wins the point at about `79:41`
  - implication: candidate can be a real `point_won`, but winner attribution needs transcript/OCR/score context
- `85:01-85:02`
  - confirmed between-points pressure context
  - set 2 score is `2-5 0-40`
  - Djokovic has three match points
  - next serve starts at about `85:13`
  - implication: should remain `pressure_state` / setup context, not result promotion
- `40:54`
  - confirmed live set-winning point
  - set 1 score is `3-5 0-40` for Djokovic
  - Djokovic wins the point and the set at about `40:54`
  - implication: reaction-like candidate should improve/correct set-winning anchor; current `set_won` anchor is earlier
- `86:59-87:01`
  - confirmed broadcaster animation after match
  - implication: suppress as live key moment; classify as post-match graphic/recap tail

Reaction-like promotion and anchor implementation:

- added regression coverage from manual review labels:
  - `37:48-37:49` reaction-like break/game result promotes to `game_won`
  - `40:54-40:55` reaction-like set-ending point moves the `set_won` anchor
  - `85:01-85:02` match-point setup remains `pressure_state`, not a result
  - `86:59-87:01` post-match broadcaster animation is suppressed as a live key moment
- implementation details:
  - added a conservative reaction-like tennis candidate pass that uses `audioProfile.summaries.oneSecond[].context`
  - promotion requires transcript/result context; audio profile alone is not enough
  - terminal match events suppress later reaction-like audio-profile candidates for a post-match window
  - set results with audio-profile anchor evidence are no longer re-anchored back to earlier pressure-state text by `event-linking`
- reference rerun:
  - output: `/tmp/media-analysis-v2-reaction-like-promotion-2026-04-30-v3/media_analysis_v2/result.json`
  - `246` segments
  - `18` events
  - `101` audio peaks
  - `15` audio reaction episodes
- key changes in reference output:
  - added `game_won` at `2268.25` (`37:48.25`): `Djokovic breaks.`
  - moved `set_won` anchor to `2454.75` (`40:54.75`) with `audio-profile:1s:2454` evidence
  - no post-match `point_won` is emitted around `86:59-87:01`
  - `79:37-79:45` remains audit/review evidence for now because winner attribution needs stronger transcript/OCR/score handling
- verified:
  - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
  - `npm run build` in `backend`

Audio profile audit tooling:

- added `backend/scripts/audit-v2-audio-profile.mjs`
- usage:
  - `node backend/scripts/audit-v2-audio-profile.mjs <media_analysis_v2/result.json> [timecode...]`
  - when no timecodes are provided, it audits the first known set: `23:07`, `73:57`, `74:27`, `81:27`, `82:22`
- the script prints:
  - nearest timeline window and transcript
  - nearby events
  - nearby raw audio peaks
  - nearby reaction episodes and member roles
  - `1s` audio hint summaries
  - `5s` audio hint summaries
  - `0.5s` frame-level energy/delta/ZCR/silence/burst rows
- generated fresh reference output at:
  - `/tmp/media-analysis-v2-audio-profile-hints-2026-04-30/media_analysis_v2/result.json`
- first compact review recorded in:
  - `docs/media-analysis-v2-audio-profile-audit.md`
- early audit conclusions:
  - `73:57` is a good reaction anchor case: high `reactionBurstScore`, episode primary at `73:58`, and `74:28` remains the tail
  - `23:07` and `74:27` show why signal-only point shape is not safe enough: both can look rally-like even when transcript speech density is high
  - next pass should keep raw audio scores unchanged but add context-adjusted hints that blend transcript speech density, replay/commentary cues, and episode role

Context-adjusted audio hint implementation:

- added `summary.context` to `AudioProfileWindowSummary`
- raw audio scores remain unchanged
- context fields include:
  - transcript/window `speechDensity`
  - commentary/replay/score cue flags
  - adjusted rally/reaction/speech/music/crowd scores
  - adjusted `pointShapeHint`
  - suppression reasons such as `high_speech_density`, `speech_dominance`, `music_bed`, and `weak_reaction_burst`
- generated fresh reference output at:
  - `/tmp/media-analysis-v2-context-audio-hints-2026-04-30-v3/media_analysis_v2/result.json`
- reviewed known timestamps:
  - `23:07`: raw `medium_rally` -> context `recap_only`
  - `73:57`: raw `medium_rally` -> context `medium_rally`
  - `74:27`: raw `medium_rally` -> context `recap_only`
  - `81:27`: context flags speech-dominant/weak reaction risk
  - `82:22`: context flags music-bed/weak reaction risk
- event behavior stayed stable:
  - `246` segments
  - `17` events
  - `101` audio peaks
  - `15` audio reaction episodes
- verified:
  - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
  - `npm run build` in `backend`

Audio profile hint implementation:

- added initial observable tennis audio hint fields to `1s` and `5s` profile summaries
- new summary fields:
  - `zeroCrossingRateMean`
  - `onsetRegularity`
  - `rallyTextureScore`
  - `reactionBurstScore`
  - `speechDominanceScore`
  - `musicBedScore`
  - `umpireAnnouncementScore`
  - `applauseCrowdScore`
  - `pointShapeHint`
- important constraint:
  - these are signal-only proxies for now
  - event promotion and anchor selection are still unchanged
  - later passes should blend transcript density/cues, OCR context, and better spectral/harmonic features before trusting the speech/music/umpire labels
- verified:
  - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
  - `npm run build` in `backend`
- reference rerun:
  - output: `/tmp/media-analysis-v2-audio-profile-2026-04-30-stable/media_analysis_v2/result.json`
  - `246` segments
  - `17` events unchanged
  - `101` audio peaks
  - `26` candidate windows
  - `15` audio reaction episodes
  - `10459` fine audio frames
  - `5230` one-second summaries
  - `1046` five-second summaries
  - `73:57.5` remains the primary anchor for `audio_peak_80`
  - `74:27.5` remains the `speech_or_commentary` / `recap_or_speech_tail` member for `audio_peak_81`
- reference rerun:
  - output: `/tmp/media-analysis-v2-reaction-episodes-2026-04-30/media_analysis_v2/result.json`
  - `246` segments
  - `17` events unchanged
  - `101` audio peaks
  - `26` candidate windows
  - `15` audio reaction episodes
  - episode primary reasons: `5 first_strong_reaction`, `10 best_available_peak`
  - `73:57.5` and `74:27.5` are grouped into `audio_reaction_episode_9`
    - primary: `73:57.5`, `audio_peak_80`, `first_strong_reaction`
    - tail: `74:27.5`, `audio_peak_81`, `recap_or_speech_tail`, `speech_or_commentary`

Candidate packet classification audit start:

- reran focused test suite:
  - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
  - `79` tests passed
- initial packet review shows the packet layer is useful, but deterministic facet hints are not reliable enough to drive behavior alone
- likely correct packets:
  - `12:07`: changeover/bench-like recap linked to the corrected `12:04` game result
  - `73:57`: live reaction/current action linked to `event_18`
  - `75:57`: live reaction/current action linked to the `4-2` hold
  - `82:22`: replay/recap-like packet linked backward to the previous `game_won`
- likely misclassified or needing manual validation:
  - `23:07`: currently `live_action/live_view/current_action`, but manual review says this is slow-motion recap of the previous point and next-point setup follows around `23:27`
  - `74:27`: currently `live_action/live_view/generic`, but manual review says this is also slow-motion recap of the previous point; there is no obvious crowd noise at this timestamp
  - `81:27`: linked to the game result and manual review confirms this is the end of a point
  - `82:02`: replay/recap packet before `82:22`; verify whether both should remain secondary evidence for the same previous game result
  - `71:42` / `72:07`: high audio peaks with no linked event; need video review before promotion
  - `37:52`: possible break/game result wording with no linked event; needs score/video review
  - `85:02`: possible match-point lead-up/crowd packet with no linked event; needs video review
- conclusion:
  - keep candidate packets observable for now
  - use manual labels to tune packet facets and safety gates before connecting packets to LLM adjudication or promotion logic

Audio-source hint follow-up:

- current audio peaks are raw audio-energy peaks, not crowd-only peaks
- `74:27` was selected because it is a local audio-energy bump:
  - `audioEnergy`: `0.686`
  - `localBaseline`: `0.530`
  - `spikeScore`: `0.156`
  - `percentileRank`: `0.959`
  - linked near existing pressure-state event `event_11`
- added `speechDensity` and `audioSourceHint` to candidate packets so audits can distinguish:
  - likely crowd/reaction peaks
  - likely speech/commentary energy
  - mixed/unknown audio energy
- added regression coverage for speech-heavy low-spike audio packets
- added `backend/scripts/audit-v2-audio-window-selection.mjs` to review why a timecode was selected:
  - prints neighboring 5-second windows
  - shows raw energy, local baseline, spike score, percentile rank, local-max status, and final grouped peak status
  - shows bypassed local maxima, which explains cases where a louder previous window did not become the final selected peak
- current 5-second window audit findings:
  - `73:57` survived as a strong reaction-like peak: `audioEnergy=0.830`, `spikeScore=0.529`, `percentileRank=0.994`
  - `74:10` was louder in raw energy: `audioEnergy=0.885`, but was grouped with the earlier `73:57` reaction stretch and did not survive as the final peak
  - `74:27` survived as a later local maximum after the audio dropped, but is speech-heavy: `audioEnergy=0.686`, `spikeScore=0.156`, `percentileRank=0.959`, `speechDensity=1.00`
  - `81:27` survived as a strong reaction-like peak: `audioEnergy=0.890`, `spikeScore=0.507`, `percentileRank=0.999`
- OCR-aware reference rerun:
  - output: `/tmp/media-analysis-v2-candidate-windows-2026-04-29/media_analysis_v2/result.json`
  - `246` segments
  - `17` events
  - `101` audio peaks
  - `26` candidate windows
  - candidate priorities: `14 high`, `12 medium`
  - play phases: `14 live_reaction`, `9 live_action`, `2 between_points`, `1 changeover_or_break`
  - content modes: `22 live_view`, `2 replay_or_slow_motion`, `1 bench_or_player_closeup`, `1 crowd_or_atmosphere`
  - transcript relations: `12 current_action`, `11 generic`, `3 previous_action_recap`
  - `73:57` packet links to `event_18` with facets `live_reaction`, `live_view`, `current_action`

Replay/recap detection clarification:

- scoreboard visibility must be tracked, but not used as a replay/live decision by itself
- replay or slow-motion can still include scoreboard graphics
- bench, changeover, player reaction, crowd shots, and camera cutaways can have no scoreboard without being replay
- do not model replay/slow-motion, bench/changeover, and replay during changeover as three independent primary moment classes; they often overlap in the same broadcast window
- use facets instead:
  - `playPhase`: live action, live reaction, between points, changeover/break, unknown
  - `contentMode`: live view, replay/slow motion, bench/player closeup, crowd/atmosphere, studio/graphic, unknown
  - `transcriptRelation`: current action, previous action recap, next-point setup, generic, unknown
- next-point setup with stale transcript should not duplicate the previous result, but it can be valuable start-boundary evidence for the next rally
- crowd/atmosphere peaks should first be attached to nearby tennis candidates; standalone crowd reactions are fallback only
- changeover/break is also useful structural evidence because in tennis it usually occurs between games or sets
- use changeover/break to strengthen or search backward for a nearby game/set boundary, not to confirm a result by itself
- secure replay/recap validation needs combined evidence:
  - segment type and transcript cues
  - timing after a live point/result
  - repeated or stale event language
  - score/OCR transition or lack of transition
  - scoreboard visibility as supporting metadata only
  - audio peak shape and backward anchor candidate

Candidate window packet layer:

- added observable LLM-ready candidate window packets seeded by audio peaks
- packets do not change event output yet
- each packet records:
  - source audio peak and metadata
  - nearby transcript
  - linked current event ids
  - previous nearby event id
  - scoreboard visibility as metadata
  - facet hints:
    - `playPhase`
    - `contentMode`
    - `transcriptRelation`
- added tests for:
  - replay during changeover represented as multiple facets on one packet
  - next-point setup with stale transcript retained as boundary evidence
- verified:
  - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
  - `npm run build` in `backend`
- OCR-aware reference rerun after the guard:
  - output: `/tmp/media-analysis-v2-audio-led-2026-04-29-rerun-ocr/media_analysis_v2/result.json`
  - `246` segments
  - `17` events
  - `101` audio peaks
  - audio peak shapes: `92 spike`, `9 sustained`
  - OCR support: `8 supports`, `3 weak_support`, `0 conflicts`
  - score transition metadata: `2 supports_result`, `2 supports_state`, `1 conflicts_result`, `6 unknown`
  - `73:57` remains `event_18` with audio evidence only, no OCR context attached
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

Audio/crowd peak audit start:

- added a read-only audit path before changing event generation
- plan guardrails:
  - audio peaks create candidate evidence, not confirmed tennis results by themselves
  - legacy OCR context is audit-only until V2 owns score sampling around peaks
  - local baseline / percentile / spike shape should be used instead of a global mean threshold
  - replay, changeover, and studio peaks must not become fresh primary live events
- first audit command:
  - `node backend/scripts/audit-v2-audio-peaks.mjs /tmp/media-analysis-v2-ocr-verify-2026-04-28-anchorfix/media_analysis_v2/result.json /home/clawdbot/.mam/storage/3936415e-cded-4b32-a264-03b12a33d73f`
- first audit result:
  - `1046` timeline windows
  - `16` current events
  - `101` raw local audio peaks
  - `40` medium/high priority rows after filtering
- early read:
  - the `12:04` hold appears as a high-priority peak supporting the existing `game_won`
  - several OCR-backed peaks have no current V2 event and need manual review before promotion logic
  - pure crowd peaks near late-match recap/result windows should stay `crowd_reaction` or secondary evidence unless score/transcript confirms a live result

Audio peak metadata implementation:

- added a reusable V2 `audioPeaks` result field before changing event generation
- peak metadata includes:
  - local baseline
  - spike score
  - percentile rank
  - grouped peak id
  - `spike` vs `sustained` shape
- summary output now includes `counts.audioPeaks` and `audioPeakCounts`
- this is behavior-neutral for current events:
  - no new `crowd_reaction` events yet
  - no `point_won` / `game_won` promotion from audio yet
  - no OCR sampling changes yet
- verified:
  - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
  - `npm run build` in `backend`

Audio peak evidence update:

- deferred rally-start audio-pattern detection until ending anchors are reliable
  - current `5s` windows are useful for reaction/end timing, not precise rally starts
  - later work should inspect finer `0.5s`-`1s` audio windows around high-value peaks
- added audio peak evidence attachment for existing events
  - nearest useful audio peak is attached as `audio` evidence
  - evidence metadata includes peak time, audio energy, local baseline, spike score, percentile rank, and peak shape
  - existing event type, label, anchor, and confidence are not changed
  - `peakTime` is filled only when absent
- verified:
  - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
  - `npm run build` in `backend`

Audio-led live point promotion start:

- added a narrow audio-led tennis `point_won` candidate path
- constraints:
  - tennis only
  - live-play segment only
  - spike-shaped audio peak
  - percentile rank at least `0.985`
  - spike score at least `0.35`
  - no existing event within `20s`
  - nearby transcript must include both reaction language and tennis action/result context
  - replay/recap/changeover text is blocked
- added regression coverage from the manual labels:
  - clean live rally ending can produce an audio-led `point_won`
  - replay/slow-motion peaks do not become primary live points after validation
- verified:
  - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
  - `npm run build` in `backend`

Audio-led reference rerun:

- reran reference asset to `/tmp/media-analysis-v2-audio-led-2026-04-29`
- with legacy OCR moments symlinked into the temp asset dir:
  - `246` segments
  - `17` events
  - `101` audio peaks
  - audio peak shapes: `92 spike`, `9 sustained`
  - OCR support: `8 supports`, `3 weak_support`, `0 conflicts`
  - score transition metadata: `2 supports_result`, `2 supports_state`, `1 conflicts_result`, `6 unknown`
- comparison versus previous boundary baseline:
  - event count changed from `16` to `17`
  - the added event is the manually reviewed live rally ending around `73:57`
  - replay/recap peaks at `43:02`, `69:52`, and `82:22` did not become new primary events
  - existing `12:04`, `4-2`, third-break, set, and match anchors remained stable
- follow-up cleanup:
  - audio-led `40-40` point labels now rewrite to `Djokovic wins rally to return to deuce`
- verified after cleanup:
  - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
  - `npm run build` in `backend`

Replay back-anchor start:

- added regression coverage for replay/slow-motion peaks:
  - replay-like audio peak can anchor back to a preceding live spike when no primary event exists
  - replay-like audio peak does not add a duplicate when a nearby live event already exists
- added first back-anchor helper for audio-led replay/recap candidates
- reference rerun after the change stayed stable:
  - output: `/tmp/media-analysis-v2-audio-led-2026-04-29/media_analysis_v2/result.json`
  - `246` segments
  - `17` events
  - `101` audio peaks
  - OCR support: `8 supports`, `3 weak_support`, `0 conflicts`
  - event type counts: `7 point_won`, `4 pressure_state`, `3 game_won`, `1 analysis_point`, `1 set_won`, `1 match_won`
- known limitation:
  - the real `73:57` reference label remains raw because transcript wording does not expose the exact `returns to deuce` phrase
  - do not keep expanding phrase rewrites for this; the planned LLM window judge should generate cleaner labels for ambiguous audio-led points
- verified:
  - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
  - `npm run build` in `backend`

OCR inspection for the `73:57` audio-led point:

- inspected stored OCR context from `73:00` to `74:45`
- nearby OCR contexts:
  - `moment/17` at `74:34`: `Alcaraz anticipates pass, earns break points`
    - `scoreBefore`: `3-6, 2-5 (15-40)`
    - no `scoreAfter`
  - `moment/25` at `74:34`: `Alcaraz wins break point with pass`
    - `scoreBefore`: `3-6, 2-5 (40-15)`
    - no `scoreAfter`
- current audio-led event:
  - anchor `73:57.5`
  - type `point_won`
  - audio evidence only
- correction from manual video review:
  - `74:34` is slow-motion recap of the previous point, not a fresh live pressure-state moment
- conclusion:
  - the available OCR is later replay/slow-motion context with pressure-looking score text, not clean live confirmation of the point ending at `73:56`
  - it is correct that OCR is not attached to the audio-led point under current scoring
  - forcing this OCR onto the `73:57` point would risk stale/wrong score support
- next implication:
  - better confirmation for this case needs V2-owned OCR sampling around the live ending (`73:50`-`74:00`), or the planned LLM window judge using transcript + audio + surrounding score context

OCR guard for audio-led point results:

- added a narrow guard so later pressure-like replay/slow-motion OCR context does not confirm audio-led `point_won` candidates when OCR has no point-score transition
- motivation from `73:57`:
  - the audio peak marks the live rally ending
  - available OCR appears later during slow-motion recap of the previous point
  - attaching that OCR would imply support from stale score context
- added regression coverage:
  - an audio-only `point_won` keeps only audio evidence when a later slow-motion OCR context says `earns break points` with `15-40`
- verified:
  - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
  - `npm run build` in `backend`

Audio reaction episode layer:

- added observable `audioReactionEpisodes` to V2 result output
- purpose:
  - group nearby candidate-window audio peaks into one reaction episode
  - preserve the first strong reaction-like spike as the primary anchor
  - keep later speech/commentary or replay/recap bumps as episode tail evidence
- this directly addresses the `73:57` -> `74:27` pattern:
  - `73:57` is the primary live point-ending reaction anchor
  - `74:10` can be louder raw energy but belongs to the same reaction stretch
  - `74:27` can survive as a later local bump, but should be treated as speech/recap tail, not a new primary anchor
- episode fields include:
  - primary candidate window id
  - primary audio peak id
  - primary anchor time
  - primary reason (`first_strong_reaction` or `best_available_peak`)
  - member roles (`primary_anchor`, `episode_tail`, `recap_or_speech_tail`)
- no event behavior changed yet
- added regression coverage for:
  - first strong reaction peak winning over a later speech-heavy bump
  - fallback to best available peak when no strong reaction anchor exists
- verified:
  - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
  - `npm run build` in `backend`

Audio pipeline rebuild plan:

- conclusion from review:
  - current audio path is too compressed for tennis moment understanding
  - it computes one normalized RMS energy value per `5s` timeline window
  - this can find coarse loudness peaks, but it cannot reliably distinguish:
    - rally texture
    - short point vs long rally
    - crowd reaction
    - commentator excitement
    - umpire/referee announcement
    - music/changeover bed
    - replay/slow-motion recap tail
- planning decision:
  - keep current `5s` windows for transcript/OCR/segment alignment
  - add a finer audio profile underneath them, starting at `0.5s`
  - preserve sub-window summaries instead of collapsing them back into one `5s` energy value
  - use previous/next fine-frame navigation to infer possible action start, reaction start, tail, and point duration
- prioritized features:
  - RMS energy
  - peak energy
  - energy delta / attack slope
  - silence ratio
  - onset count / onset pattern
  - burst duration / duration pattern
  - zero-crossing rate
  - spectral centroid / flatness / band energy
  - later: MFCC, harmonic ratio, pitch, clustering/classifier input
- planned derived tennis hints:
  - `rallyTextureScore`
  - `reactionBurstScore`
  - `speechDominanceScore`
  - `musicBedScore`
  - `umpireAnnouncementScore`
  - `applauseCrowdScore`
  - point shape hints: `short_point`, `medium_rally`, `long_rally`, `reaction_only`, `recap_only`
- next implementation should be observable first:
  - add `audioProfile`
  - add audit table around manual timestamps
  - keep event behavior stable until reviewed
- detailed staged tasks are recorded in `docs/media-analysis-v2-next.md`

Pre-OCR score-context audit:

- added `backend/scripts/audit-v2-score-context-candidates.mjs`
- purpose:
  - test whether reaction-like audio candidates have nearby transcript score, pressure, outcome, or recap evidence
  - keep score-context attribution audit-only before OCR
  - avoid broad result inference from audio + transcript alone
- latest reference command:
  - `node backend/scripts/audit-v2-score-context-candidates.mjs /tmp/media-analysis-v2-reaction-like-promotion-2026-04-30-v3/media_analysis_v2/result.json --limit=30 --min-score=0.52`
- latest reference findings:
  - `37:48` appears as `outcome_phrase_needs_score` with `djokovic breaks`; reviewed/manual label already supports current `game_won`
  - `40:54` appears as `pressure_setup_only` with `set points`; reviewed/manual label already supports current `set_won`, but transcript alone is not a safe generic rule
  - `79:41` has a strong audio candidate, but no reliable transcript score/outcome signal in the audit window; keep unpromoted until OCR/video confirms score transition
  - `85:02` appears as pressure/setup-only; keep as non-result context
  - `86:59` appears as `post_match_score_context`; do not emit a live event from the broadcaster animation/post-match score package
- detailed notes are recorded in `docs/media-analysis-v2-score-context-audit.md`

V2 OCR sampling manifest:

- added `backend/scripts/audit-v2-ocr-sampling-plan.mjs`
- purpose:
  - choose exact OCR sample timestamps around V2-owned reaction-like audio anchors
  - compare any existing legacy OCR context as a dry run
  - keep event attribution unchanged
- latest reference command:
  - `node backend/scripts/audit-v2-ocr-sampling-plan.mjs /tmp/media-analysis-v2-reaction-like-promotion-2026-04-30-v3/media_analysis_v2/result.json /home/clawdbot/.mam/storage/3936415e-cded-4b32-a264-03b12a33d73f --limit=25 --min-score=0.52`
- sampling pattern:
  - audio-aware sample labels are now generated first:
    - `setup_or_quiet_before`
    - `action_or_rally_context`
    - `reaction_start`
    - `reaction_peak`
    - `scoreboard_settle`
    - `tail_or_context_check`
  - fixed offsets are retained only as fallback fill-ins
- optional frame extraction:
  - `--extract-frames=/tmp/path`
  - writes JPEG samples and a `manifest.json` grouped by candidate anchor
  - manifest rows include `sampleLabel` and `sampleSource`
- latest reference findings:
  - `37:48` anchor is sampled at `37:48.3`; legacy OCR only gives later `? -> 5-3`, so V2 needs exact before/after frame reads
  - `40:54` anchor is sampled at `40:54.8`; legacy OCR context is stale/mixed and should not be trusted for generic attribution
  - `79:41` anchor is sampled at `79:40.3`; no useful legacy before/after OCR score read exists
  - `85:02` anchor is sampled at `85:01.8`; classify as pressure before/after OCR check
  - `86:59` anchor is sampled at `87:00.3`; classify as post-match/graphic check
- manual video validation:
  - `79:40.3` sample set is good; `79:49`-`79:56` shows replay
  - `40:54.8` sample set is good; `40:59`-`41:09` shows player bench and spectators, not replay
  - renamed late sample label from `tail_or_replay_check` to `tail_or_context_check`
- next implementation should run OCR on these sample times and persist per-anchor reads before any winner/score attribution
- detailed notes are recorded in `docs/media-analysis-v2-ocr-sampling-plan.md`

Audio profile implementation start:

- added observable `audioProfile` to V2 result output
- `audioProfile` currently includes:
  - `0.5s` fine frames
  - `1s` rolled summaries
  - `5s` rolled summaries
- fine-frame features currently include:
  - normalized RMS energy
  - normalized peak energy
  - energy delta / attack slope
  - zero-crossing rate
  - silence ratio
  - burst score
- summary features currently include:
  - exact full-window RMS energy
  - frame energy mean/max/stddev
  - burst count
  - onset rate
  - silence ratio
  - active duration
  - sustained loudness duration
  - strongest attack time and score
- compatibility note:
  - existing `timelineIndex.windows[].audioEnergy` is still populated from exact `5s` RMS summaries
  - event behavior is not changed by this step
- added synthetic PCM regression coverage for audio profile frame and summary generation
- summary output now counts:
  - `audioProfileFrames`
  - `audioProfileOneSecondSummaries`
  - `audioProfileFiveSecondSummaries`
- verified:
  - `npx vitest run src/__tests__/media-analysis-v2.test.ts`
  - `npm run build` in `backend`
