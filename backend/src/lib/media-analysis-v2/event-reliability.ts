import type { Event, EvidenceRef } from './types.js';

const OCR_STATUS_PRIORITY: Record<string, number> = {
  supports: 3,
  weak_support: 2,
  undefined: 1,
  conflicts: 0,
};

const RELATION_TYPE_PRIORITY: Record<string, number> = {
  confirms: 4,
  result_of: 3,
  primary: 2,
  leads_to: 1,
  commentary_on: 0,
  quote_from: 0,
  replay_of: 0,
};

export function annotateEventReliability(events: Event[]): Event[] {
  const rankedIds = events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => compareReliableEvents(left.event, right.event) || left.index - right.index)
    .map(({ event }) => event.id);

  const reliabilityRankById = new Map(rankedIds.map((id, index) => [id, index + 1]));

  return events.map((event) => ({
    ...event,
    ocrSupportStatus: getOcrSupportStatus(event),
    reliabilityRank: reliabilityRankById.get(event.id) ?? null,
  }));
}

export function compareReliableEvents(left: Event, right: Event): number {
  return (
    compareNumber(getOcrSupportPriority(right.evidence), getOcrSupportPriority(left.evidence)) ||
    compareNumber(right.confidence, left.confidence) ||
    compareNumber(getRelationTypePriority(right), getRelationTypePriority(left)) ||
    compareNumber(getEvidenceStrength(right.evidence), getEvidenceStrength(left.evidence)) ||
    compareNumber(right.importance, left.importance) ||
    compareNumber(left.anchorTime, right.anchorTime)
  );
}

export function getOcrSupportStatus(event: Event): 'supports' | 'weak_support' | 'conflicts' | null {
  const ocrEvidence = event.evidence.filter((evidence) => evidence.type === 'ocr_context');
  if (ocrEvidence.some((evidence) => evidence.status === 'conflicts')) {
    return 'conflicts';
  }
  if (ocrEvidence.some((evidence) => evidence.status === 'supports')) {
    return 'supports';
  }
  if (ocrEvidence.some((evidence) => evidence.status === 'weak_support')) {
    return 'weak_support';
  }
  return null;
}

function getOcrSupportPriority(evidence: EvidenceRef[]): number {
  const status = evidence
    .filter((entry) => entry.type === 'ocr_context')
    .reduce<'supports' | 'weak_support' | 'conflicts' | undefined>((best, entry) => {
      const next = entry.status;
      if (!next) return best;
      if (!best) return next;
      return OCR_STATUS_PRIORITY[next] > OCR_STATUS_PRIORITY[best] ? next : best;
    }, undefined);

  return OCR_STATUS_PRIORITY[status ?? 'undefined'];
}

function getRelationTypePriority(event: Event): number {
  return RELATION_TYPE_PRIORITY[event.relationType ?? ''] ?? 0;
}

function getEvidenceStrength(evidence: EvidenceRef[]): number {
  return evidence.reduce((total, item) => total + (item.confidence ?? 0), 0);
}

function compareNumber(left: number, right: number): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
