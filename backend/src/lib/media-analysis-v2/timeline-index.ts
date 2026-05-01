import type {
  AudioProfile,
  AudioProfileContextHint,
  AudioProfileWindowSummary,
  TimelineIndex,
  TimelineWindow,
  TranscriptSegment,
} from './types.js';
import { computeAudioProfile } from './video-utils.js';
import { hasScoreCue } from './sports-keywords.js';

const INTERVIEW_CUES = [
  'interview',
  'speaking to',
  'joins us',
  'joined by',
  'how does it feel',
  'tell us',
  'you said',
  'question',
  'answer',
];

const COMMENTARY_CUES = [
  'looking at',
  'back underway',
  'what a',
  'here we go',
  'live pictures',
  'from the sideline',
  'on the touchline',
  'let us look',
];

const REPLAY_CUES = [
  'replay',
  'take another look',
  'let us see that again',
  'again here',
  'slow motion',
];

export async function buildTimelineIndex(
  videoPath: string,
  durationSeconds: number,
  transcriptSegments: TranscriptSegment[],
  windowSize = 5,
): Promise<TimelineIndex> {
  const audioProfile = await computeAudioProfile(videoPath, durationSeconds, 0.5);
  const audioEnergies = audioProfile.summaries.fiveSecond.map((summary) => summary.rmsEnergy);
  const windowCount = Math.ceil(durationSeconds / windowSize);
  const windows: TimelineWindow[] = [];

  for (let i = 0; i < windowCount; i++) {
    const start = i * windowSize;
    const end = Math.min(durationSeconds, start + windowSize);
    const overlapping = transcriptSegments.filter((segment) => segment.end > start && segment.start < end);
    const transcriptText = overlapping.map((segment) => segment.text.trim()).join(' ').trim();
    const normalizedText = transcriptText.toLowerCase();
    const speechSeconds = overlapping.reduce((sum, segment) => {
      const overlapStart = Math.max(start, segment.start);
      const overlapEnd = Math.min(end, segment.end);
      return sum + Math.max(0, overlapEnd - overlapStart);
    }, 0);

    windows.push({
      index: i,
      start,
      end,
      transcriptText,
      transcriptSegments: overlapping,
      speechDensity: speechSeconds / Math.max(1, end - start),
      audioEnergy: audioEnergies[i] ?? 0,
      hasQuestionCue: normalizedText.includes('?'),
      hasInterviewCue: includesAny(normalizedText, INTERVIEW_CUES),
      hasCommentaryCue: includesAny(normalizedText, COMMENTARY_CUES),
      hasReplayCue: includesAny(normalizedText, REPLAY_CUES),
      hasScoreCue: hasScoreCue(normalizedText),
    });
  }

  return { windowSize, windows, audioProfile: applyAudioProfileTimelineContext(audioProfile, windows) };
}

function includesAny(text: string, cues: string[]): boolean {
  return cues.some((cue) => text.includes(cue));
}

export function applyAudioProfileTimelineContext(
  audioProfile: AudioProfile,
  windows: TimelineWindow[],
): AudioProfile {
  return {
    ...audioProfile,
    summaries: {
      oneSecond: audioProfile.summaries.oneSecond.map((summary) =>
        addSummaryContext(summary, windows),
      ),
      fiveSecond: audioProfile.summaries.fiveSecond.map((summary) =>
        addSummaryContext(summary, windows),
      ),
    },
  };
}

function addSummaryContext(
  summary: AudioProfileWindowSummary,
  windows: TimelineWindow[],
): AudioProfileWindowSummary {
  return {
    ...summary,
    context: deriveContextHint(summary, summarizeWindowContext(summary, windows)),
  };
}

function summarizeWindowContext(
  summary: AudioProfileWindowSummary,
  windows: TimelineWindow[],
): Pick<AudioProfileContextHint, 'speechDensity' | 'hasCommentaryCue' | 'hasReplayCue' | 'hasScoreCue'> {
  const overlaps = windows
    .map((window) => ({
      window,
      overlap: Math.max(0, Math.min(summary.end, window.end) - Math.max(summary.start, window.start)),
    }))
    .filter((item) => item.overlap > 0);
  const totalOverlap = overlaps.reduce((sum, item) => sum + item.overlap, 0);

  return {
    speechDensity: round3(totalOverlap > 0
      ? overlaps.reduce((sum, item) => sum + item.window.speechDensity * item.overlap, 0) / totalOverlap
      : 0),
    hasCommentaryCue: overlaps.some((item) => item.window.hasCommentaryCue),
    hasReplayCue: overlaps.some((item) => item.window.hasReplayCue),
    hasScoreCue: overlaps.some((item) => item.window.hasScoreCue),
  };
}

