import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inferPlayersFromTranscript } from '../lib/media-analysis-v2/asset-profile.js';
import { buildAudioPeakIndex } from '../lib/media-analysis-v2/audio-peaks.js';
import { addAudioPeakEvidence } from '../lib/media-analysis-v2/audio-evidence.js';
import { buildAudioReactionEpisodes } from '../lib/media-analysis-v2/audio-reaction-episodes.js';
import { buildCandidateWindowPackets } from '../lib/media-analysis-v2/candidate-windows.js';
import { addScoreConfirmationEvidence } from '../lib/media-analysis-v2/score-confirmation.js';
import { annotateEventReliability } from '../lib/media-analysis-v2/event-reliability.js';
import { classifySegments } from '../lib/media-analysis-v2/segment-classifier.js';
import { generateInitialEvents } from '../lib/media-analysis-v2/event-candidates.js';
import { validateAndNormalizeEvents } from '../lib/media-analysis-v2/event-validation.js';
import { linkRelatedEvents } from '../lib/media-analysis-v2/event-linking.js';
import { mergeAdjacentSegments, shouldValidateSegment } from '../lib/media-analysis-v2/segment-validation.js';
import { hasScoreCue, includesAnyKeyword, inferSportFromText } from '../lib/media-analysis-v2/sports-keywords.js';
import { loadMediaAnalysisResult, loadMediaAnalysisSummary, saveMediaAnalysisResult } from '../lib/media-analysis-v2/storage.js';
import { applyAudioProfileTimelineContext } from '../lib/media-analysis-v2/timeline-index.js';
import type { AssetProfile, AudioPeak, AudioProfile, MediaAnalysisResult, TimelineIndex } from '../lib/media-analysis-v2/types.js';
import { buildAudioProfileFromSamples } from '../lib/media-analysis-v2/video-utils.js';

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

function windowWithAudio(index: number, audioEnergy: number): TimelineIndex['windows'][number] {
  return {
    index,
    start: index * 5,
    end: index * 5 + 5,
    transcriptText: '',
    transcriptSegments: [],
    speechDensity: 0,
    audioEnergy,
    hasQuestionCue: false,
    hasInterviewCue: false,
    hasCommentaryCue: false,
    hasReplayCue: false,
    hasScoreCue: false,
  };
}

function audioPeak(overrides: Partial<AudioPeak> = {}): AudioPeak {
  return {
    id: 'audio_peak_0',
    groupId: 'audio_peak_group_0',
    windowIndex: 0,
    startTime: 70,
    endTime: 75,
    peakTime: 73.5,
    audioEnergy: 0.83,
    localBaseline: 0.3,
    spikeScore: 0.53,
    percentileRank: 0.99,
    shape: 'spike',
    ...overrides,
  };
}

function audioProfileForSummaries(
  summaries: Array<Partial<AudioProfile['summaries']['oneSecond'][number]> & {
    start: number;
    end: number;
  }>,
): AudioProfile {
  return {
    frameSize: 0.5,
    sampleRate: 8000,
    frames: [],
    summaries: {
      oneSecond: summaries.map((summary, index) => ({
        index,
        start: summary.start,
        end: summary.end,
        windowSize: 1,
        rmsEnergy: summary.rmsEnergy ?? 0.75,
        energyMean: summary.energyMean ?? 0.55,
        energyMax: summary.energyMax ?? 0.8,
        energyStdDev: summary.energyStdDev ?? 0.08,
        burstCount: summary.burstCount ?? 1,
        onsetRate: summary.onsetRate ?? 1,
        silenceRatio: summary.silenceRatio ?? 0.2,
        activeDuration: summary.activeDuration ?? 1,
        sustainedLoudnessDuration: summary.sustainedLoudnessDuration ?? 0.5,
        strongestAttackTime: summary.strongestAttackTime ?? summary.start + 0.5,
        strongestAttackScore: summary.strongestAttackScore ?? 0.16,
        zeroCrossingRateMean: summary.zeroCrossingRateMean ?? 0.25,
        spectralCentroidMean: summary.spectralCentroidMean ?? 1600,
        spectralCentroidStdDev: summary.spectralCentroidStdDev ?? 200,
        spectralRolloffMean: summary.spectralRolloffMean ?? 2800,
        spectralFlatnessMean: summary.spectralFlatnessMean ?? 0.45,
        spectralFluxMean: summary.spectralFluxMean ?? 0.35,
        spectralFluxMax: summary.spectralFluxMax ?? 0.6,
        onsetRegularity: summary.onsetRegularity ?? 0,
        rallyTextureScore: summary.rallyTextureScore ?? 0.72,
        reactionBurstScore: summary.reactionBurstScore ?? 0.72,
        speechDominanceScore: summary.speechDominanceScore ?? 0.5,
        musicBedScore: summary.musicBedScore ?? 0.25,
        umpireAnnouncementScore: summary.umpireAnnouncementScore ?? 0.35,
        applauseCrowdScore: summary.applauseCrowdScore ?? 0.55,
        crowdScore: summary.crowdScore ?? 0.58,
        commentatorScore: summary.commentatorScore ?? 0.48,
        umpireScore: summary.umpireScore ?? 0.42,
        playerVocalizationScore: summary.playerVocalizationScore ?? 0.5,
        musicScore: summary.musicScore ?? 0.3,
        pointShapeHint: summary.pointShapeHint ?? 'short_point',
        context: summary.context ?? {
          speechDensity: 0.45,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
          rallyTextureScore: 0.72,
          reactionBurstScore: 0.72,
          speechDominanceScore: 0.5,
          musicBedScore: 0.25,
          applauseCrowdScore: 0.55,
          crowdScore: 0.58,
          commentatorScore: 0.48,
          umpireScore: 0.42,
          playerVocalizationScore: 0.5,
          musicScore: 0.3,
          pointShapeHint: 'short_point',
          suppressionReasons: [],
        },
      })),
      fiveSecond: [],
    },
  };
}

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

