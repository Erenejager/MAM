import type { AssetProfile, Event, SegmentSpan, TimelineIndex } from './types.js';

interface ValidationContext {
  assetProfile: AssetProfile;
  timelineIndex: TimelineIndex;
  segments: SegmentSpan[];
}

export function validateAndNormalizeEvents(
  events: Event[],
  context: ValidationContext,
): Event[] {
  const normalized = events
    .map((event) => validateEvent(event, context))
    .filter((event): event is Event => event.validationStatus !== 'rejected')
    .sort((a, b) => a.anchorTime - b.anchorTime);

  return dedupeNormalized(normalized);
}

function validateEvent(event: Event, context: ValidationContext): Event {
  const segment = context.segments.find((candidate) => candidate.id === event.segmentId);
  if (!segment) {
    return { ...event, validationStatus: 'rejected', confidence: 0.1 };
  }

  if (segment.type === 'replay' && event.type !== 'quote' && event.type !== 'analysis_point') {
    return {
      ...event,
      validationStatus: 'validated',
      confidence: Math.max(event.confidence, 0.7),
      relationType: 'replay_of',
    };
  }

  if (segment.type === 'commentator_insert' && event.type === 'analysis_point') {
    return {
      ...event,
      validationStatus: 'validated',
      confidence: Math.max(event.confidence, 0.65),
      relationType: 'commentary_on',
    };
  }

  if ((segment.type === 'player_interview' || segment.type === 'press_conference') && event.type === 'quote') {
    return {
      ...event,
      validationStatus: 'validated',
      confidence: Math.max(event.confidence, 0.68),
      relationType: 'quote_from',
    };
  }

  if (segment.type === 'live_play') {
    const supportingWindow = context.timelineIndex.windows.find(
      (window) => event.anchorTime >= window.start && event.anchorTime <= window.end,
    );

    if (!supportingWindow) {
      return { ...event, validationStatus: 'rejected', confidence: 0.2 };
    }

    const evidenceStrength =
      (supportingWindow.hasScoreCue ? 0.35 : 0) +
      (supportingWindow.audioEnergy > 0.75 ? 0.25 : 0) +
      (segment.scoreboardPresent ? 0.2 : 0) +
      (segment.confidence > 0.7 ? 0.1 : 0);

    const finalConfidence = Math.min(0.95, Math.max(event.confidence, 0.35 + evidenceStrength));
    const shouldReject =
      (
        event.type === 'unknown' &&
        !supportingWindow.hasScoreCue &&
        supportingWindow.audioEnergy < 0.65
      ) ||
      (
        supportingWindow.hasReplayCue &&
        !supportingWindow.hasScoreCue &&
        event.type !== 'set_won' &&
        event.type !== 'match_won'
      );

    return {
      ...event,
      confidence: finalConfidence,
      validationStatus: shouldReject ? 'rejected' : 'validated',
      relationType: 'primary',
    };
  }

  return {
    ...event,
    validationStatus: event.confidence >= 0.55 ? 'validated' : 'rejected',
    relationType: event.relationType ?? null,
  };
}

function dedupeNormalized(events: Event[]): Event[] {
  const deduped: Event[] = [];

  for (const event of events) {
    const duplicateIndex = deduped.findIndex((existing) =>
      existing.segmentId === event.segmentId &&
      existing.type === event.type &&
      Math.abs(existing.anchorTime - event.anchorTime) < 4,
    );

    if (duplicateIndex === -1) {
      deduped.push(event);
      continue;
    }

    if (event.confidence > deduped[duplicateIndex].confidence) {
      deduped[duplicateIndex] = event;
    }
  }

  return deduped;
}