function deriveContextHint(
  summary: AudioProfileWindowSummary,
  context: Pick<AudioProfileContextHint, 'speechDensity' | 'hasCommentaryCue' | 'hasReplayCue' | 'hasScoreCue'>,
): AudioProfileContextHint {
  const suppressionReasons: AudioProfileContextHint['suppressionReasons'] = [];
  const highSpeechPenalty = context.speechDensity >= 0.9
    ? 0.35
    : context.speechDensity >= 0.8
      ? 0.2
      : context.speechDensity >= 0.65
        ? 0.08
        : 0;
  const highSpeechReason = context.speechDensity >= 0.75
    ? 'high_speech_density'
    : null;
  const commentaryPenalty = context.hasCommentaryCue && context.speechDensity >= 0.8
    ? 0.08
    : 0;
  const replayPenalty = context.hasReplayCue ? 0.18 : 0;
  const musicPenalty = summary.musicBedScore >= 0.65 ? 0.12 : 0;

  if (highSpeechReason) suppressionReasons.push(highSpeechReason);
  if (commentaryPenalty > 0) suppressionReasons.push('commentary_cue');
  if (replayPenalty > 0) suppressionReasons.push('replay_cue');
  if (musicPenalty > 0) suppressionReasons.push('music_bed');
  if (summary.reactionBurstScore < 0.45) suppressionReasons.push('weak_reaction_burst');

  const rallySuppression = highSpeechPenalty + replayPenalty + musicPenalty;
  const reactionSuppression = replayPenalty + musicPenalty + (highSpeechPenalty * 0.5);
  const speechBoost = context.speechDensity * 0.35 + (context.hasCommentaryCue ? 0.12 : 0);
  const musicBoost = context.hasReplayCue ? 0.08 : 0;

  const adjusted = {
    rallyTextureScore: round3(clamp01(summary.rallyTextureScore - rallySuppression)),
    reactionBurstScore: round3(clamp01(summary.reactionBurstScore - reactionSuppression)),
    speechDominanceScore: round3(clamp01(summary.speechDominanceScore + speechBoost)),
    musicBedScore: round3(clamp01(summary.musicBedScore + musicBoost)),
    applauseCrowdScore: round3(clamp01(summary.applauseCrowdScore - replayPenalty - (highSpeechPenalty * 0.35))),
    crowdScore: round3(clamp01(summary.crowdScore - replayPenalty - (highSpeechPenalty * 0.35))),
    commentatorScore: round3(clamp01(summary.commentatorScore + speechBoost + (context.hasCommentaryCue ? 0.08 : 0))),
    umpireScore: round3(clamp01(summary.umpireScore - replayPenalty + (context.hasScoreCue ? 0.05 : 0))),
    playerVocalizationScore: round3(clamp01(summary.playerVocalizationScore - replayPenalty - (highSpeechPenalty * 0.5))),
    musicScore: round3(clamp01(summary.musicScore + musicBoost)),
  };

  if (adjusted.speechDominanceScore >= 0.78) suppressionReasons.push('speech_dominance');

  return {
    ...context,
    ...adjusted,
    pointShapeHint: inferContextPointShape(summary, adjusted, suppressionReasons),
    suppressionReasons,
  };
}

function inferContextPointShape(
  summary: AudioProfileWindowSummary,
  adjusted: Pick<AudioProfileContextHint,
    | 'rallyTextureScore'
    | 'reactionBurstScore'
    | 'speechDominanceScore'
    | 'musicBedScore'
  >,
  suppressionReasons: AudioProfileContextHint['suppressionReasons'],
): AudioProfileWindowSummary['pointShapeHint'] {
  if (
    suppressionReasons.includes('replay_cue') ||
    adjusted.speechDominanceScore >= 0.78 ||
    (adjusted.musicBedScore >= 0.7 && adjusted.reactionBurstScore < 0.65)
  ) {
    return 'recap_only';
  }

  if (adjusted.reactionBurstScore >= 0.68 && adjusted.rallyTextureScore < 0.35) return 'reaction_only';
  if (adjusted.reactionBurstScore >= 0.68 && summary.rallyTextureScore >= 0.5) {
    if (summary.activeDuration >= 8) return 'long_rally';
    if (summary.activeDuration >= 3) return 'medium_rally';
    return 'short_point';
  }
  if (adjusted.rallyTextureScore >= 0.55 && adjusted.reactionBurstScore >= 0.45) {
    if (summary.activeDuration >= 8) return 'long_rally';
    if (summary.activeDuration >= 3) return 'medium_rally';
    return 'short_point';
  }
  if (summary.activeDuration > 0 && summary.activeDuration < 3 && adjusted.reactionBurstScore >= 0.45) {
    return 'short_point';
  }
  return 'unknown';
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}
