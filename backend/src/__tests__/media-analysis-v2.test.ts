import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inferPlayersFromTranscript } from '../lib/media-analysis-v2/asset-profile.js';
import { addScoreConfirmationEvidence } from '../lib/media-analysis-v2/score-confirmation.js';
import { annotateEventReliability } from '../lib/media-analysis-v2/event-reliability.js';
import { classifySegments } from '../lib/media-analysis-v2/segment-classifier.js';
import { generateInitialEvents } from '../lib/media-analysis-v2/event-candidates.js';
import { validateAndNormalizeEvents } from '../lib/media-analysis-v2/event-validation.js';
import { linkRelatedEvents } from '../lib/media-analysis-v2/event-linking.js';
import { mergeAdjacentSegments, shouldValidateSegment } from '../lib/media-analysis-v2/segment-validation.js';
import { hasScoreCue, includesAnyKeyword, inferSportFromText } from '../lib/media-analysis-v2/sports-keywords.js';
import { loadMediaAnalysisResult, loadMediaAnalysisSummary, saveMediaAnalysisResult } from '../lib/media-analysis-v2/storage.js';
import type { AssetProfile, MediaAnalysisResult, TimelineIndex } from '../lib/media-analysis-v2/types.js';

const sportsProfile: AssetProfile = {
  domain: 'sports',
  format: 'mixed_broadcast',
  sport: 'football',
  competition: 'Premier League',
  teams: ['Team A', 'Team B'],
  players: [],
  confidence: 0.8,
  evidence: [],
};

describe('media-analysis-v2 asset profiling', () => {
  it('infers likely tennis participants from transcript frequency while penalizing bracket context', () => {
    const text = [
      'Djokovic serves at 30-40 and Alcaraz steps inside the baseline.',
      'Brilliant from Djokovic as Alcaraz pushes the return long.',
      'Alcaraz has made Djokovic play one extra ball in every rally.',
      'Yannick Sinner awaits the winner of this match in the final tomorrow.',
      'Djokovic leads Alcaraz by a set.',
    ].join(' ');

    expect(inferPlayersFromTranscript(text, 'tennis')).toEqual(['Alcaraz', 'Djokovic']);
  });

  it('does not infer tennis players for non-tennis assets', () => {
    expect(inferPlayersFromTranscript('Djokovic and Alcaraz are mentioned in passing', 'football')).toEqual([]);
  });
});

describe('media-analysis-v2 segment classification', () => {
  it('classifies sports action, replay, and commentary insert into separate spans', () => {
    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Goal for Team A and the crowd erupts',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.95,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: false,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 1,
          start: 5,
          end: 10,
          transcriptText: 'Let us see that again in replay',
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.6,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: false,
          hasReplayCue: true,
          hasScoreCue: false,
        },
        {
          index: 2,
          start: 10,
          end: 15,
          transcriptText: 'Back on camera with the commentator on the touchline',
          transcriptSegments: [],
          speechDensity: 0.8,
          audioEnergy: 0.2,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
      ],
    };

    const segments = classifySegments(timelineIndex, sportsProfile);

    expect(segments).toHaveLength(3);
    expect(segments[0].type).toBe('live_play');
    expect(segments[1].type).toBe('replay');
    expect(segments[2].type).toBe('commentator_insert');
  });

  it('keeps generic live-match booth commentary as live_play instead of commentator_insert', () => {
    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'What a start from the young Spaniard and now Djokovic settles things down with a strong hold',
          transcriptSegments: [],
          speechDensity: 0.82,
          audioEnergy: 0.31,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
      ],
    };

    const segments = classifySegments(timelineIndex, {
      ...sportsProfile,
      sport: 'tennis',
      format: 'live_match',
    });

    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('live_play');
  });
});

