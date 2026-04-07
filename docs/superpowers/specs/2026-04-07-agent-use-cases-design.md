# Agent Use Cases for Editorial Journalists

**Date:** 2026-04-07
**Status:** Draft
**Context:** MAM pipeline (transcript, OCR/vision, key moments, context enrichment, OpenSearch) exposed to editorial journalists via a conversational AI agent.

## Overview

This document catalogs 27 use cases organized by **agent capability layer** — each layer builds on the previous and unlocks progressively more autonomous workflows.

**Target users:** Editorial journalists and sports desk staff working with a large archive (thousands of assets spanning years, multiple sports, multiple broadcasters). Content is primarily sports matches/tournaments and sports news/current affairs (interviews, reports, field coverage).

**Agent interaction model:** Primarily conversational (journalist asks, agent finds/produces) and semi-autonomous (journalist gives a brief, agent produces a draft for review). Full autopilot with approval gate is a future ambition.

**Export:** Out of scope for now — focus is on the intelligence and assembly layer. EDL/XML export to NLEs will be addressed separately.

**Edit list format:** Throughout this document, "edit list" refers to an ordered sequence of `{assetId, inPoint (timecode), outPoint (timecode), label, duration}` entries — the agent's output before any export format conversion. The concrete schema and serialization format will be defined during implementation.

---

## Layer 1 — Search & Retrieval

The foundation. The journalist asks, the agent finds. All use cases in this layer rely on existing pipeline data.

### 1.1 Natural Language Moment Search

**Prompt example:** "Find me all break points in yesterday's Roland Garros matches"

Agent queries across transcript, key moments, and OCR metadata. Returns moments with timestamps, scores, and thumbnails. Filters by moment_type, sport, competition, player, date range.

**Data sources:** `ocrKeyMoments` (moment_type, players, competition, score), OpenSearch index, asset metadata (createdAt)

### 1.2 Transcript Search with Context

**Prompt example:** "Find every time the commentator mentions VAR in Ligue 1 this season"

Full-text search across transcripts with timestamp anchoring. Returns the quote, surrounding context, and a link to that point in the video.

**Data sources:** OpenSearch transcript field, transcript segments (start/end timestamps)

### 1.3 Score-State Queries

**Prompt example:** "Show me all moments where Sinner was down a set and broke back"

Agent reasons over the structured score data (sets, game_score, score_changed, moment_type) to find moments matching a game-state condition.

**Data sources:** `ocrKeyMoments` (sets, game_score, score_before/score_after via context enrichment, moment_type, serving)

### 1.4 Visual/Scene-Type Search

**Prompt example:** "Find all press conference segments" or "Find all replay sequences"

Uses frame_type classification (live_play, replay, celebration, close_up, graphics) to locate scene types across the archive.

**Data sources:** `ocrKeyMoments` (frame_type)

### 1.5 Multi-Criteria Filtered Search

**Prompt example:** "Alcaraz aces at Wimbledon 2025, sorted by audio energy"

Combines player + competition + moment_type + custom sorting. Agent translates natural language into structured filters.

**Data sources:** All moment fields + audio_energy for sorting

### 1.6 Similarity Search

**Prompt example:** "Find moments similar to this one" (given a timestamp or moment)

Agent matches on combination of moment_type, score_state, audio_energy profile, sport, and importance level to surface analogous moments across the archive.

**Data sources:** `ocrKeyMoments` (all fields), context enrichment data (audio-curve.json)

### 1.7 Temporal Proximity Search

**Prompt example:** "What happened in the 5 minutes before this red card?"

Uses moment boundaries and context enrichment data to reconstruct the sequence of events around a given moment.

**Data sources:** `ocrKeyMoments` (startTime/endTime), context enrichment (transcript.json, audio-curve.json, frames)

---

## Layer 2 — Analysis & Insight

The agent reasons over what it found. Turns raw moments into editorial intelligence.

### 2.1 Match Narrative Summary

**Prompt example:** "Summarize this match"

Agent reads all key moments chronologically, tracks score progression, and generates a structured narrative: key turning points, momentum shifts, final result. Can produce different lengths (one-liner, paragraph, full recap).

**Data sources:** `ocrKeyMoments` (full list, chronological), score progression, moment labels

### 2.2 Cross-Match Story Arc Detection

**Prompt example:** "What's the story of this tournament so far for Sinner?"

Agent pulls all moments mentioning a player across multiple assets in a date/competition range, orders them chronologically, and builds a narrative arc: early rounds comfortable wins, quarterfinal saved match points, semifinal comeback. Uses moment labels, scores, and importance — not per-player statistics.

