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
  transitionStatus: OcrTransitionStatus;
  selectedBy: OcrSelectionReason;
}

type OcrTransitionStatus = 'supports_result' | 'supports_state' | 'conflicts_result' | 'unknown';
type OcrSelectionReason = 'transition_match' | 'label_match' | 'timing_match' | 'conflict_match';

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
    .map((context) => ({ context, support: evaluateOcrSupport(event, context) }))
    .sort((a, b) =>
      rankOcrCandidate(event, b.context, b.support) - rankOcrCandidate(event, a.context, a.support) ||
      Math.abs((a.context.peakTime ?? 0) - event.anchorTime) - Math.abs((b.context.peakTime ?? 0) - event.anchorTime),
    );

  return nearby.find(({ support }) =>
    (
      support.status === 'conflicts' ||
      support.transitionStatus === 'conflicts_result' ||
      support.score >= 0.55
    )
  )?.context ?? null;
}

function rankOcrCandidate(
  event: Event,
  context: OcrMomentContext,
  support: OcrSupportEvaluation,
): number {
  const distance = context.peakTime == null ? Infinity : Math.abs(context.peakTime - event.anchorTime);
  let rank = support.score;

  if (support.selectedBy === 'transition_match') rank += 0.12;
  if (support.selectedBy === 'timing_match') rank -= 0.04;
  if (support.selectedBy === 'conflict_match') rank -= 0.18;

  if (distance <= 10) rank += 0.02;
  return rank;
}

function evaluateOcrSupport(event: Event, context: OcrMomentContext): OcrSupportEvaluation {
  const score = scoreOcrSupport(event, context);
  const transitionStatus = evaluateOcrScoreTransition(event, context);
  const selectedBy = classifyOcrSelectionReason(event, context, score, transitionStatus);

  if (hasObviousOcrConflict(event, context) && !isSupportingTransition(transitionStatus)) {
    return {
      score: Math.min(score, 0.35),
      status: 'conflicts',
      transitionStatus,
      selectedBy: 'conflict_match',
    };
  }

  if (transitionStatus === 'conflicts_result') {
    return {
      score: Math.min(score, 0.5),
      status: 'weak_support',
      transitionStatus,
      selectedBy: 'conflict_match',
    };
  }

  if (hasInconsistentOcrScoreFields(event, context)) {
    return {
      score: Math.min(score, 0.68),
      status: 'weak_support',
      transitionStatus,
      selectedBy,
    };
  }

  return {
    score,
    status: score >= 0.72 ? 'supports' : 'weak_support',
    transitionStatus,
    selectedBy,
  };
}

function isSupportingTransition(transitionStatus: OcrTransitionStatus): boolean {
  return transitionStatus === 'supports_result' || transitionStatus === 'supports_state';
}

function classifyOcrSelectionReason(
  event: Event,
  context: OcrMomentContext,
  score: number,
  transitionStatus: OcrTransitionStatus,
): OcrSelectionReason {
  if (transitionStatus === 'supports_result' || transitionStatus === 'supports_state') {
    return 'transition_match';
  }

  if (transitionStatus === 'conflicts_result') {
    return 'conflict_match';
  }

  const contextLabel = (context.label ?? '').toLowerCase();
  if (
    hasSharedImportantToken(event.label.toLowerCase(), contextLabel) ||
    hasEventTypeLabelCue(event.type, contextLabel)
  ) {
    return 'label_match';
  }

  return score >= 0.55 ? 'timing_match' : 'conflict_match';
}

function hasEventTypeLabelCue(eventType: Event['type'], contextLabel: string): boolean {
  if (eventType === 'set_won') return /\bset\b/.test(contextLabel);
  if (eventType === 'match_won') return /\bmatch\b/.test(contextLabel);
  if (eventType === 'game_won') return /\b(?:breaks?|holds?|leads?|game)\b/.test(contextLabel);
  if (eventType === 'point_won') return /\b(?:wins? point|winner|rally|saved|break point|overhead|brilliant|spectacular)\b/.test(contextLabel);
  if (eventType === 'pressure_state') return /\b(?:break point|set point|match point|advantage)\b/.test(contextLabel);
  return false;
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

  const transitionStatus = evaluateOcrScoreTransition(event, context);
  if (transitionStatus === 'supports_result') score += 0.36;
  if (transitionStatus === 'supports_state') score += 0.22;
  if (transitionStatus === 'conflicts_result') score -= 0.18;

  return Math.min(0.95, Math.max(0, score));
}

