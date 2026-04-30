import type {
  AudioPeak,
  CandidateContentMode,
  CandidatePlayPhase,
  CandidateTranscriptRelation,
  CandidateWindowPacket,
  Event,
  SegmentSpan,
  TimelineIndex,
} from './types.js';

export function buildCandidateWindowPackets(
  timelineIndex: TimelineIndex,
  segments: SegmentSpan[],
  audioPeaks: AudioPeak[],
  events: Event[],
): CandidateWindowPacket[] {
  return audioPeaks
    .map((peak, index) => buildAudioPeakPacket(index, peak, timelineIndex, segments, events))
    .filter((packet) => packet.priority !== 'low' || packet.linkedEventIds.length > 0);
}

function buildAudioPeakPacket(
  index: number,
  peak: AudioPeak,
  timelineIndex: TimelineIndex,
  segments: SegmentSpan[],
  events: Event[],
): CandidateWindowPacket {
  const segment = findSegmentAt(segments, peak.peakTime);
  const peakWindow = timelineIndex.windows.find((window) => window.index === peak.windowIndex) ?? null;
  const nearbyTranscript = transcriptAround(timelineIndex, peak.peakTime, 12, 18);
  const normalized = nearbyTranscript.toLowerCase();
  const linkedEvents = findLinkedEvents(events, peak.peakTime, peak.startTime, peak.endTime);
  const previousEvent = findPreviousEvent(events, peak.peakTime);
  const facets = {
    playPhase: inferPlayPhase(peak, segment, normalized),
    contentMode: inferContentMode(segment, normalized),
    transcriptRelation: inferTranscriptRelation(segment, normalized),
  };

  return {
    id: `candidate_window_${index}`,
    source: 'audio_peak',
    sourceRef: `audio-peak:${peak.id}`,
    startTime: Number(Math.max(0, peak.peakTime - 15).toFixed(3)),
    endTime: Number((peak.peakTime + 20).toFixed(3)),
    anchorTime: peak.peakTime,
    priority: inferPriority(peak, facets, linkedEvents),
    facets,
    segmentId: segment?.id ?? null,
    segmentType: segment?.type ?? null,
    scoreboardPresent: segment?.scoreboardPresent ?? null,
    speechDensity: peakWindow?.speechDensity ?? null,
    audioSourceHint: inferAudioSourceHint(peak, peakWindow?.speechDensity ?? null, nearbyTranscript),
    nearbyTranscript,
    linkedEventIds: linkedEvents.map((event) => event.id),
    previousEventId: previousEvent?.id ?? null,
    evidence: [{
      type: 'audio',
      ref: `audio-peak:${peak.id}`,
      confidence: audioEvidenceConfidence(peak),
      note: 'candidate window seeded by audio peak for later adjudication',
      metadata: {
        peakTime: peak.peakTime,
        audioEnergy: peak.audioEnergy,
        localBaseline: peak.localBaseline,
        spikeScore: peak.spikeScore,
        percentileRank: peak.percentileRank,
        audioPeakShape: peak.shape,
      },
    }],
  };
}

function inferAudioSourceHint(
  peak: AudioPeak,
  speechDensity: number | null,
  transcript: string,
): CandidateWindowPacket['audioSourceHint'] {
  const text = transcript.toLowerCase();
  if ((speechDensity ?? 0) >= 0.65 && peak.spikeScore < 0.25) {
    return 'speech_or_commentary';
  }

  if (/\b(?:fans roar|crowd|applause|cheers?|roar)\b/.test(text)) {
    return 'crowd_or_reaction';
  }

  if (peak.shape === 'spike' && peak.spikeScore >= 0.35 && peak.percentileRank >= 0.98) {
    return 'crowd_or_reaction';
  }

  return 'mixed_or_unknown';
}

function findSegmentAt(segments: SegmentSpan[], time: number): SegmentSpan | null {
  return segments.find((segment) => time >= segment.start && time <= segment.end) ?? null;
}

function findLinkedEvents(
  events: Event[],
  time: number,
  startTime: number,
  endTime: number,
): Event[] {
  return events.filter((event) =>
    Math.abs(event.anchorTime - time) <= 10 ||
    (event.startTime != null && event.endTime != null && event.startTime <= endTime && event.endTime >= startTime),
  );
}

function findPreviousEvent(events: Event[], time: number): Event | null {
  return events
    .filter((event) => event.anchorTime < time && time - event.anchorTime <= 90)
    .sort((a, b) => b.anchorTime - a.anchorTime)[0] ?? null;
}

