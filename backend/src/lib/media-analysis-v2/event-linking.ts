import type { Event, SegmentSpan } from './types.js';

export function linkRelatedEvents(
  events: Event[],
  segments: SegmentSpan[],
): Event[] {
  const primaryEvents = events.filter((event) => event.relationType === 'primary');

  const segmentLinked = events.map((event) => {
    if (event.relationType === 'primary') return event;

    const segment = segments.find((candidate) => candidate.id === event.segmentId);
    if (!segment) return event;

    const parent = primaryEvents.find((candidate) =>
      candidate.anchorTime <= event.anchorTime &&
      event.anchorTime - candidate.anchorTime <= 45,
    ) ?? primaryEvents.find((candidate) =>
      Math.abs(candidate.anchorTime - event.anchorTime) <= 45,
    );

    if (!parent) return event;

    return {
      ...event,
      parentEventId: parent.id,
      relationType: event.relationType ?? inferRelationFromSegment(segment),
    };
  });

  return linkTennisSequences(segmentLinked);
}

function inferRelationFromSegment(segment: SegmentSpan): Event['relationType'] {
  if (segment.type === 'replay') return 'replay_of';
  if (segment.type === 'commentator_insert') return 'commentary_on';
  if (segment.type === 'player_interview' || segment.type === 'press_conference') return 'quote_from';
  return null;
}

function linkTennisSequences(events: Event[]): Event[] {
  return events.map((event) => {
    if (event.relationType !== 'primary') {
      return event;
    }

    const link = findTennisSequenceLink(event, events);
    if (!link) {
      return event;
    }

    return {
      ...event,
      parentEventId: link.parent.id,
      relationType: link.relationType,
      evidence: [
        ...event.evidence,
        {
          type: 'heuristic',
          ref: `event-link:${event.id}->${link.parent.id}`,
          confidence: link.confidence,
          note: link.note,
        },
      ],
    };
  });
}

function findTennisSequenceLink(
  event: Event,
  events: Event[],
): { parent: Event; relationType: NonNullable<Event['relationType']>; confidence: number; note: string } | null {
  if (event.type === 'pressure_state') {
    const result = events.find((candidate) =>
      candidate.id !== event.id &&
      candidate.relationType === 'primary' &&
      candidate.anchorTime >= event.anchorTime &&
      candidate.anchorTime - event.anchorTime <= 75 &&
      isCompatiblePressureResult(event, candidate),
    );

    return result
      ? {
          parent: result,
          relationType: 'leads_to',
          confidence: 0.62,
          note: 'heuristic tennis pressure state linked to nearby compatible result',
        }
      : null;
  }

  if (event.type === 'point_won') {
    const result = events.find((candidate) =>
      candidate.id !== event.id &&
      candidate.relationType === 'primary' &&
      candidate.type === 'game_won' &&
      candidate.anchorTime >= event.anchorTime &&
      candidate.anchorTime - event.anchorTime <= 20 &&
      hasMeaningfulLabelOverlap(event.label, candidate.label),
    );

    return result
      ? {
          parent: result,
          relationType: 'confirms',
          confidence: 0.68,
          note: 'heuristic tennis point outcome confirms nearby game result',
        }
      : null;
  }

  return null;
}

function isCompatiblePressureResult(pressure: Event, result: Event): boolean {
  const label = pressure.label.toLowerCase();

  if (label.includes('set point')) return result.type === 'set_won' || result.type === 'point_won';
  if (label.includes('match point')) return result.type === 'match_won' || result.type === 'point_won';
  if (label.includes('break point') || label.includes('game point')) {
    return result.type === 'point_won' || result.type === 'game_won';
  }

  return false;
}

function hasMeaningfulLabelOverlap(a: string, b: string): boolean {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  let overlap = 0;

  for (const token of aTokens) {
    if (bTokens.has(token)) overlap++;
  }

  return overlap >= 2;
}

function tokenSet(label: string): Set<string> {
  const stopWords = new Set(['the', 'and', 'that', 'this', 'with', 'which', 'into', 'from', 'still', 'quite']);
  return new Set(
    label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2 && !stopWords.has(token)),
  );
}
