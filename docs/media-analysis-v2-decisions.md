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

## Current View

- Good:
  - sport profiling is stable on the tennis reference asset
  - football-style leakage into tennis is fixed
  - `analysis_point` noise was reduced successfully
- Not good enough yet:
  - `point_won` recall is now too low in the latest run
  - segment validation is still expensive and 503-prone

## Future Direction

- Long-term V2 accuracy should come from multimodal window-based inference, not just keyword rules.
- Deferred design review:
  - if `ocr_context` becomes a first-class ranking signal, replace the generic `EvidenceRef.metadata` bag with a typed OCR-specific evidence variant instead of growing the loose shared shape further
- The likely future accuracy pillars are:
  - OCR score state and score transitions
  - richer audio / excitement signals
  - speaker-role or diarization-aware segmentation
  - multimodal event confidence instead of transcript-only event typing