**Data sources:** Cross-asset moment search by player + competition + date, moment labels, scores, importance

### 2.3 Moment Importance Ranking

**Prompt example:** "What are the 10 most dramatic moments from this tournament?"

Agent scores moments using audio_energy, importance classification, score_state (was it a deciding point?), and moment_type priority. Returns a ranked list with justification.

**Data sources:** `ocrKeyMoments` (importance, audio_energy, moment_type), moment_type priority map

### 2.4 Trend Detection

**Prompt example:** "Are there more red cards in Ligue 1 this season compared to last?"

Agent counts and compares moment types, player actions, or transcript keyword frequency across time periods. Surfaces patterns the journalist might not have noticed.

**Data sources:** Cross-archive moment_type aggregation, transcript keyword frequency, asset dates

### 2.5 Controversy & Key Decision Identification

**Prompt example:** "Flag all disputed referee decisions from this weekend's matches"

Agent looks for moment_types like challenge, VAR mentions in transcript, high audio_energy combined with graphics/replay frame_types — indicators of controversial moments.

**Data sources:** `ocrKeyMoments` (moment_type: challenge), transcript keywords (VAR, referee, foul, penalty), frame_type (graphics, replay), audio_energy

### 2.6 Momentum & Turning Point Detection

**Prompt example:** "When did the momentum shift in this match?"

Agent analyzes score progression, break sequences, and audio energy curves to identify inflection points where the match dynamic changed.

**Data sources:** `ocrKeyMoments` (chronological score data, moment_type sequences), context enrichment (audio-curve.json)

### 2.7 Editorial Angle Suggestion

**Prompt example:** "I need to write about tonight's PSG match — what angles do I have?"

Agent reviews all moments, scores, transcript keywords, and moment types and proposes 3-5 editorial angles with supporting evidence: "Late equalizer drama — 88th minute goal", "Defensive collapse — 3 goals in 12 minutes", "VAR controversy — two overturned decisions". Each angle comes with the specific moments that support it.

**Data sources:** All moment data + transcript + audio energy for a given asset

### 2.8 Moment Clustering & Pattern Recognition

**Prompt example:** "What types of moments dominate in this match compared to the average?"

Agent groups a match's moments by type and compares the distribution against the archive baseline for that sport. Surfaces anomalies: "4x more tiebreaks than average", "Unusually high number of challenges", "Very few replays — mostly continuous live play". Helps journalists quickly understand what made a match atypical.

**Data sources:** Single-asset moment distribution vs. archive-wide moment distribution per sport

---

## Layer 3 — Generation & Assembly

The agent produces output the journalist can use directly. Highlights, compilations, and editorial drafts.

### 3.1 Automated Highlight Reel Assembly

**Prompt example:** "Make me a 3-minute highlight reel of today's final"

Agent selects moments by importance ranking + audio energy, respects temporal order, uses startTime/endTime boundaries for in/out points, avoids duplicate replays, and produces an ordered edit list with timecodes. Journalist previews and adjusts before export.

**Data sources:** `ocrKeyMoments` (importance, audio_energy, startTime, endTime, frame_type), moment_type priority

**Output:** Ordered list of {assetId, inPoint, outPoint, label, duration} entries

### 3.2 Themed Compilation Across Assets

**Prompt example:** "All goals scored in Ligue 1 matchday 28"