describe('media-analysis-v2 audio peaks', () => {
  it('builds fine-grained audio profile frames and summaries from PCM samples', () => {
    const sampleRate = 10;
    const samples = new Int16Array([
      0, 0, 0, 0, 0,
      1000, -1000, 1000, -1000, 1000,
      4000, -4000, 4000, -4000, 4000,
      4000, -4000, 4000, -4000, 4000,
    ]);

    const profile = buildAudioProfileFromSamples(samples, sampleRate, 2, 0.5);

    expect(profile.frameSize).toBe(0.5);
    expect(profile.sampleRate).toBe(sampleRate);
    expect(profile.frames).toHaveLength(4);
    expect(profile.frames[0]).toMatchObject({
      start: 0,
      end: 0.5,
      rmsEnergy: 0,
      peakEnergy: 0,
      silenceRatio: 1,
    });
    expect(profile.frames[2].rmsEnergy).toBe(1);
    expect(profile.frames[2].energyDelta).toBeGreaterThan(0.6);
    expect(profile.frames[2].burstScore).toBeGreaterThan(0.7);
    expect(profile.frames[2].zeroCrossingRate).toBeGreaterThan(0.5);
    expect(profile.frames[2]).toMatchObject({
      spectralCentroid: expect.any(Number),
      spectralRolloff: expect.any(Number),
      spectralFlatness: expect.any(Number),
      spectralFlux: expect.any(Number),
    });
    expect(profile.summaries.oneSecond).toHaveLength(2);
    expect(profile.summaries.fiveSecond).toHaveLength(1);
    expect(profile.summaries.oneSecond[1]).toMatchObject({
      windowSize: 1,
      rmsEnergy: 1,
      energyMean: 1,
      energyMax: 1,
      burstCount: 1,
      activeDuration: 1,
      sustainedLoudnessDuration: 1,
      strongestAttackTime: 1.25,
      zeroCrossingRateMean: 0.8,
      spectralCentroidMean: expect.any(Number),
      spectralFlatnessMean: expect.any(Number),
      spectralFluxMax: expect.any(Number),
      reactionBurstScore: 1,
      applauseCrowdScore: expect.any(Number),
      crowdScore: expect.any(Number),
      playerVocalizationScore: expect.any(Number),
      pointShapeHint: expect.any(String),
    });
    expect(profile.summaries.oneSecond[1].applauseCrowdScore).toBeGreaterThan(0.8);
    expect(profile.summaries.fiveSecond[0]).toMatchObject({
      onsetRegularity: expect.any(Number),
      spectralCentroidMean: expect.any(Number),
      spectralCentroidStdDev: expect.any(Number),
      spectralFlatnessMean: expect.any(Number),
      spectralFluxMean: expect.any(Number),
      spectralFluxMax: expect.any(Number),
      rallyTextureScore: expect.any(Number),
      speechDominanceScore: expect.any(Number),
      musicBedScore: expect.any(Number),
      umpireAnnouncementScore: expect.any(Number),
      crowdScore: expect.any(Number),
      commentatorScore: expect.any(Number),
      umpireScore: expect.any(Number),
      playerVocalizationScore: expect.any(Number),
      musicScore: expect.any(Number),
    });
  });

  it('adds context-adjusted audio hints without mutating raw signal scores', () => {
    const sampleRate = 10;
    const profile = buildAudioProfileFromSamples(new Int16Array([
      0, 0, 0, 0, 0,
      1000, -1000, 1000, -1000, 1000,
      4000, -4000, 4000, -4000, 4000,
      4000, -4000, 4000, -4000, 4000,
    ]), sampleRate, 2, 0.5);
    const rawSummary = profile.summaries.oneSecond[1];

    const contextual = applyAudioProfileTimelineContext(profile, [{
      ...windowWithAudio(0, 0.8),
      start: 1,
      end: 2,
      speechDensity: 1,
      transcriptText: 'take another look at that brilliant pass in slow motion',
      hasCommentaryCue: true,
      hasReplayCue: true,
    }]);

    const summary = contextual.summaries.oneSecond[1];
    expect(summary.rallyTextureScore).toBe(rawSummary.rallyTextureScore);
    expect(summary.reactionBurstScore).toBe(rawSummary.reactionBurstScore);
    expect(summary.context).toMatchObject({
      speechDensity: 1,
      hasCommentaryCue: true,
      hasReplayCue: true,
      pointShapeHint: 'recap_only',
      suppressionReasons: expect.arrayContaining(['high_speech_density', 'commentary_cue', 'replay_cue']),
    });
    expect(summary.context?.rallyTextureScore).toBeLessThan(summary.rallyTextureScore);
    expect(summary.context?.speechDominanceScore).toBeGreaterThan(summary.speechDominanceScore);
  });

  it('detects grouped local audio peaks with baseline and shape metadata', () => {
    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [
        windowWithAudio(0, 0.1),
        windowWithAudio(1, 0.2),
        windowWithAudio(2, 0.82),
        windowWithAudio(3, 0.22),
        windowWithAudio(4, 0.18),
        windowWithAudio(5, 0.2),
        windowWithAudio(6, 0.76),
        windowWithAudio(7, 0.78),
        windowWithAudio(8, 0.77),
        windowWithAudio(9, 0.76),
        windowWithAudio(10, 0.2),
      ],
    };

    const peaks = buildAudioPeakIndex(timelineIndex);

    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toMatchObject({
      id: 'audio_peak_0',
      groupId: 'audio_peak_group_0',
      windowIndex: 2,
      peakTime: 12.5,
      audioEnergy: 0.82,
      shape: 'spike',
    });
    expect(peaks[0].localBaseline).toBe(0.2);
    expect(peaks[0].spikeScore).toBe(0.62);
    expect(peaks[1]).toMatchObject({
      id: 'audio_peak_1',
      groupId: 'audio_peak_group_1',
      windowIndex: 7,
      shape: 'sustained',
    });
  });

  it('attaches nearby audio peak evidence to existing events without changing type or anchor', () => {
    const events = addAudioPeakEvidence([
      {
        id: 'event_0',
        segmentId: 'segment_0',
        type: 'point_won',
        label: 'Djokovic wins a rally',
        anchorTime: 73.5,
        peakTime: null,
        startTime: 68,
        endTime: 74,
        importance: 80,
        confidence: 0.78,
        entities: ['Djokovic'],
        evidence: [{ type: 'transcript', ref: 'window:14' }],
        parentEventId: null,
        validationStatus: 'validated',
        relationType: 'primary',
      },
    ], [
      {
        id: 'audio_peak_0',
        groupId: 'audio_peak_group_0',
        windowIndex: 14,
        startTime: 70,
        endTime: 75,
        peakTime: 73.5,
        audioEnergy: 0.83,
        localBaseline: 0.3,
        spikeScore: 0.53,
        percentileRank: 0.99,
        shape: 'spike',
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('point_won');
    expect(events[0].anchorTime).toBe(73.5);
    expect(events[0].peakTime).toBe(73.5);
    expect(events[0].evidence.at(-1)).toMatchObject({
      type: 'audio',
      ref: 'audio-peak:audio_peak_0',
      metadata: {
        peakTime: 73.5,
        audioEnergy: 0.83,
        audioPeakShape: 'spike',
      },
    });
  });
});

describe('media-analysis-v2 candidate window packets', () => {
  it('represents replay during changeover as multiple facets on one packet', () => {
    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [{
        index: 14,
        start: 70,
        end: 75,
        transcriptText: 'Slow motion now, take another look while the players sit down at the changeover after that spectacular rally.',
        transcriptSegments: [],
        speechDensity: 0.8,
        audioEnergy: 0.85,
        hasQuestionCue: false,
        hasInterviewCue: false,
        hasCommentaryCue: true,
        hasReplayCue: true,
        hasScoreCue: false,
      }],
    };
    const segments = [{
      id: 'segment_0',
      start: 70,
      end: 75,
      type: 'replay' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: false,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.86,
      sourceWindowIndexes: [14],
      evidence: [],
    }];

    const packets = buildCandidateWindowPackets(timelineIndex, segments, [
      audioPeak({ windowIndex: 14, startTime: 70, endTime: 75, peakTime: 72.5 }),
    ], []);

    expect(packets).toHaveLength(1);
    expect(packets[0]).toMatchObject({
      source: 'audio_peak',
      sourceRef: 'audio-peak:audio_peak_0',
      segmentId: 'segment_0',
      scoreboardPresent: false,
      speechDensity: 0.8,
      audioSourceHint: 'crowd_or_reaction',
      priority: 'medium',
      facets: {
        playPhase: 'changeover_or_break',
        contentMode: 'replay_or_slow_motion',
        transcriptRelation: 'previous_action_recap',
      },
    });
  });

  it('keeps stale transcript during next-point setup as boundary evidence', () => {
    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [{
        index: 280,
        start: 1400,
        end: 1405,
        transcriptText: 'Djokovic ready to serve at advantage after that brilliant overhead winner.',
        transcriptSegments: [],
        speechDensity: 0.7,
        audioEnergy: 0.78,
        hasQuestionCue: false,
        hasInterviewCue: false,
        hasCommentaryCue: true,
        hasReplayCue: false,
        hasScoreCue: true,
      }],
    };
    const segments = [{
      id: 'segment_0',
      start: 1400,
      end: 1405,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [280],
      evidence: [],
    }];

    const packets = buildCandidateWindowPackets(timelineIndex, segments, [
      audioPeak({ windowIndex: 280, startTime: 1400, endTime: 1405, peakTime: 1402.5 }),
    ], []);

    expect(packets).toHaveLength(1);
    expect(packets[0]).toMatchObject({
      priority: 'medium',
      facets: {
        playPhase: 'between_points',
        contentMode: 'live_view',
        transcriptRelation: 'next_point_setup',
      },
      scoreboardPresent: true,
      speechDensity: 0.7,
      audioSourceHint: 'crowd_or_reaction',
    });
  });

  it('marks speech-heavy low-spike audio packets as speech or commentary', () => {
    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [{
        index: 893,
        start: 4465,
        end: 4470,
        transcriptText: 'just anticipated the pass and he made it count',
        transcriptSegments: [],
        speechDensity: 0.9,
        audioEnergy: 0.69,
        hasQuestionCue: false,
        hasInterviewCue: false,
        hasCommentaryCue: true,
        hasReplayCue: false,
        hasScoreCue: false,
      }],
    };
    const segments = [{
      id: 'segment_0',
      start: 4465,
      end: 4470,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: null,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [893],
      evidence: [],
    }];

    const packets = buildCandidateWindowPackets(timelineIndex, segments, [
      audioPeak({
        id: 'audio_peak_81',
        windowIndex: 893,
        startTime: 4465,
        endTime: 4470,
        peakTime: 4467.5,
        audioEnergy: 0.686,
        localBaseline: 0.53,
        spikeScore: 0.156,
        percentileRank: 0.959,
      }),
    ], [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'pressure_state',
      label: 'Break points',
      anchorTime: 4468,
      peakTime: null,
      startTime: 4467,
      endTime: 4470,
      importance: 60,
      confidence: 0.78,
      entities: ['Alcaraz', 'Djokovic'],
      evidence: [{ type: 'transcript', ref: 'window:893' }],
      parentEventId: null,
      validationStatus: 'validated',
      relationType: 'primary',
    }]);

    expect(packets[0]).toMatchObject({
      speechDensity: 0.9,
      audioSourceHint: 'speech_or_commentary',
    });
  });
});