describe('media-analysis-v2 initial events', () => {
  it('creates quote events for interview spans and sports events for live play', () => {
    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'What a goal from Team A',
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.9,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: false,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 1,
          start: 5,
          end: 10,
          transcriptText: 'It means everything to score tonight and help the team',
          transcriptSegments: [],
          speechDensity: 0.9,
          audioEnergy: 0.2,
          hasQuestionCue: false,
          hasInterviewCue: true,
          hasCommentaryCue: false,
          hasReplayCue: false,
          hasScoreCue: false,
        },
      ],
    };

    const segments = [
      {
        id: 'segment_0',
        start: 0,
        end: 5,
        type: 'live_play' as const,
        subtype: null,
        speechMode: 'commentary' as const,
        scoreboardPresent: true,
        participants: [],
        confidence: 0.8,
        sourceWindowIndexes: [0],
        evidence: [],
      },
      {
        id: 'segment_1',
        start: 5,
        end: 10,
        type: 'player_interview' as const,
        subtype: null,
        speechMode: 'interview_answer' as const,
        scoreboardPresent: false,
        participants: [],
        confidence: 0.8,
        sourceWindowIndexes: [1],
        evidence: [],
      },
    ];

    const events = generateInitialEvents(sportsProfile, timelineIndex, segments);

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('goal');
    expect(events[1].type).toBe('quote');
  });

  it('maps tennis scoring language to specific tennis-safe event types instead of football labels', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      competition: 'Nitto ATP Finals',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'First break points of the evening saved',
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.86,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 1,
          start: 5,
          end: 10,
          transcriptText: 'Three set points for the six-time champion',
          transcriptSegments: [],
          speechDensity: 0.45,
          audioEnergy: 0.72,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 10,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 1],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('point_won');
    expect(events[1].type).toBe('pressure_state');
    expect(events[0].label.toLowerCase()).not.toContain('goal! goal!');
  });

  it('separates tennis pressure-state narration from completed point outcomes', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      competition: 'Nitto ATP Finals',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Three set points for the six-time champion',
          transcriptSegments: [],
          speechDensity: 0.45,
          audioEnergy: 0.72,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 2,
          start: 10,
          end: 15,
          transcriptText: 'The break point is saved after the forehand drifts wide',
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.84,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 4,
          start: 20,
          end: 25,
          transcriptText: 'Djokovic, too good in Turin this time. 6-3, 6-2.',
          transcriptSegments: [],
          speechDensity: 0.43,
          audioEnergy: 0.7,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 25,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 2, 4],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events.map((event) => event.type)).toEqual([
      'pressure_state',
      'point_won',
      'match_won',
    ]);
  });

  it('emits set_won for terminal set language even without a scoreboard cue', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      competition: 'Nitto ATP Finals',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'He has a one set lead to show for his effort six three',
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.39,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('set_won');
  });

  it('drops low-value tennis pressure-state chatter without current event evidence', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      competition: 'Nitto ATP Finals',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Deuce',
          transcriptSegments: [],
          speechDensity: 0.2,
          audioEnergy: 0.81,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 2,
          start: 10,
          end: 15,
          transcriptText: 'So far a player who has had a look at a couple of break points',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.79,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 4,
          start: 20,
          end: 25,
          transcriptText: 'Break point for Djokovic',
          transcriptSegments: [],
          speechDensity: 0.35,
          audioEnergy: 0.73,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 6,
          start: 30,
          end: 35,
          transcriptText: 'Break point saved, back to deuce',
          transcriptSegments: [],
          speechDensity: 0.38,
          audioEnergy: 0.74,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 8,
          start: 40,
          end: 45,
          transcriptText: 'Advantage Djokovic',
          transcriptSegments: [],
          speechDensity: 0.3,
          audioEnergy: 0.68,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 25,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 2, 4, 6, 8],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(3);
    expect(events.map((event) => event.type)).toEqual([
      'pressure_state',
      'pressure_state',
      'pressure_state',
    ]);
    expect(events.map((event) => event.label)).toEqual([
      'Break point for Djokovic',
      'Break point saved, back to deuce',
      'Advantage Djokovic',
    ]);
  });

  it('recovers medium-signal tennis points when live-play context and support are present', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      competition: 'Nitto ATP Finals',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Long exchange from the baseline and the backhand forces the error at deuce',
          transcriptSegments: [],
          speechDensity: 0.52,
          audioEnergy: 0.76,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.88,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('point_won');
  });

  it('keeps completed tennis point outcomes as point_won even when they produce advantage', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      competition: 'Nitto ATP Finals',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Brilliant backhand winner from Djokovic to bring up advantage',
          transcriptSegments: [],
          speechDensity: 0.48,
          audioEnergy: 0.82,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.88,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('point_won');
  });

  it('keeps pure advantage transition narration as pressure_state when no completed outcome is stated', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      competition: 'Nitto ATP Finals',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Advantage Djokovic after saving it',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.73,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.88,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pressure_state');
  });

  it('still rejects weak generic tennis narration without score or audio support', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      competition: 'Nitto ATP Finals',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Rally from the baseline with a forehand backhand pattern developing',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.41,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.88,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(0);
  });

  it('collapses consecutive live-play windows of the same sports event type', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'What a rally from Djokovic, brilliant overhead winner',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 1,
          start: 5,
          end: 10,
          transcriptText: 'What a rally from Djokovic, brilliant overhead winner',
          transcriptSegments: [],
          speechDensity: 0.45,
          audioEnergy: 0.9,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 10,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 1],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('point_won');
    expect(events[0].anchorTime).toBe(7.5);
    expect(events[0].label.toLowerCase()).toContain('brilliant overhead winner');
  });

  it('collapses adjacent commentator analysis windows into one analysis_point', () => {
    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Djokovic is trying to rush the forehand and Alcaraz is making him play one extra ball every rally',
          transcriptSegments: [],
          speechDensity: 0.92,
          audioEnergy: 0.24,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
        {
          index: 1,
          start: 5,
          end: 10,
          transcriptText: 'You can see the same pattern again because Alcaraz is keeping the point alive and forcing the error',
          transcriptSegments: [],
          speechDensity: 0.9,
          audioEnergy: 0.21,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 10,
      type: 'commentator_insert' as const,
      subtype: 'analysis',
      speechMode: 'commentary' as const,
      scoreboardPresent: false,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.82,
      sourceWindowIndexes: [0, 1],
      evidence: [],
    }];

    const events = generateInitialEvents({
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    }, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('analysis_point');
    expect(events[0].startTime).toBe(0);
    expect(events[0].endTime).toBe(10);
  });

  it('uses transcript segment boundaries to tighten tennis event timing when available', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Crowd rises. Djokovic wins the point with a forehand winner.',
          transcriptSegments: [
            { start: 0.2, end: 1.1, text: 'Crowd rises.' },
            { start: 2.1, end: 3.7, text: 'Djokovic wins the point with a forehand winner.' },
          ],
          speechDensity: 0.48,
          audioEnergy: 0.86,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.91,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('point_won');
    expect(events[0].startTime).toBe(2.1);
    expect(events[0].endTime).toBe(3.7);
    expect(events[0].anchorTime).toBe(2.9);
    expect(events[0].peakTime).toBe(2.9);
  });

  it('keeps short transcript timing cues intact when they cross a window boundary', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 1,
          start: 5,
          end: 10,
          transcriptText: 'Djokovic saves the second break point.',
          transcriptSegments: [
            { start: 4.96, end: 5.52, text: 'Djokovic saves the second break point.' },
          ],
          speechDensity: 0.45,
          audioEnergy: 0.78,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_1',
      start: 5,
      end: 10,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.91,
      sourceWindowIndexes: [1],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('point_won');
    expect(events[0].startTime).toBe(4.96);
    expect(events[0].endTime).toBe(5.52);
    expect(events[0].anchorTime).toBe(5.24);
  });

  it('does not emit analysis_point for weak commentator filler', () => {
    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Welcome back with us here tonight as we look ahead to what could happen next',
          transcriptSegments: [],
          speechDensity: 0.88,
          audioEnergy: 0.18,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'commentator_insert' as const,
      subtype: 'analysis',
      speechMode: 'commentary' as const,
      scoreboardPresent: false,
      participants: [],
      confidence: 0.8,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(sportsProfile, timelineIndex, segments);

    expect(events).toHaveLength(0);
  });

  it('does not emit a live sports event from replay-style transcript text', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Take another look at that brilliant point from Djokovic.',
          transcriptSegments: [
            { start: 0.8, end: 4.1, text: 'Take another look at that brilliant point from Djokovic.' },
          ],
          speechDensity: 0.66,
          audioEnergy: 0.88,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: true,
          hasScoreCue: false,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.86,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(0);
  });

  it('keeps strong tennis outcome language as point_won', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'What a forehand, point of the match so far and Djokovic comes out on top',
          transcriptSegments: [],
          speechDensity: 0.48,
          audioEnergy: 0.88,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('point_won');
  });

  it('does not emit point_won for weak generic tennis rally chatter', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Heavy forehand crosscourt rally from the baseline as they settle into the exchange',
          transcriptSegments: [],
          speechDensity: 0.42,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(0);
  });

  it('emits point_won for subtle tennis language when score or audio support is strong', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Brilliant from Alcaraz at the end of a long exchange',
          transcriptSegments: [],
          speechDensity: 0.46,
          audioEnergy: 0.87,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('point_won');
  });

  it('treats goal-only tennis transcript text as noise', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Goal! Goal! Goal!',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.9,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(0);
  });

  it('ignores goal noise in tennis labels while preserving supported tennis point evidence', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Goal! What a rally! Maybe that sort of tennis will get him going.',
          transcriptSegments: [],
          speechDensity: 0.45,
          audioEnergy: 0.88,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('point_won');
    expect(events[0].label).toBe('What a rally! Maybe that sort of tennis will get him going.');
  });

  it('drops tennis bracket-context winner language while keeping shot winners', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Yannick Sinner awaits the winner of this match',
          transcriptSegments: [],
          speechDensity: 0.45,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 2,
          start: 10,
          end: 15,
          transcriptText: 'Forehand winner down the line from Djokovic',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.81,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 15,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 2],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('point_won');
    expect(events[0].label).toBe('Forehand winner down the line from Djokovic');
  });

  it('drops non-participant-only tennis context when participants are known', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Federer leading that race with ten finals',
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 2,
          start: 10,
          end: 15,
          transcriptText: 'Djokovic will face Sinner if he wins this match',
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 15,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 2],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(0);
  });

  it('does not infer ace from race or face substrings', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Federer leading that race with ten',
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 2,
          start: 10,
          end: 15,
          transcriptText: 'He has got his first break points to face',
          transcriptSegments: [],
          speechDensity: 0.45,
          audioEnergy: 0.78,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 4,
          start: 20,
          end: 25,
          transcriptText: 'An ace down the T from Djokovic',
          transcriptSegments: [],
          speechDensity: 0.3,
          audioEnergy: 0.84,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 25,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 2, 4],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.type)).toEqual(['pressure_state', 'ace']);
    expect(events[1].label).toBe('An ace down the T from Djokovic');
  });

  it('drops historical record context that says wins this match', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Lendl made nine, so he would draw alongside Lendl. He wins this match. Federer leading that race with ten.',
          transcriptSegments: [],
          speechDensity: 0.7,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 2,
          start: 10,
          end: 15,
          transcriptText: 'Djokovic, too good in Turin this time. 6-3, 6-2.',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.72,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 15,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 2],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('match_won');
    expect(events[0].label).toBe('Djokovic, too good in Turin this time. 6-3, 6-2.');
  });

  it('dedupes same-type semantic repeats without deleting close cross-type events', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'First break points of the evening saved',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.84,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 1,
          start: 5,
          end: 10,
          transcriptText: 'First break points of the evening saved',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.86,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 4,
          start: 20,
          end: 25,
          transcriptText: 'An ace down the T from Djokovic',
          transcriptSegments: [],
          speechDensity: 0.3,
          audioEnergy: 0.88,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 5,
          start: 25,
          end: 30,
          transcriptText: 'Game Djokovic',
          transcriptSegments: [],
          speechDensity: 0.2,
          audioEnergy: 0.78,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 30,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 1, 4, 5],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events.map((event) => event.type)).toEqual(['point_won', 'ace', 'game_won']);
  });

  it('dedupes same-type semantic repeats across adjacent segments', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Chilster drops wide. First break points of the evening saved.',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.7,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 1,
          start: 5,
          end: 10,
          transcriptText: 'First break points of the evening saved.',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.9,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [
      {
        id: 'segment_0',
        start: 0,
        end: 5,
        type: 'live_play' as const,
        subtype: null,
        speechMode: 'commentary' as const,
        scoreboardPresent: true,
        participants: ['Alcaraz', 'Djokovic'],
        confidence: 0.9,
        sourceWindowIndexes: [0],
        evidence: [],
      },
      {
        id: 'segment_1',
        start: 5,
        end: 10,
        type: 'live_play' as const,
        subtype: null,
        speechMode: 'commentary' as const,
        scoreboardPresent: true,
        participants: ['Alcaraz', 'Djokovic'],
        confidence: 0.9,
        sourceWindowIndexes: [1],
        evidence: [],
      },
    ];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].label).toBe('First break points of the evening saved.');
  });

  it('dedupes adjacent recap-style point narration across segments', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Djokovic wins the point with a brilliant backhand winner',
          transcriptSegments: [],
          speechDensity: 0.44,
          audioEnergy: 0.84,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 1,
          start: 5,
          end: 10,
          transcriptText: 'What a point that was from Djokovic, brilliant from the baseline',
          transcriptSegments: [],
          speechDensity: 0.43,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [
      {
        id: 'segment_0',
        start: 0,
        end: 5,
        type: 'live_play' as const,
        subtype: null,
        speechMode: 'commentary' as const,
        scoreboardPresent: true,
        participants: ['Alcaraz', 'Djokovic'],
        confidence: 0.9,
        sourceWindowIndexes: [0],
        evidence: [],
      },
      {
        id: 'segment_1',
        start: 5,
        end: 10,
        type: 'live_play' as const,
        subtype: null,
        speechMode: 'commentary' as const,
        scoreboardPresent: true,
        participants: ['Alcaraz', 'Djokovic'],
        confidence: 0.9,
        sourceWindowIndexes: [1],
        evidence: [],
      },
    ];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].label).toBe('Djokovic wins the point with a brilliant backhand winner');
  });

  it('focuses tennis labels on the event-bearing sentence', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: "drama and the tension aren't we? Opening game break point saved for service.",
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 2,
          start: 10,
          end: 15,
          transcriptText: 'All of a sudden, 15-30 becomes 15-40, and he has got his first break points to face.',
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 15,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 2],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events.map((event) => event.label)).toEqual([
      'Opening game break point saved for service.',
      'All of a sudden, 15-30 becomes 15-40, and he has got his first break points...',
    ]);
  });

  it('keeps strong tennis point-quality recap but drops pure stat context', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Djokovic average forehand speed was 141 kilometers an hour.',
          transcriptSegments: [],
          speechDensity: 0.7,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 2,
          start: 10,
          end: 15,
          transcriptText: 'What a point. let us remind ourselves of the quality of points we have just seen',
          transcriptSegments: [],
          speechDensity: 0.6,
          audioEnergy: 0.83,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 4,
          start: 20,
          end: 25,
          transcriptText: 'Huge point after a brilliant forehand exchange.',
          transcriptSegments: [],
          speechDensity: 0.45,
          audioEnergy: 0.88,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 25,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 2, 4],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.type)).toEqual(['point_won', 'point_won']);
    expect(events.map((event) => event.label)).toEqual([
      'What a point. let us remind ourselves of the quality of points we have just seen',
      'Huge point after a brilliant forehand exchange.',
    ]);
  });

  it('preserves player and score context when focusing tennis labels', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: '30-40. That incredible point. Djokovic average forehand speed was 141 kilometers an hour.',
          transcriptSegments: [],
          speechDensity: 0.7,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].label).toBe('30-40 Djokovic: That incredible point.');
  });

  it('includes previous result fragment for game_won labels when needed', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Breaks for a third time this evening. A game from victory.',
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('game_won');
    expect(events[0].label).toBe('Breaks for a third time; one game from victory');
  });

  it('rewrites clear tennis result labels into compact editorial labels', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'The way in which he saved that second break point of the game Djokovic leads 4 against 2',
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 2,
          start: 10,
          end: 15,
          transcriptText: 'He has a one set lead to show for his effort six three',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.7,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 4,
          start: 20,
          end: 25,
          transcriptText: 'Three set points for the six-time champion',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.75,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 25,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 2, 4],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events.map((event) => event.label)).toEqual([
      'Djokovic saves break point and holds for 4-2',
      'Takes opening set 6-3',
      'Three set points for Djokovic',
    ]);
  });

  it('promotes clear hold outcome plus score lead language to game_won without explicit game wording', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Djokovic saves break point and leads 4 against 2',
          transcriptSegments: [],
          speechDensity: 0.46,
          audioEnergy: 0.81,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('game_won');
    expect(events[0].label).toBe('Djokovic saves break point and holds for 4-2');
  });

  it('keeps generic score-lead narration out of game_won when no outcome language is present', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };

    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Djokovic leads 4 against 2 in this opening set',
          transcriptSegments: [],
          speechDensity: 0.42,
          audioEnergy: 0.77,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 0,
      end: 5,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(0);
  });
});

