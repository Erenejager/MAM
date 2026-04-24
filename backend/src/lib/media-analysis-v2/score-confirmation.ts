import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Event, EvidenceRef } from './types.js';

interface OcrMomentContext {
  momentDir: string;
  label: string | null;
  score: string | null;
  scoreBefore: string | null;
  scoreAfter: string | null;
  scoreChanged: boolean | null;
  peakTime: number | null;
  set_period: string | null;
  audioEnergy: number | null;
}

type OcrSupportStatus = NonNullable<EvidenceRef['status']>;

interface OcrSupportEvaluation {
  score: number;
  status: OcrSupportStatus;
}

export async function addScoreConfirmationEvidence(
  assetDir: string,
  events: Event[],
): Promise<Event[]> {
  const contexts = await loadOcrMomentContexts(assetDir);
  if (contexts.length === 0) {
    return events;
  }

  return events.map((event) => {
    const context = findSupportingOcrContext(event, contexts);
    if (!context) {
      return event;
    }
    const support = evaluateOcrSupport(event, context);

    return {
      ...event,
      confidence: applyOcrSupportToConfidence(event.confidence, support),
      evidence: [
        ...event.evidence,
        buildOcrEvidenceRef(context, support),
      ],
    };
  });
}

async function loadOcrMomentContexts(assetDir: string): Promise<OcrMomentContext[]> {
  const momentsDir = resolve(assetDir, 'moments');

  try {
    const entries = await readdir(momentsDir, { withFileTypes: true });
    const contexts = await Promise.all(entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const filePath = resolve(momentsDir, entry.name, 'context.json');
        try {
          const raw = await readFile(filePath, 'utf-8');
          const parsed = JSON.parse(raw) as Partial<OcrMomentContext>;
          return normalizeOcrMomentContext(entry.name, parsed);
        } catch {
          return null;
        }
      }));

    return contexts
      .filter((context): context is OcrMomentContext => context != null && context.peakTime != null)
      .sort((a, b) => (a.peakTime ?? 0) - (b.peakTime ?? 0));
  } catch {
    return [];
  }
}

