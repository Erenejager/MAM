# Media Analysis V2 Score-Context Candidate Audit

Purpose:

- test whether transcript + audio timeline can provide valid score context before OCR-backed point attribution
- keep this layer audit-only until reviewed labels prove it is accurate enough
- avoid broad automatic inference from audio + transcript alone

Command:

```bash
node backend/scripts/audit-v2-score-context-candidates.mjs /tmp/media-analysis-v2-reaction-like-promotion-2026-04-30-v3/media_analysis_v2/result.json --limit=30 --min-score=0.52
```

Current reference result:

- `/tmp/media-analysis-v2-reaction-like-promotion-2026-04-30-v3/media_analysis_v2/result.json`
- `5230` one-second audio summaries
- `64` audio rows above score `0.52`
- `28` score-context groups with transcript score/pressure/outcome/recap evidence

Manual anchor check:

| time | audit result | current interpretation |
| --- | --- | --- |
| `37:48` | audio candidate plus `djokovic breaks` outcome phrase | already promoted as reviewed `game_won`; OCR would be needed before broad attribution |
| `40:54` | audio candidate plus `set points` pressure context | already promoted as reviewed `set_won`; transcript alone is not enough for generic set attribution |
| `79:41` | audio candidate exists, but no reliable transcript score/outcome signal in the audit window | keep unpromoted until OCR/video confirms winner and score transition |
| `85:02` | pressure/setup-only: `three chances to seal it` | correctly not a result event |
| `86:59` | post-match score context `6-3, 6-2` after match result | do not emit a new live event; confirmed broadcaster animation/post-match context |

Conclusion:

- audio + transcript are useful for proposing review targets and pressure context
- they are not safe enough for broad winner/score attribution before OCR
- next implementation should use this audit output to decide where to sample OCR, not to create new events directly
