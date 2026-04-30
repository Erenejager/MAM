# Media Analysis V2 Next

## Immediate Task

Improve key-moment correctness and boundaries before building more agent/highlight abstractions.

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
