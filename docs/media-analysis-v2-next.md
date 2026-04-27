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

## Change

Focus the next pass on raw key-moment quality rather than downstream agent abstractions.

The next pass should improve:

- anchor placement
- start/end boundaries
- result-vs-state classification accuracy
- replay / duplicate suppression
- stronger confirmation from OCR plus future audio/crowd signals
- score-change parsing beyond the first tennis transition pass

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