describe('media-analysis-v2 audio reaction episodes', () => {
  it('keeps the first strong reaction peak as primary when a later speech bump is nearby', () => {
    const peaks = [
      audioPeak({
        id: 'audio_peak_0',
        windowIndex: 887,
        startTime: 4435,
        endTime: 4440,
        peakTime: 4437.5,
        audioEnergy: 0.83,
        localBaseline: 0.301,
        spikeScore: 0.529,
        percentileRank: 0.994,
        shape: 'spike',
      }),
      audioPeak({
        id: 'audio_peak_1',
        groupId: 'audio_peak_group_1',
        windowIndex: 893,
        startTime: 4465,
        endTime: 4470,
        peakTime: 4467.5,
        audioEnergy: 0.686,
        localBaseline: 0.53,
        spikeScore: 0.156,
        percentileRank: 0.959,
        shape: 'spike',
      }),
    ];
    const packets = [
      {
        id: 'candidate_window_0',
        source: 'audio_peak' as const,
        sourceRef: 'audio-peak:audio_peak_0',
        startTime: 4422.5,
        endTime: 4457.5,
        anchorTime: 4437.5,
        priority: 'high' as const,
        facets: {
          playPhase: 'live_reaction' as const,
          contentMode: 'live_view' as const,
          transcriptRelation: 'current_action' as const,
        },
        segmentId: 'segment_0',
        segmentType: 'live_play' as const,
        scoreboardPresent: true,
        speechDensity: 0.35,
        audioSourceHint: 'crowd_or_reaction' as const,
        nearbyTranscript: 'What a point from Alcaraz.',
        linkedEventIds: ['event_0'],
        previousEventId: null,
        evidence: [{ type: 'audio' as const, ref: 'audio-peak:audio_peak_0' }],
      },
      {
        id: 'candidate_window_1',
        source: 'audio_peak' as const,
        sourceRef: 'audio-peak:audio_peak_1',
        startTime: 4452.5,
        endTime: 4487.5,
        anchorTime: 4467.5,
        priority: 'high' as const,
        facets: {
          playPhase: 'live_action' as const,
          contentMode: 'live_view' as const,
          transcriptRelation: 'generic' as const,
        },
        segmentId: 'segment_1',
        segmentType: 'live_play' as const,
        scoreboardPresent: true,
        speechDensity: 1,
        audioSourceHint: 'speech_or_commentary' as const,
        nearbyTranscript: 'Just anticipated the pass and he made it count.',
        linkedEventIds: ['event_1'],
        previousEventId: 'event_0',
        evidence: [{ type: 'audio' as const, ref: 'audio-peak:audio_peak_1' }],
      },
    ];

    const episodes = buildAudioReactionEpisodes(peaks, packets);

    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      primaryCandidateWindowId: 'candidate_window_0',
      primaryAudioPeakId: 'audio_peak_0',
      primaryAnchorTime: 4437.5,
      primaryReason: 'first_strong_reaction',
      memberCount: 2,
      members: [
        {
          candidateWindowId: 'candidate_window_0',
          role: 'primary_anchor',
          audioSourceHint: 'crowd_or_reaction',
        },
        {
          candidateWindowId: 'candidate_window_1',
          role: 'recap_or_speech_tail',
          audioSourceHint: 'speech_or_commentary',
        },
      ],
    });
  });

  it('falls back to the best available peak when no strong reaction anchor exists', () => {
    const peaks = [
      audioPeak({
        id: 'audio_peak_0',
        peakTime: 120,
        spikeScore: 0.16,
        percentileRank: 0.96,
        shape: 'spike',
      }),
      audioPeak({
        id: 'audio_peak_1',
        groupId: 'audio_peak_group_1',
        peakTime: 145,
        spikeScore: 0.22,
        percentileRank: 0.97,
        shape: 'spike',
      }),
    ];
    const packets = peaks.map((peak, index) => ({
      id: `candidate_window_${index}`,
      source: 'audio_peak' as const,
      sourceRef: `audio-peak:${peak.id}`,
      startTime: peak.peakTime - 15,
      endTime: peak.peakTime + 20,
      anchorTime: peak.peakTime,
      priority: 'medium' as const,
      facets: {
        playPhase: 'live_action' as const,
        contentMode: 'live_view' as const,
        transcriptRelation: 'generic' as const,
      },
      segmentId: null,
      segmentType: null,
      scoreboardPresent: null,
      speechDensity: 0.8,
      audioSourceHint: 'mixed_or_unknown' as const,
      nearbyTranscript: '',
      linkedEventIds: [],
      previousEventId: null,
      evidence: [{ type: 'audio' as const, ref: `audio-peak:${peak.id}` }],
    }));

    const episodes = buildAudioReactionEpisodes(peaks, packets);

    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      primaryAudioPeakId: 'audio_peak_1',
      primaryReason: 'best_available_peak',
    });
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

  it('emits an audio-led tennis point for a clean live rally ending', () => {
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
          index: 14,
          start: 70,
          end: 75,
          transcriptText: 'Oh my God, are you kidding me? How good is this game? Djokovic anticipated the pass and gets back to 40-40.',
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.83,
          hasQuestionCue: true,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 70,
      end: 75,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [14],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments, [
      audioPeak({ windowIndex: 14, startTime: 70, endTime: 75, peakTime: 73.5 }),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('point_won');
    expect(events[0].label).toBe('Djokovic wins rally to return to deuce');
    expect(events[0].anchorTime).toBe(73.5);
    expect(events[0].startTime).toBe(70);
    expect(events[0].endTime).toBe(73.5);
    expect(events[0].evidence[0]).toMatchObject({
      type: 'audio',
      ref: 'audio-peak:audio_peak_0',
    });
  });

  it('back-anchors slow-motion audio peaks to the earlier live point ending', () => {
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
          index: 13,
          start: 65,
          end: 70,
          transcriptText: 'Alcaraz absorbs it and turns the point in his favour.',
          transcriptSegments: [],
          speechDensity: 0.45,
          audioEnergy: 0.81,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
        {
          index: 14,
          start: 70,
          end: 75,
          transcriptText: 'Slow motion now, take another look at that spectacular rally from Alcaraz.',
          transcriptSegments: [],
          speechDensity: 0.55,
          audioEnergy: 0.85,
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
      start: 65,
      end: 75,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: null,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [13, 14],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments, [
      audioPeak({
        id: 'audio_peak_0',
        windowIndex: 13,
        startTime: 65,
        endTime: 70,
        peakTime: 69.5,
        audioEnergy: 0.81,
        spikeScore: 0.31,
        percentileRank: 0.97,
      }),
      audioPeak({
        id: 'audio_peak_1',
        groupId: 'audio_peak_group_1',
        windowIndex: 14,
        startTime: 70,
        endTime: 75,
        peakTime: 72.5,
        audioEnergy: 0.85,
        spikeScore: 0.54,
        percentileRank: 0.99,
      }),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('point_won');
    expect(events[0].anchorTime).toBe(69.5);
    expect(events[0].peakTime).toBe(72.5);
    expect(events[0].endTime).toBe(69.5);
  });

  it('does not add a replay-backed audio point when a nearby live event already exists', () => {
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
          index: 13,
          start: 65,
          end: 70,
          transcriptText: 'What a rally from Alcaraz, he wins the point with a forehand winner.',
          transcriptSegments: [],
          speechDensity: 0.55,
          audioEnergy: 0.81,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 14,
          start: 70,
          end: 75,
          transcriptText: 'Slow motion now, take another look at that spectacular rally from Alcaraz.',
          transcriptSegments: [],
          speechDensity: 0.55,
          audioEnergy: 0.85,
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
      start: 65,
      end: 75,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [13, 14],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments, [
      audioPeak({
        id: 'audio_peak_0',
        windowIndex: 13,
        startTime: 65,
        endTime: 70,
        peakTime: 69.5,
        audioEnergy: 0.81,
        spikeScore: 0.31,
        percentileRank: 0.97,
      }),
      audioPeak({
        id: 'audio_peak_1',
        groupId: 'audio_peak_group_1',
        windowIndex: 14,
        startTime: 70,
        endTime: 75,
        peakTime: 72.5,
        audioEnergy: 0.85,
        spikeScore: 0.54,
        percentileRank: 0.99,
      }),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('point_won');
    expect(events[0].anchorTime).not.toBe(72.5);
  });

  it('keeps the manually reviewed 37:48 reaction-like break exception as game_won', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };
    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [{
        index: 454,
        start: 2268,
        end: 2273,
        transcriptText: 'Djokovic breaks. The first to make a move. Great game from Alcaraz but disappointing miss to concede the break.',
        transcriptSegments: [],
        speechDensity: 0.55,
        audioEnergy: 0.58,
        hasQuestionCue: false,
        hasInterviewCue: false,
        hasCommentaryCue: true,
        hasReplayCue: false,
        hasScoreCue: false,
      }],
      audioProfile: audioProfileForSummaries([{
        start: 2268,
        end: 2269,
        strongestAttackTime: 2268.6,
      }]),
    };
    const segments = [{
      id: 'segment_0',
      start: 2268,
      end: 2273,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [454],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'game_won',
      anchorTime: 2268.6,
    });
    expect(events[0].label).toContain('Djokovic breaks');
  });

  it('keeps the manually reviewed 40:54 reaction-like set-ending exception anchored to the live point', () => {
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
          index: 486,
          start: 2430,
          end: 2435,
          transcriptText: 'Three set points for Djokovic.',
          transcriptSegments: [],
          speechDensity: 0.45,
          audioEnergy: 0.7,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 491,
          start: 2455,
          end: 2460,
          transcriptText: 'Really good closing passage of play from Djokovic in that opening set.',
          transcriptSegments: [],
          speechDensity: 0.55,
          audioEnergy: 0.62,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
        {
          index: 492,
          start: 2460,
          end: 2465,
          transcriptText: 'He takes the opening set 6-3.',
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.58,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
      ],
      audioProfile: audioProfileForSummaries([{
        start: 2454,
        end: 2455,
        strongestAttackTime: 2454.5,
      }]),
    };
    const segments = [{
      id: 'segment_0',
      start: 2430,
      end: 2465,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [486, 491, 492],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);
    const setWon = events.find((event) => event.type === 'set_won');

    expect(setWon).toMatchObject({
      anchorTime: 2454.5,
      peakTime: 2454.5,
    });
    expect(setWon?.evidence.some((evidence) => evidence.ref === 'audio-profile:1s:0')).toBe(true);
  });

  it('does not promote reviewed between-points match-point setup to a result event', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };
    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [{
        index: 1020,
        start: 5100,
        end: 5105,
        transcriptText: 'Three chances to seal it. Three match points. Fans roar before Djokovic serves.',
        transcriptSegments: [],
        speechDensity: 0.6,
        audioEnergy: 0.78,
        hasQuestionCue: false,
        hasInterviewCue: false,
        hasCommentaryCue: true,
        hasReplayCue: false,
        hasScoreCue: true,
      }],
      audioProfile: audioProfileForSummaries([{
        start: 5101,
        end: 5102,
        strongestAttackTime: 5101.4,
      }]),
    };
    const segments = [{
      id: 'segment_0',
      start: 5100,
      end: 5105,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [1020],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pressure_state');
  });

  it('does not infer a point winner from an unreviewed reaction-like pressure candidate before OCR', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };
    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [{
        index: 956,
        start: 4780,
        end: 4785,
        transcriptText: 'Eighth break point of the match for Djokovic. Was on the return, just missed it.',
        transcriptSegments: [],
        speechDensity: 0.25,
        audioEnergy: 0.74,
        hasQuestionCue: false,
        hasInterviewCue: false,
        hasCommentaryCue: true,
        hasReplayCue: false,
        hasScoreCue: true,
      }],
      audioProfile: audioProfileForSummaries([{
        start: 4780,
        end: 4781,
        strongestAttackTime: 4780.4,
      }]),
    };
    const segments = [{
      id: 'segment_0',
      start: 4780,
      end: 4785,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [956],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events.every((event) => event.type !== 'point_won')).toBe(true);
    expect(events.every((event) => event.type !== 'game_won')).toBe(true);
    expect(events.every((event) => event.type !== 'set_won')).toBe(true);
  });

  it('suppresses reviewed post-match broadcaster animation as a live key moment', () => {
    const tennisProfile: AssetProfile = {
      ...sportsProfile,
      sport: 'Tennis',
      players: ['Alcaraz', 'Djokovic'],
      teams: [],
    };
    const timelineIndex: TimelineIndex = {
      windowSize: 5,
      windows: [{
        index: 1043,
        start: 5215,
        end: 5220,
        transcriptText: 'Broadcaster animation after the match, Djokovic through 6-3, 6-2.',
        transcriptSegments: [],
        speechDensity: 0.4,
        audioEnergy: 0.9,
        hasQuestionCue: false,
        hasInterviewCue: false,
        hasCommentaryCue: false,
        hasReplayCue: false,
        hasScoreCue: true,
      }],
      audioProfile: audioProfileForSummaries([{
        start: 5219,
        end: 5220,
        strongestAttackTime: 5219.4,
      }]),
    };
    const segments = [{
      id: 'segment_0',
      start: 5215,
      end: 5220,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: false,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [1043],
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

  it('does not emit a second primary event for bench changeover coverage after a tennis game result', () => {
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
          start: 722,
          end: 727,
          transcriptText: 'Game Djokovic, he holds for 2-1 against Alcaraz',
          transcriptSegments: [],
          speechDensity: 0.45,
          audioEnergy: 0.82,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 6,
          start: 752,
          end: 757,
          transcriptText: 'Slow motion pictures as Djokovic sits on the bench after he wins the game',
          transcriptSegments: [],
          speechDensity: 0.5,
          audioEnergy: 0.66,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: true,
          hasScoreCue: true,
        },
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 722,
      end: 757,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 6],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('game_won');
    expect(events[0].anchorTime).toBe(724.5);
    expect(events[0].label).toBe('Game Djokovic, he holds for 2-1 against Alcaraz');
  });

  it('keeps a tennis hold result when the score follows holds-on-board wording across adjacent windows', () => {
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
          index: 145,
          start: 725,
          end: 730,
          transcriptText: 'so three holds on the board to get us going this evening',
          transcriptSegments: [],
          speechDensity: 0.48,
          audioEnergy: 0.56,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
        {
          index: 146,
          start: 730,
          end: 735,
          transcriptText: 'to the bench to 2-1.',
          transcriptSegments: [
            {
              start: 733.4,
              end: 734.48,
              text: 'to the bench',
            },
            {
              start: 734.48,
              end: 735.02,
              text: 'to 2-1.',
            },
          ],
          speechDensity: 0.32,
          audioEnergy: 0.36,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
        {
          index: 150,
          start: 750,
          end: 755,
          transcriptText: 'Early calm couple of games after Djokovic',
          transcriptSegments: [],
          speechDensity: 0.4,
          audioEnergy: 0.3,
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
      start: 725,
      end: 755,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [145, 146, 150],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('game_won');
    expect(events[0].anchorTime).toBe(724.4);
    expect(events[0].startTime).toBe(718.4);
    expect(events[0].endTime).toBe(724.4);
    expect(events[0].label).toBe('Third hold of the set moves score to 2-1');
  });

  it('does not treat a score before holds-on-board wording as a new tennis hold result', () => {
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
          index: 140,
          start: 700,
          end: 705,
          transcriptText: '1-0 1-0 1-0 40-15',
          transcriptSegments: [],
          speechDensity: 0.45,
          audioEnergy: 0.39,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
        {
          index: 141,
          start: 705,
          end: 710,
          transcriptText: '40-15 so three holds on the board to get us going this evening',
          transcriptSegments: [],
          speechDensity: 0.48,
          audioEnergy: 0.19,
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
      start: 700,
      end: 710,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [140, 141],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events).toHaveLength(0);
  });

  it('classifies opening-game break-point saved at deuce as point_won, not game_won', () => {
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
          start: 260,
          end: 265,
          transcriptText: 'Opening game break point saved for service.',
          transcriptSegments: [],
          speechDensity: 0.42,
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
      start: 260,
      end: 265,
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
    expect(events[0].label).toBe('Opening game break point saved for service.');
  });

  it('anchors a tennis hold to held-serve language instead of the later score recap', () => {
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
          start: 4526,
          end: 4531,
          transcriptText: '30-40. That incredible point.',
          transcriptSegments: [],
          speechDensity: 0.46,
          audioEnergy: 0.78,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 4,
          start: 4544,
          end: 4559,
          transcriptText: 'I am not sure how he held serve but he has done',
          transcriptSegments: [],
          speechDensity: 0.45,
          audioEnergy: 0.82,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 8,
          start: 4564,
          end: 4571,
          transcriptText: 'the way in which he saved that second break point of the game Djokovic leads 4 against 2',
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
      start: 4526,
      end: 4571,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 4, 8],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);
    const gameEvents = events.filter((event) => event.type === 'game_won');
    const savedBreakPointRecaps = events.filter((event) =>
      event.label.toLowerCase().includes("still can't quite believe"),
    );

    expect(gameEvents).toHaveLength(1);
    expect(gameEvents[0].anchorTime).toBe(4551.5);
    expect(gameEvents[0].label).toBe('Djokovic saves break point and holds for 4-2');
    expect(savedBreakPointRecaps).toHaveLength(0);
  });

  it('anchors a tennis break to the live reaction instead of the later game-from-victory recap', () => {
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
          start: 4822,
          end: 4832,
          transcriptText: '8th break point of the match for Djokovic',
          transcriptSegments: [],
          speechDensity: 0.42,
          audioEnergy: 0.25,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 12,
          start: 4885,
          end: 4890,
          transcriptText: 'Oh, mesmerizing stuff. He was everywhere. Yeah.',
          transcriptSegments: [],
          speechDensity: 0.35,
          audioEnergy: 0.86,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: false,
        },
        {
          index: 14,
          start: 4893,
          end: 4902,
          transcriptText: 'Breaks for a third time this evening. A game from victory.',
          transcriptSegments: [],
          speechDensity: 0.48,
          audioEnergy: 0.8,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 16,
          start: 4905,
          end: 4913,
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
      ],
    };

    const segments = [{
      id: 'segment_0',
      start: 4822,
      end: 4832,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0],
      evidence: [],
    }, {
      id: 'segment_1',
      start: 4885,
      end: 4913,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [12, 14, 16],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);
    const gameEvents = events.filter((event) => event.type === 'game_won');
    const pointEvents = events.filter((event) => event.type === 'point_won');

    expect(gameEvents).toHaveLength(1);
    expect(gameEvents[0].anchorTime).toBe(4887.5);
    expect(gameEvents[0].label).toBe('Breaks for a third time; one game from victory');
    expect(pointEvents).toHaveLength(0);
  });

  it('keeps final match-point pressure and cleans noisy match-result score text', () => {
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
          start: 5079,
          end: 5103,
          transcriptText: 'three chances to seal it',
          transcriptSegments: [],
          speechDensity: 0.34,
          audioEnergy: 0.7,
          hasQuestionCue: false,
          hasInterviewCue: false,
          hasCommentaryCue: true,
          hasReplayCue: false,
          hasScoreCue: true,
        },
        {
          index: 18,
          start: 5169,
          end: 5180,
          transcriptText: 'Djokovic, too good in Turin this time. C3 is 2-2, 6-3, 6-2.',
          transcriptSegments: [],
          speechDensity: 0.48,
          audioEnergy: 0.93,
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
      start: 5079,
      end: 5180,
      type: 'live_play' as const,
      subtype: null,
      speechMode: 'commentary' as const,
      scoreboardPresent: true,
      participants: ['Alcaraz', 'Djokovic'],
      confidence: 0.9,
      sourceWindowIndexes: [0, 18],
      evidence: [],
    }];

    const events = generateInitialEvents(tennisProfile, timelineIndex, segments);

    expect(events.map((event) => event.type)).toEqual(['pressure_state', 'match_won']);
    expect(events[0].label).toBe('three chances to seal it');
    expect(events[1].anchorTime).toBe(5174.5);
    expect(events[1].label).toBe('Djokovic, too good in Turin this time. 6-3, 6-2.');
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

  it('anchors a set-result recap back to the preceding live set-point state', () => {
    const events = linkRelatedEvents([
      {
        id: 'event_0',
        segmentId: 'segment_0',
        type: 'pressure_state',
        label: 'Three set points for Djokovic',
        anchorTime: 2432.5,
        peakTime: null,
        startTime: 2430,
        endTime: 2435,
        importance: 57,
        confidence: 0.95,
        entities: ['Djokovic', 'Alcaraz'],
        evidence: [{ type: 'transcript', ref: 'window:486' }],
        parentEventId: null,
        validationStatus: 'validated',
        relationType: 'primary',
      },
      {
        id: 'event_1',
        segmentId: 'segment_1',
        type: 'set_won',
        label: 'Takes opening set 6-3',
        anchorTime: 2467.526,
        peakTime: null,
        startTime: 2465.0518,
        endTime: 2470,
        importance: 39,
        confidence: 0.64,
        entities: ['Djokovic', 'Alcaraz'],
        evidence: [{ type: 'transcript', ref: 'window:493' }],
        parentEventId: null,
        validationStatus: 'validated',
        relationType: 'primary',
      },
    ], []);

    expect(events[0].relationType).toBe('leads_to');
    expect(events[0].parentEventId).toBe('event_1');
    expect(events[1].type).toBe('set_won');
    expect(events[1].anchorTime).toBe(2432.5);
    expect(events[1].startTime).toBe(2430);
    expect(events[1].endTime).toBe(2435);
    expect(events[1].evidence.at(-1)?.type).toBe('heuristic');
    expect(events[1].evidence.at(-1)?.note).toContain('anchored set result to preceding set-point state');
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

  it('does not attach later slow-motion pressure-like OCR context to audio-led point results', async () => {
    const assetDir = await mkdtemp(resolve(tmpdir(), 'mam-v2-audio-point-late-recap-'));
    const momentDir = resolve(assetDir, 'moments', '0');
    await mkdir(momentDir, { recursive: true });
    await writeFile(resolve(momentDir, 'context.json'), JSON.stringify({
      label: 'Alcaraz anticipates pass, earns break points',
      scoreBefore: '3-6, 2-5 (15-40)',
      scoreChanged: false,
      peakTime: 136.5,
      set_period: 'Set 2',
      audioEnergy: 0.82,
    }), 'utf-8');

    const events = await addScoreConfirmationEvidence(assetDir, [{
      id: 'event_0',
      segmentId: 'segment_0',
      type: 'point_won',
      label: 'Oh, are you kidding me? How good is this game?',
      anchorTime: 100,
      peakTime: 100,
      startTime: 92,
      endTime: 100,
      importance: 83,
      confidence: 0.58,
      entities: ['Djokovic', 'Alcaraz'],
      evidence: [{
        type: 'audio',
        ref: 'audio-peak:audio_peak_0',
        confidence: 0.62,
        metadata: {
          peakTime: 100,
          audioEnergy: 0.83,
          localBaseline: 0.3,
          spikeScore: 0.53,
          percentileRank: 0.99,
          audioPeakShape: 'spike',
        },
      }],
      parentEventId: null,
      validationStatus: 'candidate',
      relationType: null,
    }]);

    expect(events[0].evidence).toHaveLength(1);
    expect(events[0].evidence[0].type).toBe('audio');
    expect(events[0].confidence).toBe(0.58);
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
      audioProfile: {
        frameSize: 0.5,
        sampleRate: 8000,
        frames: [{
          index: 0,
          start: 0,
          end: 0.5,
          rmsEnergy: 0.5,
          peakEnergy: 0.7,
          energyDelta: 0.5,
          zeroCrossingRate: 0.1,
          silenceRatio: 0.2,
          burstScore: 0.56,
          spectralCentroid: 1400,
          spectralRolloff: 2600,
          spectralFlatness: 0.4,
          spectralFlux: 0,
        }],
        summaries: {
          oneSecond: [{
            index: 0,
            start: 0,
            end: 1,
            windowSize: 1,
            rmsEnergy: 0.5,
            energyMean: 0.5,
            energyMax: 0.5,
            energyStdDev: 0,
            burstCount: 1,
            onsetRate: 1,
            silenceRatio: 0.2,
            activeDuration: 0.5,
            sustainedLoudnessDuration: 0.5,
            strongestAttackTime: 0.25,
            strongestAttackScore: 0.5,
            zeroCrossingRateMean: 0.1,
            spectralCentroidMean: 1400,
            spectralCentroidStdDev: 0,
            spectralRolloffMean: 2600,
            spectralFlatnessMean: 0.4,
            spectralFluxMean: 0,
            spectralFluxMax: 0,
            onsetRegularity: 0,
            rallyTextureScore: 0.5,
            reactionBurstScore: 0.6,
            speechDominanceScore: 0.4,
            musicBedScore: 0.2,
            umpireAnnouncementScore: 0.3,
            applauseCrowdScore: 0.5,
            crowdScore: 0.5,
            commentatorScore: 0.4,
            umpireScore: 0.3,
            playerVocalizationScore: 0.4,
            musicScore: 0.2,
            pointShapeHint: 'short_point',
          }],
          fiveSecond: [{
            index: 0,
            start: 0,
            end: 5,
            windowSize: 5,
            rmsEnergy: 0.5,
            energyMean: 0.5,
            energyMax: 0.5,
            energyStdDev: 0,
            burstCount: 1,
            onsetRate: 0.2,
            silenceRatio: 0.2,
            activeDuration: 0.5,
            sustainedLoudnessDuration: 0.5,
            strongestAttackTime: 0.25,
            strongestAttackScore: 0.5,
            zeroCrossingRateMean: 0.1,
            spectralCentroidMean: 1400,
            spectralCentroidStdDev: 0,
            spectralRolloffMean: 2600,
            spectralFlatnessMean: 0.4,
            spectralFluxMean: 0,
            spectralFluxMax: 0,
            onsetRegularity: 0,
            rallyTextureScore: 0.5,
            reactionBurstScore: 0.6,
            speechDominanceScore: 0.4,
            musicBedScore: 0.2,
            umpireAnnouncementScore: 0.3,
            applauseCrowdScore: 0.5,
            crowdScore: 0.5,
            commentatorScore: 0.4,
            umpireScore: 0.3,
            playerVocalizationScore: 0.4,
            musicScore: 0.2,
            pointShapeHint: 'short_point',
          }],
        },
      },
      audioPeaks: [
        {
          id: 'audio_peak_0',
          groupId: 'audio_peak_group_0',
          windowIndex: 2,
          startTime: 10,
          endTime: 15,
          peakTime: 12.5,
          audioEnergy: 0.9,
          localBaseline: 0.2,
          spikeScore: 0.7,
          percentileRank: 1,
          shape: 'spike',
        },
      ],
      audioReactionEpisodes: [{
        id: 'audio_reaction_episode_0',
        startTime: 0,
        endTime: 25,
        primaryCandidateWindowId: 'candidate_window_0',
        primaryAudioPeakId: 'audio_peak_0',
        primaryAnchorTime: 12.5,
        primaryReason: 'first_strong_reaction',
        confidence: 0.8,
        memberCount: 1,
        members: [{
          candidateWindowId: 'candidate_window_0',
          audioPeakId: 'audio_peak_0',
          anchorTime: 12.5,
          role: 'primary_anchor',
          audioSourceHint: 'crowd_or_reaction',
          spikeScore: 0.7,
          percentileRank: 1,
        }],
        evidence: [{ type: 'audio', ref: 'audio-peak:audio_peak_0' }],
      }],
      candidateWindows: [{
        id: 'candidate_window_0',
        source: 'audio_peak',
        sourceRef: 'audio-peak:audio_peak_0',
        startTime: 0,
        endTime: 25,
        anchorTime: 12.5,
        priority: 'high',
        facets: {
          playPhase: 'live_reaction',
          contentMode: 'live_view',
          transcriptRelation: 'current_action',
        },
        segmentId: null,
        segmentType: null,
        scoreboardPresent: null,
        speechDensity: null,
        audioSourceHint: 'crowd_or_reaction',
        nearbyTranscript: 'What a point',
        linkedEventIds: ['event_0'],
        previousEventId: null,
        evidence: [{ type: 'audio', ref: 'audio-peak:audio_peak_0' }],
      }],
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
    expect(stored.audioPeaks).toHaveLength(1);
    expect(summary.counts.audioPeaks).toBe(1);
    expect(stored.audioProfile?.frames).toHaveLength(1);
    expect(summary.counts.audioProfileFrames).toBe(1);
    expect(summary.counts.audioProfileOneSecondSummaries).toBe(1);
    expect(summary.counts.audioProfileFiveSecondSummaries).toBe(1);
    expect(stored.audioReactionEpisodes).toHaveLength(1);
    expect(summary.counts.audioReactionEpisodes).toBe(1);
    expect(stored.candidateWindows).toHaveLength(1);
    expect(summary.counts.candidateWindows).toBe(1);
    expect(summary.audioPeakCounts).toEqual([{ shape: 'spike', count: 1 }]);
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