function evaluateOcrScoreTransition(event: Event, context: OcrMomentContext): OcrTransitionStatus {
  const before = parseTennisScoreState(context.scoreBefore);
  const after = parseTennisScoreState(context.scoreAfter ?? context.score);
  const snapshot = parseTennisScoreState(context.scoreAfter ?? context.score ?? context.scoreBefore);
  const resultTypes = new Set<Event['type']>(['game_won', 'set_won', 'match_won']);

  if (!before || !after) {
    if (event.type === 'pressure_state' && isPressurePointScore(snapshot?.pointScore ?? null)) {
      return 'supports_state';
    }

    const resultScores = extractEventResultScores(event.label);
    if (
      resultTypes.has(event.type) &&
      resultScores.length > 0 &&
      scoreStateMatchesEventResult(event.type, resultScores, snapshot)
    ) {
      return 'supports_result';
    }

    return 'unknown';
  }

  const gameScoreChanged = scoresDiffer(before.gameScore, after.gameScore);
  const setScoreChanged = scoresDiffer(before.setScore, after.setScore);
  const pointScoreChanged = scoresDiffer(before.pointScore, after.pointScore);
  const terminalPointReset = before.pointScore != null && after.pointScore == null;
  const resultScores = extractEventResultScores(event.label);
  const resultScoreMatchesAfter = scoreStateMatchesEventResult(event.type, resultScores, after);

  if (event.type === 'game_won') {
    if (resultScoreMatchesAfter || gameScoreChanged || terminalPointReset) {
      return 'supports_result';
    }

    if (context.scoreChanged === false && before.gameScore && after.gameScore && !pointScoreChanged) {
      return 'conflicts_result';
    }

    return 'unknown';
  }

  if (event.type === 'set_won') {
    if (resultScoreMatchesAfter || setScoreChanged || terminalPointReset) {
      return 'supports_result';
    }

    if (context.scoreChanged === false && before.gameScore && after.gameScore && !pointScoreChanged) {
      return 'conflicts_result';
    }

    return 'unknown';
  }

  if (event.type === 'match_won') {
    if (resultScoreMatchesAfter || setScoreChanged || gameScoreChanged || terminalPointReset) {
      return 'supports_result';
    }

    if (context.scoreChanged === false && before.gameScore && after.gameScore && !pointScoreChanged) {
      return 'conflicts_result';
    }

    return 'unknown';
  }

  if (event.type === 'point_won') {
    return pointScoreChanged || terminalPointReset || gameScoreChanged || setScoreChanged
      ? 'supports_result'
      : 'unknown';
  }

  if (event.type === 'pressure_state') {
    return !gameScoreChanged && !setScoreChanged && isPressurePointScore(after.pointScore)
      ? 'supports_state'
      : 'unknown';
  }

  return 'unknown';
}

interface TennisScoreState {
  setScore: string | null;
  gameScore: string | null;
  pointScore: string | null;
}

function parseTennisScoreState(score: string | null): TennisScoreState | null {
  if (!score) {
    return null;
  }

  const normalized = score.toLowerCase().replace(/\s+/g, ' ').trim();
  const pointScore = normalized.match(/\(([^)]+)\)/)?.[1]?.replace(/\s+/g, '') ?? null;
  const withoutPointScore = normalized.replace(/\([^)]+\)/g, ' ');
  const scoreMatches = [...withoutPointScore.matchAll(/\b(\d+-\d+)\b/g)].map((match) => match[1]);
  if (scoreMatches.length === 0 && !pointScore) {
    return null;
  }

  return {
    setScore: scoreMatches.length > 1 ? scoreMatches.slice(0, -1).join(',') : null,
    gameScore: scoreMatches.at(-1) ?? null,
    pointScore,
  };
}

function scoresDiffer(before: string | null, after: string | null): boolean {
  return before != null && after != null && normalizeScore(before) !== normalizeScore(after);
}

function scoreMatches(expected: string, actual: string | null): boolean {
  if (!actual) {
    return false;
  }

  const normalizedExpected = normalizeScore(expected);
  return (
    normalizeScore(actual) === normalizedExpected ||
    normalizeScore(reverseScore(actual)) === normalizedExpected
  );
}

function scoreStateMatchesEventResult(
  eventType: Event['type'],
  resultScores: string[],
  state: TennisScoreState | null,
): boolean {
  if (!state || resultScores.length === 0) {
    return false;
  }

  if (eventType === 'game_won') {
    return resultScores.some((score) => scoreMatches(score, state.gameScore));
  }

  if (eventType === 'set_won') {
    return state.pointScore == null && resultScores.some((score) => scoreMatches(score, state.gameScore));
  }

  if (eventType === 'match_won') {
    const stateScores = [
      ...splitScoreList(state.setScore),
      state.gameScore,
    ].filter((score): score is string => score != null);
    return resultScores.every((resultScore) =>
      stateScores.some((stateScore) => scoreMatches(resultScore, stateScore)),
    );
  }

  return false;
}

function splitScoreList(score: string | null): string[] {
  return score?.split(',').filter((part) => part.length > 0) ?? [];
}

function isPressurePointScore(score: string | null): boolean {
  if (!score) {
    return false;
  }

  return /^(?:0-40|15-40|30-40|40-0|40-15|40-30|ad-\d+|\d+-ad|advantage-\d+|\d+-advantage)$/.test(score);
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
  return extractEventResultScores(label)[0] ?? null;
}

function extractEventResultScores(label: string): string[] {
  const lower = label.toLowerCase();
  const scores = [...lower.matchAll(/\b(\d+-\d+)\b/g)].map((match) => match[1]);
  if (scores.length === 0) {
    return [];
  }

  return scores.filter((score) => !isPointScore(score));
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

function buildOcrEvidenceNote(
  context: OcrMomentContext,
  status: OcrSupportStatus,
  transitionStatus: OcrTransitionStatus,
  selectedBy: OcrSelectionReason,
): string {
  const parts = [`OCR ${status}: ${context.label ?? 'unlabeled moment'}`];
  if (context.score) parts.push(`score=${context.score}`);
  if (context.scoreBefore) parts.push(`before=${context.scoreBefore}`);
  if (context.scoreAfter) parts.push(`after=${context.scoreAfter}`);
  if (transitionStatus !== 'unknown') parts.push(`transition=${transitionStatus}`);
  parts.push(`selectedBy=${selectedBy}`);
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
    note: buildOcrEvidenceNote(context, support.status, support.transitionStatus, support.selectedBy),
    metadata: {
      label: context.label,
      score: context.score,
      scoreBefore: context.scoreBefore,
      scoreAfter: context.scoreAfter,
      scoreChanged: context.scoreChanged,
      scoreTransitionStatus: support.transitionStatus,
      selectedBy: support.selectedBy,
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