describe('media-analysis-v2 validation and linking', () => {
  it('validates primary live events and links replay/commentary events back to them', () => {
    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        {
          index: 0,
          start: 0,
          end: 5,
          transcriptText: 'Goal for Team A and the crowd erupts',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.95,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: false,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 1,
          start: 5,
          end: 10,
          transcriptText: 'Take another look at the replay',
          transcriptSegments: [],
          speechDensity: 0.6,
          audioEnergy: 0.45,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: true,
          hasScoreCue: false,
        },
        {
          index: 2,
          start: 10,
          end: 15,
          transcriptText: 'The commentator explains that Team A keeps creating overloads because the midfield runner is dragging defenders out of shape',
          transcriptSegments: [],
          speechDensity: 0.9,
          audioEnergy: 0.2,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
      ],
    };

    const segments = [
      {
        id: 'segment_0',
        start: 0,
        end: 5,
        type: 'live_play' as const,
        subtype: null,
        speechMode: 'commentary' as const,
        scoreboardPresent: true,
        participants: [],
        confidence: 0.85,
        sourceWindowIndexes: [0],
        evidence: [],
      },
      {
        id: 'segment_1',
        start: 5,
        end: 10,
        type: 'replay' as const,
        subtype: null,
        speechMode: 'commentary' as const,
        scoreboardPresent: true,
        participants: [],
        confidence: 0.8,
        sourceWindowIndexes: [1],
        evidence: [],
      },
      {
        id: 'segment_2',
        start: 10,
        end: 15,
        type: 'commentator_insert' as const,
        subtype: 'analysis',
        speechMode: 'commentary' as const,
        scoreboardPresent: false,
        participants: [],
        confidence: 0.8,
        sourceWindowIndexes: [2],
        evidence: [],
      },
    ];

    const candidates = generateInitialEvents(sportsProfile, timelineIndex, segments);
    const validated = validateAndNormalizeEvents(candidates, {
      assetProfile: sportsProfile,
      timelineIndex,
      segments,
    });
    const linked = linkRelatedEvents(validated, segments);

    const primary = linked.find((event) => event.relationType === 'primary');
    const replay = linked.find((event) => event.relationType === 'replay_of');
    const commentary = linked.find((event) => event.relationType === 'commentary_on');

    expect(primary?.validationStatus).toBe('validated');
    expect(replay?.parentEventId).toBe(primary?.id);
    expect(commentary?.parentEventId).toBe(primary?.id);
  });

  it('adds heuristic tennis sequence links without deleting events', () => {
    const events = linkRelatedEvents([
      {
        id: 'event_0',
        segmentId: 'segment_0',
        type: 'pressure_state',
        label: 'three set points for Djokovic',
        anchorTime: 100,
        peakTime: null,
        startTime: 100,
        endTime: 105,
        importance: 70,
        confidence: 0.8,
        entities: ['Djokovic', 'Alcaraz'],
        evidence: [{ type: 'transcript', ref: 'window:20' }],
        parentEventId: null,
        validationStatus: 'validated',
        relationType: 'primary',
      },
      {
        id: 'event_1',
        segmentId: 'segment_1',
        type: 'set_won',
        label: 'Djokovic takes the opening set 6-3',
        anchorTime: 135,
        peakTime: null,
        startTime: 135,
        endTime: 140,
        importance: 80,
        confidence: 0.8,
        entities: ['Djokovic', 'Alcaraz'],
        evidence: [{ type: 'transcript', ref: 'window:27' }],
        parentEventId: null,
        validationStatus: 'validated',
        relationType: 'primary',
      },
      {
        id: 'event_2',
        segmentId: 'segment_2',
        type: 'point_won',
        label: 'saved that second break point',
        anchorTime: 200,
        peakTime: null,
        startTime: 200,
        endTime: 205,
        importance: 75,
        confidence: 0.8,
        entities: ['Djokovic', 'Alcaraz'],
        evidence: [{ type: 'transcript', ref: 'window:40' }],
        parentEventId: null,
        validationStatus: 'validated',
        relationType: 'primary',
      },
      {
        id: 'event_3',
        segmentId: 'segment_2',
        type: 'game_won',
        label: 'saved that second break point of the game Djokovic leads 4-2',
        anchorTime: 205,
        peakTime: null,
        startTime: 205,
        endTime: 210,
        importance: 80,
        confidence: 0.8,
        entities: ['Djokovic', 'Alcaraz'],
        evidence: [{ type: 'transcript', ref: 'window:41' }],
        parentEventId: null,
        validationStatus: 'validated',
        relationType: 'primary',
      },
    ], []);

    expect(events).toHaveLength(4);
    expect(events[0].relationType).toBe('leads_to');
    expect(events[0].parentEventId).toBe('event_1');
    expect(events[2].relationType).toBe('confirms');
    expect(events[2].parentEventId).toBe('event_3');
    expect(events[0].evidence.at(-1)?.type).toBe('heuristic');
    expect(events[2].evidence.at(-1)?.type).toBe('heuristic');
  });

  it('adds optional OCR score confirmation evidence when moment context is available', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-confirm-'));
    const momentDir = resolve(assetDir, 'moments', '0');
    await mkdir(momentDir, { recursive: true });
    await writeFile(resolve(momentDir, 'context.json'), JSON.stringify({
      label: 'Djokovic wins Set 1 6-3',
      score: '6-3',
      scoreBefore: '5-3',
      scoreAfter: '6-3',
      scoreChanged: true,
      peakTime: 102,
      set_period: 'Set 1',
      audioEnergy: 0.82,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'set_won',
      label: 'Takes opening set 6-3',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 80,
      confidence: 0.8,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{ type: 'transcript', ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(events[0].evidence).toHaveLength(2);
    expect(events[0].evidence[1].type).toBe('ocr_context');
    expect(events[0].evidence[1].ref).toBe('ocr-context:0');
    expect(events[0].evidence[1].status).toBe('supports');
    expect(events[0].confidence).toBe(0.95);
    expect(events[0].evidence[1].metadata).toMatchObject({
      label: 'Djokovic wins Set 1 6-3',
      score: '6-3',
      scoreBefore: '5-3',
      scoreAfter: '6-3',
      scoreChanged: true,
      scoreTransitionStatus: 'supports_result',
      peakTime: 102,
      setPeriod: 'Set 1',
      audioEnergy: 0.82,
    });
    expect(events[0].evidence[1].note).toContain('OCR supports: Djokovic wins Set 1 6-3');
    expect(events[0].evidence[1].note).toContain('score=6-3');
  });

  it('uses OCR score transitions to support result events when labels are generic', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-transition-result-'));
    const momentDir = resolve(assetDir, 'moments', '0');
    await mkdir(momentDir, { recursive: true });
    await writeFile(resolve(momentDir, 'context.json'), JSON.stringify({
      label: 'Score update after long service game',
      score: '4-2',
      scoreBefore: '3-2 (40-30)',
      scoreAfter: '4-2',
      scoreChanged: true,
      peakTime: 102,
      set_period: 'Set 2',
      audioEnergy: 0.7,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'game_won',
      label: 'Djokovic holds for 4-2',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 80,
      confidence: 0.78,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{ type: 'transcript', ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(events[0].evidence).toHaveLength(2);
    expect(events[0].evidence[1].status).toBe('supports');
    expect(events[0].evidence[1].confidence).toBeGreaterThanOrEqual(0.72);
    expect(events[0].confidence).toBeGreaterThan(0.78);
    expect(events[0].evidence[1].metadata?.scoreTransitionStatus).toBe('supports_result');
    expect(events[0].evidence[1].metadata?.selectedBy).toBe('transition_match');
    expect(events[0].evidence[1].note).toContain('transition=supports_result');
    expect(events[0].evidence[1].note).toContain('selectedBy=transition_match');
  });

  it('prefers OCR score-transition matches over nearby label-only context', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-rank-transition-'));
    const closeMomentDir = resolve(assetDir, 'moments', '0');
    const transitionMomentDir = resolve(assetDir, 'moments', '1');
    await mkdir(closeMomentDir, { recursive: true });
    await mkdir(transitionMomentDir, { recursive: true });
    await writeFile(resolve(closeMomentDir, 'context.json'), JSON.stringify({
      label: 'Djokovic holds serve',
      scoreChanged: false,
      peakTime: 101,
      set_period: 'Set 2',
      audioEnergy: 0.7,
    }), 'utf-8');
    await writeFile(resolve(transitionMomentDir, 'context.json'), JSON.stringify({
      label: 'Score update after long service game',
      score: '4-2',
      scoreBefore: '3-2 (40-30)',
      scoreAfter: '4-2',
      scoreChanged: true,
      peakTime: 126,
      set_period: 'Set 2',
      audioEnergy: 0.7,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'game_won',
      label: 'Djokovic holds for 4-2',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 80,
      confidence: 0.78,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{ type: 'transcript', ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(events[0].evidence[1].ref).toBe('ocr-context:1');
    expect(events[0].evidence[1].metadata?.selectedBy).toBe('transition_match');
    expect(events[0].evidence[1].metadata?.scoreTransitionStatus).toBe('supports_result');
  });

  it('does not let stale pressure-score context outrank a valid OCR label match', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-rank-stale-score-'));
    const staleMomentDir = resolve(assetDir, 'moments', '0');
    const labelMomentDir = resolve(assetDir, 'moments', '1');
    await mkdir(staleMomentDir, { recursive: true });
    await mkdir(labelMomentDir, { recursive: true });
    await writeFile(resolve(staleMomentDir, 'context.json'), JSON.stringify({
      label: 'Djokovic has break point',
      score: '3-2 (30-40)',
      scoreBefore: '3-2 (30-40)',
      scoreAfter: '3-2 (30-40)',
      scoreChanged: false,
      peakTime: 101,
      set_period: 'Set 2',
      audioEnergy: 0.82,
    }), 'utf-8');
    await writeFile(resolve(labelMomentDir, 'context.json'), JSON.stringify({
      label: 'Djokovic holds service game',
      scoreChanged: false,
      peakTime: 115,
      set_period: 'Set 2',
      audioEnergy: 0.68,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'game_won',
      label: 'Djokovic holds for 4-2',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 80,
      confidence: 0.78,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{ type: 'transcript', ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(events[0].evidence[1].ref).toBe('ocr-context:1');
    expect(events[0].evidence[1].metadata?.selectedBy).toBe('label_match');
    expect(events[0].evidence[1].metadata?.scoreTransitionStatus).toBe('unknown');
  });

  it('uses OCR point-score transitions to support pressure-state events', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-transition-pressure-'));
    const momentDir = resolve(assetDir, 'moments', '0');
    await mkdir(momentDir, { recursive: true });
    await writeFile(resolve(momentDir, 'context.json'), JSON.stringify({
      label: 'Alcaraz faces break points',
      score: '4-3 (15-40)',
      scoreBefore: '4-3 (15-30)',
      scoreAfter: '4-3 (15-40)',
      scoreChanged: true,
      peakTime: 102,
      set_period: 'Set 1',
      audioEnergy: 0.76,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'pressure_state',
      label: 'Two break points for Djokovic',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 76,
      confidence: 0.78,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{ type: 'transcript', ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(events[0].evidence).toHaveLength(2);
    expect(events[0].evidence[1].status).toBe('supports');
    expect(events[0].evidence[1].metadata?.scoreTransitionStatus).toBe('supports_state');
    expect(events[0].evidence[1].note).toContain('transition=supports_state');
  });

  it('uses a single OCR pressure-score snapshot to support pressure-state events', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-snapshot-pressure-'));
    const momentDir = resolve(assetDir, 'moments', '0');
    await mkdir(momentDir, { recursive: true });
    await writeFile(resolve(momentDir, 'context.json'), JSON.stringify({
      label: 'Alcaraz earns break points',
      scoreBefore: '3-6, 2-5 (15-40)',
      scoreChanged: false,
      peakTime: 102,
      set_period: 'Set 2',
      audioEnergy: 0.66,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'pressure_state',
      label: 'Break points for Alcaraz',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 72,
      confidence: 0.78,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{ type: 'transcript', ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(events[0].evidence).toHaveLength(2);
    expect(events[0].evidence[1].metadata?.scoreTransitionStatus).toBe('supports_state');
  });

  it('uses a single OCR result-score snapshot to support matching result events', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-snapshot-result-'));
    const momentDir = resolve(assetDir, 'moments', '0');
    await mkdir(momentDir, { recursive: true });
    await writeFile(resolve(momentDir, 'context.json'), JSON.stringify({
      label: 'Scoreboard shows completed service game',
      score: '4-2',
      scoreChanged: false,
      peakTime: 102,
      set_period: 'Set 2',
      audioEnergy: 0.7,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'game_won',
      label: 'Djokovic holds for 4-2',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 80,
      confidence: 0.78,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{ type: 'transcript', ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(events[0].evidence).toHaveLength(2);
    expect(events[0].evidence[1].metadata?.scoreTransitionStatus).toBe('supports_result');
  });

  it('uses multi-set OCR score snapshots to support match result events', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-snapshot-match-result-'));
    const momentDir = resolve(assetDir, 'moments', '0');
    await mkdir(momentDir, { recursive: true });
    await writeFile(resolve(momentDir, 'context.json'), JSON.stringify({
      label: 'Djokovic wins match',
      score: '6-3, 6-2',
      scoreChanged: false,
      peakTime: 102,
      set_period: 'Set 2',
      audioEnergy: 0.86,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'match_won',
      label: 'Djokovic wins match 6-3, 6-2',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 95,
      confidence: 0.82,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{ type: 'transcript', ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(events[0].evidence).toHaveLength(2);
    expect(events[0].evidence[1].status).toBe('supports');
    expect(events[0].evidence[1].metadata?.scoreTransitionStatus).toBe('supports_result');
    expect(events[0].evidence[1].metadata?.selectedBy).toBe('transition_match');
  });

  it('does not treat a historical set score plus active point score as set-result support', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-historical-set-score-'));
    const momentDir = resolve(assetDir, 'moments', '0');
    await mkdir(momentDir, { recursive: true });
    await writeFile(resolve(momentDir, 'context.json'), JSON.stringify({
      label: 'Djokovic wins Set 1 6-3',
      score: '3-6, 2-5 (15-40)',
      scoreBefore: '5-3',
      scoreAfter: '3-6, 2-5 (15-40)',
      scoreChanged: false,
      peakTime: 102,
      set_period: 'Set 2',
      audioEnergy: 0.66,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'set_won',
      label: 'Takes opening set 6-3',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 80,
      confidence: 0.78,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{ type: 'transcript', ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(events[0].evidence).toHaveLength(2);
    expect(events[0].evidence[1].status).toBe('weak_support');
    expect(events[0].evidence[1].metadata?.scoreTransitionStatus).toBe('conflicts_result');
    expect(events[0].evidence[1].metadata?.selectedBy).toBe('conflict_match');
  });

  it('keeps result OCR support weak when score context stays in a pressure state', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-transition-conflict-'));
    const momentDir = resolve(assetDir, 'moments', '0');
    await mkdir(momentDir, { recursive: true });
    await writeFile(resolve(momentDir, 'context.json'), JSON.stringify({
      label: 'Djokovic has break point',
      score: '3-2 (30-40)',
      scoreBefore: '3-2 (30-40)',
      scoreAfter: '3-2 (30-40)',
      scoreChanged: false,
      peakTime: 102,
      set_period: 'Set 2',
      audioEnergy: 0.82,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'game_won',
      label: 'Djokovic holds for 4-2',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 80,
      confidence: 0.78,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{ type: 'transcript', ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(events[0].evidence).toHaveLength(2);
    expect(events[0].evidence[1].status).toBe('weak_support');
    expect(events[0].evidence[1].confidence).toBeLessThanOrEqual(0.5);
    expect(events[0].confidence).toBe(0.78);
    expect(events[0].evidence[1].metadata?.scoreTransitionStatus).toBe('conflicts_result');
    expect(events[0].evidence[1].metadata?.selectedBy).toBe('conflict_match');
    expect(events[0].evidence[1].note).toContain('transition=conflicts_result');
  });

  it('marks obvious nearby OCR event-type mismatches as conflicts', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-conflict-'));
    const momentDir = resolve(assetDir, 'moments', '0');
    await mkdir(momentDir, { recursive: true });
    await writeFile(resolve(momentDir, 'context.json'), JSON.stringify({
      label: 'Djokovic wins match',
      score: '6-3, 6-2',
      scoreBefore: '5-2',
      scoreAfter: '6-2',
      scoreChanged: true,
      peakTime: 102,
      set_period: 'Set 2',
      audioEnergy: 0.8,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'set_won',
      label: 'Takes opening set 6-3',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 80,
      confidence: 0.8,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{ type: 'transcript', ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(events[0].evidence).toHaveLength(2);
    expect(events[0].evidence[1].type).toBe('ocr_context');
    expect(events[0].evidence[1].confidence).toBeLessThanOrEqual(0.35);
    expect(events[0].evidence[1].status).toBe('conflicts');
    expect(events[0].confidence).toBe(0.5);
    expect(events[0].evidence[1].metadata).toMatchObject({
      label: 'Djokovic wins match',
      score: '6-3, 6-2',
      scoreBefore: '5-2',
      scoreAfter: '6-2',
      setPeriod: 'Set 2',
    });
    expect(events[0].evidence[1].note).toContain('OCR conflicts: Djokovic wins match');
  });

  it('trusts a matching OCR score transition over misleading OCR label wording', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-transition-over-label-'));
    const momentDir = resolve(assetDir, 'moments', '0');
    await mkdir(momentDir, { recursive: true });
    await writeFile(resolve(momentDir, 'context.json'), JSON.stringify({
      label: 'Djokovic wins match',
      score: '6-3',
      scoreBefore: '5-3',
      scoreAfter: '6-3',
      scoreChanged: true,
      peakTime: 102,
      set_period: 'Set 1',
      audioEnergy: 0.8,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'set_won',
      label: 'Takes opening set 6-3',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 80,
      confidence: 0.8,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{ type: 'transcript', ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(events[0].evidence).toHaveLength(2);
    expect(events[0].evidence[1].status).toBe('supports');
    expect(events[0].evidence[1].metadata?.scoreTransitionStatus).toBe('supports_result');
    expect(events[0].evidence[1].metadata?.selectedBy).toBe('transition_match');
    expect(events[0].evidence[1].note).toContain('transition=supports_result');
  });

  it('downgrades OCR support when score context fields disagree with the event label', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-weak-score-'));
    const momentDir = resolve(assetDir, 'moments', '0');
    await mkdir(momentDir, { recursive: true });
    await writeFile(resolve(momentDir, 'context.json'), JSON.stringify({
      label: 'Djokovic saves break point, leads 4-3',
      scoreChanged: true,
      peakTime: 102,
      set_period: 'Set 2',
      audioEnergy: 0.8,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'game_won',
      label: 'Djokovic saves break point and holds for 4-2',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 70,
      confidence: 0.8,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{ type: 'transcript', ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(events[0].evidence).toHaveLength(2);
    expect(events[0].evidence[1].confidence).toBeLessThanOrEqual(0.68);
    expect(events[0].evidence[1].status).toBe('weak_support');
    expect(events[0].confidence).toBe(0.8);
    expect(events[0].evidence[1].metadata).toMatchObject({
      label: 'Djokovic saves break point, leads 4-3',
      scoreChanged: true,
      peakTime: 102,
      setPeriod: 'Set 2',
      audioEnergy: 0.8,
    });
    expect(events[0].evidence[1].note).toContain('OCR weak_support: Djokovic saves break point, leads 4-3');
  });

  it('downgrades OCR support when context label and period disagree', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-weak-period-'));
    const momentDir = resolve(assetDir, 'moments', '0');
    await mkdir(momentDir, { recursive: true });
    await writeFile(resolve(momentDir, 'context.json'), JSON.stringify({
      label: 'Djokovic wins Set 1 6-3',
      score: '6-3',
      scoreBefore: '5-3',
      scoreAfter: '6-3',
      scoreChanged: true,
      peakTime: 102,
      set_period: 'Set 2',
      audioEnergy: 0.82,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'set_won',
      label: 'Takes opening set 6-3',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 80,
      confidence: 0.8,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{ type: 'transcript', ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(events[0].evidence).toHaveLength(2);
    expect(events[0].evidence[1].confidence).toBeLessThanOrEqual(0.68);
    expect(events[0].evidence[1].status).toBe('weak_support');
    expect(events[0].confidence).toBe(0.8);
    expect(events[0].evidence[1].metadata).toMatchObject({
      label: 'Djokovic wins Set 1 6-3',
      score: '6-3',
      scoreBefore: '5-3',
      scoreAfter: '6-3',
      scoreChanged: true,
      peakTime: 102,
      setPeriod: 'Set 2',
      audioEnergy: 0.82,
    });
    expect(events[0].evidence[1].note).toContain('OCR weak_support: Djokovic wins Set 1 6-3');
  });

  it('leaves events unchanged when OCR context is unavailable', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-no-confirm-'));
    const input = [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'point_won' as const,
      label: 'What a rally',
      anchorTime: 100,
      peakTime: null,
      startTime: 100,
      endTime: 105,
      importance: 70,
      confidence: 0.8,
      entities: [],
      evidence: [{ type: 'transcript' as const, ref: 'window:20' }],
      parentEventId: null,
      validationStatus: 'validated' as const,
      relationType: 'primary' as const,
    }];

    const events = await addScoreConfirmationEvidence(assetDir, input);

    expect(events).toEqual(input);
  });
});

describe('media-analysis-v2 segment validation helpers', () => {
  it('selects uncertain and structurally important segments for validation', () => {
    expect(shouldValidateSegment({
      id: 'segment_0',
      start: 0,
      end: 10,
      type: 'commentator_insert',
      subtype: null,
      speechMode: 'commentary',
      scoreboardPresent: null,
      participants: [],
      confidence: 0.9,
      sourceWindowIndexes: [0, 1],
      evidence: [],
    }, sportsProfile)).toBe(true);

    expect(shouldValidateSegment({
      id: 'segment_1',
      start: 10,
      end: 20,
      type: 'live_play',
      subtype: null,
      speechMode: 'commentary',
      scoreboardPresent: true,
      participants: [],
      confidence: 0.92,
      sourceWindowIndexes: [2, 3],
      evidence: [],
    }, {
      ...sportsProfile,
      format: 'live_match',
    })).toBe(false);
  });

  it('does not revalidate high-confidence commentator inserts for live_match assets', () => {
    expect(shouldValidateSegment({
      id: 'segment_0',
      start: 0,
      end: 10,
      type: 'commentator_insert',
      subtype: 'analysis',
      speechMode: 'commentary',
      scoreboardPresent: null,
      participants: [],
      confidence: 0.82,
      sourceWindowIndexes: [0, 1],
      evidence: [],
    }, {
      ...sportsProfile,
      sport: 'tennis',
      format: 'live_match',
    })).toBe(false);
  });

  it('merges adjacent segments after validation when labels become identical', () => {
    const merged = mergeAdjacentSegments([
      {
        id: 'segment_0',
        start: 0,
        end: 5,
        type: 'commentator_insert',
        subtype: 'analysis',
        speechMode: 'commentary',
        scoreboardPresent: false,
        participants: [],
        confidence: 0.7,
        sourceWindowIndexes: [0],
        evidence: [],
      },
      {
        id: 'segment_1',
        start: 5,
        end: 10,
        type: 'commentator_insert',
        subtype: 'analysis',
        speechMode: 'commentary',
        scoreboardPresent: false,
        participants: [],
        confidence: 0.9,
        sourceWindowIndexes: [1],
        evidence: [],
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].start).toBe(0);
    expect(merged[0].end).toBe(10);
    expect(merged[0].sourceWindowIndexes).toEqual([0, 1]);
  });
});

describe('media-analysis-v2 ranking and summary', () => {
  it('adds reliability ranks without changing chronological event order', () => {
    const events = annotateEventReliability([
      {
        id: 'event_0',
        segmentId: 'segment_0',
        type: 'point_won',
        label: 'Routine point',
        anchorTime: 10,
        peakTime: null,
        startTime: 10,
        endTime: 15,
        importance: 70,
        confidence: 0.9,
        entities: ['Djokovic'],
        evidence: [{ type: 'transcript', ref: 'window:2' }],
        parentEventId: 'event_2',
        validationStatus: 'validated',
        relationType: 'commentary_on',
      },
      {
        id: 'event_1',
        segmentId: 'segment_1',
        type: 'game_won',
        label: 'Djokovic holds for 4-2',
        anchorTime: 12,
        peakTime: null,
        startTime: 12,
        endTime: 17,
        importance: 82,
        confidence: 0.88,
        entities: ['Djokovic'],
        evidence: [
          { type: 'transcript', ref: 'window:3' },
          { type: 'ocr_context', ref: 'ocr-context:1', status: 'supports', confidence: 0.91 },
        ],
        parentEventId: null,
        validationStatus: 'validated',
        relationType: 'primary',
      },
      {
        id: 'event_2',
        segmentId: 'segment_2',
        type: 'pressure_state',
        label: 'Break point Djokovic',
        anchorTime: 8,
        peakTime: null,
        startTime: 8,
        endTime: 13,
        importance: 75,
        confidence: 0.88,
        entities: ['Djokovic'],
        evidence: [
          { type: 'transcript', ref: 'window:1' },
          { type: 'ocr_context', ref: 'ocr-context:0', status: 'weak_support', confidence: 0.67 },
        ],
        parentEventId: null,
        validationStatus: 'validated',
        relationType: 'primary',
      },
    ]);

    expect(events.map((event) => event.id)).toEqual(['event_0', 'event_1', 'event_2']);
    expect(events.map((event) => event.reliabilityRank)).toEqual([3, 1, 2]);
    expect(events.map((event) => event.ocrSupportStatus)).toEqual([null, 'supports', 'weak_support']);
  });

  it('persists chronological events and exposes reliability metadata in summary', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-summary-'));
    const result: MediaAnalysisResult = {
      assetProfile: sportsProfile,
      timelineIndex: {
        windowSize: 5,
        windows: [],
      },
      segments: [],
      events: [
        {
          id: 'event_0',
          segmentId: 'segment_0',
          type: 'point_won' as const,
          label: 'Routine point',
          anchorTime: 10,
          peakTime: null,
          startTime: 10,
          endTime: 15,
          importance: 70,
          confidence: 0.9,
          entities: ['Djokovic'],
          evidence: [{ type: 'transcript', ref: 'window:2' }],
          parentEventId: 'event_2',
          validationStatus: 'validated',
          relationType: 'commentary_on',
        },
        {
          id: 'event_1',
          segmentId: 'segment_1',
          type: 'match_won' as const,
          label: 'Djokovic wins match',
          anchorTime: 80,
          peakTime: null,
          startTime: 80,
          endTime: 85,
          importance: 95,
          confidence: 0.95,
          entities: ['Djokovic'],
          evidence: [
            { type: 'transcript', ref: 'window:16' },
            {
              type: 'ocr_context',
              ref: 'ocr-context:2',
              status: 'supports',
              confidence: 0.95,
              metadata: { scoreTransitionStatus: 'supports_result', selectedBy: 'transition_match' },
            },
            {
              type: 'ocr_context',
              ref: 'ocr-context:3',
              status: 'supports',
              confidence: 0.72,
              metadata: { scoreTransitionStatus: 'unknown', selectedBy: 'label_match' },
            },
          ],
          parentEventId: null,
          validationStatus: 'validated',
          relationType: 'primary',
        },
        {
          id: 'event_2',
          segmentId: 'segment_2',
          type: 'game_won' as const,
          label: 'Djokovic holds for 4-2',
          anchorTime: 40,
          peakTime: null,
          startTime: 40,
          endTime: 45,
          importance: 82,
          confidence: 0.78,
          entities: ['Djokovic'],
          evidence: [
            { type: 'transcript', ref: 'window:8' },
            {
              type: 'ocr_context',
              ref: 'ocr-context:1',
              status: 'weak_support',
              confidence: 0.67,
              metadata: { scoreTransitionStatus: 'supports_state', selectedBy: 'transition_match' },
            },
          ],
          parentEventId: null,
          validationStatus: 'validated',
          relationType: 'primary',
        },
      ],
    };

    await saveMediaAnalysisResult(assetDir, result);

    const stored = await loadMediaAnalysisResult(assetDir);
    const summary = await loadMediaAnalysisSummary(assetDir);

    expect(stored.events.map((event) => event.id)).toEqual(['event_0', 'event_1', 'event_2']);
    expect(stored.events.map((event) => event.reliabilityRank)).toEqual([3, 1, 2]);
    expect(summary.ocrSupportCounts).toEqual([
      { status: 'supports', count: 1 },
      { status: 'weak_support', count: 1 },
    ]);
    expect(summary.scoreTransitionCounts).toEqual([
      { status: 'supports_result', count: 1 },
      { status: 'supports_state', count: 1 },
      { status: 'unknown', count: 1 },
    ]);
    expect(summary.selectedByCounts).toEqual([
      { reason: 'transition_match', count: 2 },
      { reason: 'label_match', count: 1 },
    ]);
    expect(summary.reliabilityCounts).toEqual([
      { bucket: 'top_5', count: 3 },
      { bucket: 'top_10', count: 3 },
      { bucket: 'top_20', count: 3 },
    ]);
  });
});

describe('media-analysis-v2 sports keyword registry', () => {
  it('infers sports from centralized keyword sets', () => {
    expect(inferSportFromText('He saved break point and forced deuce')).toBe('tennis');
    expect(inferSportFromText('The striker beats the keeper for a goal')).toBe('football');
    expect(inferSportFromText('Quarterback finds the receiver for a touchdown')).toBe('american football');
  });

  it('detects score cues across sports from the shared registry', () => {
    expect(hasScoreCue('Three set points for Djokovic')).toBe(true);
    expect(hasScoreCue('Penalty to the home side')).toBe(true);
    expect(hasScoreCue('Routine crowd reaction during a changeover')).toBe(false);
  });

  it('matches keywords on token boundaries instead of substrings', () => {
    expect(includesAnyKeyword('An ace down the T', ['ace'])).toBe(true);
    expect(includesAnyKeyword('Federer leading that race', ['ace'])).toBe(false);
    expect(includesAnyKeyword('break points to face', ['ace'])).toBe(false);
    expect(includesAnyKeyword('first break point', ['break point'])).toBe(true);
  });
});