function inferPlayPhase(
  peak: AudioPeak,
  segment: SegmentSpan | null,
  text: string,
): CandidatePlayPhase {
  if (hasChangeoverCue(text)) return 'changeover_or_break';
  if (hasNextPointSetupCue(text)) return 'between_points';
  if (segment?.type === 'crowd' || segment?.type === 'replay') return 'between_points';
  if (segment?.type === 'live_play' && peak.shape === 'spike' && peak.spikeScore >= 0.25) return 'live_reaction';
  if (segment?.type === 'live_play') return 'live_action';
  return 'unknown';
}

function inferContentMode(
  segment: SegmentSpan | null,
  text: string,
): CandidateContentMode {
  if (segment?.type === 'replay' || hasReplayCue(text)) return 'replay_or_slow_motion';
  if (hasBenchCue(text)) return 'bench_or_player_closeup';
  if (segment?.type === 'crowd') return 'crowd_or_atmosphere';
  if (segment?.type === 'studio_analysis' || segment?.type === 'graphics_only') return 'studio_or_graphic';
  if (segment?.type === 'live_play') return 'live_view';
  return 'unknown';
}

function inferTranscriptRelation(
  segment: SegmentSpan | null,
  text: string,
): CandidateTranscriptRelation {
  if (!text) return 'unknown';
  if (hasNextPointSetupCue(text)) return 'next_point_setup';
  if (hasReplayCue(text) || hasRecapCue(text) || segment?.type === 'replay') return 'previous_action_recap';
  if (hasTennisActionCue(text) || hasReactionCue(text)) return 'current_action';
  return 'generic';
}

function inferPriority(
  peak: AudioPeak,
  facets: CandidateWindowPacket['facets'],
  linkedEvents: Event[],
): CandidateWindowPacket['priority'] {
  if (linkedEvents.length > 0) return 'high';
  if (
    peak.percentileRank >= 0.985 &&
    peak.shape === 'spike' &&
    (facets.playPhase === 'live_reaction' || facets.transcriptRelation === 'current_action')
  ) {
    return 'high';
  }
  if (
    peak.percentileRank >= 0.95 &&
    (
      facets.contentMode === 'replay_or_slow_motion' ||
      facets.playPhase === 'changeover_or_break' ||
      facets.transcriptRelation === 'next_point_setup'
    )
  ) {
    return 'medium';
  }
  if (peak.percentileRank >= 0.95 && peak.spikeScore >= 0.2) return 'medium';
  return 'low';
}

function transcriptAround(
  timelineIndex: TimelineIndex,
  time: number,
  beforeSeconds: number,
  afterSeconds: number,
): string {
  return timelineIndex.windows
    .filter((window) => window.end >= time - beforeSeconds && window.start <= time + afterSeconds)
    .map((window) => window.transcriptText.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 500);
}

function audioEvidenceConfidence(peak: AudioPeak): number {
  const shapeBonus = peak.shape === 'spike' ? 0.08 : 0.03;
  return Number(Math.min(0.82, peak.percentileRank * 0.38 + Math.max(0, peak.spikeScore) * 0.38 + shapeBonus).toFixed(3));
}

function hasReplayCue(text: string): boolean {
  return /\b(?:slow motion|slow-mo|replay|take another look|look again|look at that|this was|that was)\b/.test(text);
}

function hasRecapCue(text: string): boolean {
  return /\b(?:after that last point|previous point|last point|still can't believe|what a point|remind ourselves)\b/.test(text);
}

function hasBenchCue(text: string): boolean {
  return /\b(?:bench|changeover|change over|sit down|sitting down|chair|resting|towel|between games|players sit)\b/.test(text);
}

function hasChangeoverCue(text: string): boolean {
  return hasBenchCue(text) || /\b(?:three holds|two holds|holds on the board|between sets|end of the set)\b/.test(text);
}

function hasNextPointSetupCue(text: string): boolean {
  return /\b(?:to serve|serving now|about to serve|new balls|advantage|deuce|ready to serve|at the line)\b/.test(text);
}

function hasReactionCue(text: string): boolean {
  return /\b(?:are you kidding me|oh my god|unbelievable|incredible|brilliant|sensational|spectacular|goodness me|what a)\b/.test(text);
}

function hasTennisActionCue(text: string): boolean {
  return /\b(?:point|rally|forehand|backhand|serve|return|volley|winner|passing shot|overhead|break point|set point|match point|deuce)\b/.test(text);
}