Agent searches across the archive for matching moment_type + competition + date range, collects moments from multiple assets, orders them (by time, by drama, by team — journalist's choice), and outputs a multi-asset edit list.

**Data sources:** Cross-asset moment search, all moment fields

**Output:** Multi-asset edit list with source asset references

### 3.3 Story Package Assembly

**Prompt example:** "Build me a news segment on the Djokovic injury: the moment it happened, the medical timeout, and any post-match press conference quotes"

Agent finds related moments across potentially different assets (match footage + press conference), sequences them into a narrative structure, and includes transcript excerpts the journalist can use as voiceover script or quotes.

**Data sources:** Cross-asset search (match + press conference assets), moments, transcript segments

**Output:** Sequenced edit list + transcript excerpts for voiceover/quotes

### 3.4 Customizable Highlight Rules

**Prompt example:** "For every Ligue 1 match this weekend, generate a 90-second highlight package: goals only, chronological order"

Journalist defines a reusable template (sport, moment_types to include, max duration, ordering logic). Agent applies it automatically to matching assets as they're ingested or on-demand for a batch.

**Data sources:** Template definition + matching assets + moments

**Output:** One edit list per matching asset, following template rules

### 3.5 Social Media Clip Selection

**Prompt example:** "Pick the 3 most shareable moments from this match for our social accounts"

Agent optimizes for different criteria than a traditional highlight: short duration, high visual drama (celebration frame_types, high audio energy), self-contained narrative (the moment makes sense without context). Returns clips with suggested durations optimized for platform constraints (15s for stories, 60s for posts).

**Data sources:** `ocrKeyMoments` (frame_type, audio_energy, importance, startTime/endTime), moment labels

**Output:** Ranked clip suggestions with {inPoint, outPoint, suggestedDuration, platform, rationale}

### 3.6 Transcript-to-Article Draft

**Prompt example:** "Write a match report draft from this broadcast"

Agent uses the chronological moment list, score progression, transcript quotes from commentary, and editorial angles (from Layer 2) to generate a structured article draft: intro, key moments narrative, turning points, result, notable quotes. Journalist edits and publishes.

**Data sources:** All moment data + transcript + Layer 2 analysis outputs

**Output:** Structured text (markdown or HTML) with embedded moment references

### 3.7 Quote Extraction & Attribution

**Prompt example:** "Pull all usable quotes from this press conference"

Agent scans transcript for direct speech patterns, attributes them to speakers where possible (using OCR player detection or transcript cues), and returns a list of quotable excerpts with timestamps for verification.

**Data sources:** Transcript segments, OCR player detection

**Output:** List of {quote, speaker, timestamp, assetId}

### 3.8 Comparison Highlight

**Prompt example:** "Show me a side-by-side of how both semifinalists won their quarterfinals"

Agent finds matching moments from two assets (e.g., match point of each quarterfinal) and produces a paired edit list — useful for preview packages before a big match.

**Data sources:** Cross-asset moment matching by moment_type + competition context

**Output:** Paired edit list with {assetA, assetB, momentType, inPoint, outPoint} per pair

### 3.9 Moment Annotation & Enrichment

**Prompt example:** "Add context to each moment in this match: what was the score, what set, who was serving, why it mattered"

Agent takes the raw moment list and enriches each entry with contextual narration using score_before/score_after, moment_type significance, and surrounding transcript. Produces annotated moment cards the journalist can use in a CMS or social post.

**Data sources:** `ocrKeyMoments` + context enrichment (context.json, transcript.json)

**Output:** Annotated moment cards with {timestamp, label, contextNarration, score, significance}

---

## Layer 4 — Monitoring & Automation

The agent works proactively — watching for conditions and reducing manual triage.

### 4.1 Ingest-Time Auto-Highlight

When a new asset finishes pipeline processing, agent automatically generates a default highlight package (top moments by importance + audio energy) and notifies the editorial desk. Ready to review when the journalist opens the asset.

**Trigger:** Asset status transitions to 'ready' with OCR moments available
**Data sources:** `ocrKeyMoments` for the newly processed asset
**Output:** Pre-generated edit list stored alongside the asset

### 4.2 Daily/Weekly Editorial Digest

Every morning, agent produces a summary of what was ingested: number of new assets, top moments across all content, suggested editorial angles, any anomalies (unusually dramatic match, high volume of a specific event type). Delivered as a briefing the desk can scan in 2 minutes.

**Trigger:** Scheduled (daily or weekly)
**Data sources:** All assets ingested in the period, their moments and metadata
**Output:** Structured digest (text or rendered report)

### 4.3 Archive Gap Detection

**Prompt example:** "Do we have full coverage of Roland Garros 2025?"

Agent cross-references ingested assets against expected coverage (tournament schedule, known match dates) and flags what's missing. Helps archive managers ensure completeness.

**Data sources:** Asset metadata (competition, dates, players), external schedule data (provided by journalist or imported)
**Output:** Coverage matrix with gaps highlighted

---

## Future Additions

- **Expiry & Rights Reminder (4.9):** If assets have date-based custom fields (broadcast rights expiry, embargo dates), agent monitors upcoming deadlines and alerts the team. Requires custom field conventions to be established first.

---

## Implementation Priority

Layers are designed to be built incrementally:

1. **Layer 1** first — search is the most immediate value and validates the data model
2. **Layer 2** next — analysis builds on search and produces the intelligence that Layer 3 needs
3. **Layer 3** follows — generation and assembly are the highest editorial value but need Layers 1+2
4. **Layer 4** last — automation requires all other layers to be stable

Within each layer, use cases marked with existing pipeline data sources can be built first; those requiring new data or cross-asset capabilities come second.
