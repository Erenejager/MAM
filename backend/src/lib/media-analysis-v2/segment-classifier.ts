import type {
  AssetProfile,
  EvidenceRef,
  SegmentSpan,
  SegmentType,
  SpeechMode,
  TimelineIndex,
  TimelineWindow,
} from './types.js';

export function classifySegments(
  timelineIndex: TimelineIndex,
  assetProfile: AssetProfile,
): SegmentSpan[] {
  if (timelineIndex.windows.length === 0) return [];

  const labels = timelineIndex.windows.map((window) => classifyWindow(window, assetProfile));
  const spans: SegmentSpan[] = [];

  let current = labels[0];
  let currentStart = timelineIndex.windows[0].start;
  let currentWindowIndexes = [timelineIndex.windows[0].index];
  let currentEvidence = [...current.evidence];
  let currentConfidenceValues = [current.confidence];

  for (let i = 1; i < labels.length; i++) {
    const label = labels[i];
    const window = timelineIndex.windows[i];

    if (label.type === current.type && label.speechMode === current.speechMode && label.subtype === current.subtype) {
      currentWindowIndexes.push(window.index);
      currentEvidence.push(...label.evidence);
      currentConfidenceValues.push(label.confidence);
      continue;
    }

    spans.push(buildSpan(
      spans.length,
      currentStart,
      timelineIndex.windows[i - 1].end,
      current,
      currentWindowIndexes,
      currentEvidence,
      currentConfidenceValues,
      assetProfile,
    ));

    current = label;
    currentStart = window.start;
    currentWindowIndexes = [window.index];
    currentEvidence = [...label.evidence];
    currentConfidenceValues = [label.confidence];
  }

  spans.push(buildSpan(
    spans.length,
    currentStart,
    timelineIndex.windows[timelineIndex.windows.length - 1].end,
    current,
    currentWindowIndexes,
    currentEvidence,
    currentConfidenceValues,
    assetProfile,
  ));

  return spans;
}

function classifyWindow(
  window: TimelineWindow,
  assetProfile: AssetProfile,
): {
  type: SegmentType;
  subtype: string | null;
  speechMode: SpeechMode;
  scoreboardPresent: boolean | null;
  confidence: number;
  evidence: EvidenceRef[];
} {
  const text = window.transcriptText.toLowerCase();
  const evidence: EvidenceRef[] = [
    { type: 'transcript', ref: `window:${window.index}` },
    { type: 'audio', ref: `window:${window.index}`, confidence: window.audioEnergy },
  ];

  const likelyInterview = window.hasInterviewCue || window.hasQuestionCue;
  const likelyReplay = window.hasReplayCue;
  const likelyScoreMoment = window.hasScoreCue;
  const likelyCommentary = window.hasCommentaryCue || (window.speechDensity > 0.6 && window.audioEnergy < 0.45);
  const likelyCrowd = window.audioEnergy > 0.8 && window.speechDensity < 0.2;
  const strongAnalysisInsert =
    likelyCommentary &&
    !likelyScoreMoment &&
    window.speechDensity > 0.78 &&
    window.audioEnergy < 0.35 &&
    text.length > 90 &&
    hasAnalysisLanguage(text);

  if (likelyReplay) {
    return {
      type: 'replay',
      subtype: null,
      speechMode: 'commentary',
      scoreboardPresent: likelyScoreMoment ? true : null,
      confidence: 0.82,
      evidence,
    };
  }

  if (assetProfile.format === 'press_conference') {
    return {
      type: 'press_conference',
      subtype: null,
      speechMode: likelyInterview ? 'question' : 'interview_answer',
      scoreboardPresent: false,
      confidence: 0.85,
      evidence,
    };
  }

  if (assetProfile.format === 'player_interview') {
    return {
      type: 'player_interview',
      subtype: null,
      speechMode: likelyInterview ? 'interview_answer' : 'reporter_monologue',
      scoreboardPresent: false,
      confidence: 0.82,
      evidence,
    };
  }

  if (likelyCrowd) {
    return {
      type: 'crowd',
      subtype: null,
      speechMode: 'ambient',
      scoreboardPresent: null,
      confidence: 0.65,
      evidence,
    };
  }

  if (assetProfile.format === 'live_match' && assetProfile.domain === 'sports') {
    if (strongAnalysisInsert) {
      return {
        type: 'commentator_insert',
        subtype: 'analysis',
        speechMode: 'commentary',
        scoreboardPresent: null,
        confidence: 0.66,
        evidence,
      };
    }

    return {
      type: 'live_play',
      subtype: null,
      speechMode: window.speechDensity > 0.15 ? 'commentary' : 'ambient',
      scoreboardPresent: likelyScoreMoment ? true : null,
      confidence: likelyScoreMoment ? 0.78 : 0.61,
      evidence,
    };
  }

  if (assetProfile.format === 'mixed_broadcast' && likelyInterview) {
    return {
      type: 'commentator_insert',
      subtype: 'on_camera',
      speechMode: 'reporter_monologue',
      scoreboardPresent: false,
      confidence: 0.74,
      evidence,
    };
  }

  if (likelyInterview && !likelyScoreMoment) {
    return {
      type: 'player_interview',
      subtype: null,
      speechMode: window.hasQuestionCue ? 'question' : 'interview_answer',
      scoreboardPresent: false,
      confidence: 0.68,
      evidence,
    };
  }

  if (likelyCommentary && assetProfile.domain === 'sports' && !likelyScoreMoment) {
    return {
      type: 'commentator_insert',
      subtype: 'analysis',
      speechMode: 'commentary',
      scoreboardPresent: null,
      confidence: 0.62,
      evidence,
    };
  }

  if (assetProfile.domain === 'sports' || likelyScoreMoment) {
    return {
      type: 'live_play',
      subtype: null,
      speechMode: window.speechDensity > 0.15 ? 'commentary' : 'ambient',
      scoreboardPresent: likelyScoreMoment ? true : null,
      confidence: likelyScoreMoment ? 0.76 : 0.58,
      evidence,
    };
  }

  return {
    type: 'unknown',
    subtype: null,
    speechMode: window.speechDensity > 0.5 ? 'reporter_monologue' : null,
    scoreboardPresent: null,
    confidence: 0.4,
    evidence,
  };
}

function hasAnalysisLanguage(text: string): boolean {
  return /(because|pattern|strategy|tactic|adjustment|you can see|the reason|trying to|keeping the point alive|forcing the error|opening up the court|dictating|rushing the forehand|playing one extra ball)/.test(text);
}

function buildSpan(
  index: number,
  start: number,
  end: number,
  label: {
    type: SegmentType;
    subtype: string | null;
    speechMode: SpeechMode;
    scoreboardPresent: boolean | null;
  },
  sourceWindowIndexes: number[],
  evidence: EvidenceRef[],
  confidenceValues: number[],
  assetProfile: AssetProfile,
): SegmentSpan {
  return {
    id: `segment_${index}`,
    start,
    end,
    type: label.type,
    subtype: label.subtype,
    speechMode: label.speechMode,
    scoreboardPresent: label.scoreboardPresent,
    participants: assetProfile.players.length > 0 ? assetProfile.players : assetProfile.teams,
    confidence: average(confidenceValues),
    sourceWindowIndexes,
    evidence,
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}
