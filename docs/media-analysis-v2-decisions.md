# Media Analysis V2 Decisions

## Stable Decisions

- `media-analysis-v2` is the active V2 architecture. It should not be steered by the legacy OCR key-moment pipeline docs except where specific ideas are intentionally reused.
- The core V2 flow is:
  - `profile asset -> build timeline -> classify segments -> selectively validate -> generate sport-aware events -> validate and link -> persist results`
- `analysis_point` is secondary commentary context, not a primary live sports event.
- The `analysis_point` cleanup from 2026-04-20 is a good change and should be retained.
- Tennis event typing should move toward full-window evidence, not transcript-only phrase matching.
- The latest tennis `point_won` tightening was too aggressive because it reduced `point_won` from `35` to `19` on the reference tennis asset.
- Current priority is still “cleaner and mostly right,” not “maximum sophistication immediately.”
- Runtime optimization should not lead the work until event quality is in a better place.
- Event cleanup must not dedupe by time alone. Consecutive tennis points can be close together, and an `ace`, `point_won`, `game_won`, `set_won`, or `match_won` may describe different granularities of the same sequence. For now, only same-type semantic duplicates should be removed. Cross-type relationships should be linked later, not deleted.
- OCR/key-moment context attached after event linking should use `ocr_context` evidence, not `vision`. `vision` is reserved for direct frame/LLM validation calls.
- Tennis event taxonomy is now: `pressure_state`, `point_won`, `game_won`, `set_won`, `match_won`, `ace`, `analysis_point`, `quote`. Do not collapse back to a single `point_won` bucket.
- OCR candidate selection rank is separate from evidence confidence. Selection determines which OCR moment is attached; confidence determines how much it lifts event confidence.
- `transition_match` should be preferred over `label_match` when a real score movement is parsed. `conflict_match` should be penalised but not hard-rejected.
- Scoped score matching: `game_won` checks the game score, `set_won` checks the terminal game/set score without an active point score, `match_won` checks multi-set snapshots.
- `selectedBy` and `scoreTransitionStatus` are observability-only for now. Do not use them to hard-reject events or reorder the timeline until more signal coverage is in place.

## Current View

### 2026-04-20

- Good:
  - sport profiling is stable on the tennis reference asset
  - football-style leakage into tennis is fixed
  - `analysis_point` noise was reduced successfully
- Not good enough yet:
  - `point_won` recall was too low after aggressive tightening (35 → 19)
  - segment validation is still expensive and 503-prone

### 2026-04-27

- Good:
  - full tennis event taxonomy split is stable and passing on reference asset
  - `point_won` recall recovered — reference is at 17 events with correct taxonomy breakdown
  - OCR score-transition framework is live and observability-complete
  - candidate ranking correctly prefers real score movement over stale label matches
  - regression suite now guards all heuristic and OCR confirmation logic
- Not good enough yet:
  - 7 of 12 OCR score transitions are still `unknown` — more score-format coverage needed
  - anchor placement and boundary accuracy are not yet tight enough for clip extraction
  - segment validation volume is still high

## Future Direction

- Long-term V2 accuracy should come from multimodal window-based inference, not just keyword rules.
- Deferred design review:
  - if `ocr_context` becomes a first-class ranking signal, replace the generic `EvidenceRef.metadata` bag with a typed OCR-specific evidence variant instead of growing the loose shared shape further
- The likely future accuracy pillars are:
  - OCR score state and score transitions
  - richer audio / excitement signals
  - speaker-role or diarization-aware segmentation
  - multimodal event confidence instead of transcript-only event typing
