# Media Analysis V2 Plan

## Purpose

`media-analysis-v2` is the new analysis pipeline for understanding full video assets as structured content, not just as isolated OCR key moments.

The core shift is:

- old approach: detect peaks, inspect moments, curate highlights
- V2 approach: profile the asset, segment the timeline, generate events from segments, then link the result into a coherent structure

This document is the canonical working plan for the V2 pipeline created on 2026-04-20. It replaces any attempt to steer V2 from the older OCR pipeline plans.

## Product Goal

Build a production-usable analysis pipeline that can:

- identify what kind of asset this is
- understand the structure of the timeline
- detect meaningful events in sport-aware ways
- connect replays, commentary, and interviews back to primary moments
- persist results per asset for inspection, reruns, and downstream UI use

## Current Architecture

The implemented V2 pipeline is:

1. `profileAsset`
   Infer `domain`, `format`, `sport`, `competition`, `players`, and `teams` from representative frames plus transcript fallback heuristics.

2. `buildTimelineIndex`
   Convert transcript and audio into dense fixed windows with features such as transcript text, speech density, audio energy, replay cues, commentary cues, and score cues.

3. `classifySegments`
   Turn timeline windows into structured spans such as `live_play`, `replay`, `commentator_insert`, `player_interview`, `press_conference`, `crowd`, and `unknown`.

4. `validateSegments`
   Use Gemini selectively on uncertain or high-impact spans to improve segment labels without validating everything.

5. `generateInitialEvents`
   Emit event candidates from validated segments with sport-aware rules.

6. `validateAndNormalizeEvents`
   Reject weak candidates, normalize confidence, and mark event roles such as `primary`.

7. `linkRelatedEvents`
   Link secondary events such as replays, commentary, and quotes back to nearby primary events.

8. `saveMediaAnalysisResult`
   Persist full result, summary, and status under per-asset V2 artifacts.

## What Was Built On 2026-04-20

The following V2 components were established today:

- asset profiling
- timeline indexing
- segment classification
- selective segment validation
- event candidate generation
- event normalization and linking
- per-asset storage for result, summary, and status
- API routes to run V2 and fetch stored outputs
- tests covering the new pipeline behavior

The result is an end-to-end V2 path that can be run independently of the legacy OCR key-moment pipeline.

## Current Status

What is working:

- V2 runs end to end and persists artifacts.
- Asset profiling correctly keeps the tennis sample in the right domain and sport.
- Tennis keyword centralization worked.
- Football-style event leakage into tennis has been removed.
- The test suite for `media-analysis-v2` is passing.

What is not done:

- tennis event quality is still too loose
- commentator-driven `analysis_point` events are too dense
- segment validation still spends too much time on noisy or marginal cases
- Gemini retries and `503` pressure remain a runtime bottleneck

## What We Learned From The Latest Tennis Rerun

The latest rerun showed a real correctness improvement:

- incorrect football-like labels dropped away
- the asset remained correctly profiled as tennis
- `point_won` became the dominant tennis event type instead of `unknown`, `goal`, or `save`

The remaining problem is no longer "wrong sport." The remaining problem is "event quality and runtime efficiency."

That changes the priority order.

## Priority Order

### Priority 1: Improve event quality

This is the current top priority because the biggest remaining errors are created during candidate generation, not asset profiling.

Main issues:

- some `point_won` events are emitted from weak transcript fragments rather than clearly meaningful tennis moments
- `analysis_point` is emitted too often from commentator segments

Desired outcome:

- fewer but better events
- stronger precision for tennis moments
- less commentary noise in the final event graph

### Priority 2: Reduce validation volume

This is the next priority after event quality improves.

Main issues:

- `validateSegments` currently rechecks many segment classes by policy
- commentator inserts and other structurally important spans may be over-validated
- this creates unnecessary Gemini load and exposes the run to retry storms

Desired outcome:

- validate only when the decision is truly ambiguous or materially changes downstream event quality

### Priority 3: Improve runtime and reliability

This follows the first two priorities because runtime work is less valuable if the pipeline is still generating too many weak events.

Main issues:

- frequent Gemini `503` high-demand responses
- too many retries on low-value validations

Desired outcome:

- fewer external calls
- better completion time
- less noisy run behavior

## Immediate Next Work

### 1. Tighten tennis `point_won` generation

Focus file:

- `backend/src/lib/media-analysis-v2/event-candidates.ts`

Planned changes:

- require stronger tennis cues before emitting `point_won`
- separate clearly decisive tennis language from generic rally commentary
- reduce fallback behavior that turns weak text into tennis scoring events

Success condition:

- weak commentary fragments no longer become `point_won`
- strong tennis moments still map correctly

### 2. Collapse or gate `analysis_point` bursts

Focus file:

- `backend/src/lib/media-analysis-v2/event-candidates.ts`

Planned changes:

- stop emitting an `analysis_point` for every commentator window that passes a length threshold
- collapse adjacent commentator windows into a smaller number of analysis events
- require stronger evidence for analysis-style events

Success condition:

- commentary spans produce concise analysis events instead of dense bursts

### 3. Add regression tests before heuristic tuning

Focus file:

- `backend/src/__tests__/media-analysis-v2.test.ts`

Planned changes:

- add tennis weak-signal cases that must not emit `point_won`
- add strong-signal tennis cases that must still emit `point_won`
- add commentator burst cases that should collapse to fewer `analysis_point` events

Success condition:

- heuristics can be tightened safely without guesswork

### 4. Narrow segment validation policy

Focus file:

- `backend/src/lib/media-analysis-v2/segment-validation.ts`

Planned changes:

- revisit `shouldValidateSegment()`
- stop validating spans that are already stable enough for downstream use
- keep validation only where it meaningfully changes segment class or event quality

Success condition:

- fewer Gemini calls
- less retry pressure
- similar or better final output quality

## Non-Goals Right Now

The following should not drive the next round of work:

- migrating V2 back into the legacy OCR moment-selection design
- broadening V2 to many new sports before tennis quality stabilizes
- polishing UI output before event quality and run reliability are under control
- optimizing runtime before the validator and event generator are producing the right shape of output

## Success Criteria

V2 is on the right track when the following are true on repeated tennis reruns:

- asset profiling remains correct
- event types remain tennis-safe
- `point_won` count decreases slightly but quality increases
- `analysis_point` density drops noticeably
- total event output feels cleaner and less repetitive
- validation volume decreases
- run completion becomes less dependent on surviving transient Gemini overload

## Canonical Summary

The V2 plan is:

`profile asset -> build timeline -> classify segments -> selectively validate -> generate sport-aware events -> validate and link -> persist results`

The immediate next milestone is:

`make events cleaner before making the pipeline faster`