function normalizeOcrMomentContext(momentDir: string, input: Partial<OcrMomentContext>): OcrMomentContext {
  return {
    momentDir,
    label: nullableString(input.label),
    score: nullableString(input.score),
    scoreBefore: nullableString(input.scoreBefore),
    scoreAfter: nullableString(input.scoreAfter),
    scoreChanged: typeof input.scoreChanged === 'boolean' ? input.scoreChanged : null,
    peakTime: typeof input.peakTime === 'number' ? input.peakTime : null,
    set_period: nullableString(input.set_period),
    audioEnergy: typeof input.audioEnergy === 'number' ? input.audioEnergy : null,
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function findSupportingOcrContext(
  event: Event,
  contexts: OcrMomentContext[],
): OcrMomentContext | null {
  const windowSeconds = event.type === 'set_won' || event.type === 'match_won' ? 120 : 45;
  const nearby = contexts
    .filter((context) => context.peakTime != null && Math.abs(context.peakTime - event.anchorTime) <= windowSeconds)
    .sort((a, b) =>
      evaluateOcrSupport(event, b).score - evaluateOcrSupport(event, a).score ||
      Math.abs((a.peakTime ?? 0) - event.anchorTime) - Math.abs((b.peakTime ?? 0) - event.anchorTime),
    );

  return nearby.find((context) => {
    const support = evaluateOcrSupport(event, context);
    return support.status === 'conflicts' || support.score >= 0.55;
  }) ?? null;
}

function evaluateOcrSupport(event: Event, context: OcrMomentContext): OcrSupportEvaluation {
  const score = scoreOcrSupport(event, context);
  if (hasObviousOcrConflict(event, context)) {
    return {
      score: Math.min(score, 0.35),
      status: 'conflicts',
    };
  }

  if (hasInconsistentOcrScoreFields(event, context)) {
    return {
      score: Math.min(score, 0.68),
      status: 'weak_support',
    };
  }

  return {
    score,
    status: score >= 0.72 ? 'supports' : 'weak_support',
  };
}

function scoreOcrSupport(event: Event, context: OcrMomentContext): number {
  const eventLabel = event.label.toLowerCase();
  const contextLabel = (context.label ?? '').toLowerCase();
  let score = 0;

  const distance = context.peakTime == null ? Infinity : Math.abs(context.peakTime - event.anchorTime);
  if (distance <= 10) score += 0.3;
  else if (distance <= 30) score += 0.22;
  else if (distance <= 60) score += 0.12;
  else if (distance <= 120 && (event.type === 'set_won' || event.type === 'match_won')) score += 0.08;

  if (event.type === 'set_won' && /set/.test(contextLabel)) score += 0.45;
  if (event.type === 'match_won' && /match/.test(contextLabel)) score += 0.45;
  if (event.type === 'game_won' && /(breaks?|holds?|leads?|game)/.test(contextLabel)) score += 0.35;
  if (event.type === 'point_won' && /(wins? point|winner|rally|saved|break point|overhead|brilliant|spectacular)/.test(contextLabel)) score += 0.3;
  if (event.type === 'pressure_state' && /(break point|set point|match point|advantage)/.test(contextLabel)) score += 0.35;

  if (hasSharedImportantToken(eventLabel, contextLabel)) score += 0.18;
  if (context.score || context.scoreBefore || context.scoreAfter) score += 0.08;
  if ((context.audioEnergy ?? 0) >= 0.75) score += 0.06;

  return Math.min(0.95, score);
}

function hasSharedImportantToken(a: string, b: string): boolean {
  const important = ['djokovic', 'alcaraz', 'break', 'point', 'set', 'match', 'rally', 'serve', 'saved', 'winner'];
  return important.some((token) => a.includes(token) && b.includes(token));
}

function hasObviousOcrConflict(event: Event, context: OcrMomentContext): boolean {
  const contextLabel = (context.label ?? '').toLowerCase();
  const distance = context.peakTime == null ? Infinity : Math.abs(context.peakTime - event.anchorTime);
  if (distance > 30) {
    return false;
  }

  if (event.type === 'set_won') {
    return /\bmatch\b/.test(contextLabel) && !/\bset\b/.test(contextLabel);
  }
  if (event.type === 'match_won') {
    return /\bset\b/.test(contextLabel) && !/\bmatch\b/.test(contextLabel);
  }
  if (event.type === 'game_won') {
    return /\b(wins?|takes?)\s+(the\s+)?(set|match)\b/.test(contextLabel);
  }

  return false;
}

function hasInconsistentOcrScoreFields(event: Event, context: OcrMomentContext): boolean {
  if (hasInconsistentSetPeriod(context)) {
    return true;
  }

  const eventScore = extractEventResultScore(event.label);
  if (!eventScore) {
    return false;
  }

  const contextText = [
    context.label,
    context.score,
    context.scoreBefore,
    context.scoreAfter,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!contextText) {
    return false;
  }

  const scoreCandidates = extractTennisScoreCandidates(contextText);
  if (scoreCandidates.length === 0) {
    return false;
  }

  const normalizedEventScore = normalizeScore(eventScore);
  return !scoreCandidates.some((candidate) =>
    normalizeScore(candidate) === normalizedEventScore ||
    normalizeScore(reverseScore(candidate)) === normalizedEventScore,
  );
}

function hasInconsistentSetPeriod(context: OcrMomentContext): boolean {
  const contextLabel = (context.label ?? '').toLowerCase();
  const period = (context.set_period ?? '').toLowerCase();
  const labelSet = contextLabel.match(/\bset\s*(\d+)\b/)?.[1] ?? null;
  const periodSet = period.match(/\bset\s*(\d+)\b/)?.[1] ?? null;
  return labelSet != null && periodSet != null && labelSet !== periodSet;
}

function extractEventResultScore(label: string): string | null {
  const lower = label.toLowerCase();
  const explicitResult = lower.match(/\b(?:for|leads?|wins?|takes?)\s+(\d+-\d+)\b/);
  if (explicitResult) {
    return explicitResult[1];
  }

  const score = lower.match(/\b(\d+-\d+)\b/);
  return score?.[1] ?? null;
}

function extractTennisScoreCandidates(text: string): string[] {
  const candidates: string[] = [];
  const resultMatches = text.matchAll(/\b(?:for|leads?|wins?|takes?|score=|before=|after=)\s*(\d+-\d+)\b/g);
  for (const match of resultMatches) {
    candidates.push(match[1]);
  }

  return candidates.filter((score) => !isPointScore(score));
}

function isPointScore(score: string): boolean {
  const [left, right] = score.split('-').map(Number);
  return left > 7 || right > 7;
}

function normalizeScore(score: string): string {
  return score.replace(/\s+/g, '');
}

function reverseScore(score: string): string {
  const [left, right] = score.split('-');
  return `${right}-${left}`;
}

function buildOcrEvidenceNote(context: OcrMomentContext, status: OcrSupportStatus): string {
  const parts = [`OCR ${status}: ${context.label ?? 'unlabeled moment'}`];
  if (context.score) parts.push(`score=${context.score}`);
  if (context.scoreBefore) parts.push(`before=${context.scoreBefore}`);
  if (context.scoreAfter) parts.push(`after=${context.scoreAfter}`);
  if (context.set_period) parts.push(context.set_period);
  return parts.join(' | ');
}

function buildOcrEvidenceRef(
  context: OcrMomentContext,
  support: OcrSupportEvaluation,
): EvidenceRef {
  return {
    type: 'ocr_context',
    ref: `ocr-context:${context.momentDir}`,
    confidence: support.score,
    status: support.status,
    note: buildOcrEvidenceNote(context, support.status),
    metadata: {
      label: context.label,
      score: context.score,
      scoreBefore: context.scoreBefore,
      scoreAfter: context.scoreAfter,
      scoreChanged: context.scoreChanged,
      peakTime: context.peakTime,
      setPeriod: context.set_period,
      audioEnergy: context.audioEnergy,
    },
  };
}

function applyOcrSupportToConfidence(
  currentConfidence: number,
  support: OcrSupportEvaluation,
): number {
  if (support.status === 'supports') {
    return Math.min(0.98, Math.max(currentConfidence, support.score, currentConfidence + 0.05));
  }

  if (support.status === 'conflicts') {
    return Math.max(0.2, Math.min(currentConfidence - 0.18, support.score + 0.15));
  }

  return Math.min(0.95, Math.max(currentConfidence, support.score));
}
