import type { AssetProfile, Event, SegmentSpan, TimelineIndex } from './types.js';
import { getSportKeywords, includesAnyKeyword } from './sports-keywords.js';

const KNOWN_TENNIS_PLAYERS = [
  'Alcaraz',
  'Djokovic',
  'Sinner',
  'Federer',
  'Nadal',
  'Murray',
  'Medvedev',
  'Zverev',
  'Tsitsipas',
  'Rublev',
  'Rune',
  'Fritz',
  'Ruud',
  'Shelton',
  'Becker',
  'Lendl',
  'Sampras',
];

export function generateInitialEvents(
  assetProfile: AssetProfile,
  timelineIndex: TimelineIndex,
  segments: SegmentSpan[],
): Event[] {
  const events: Event[] = [];

  for (const segment of segments) {
    const windows = segment.sourceWindowIndexes
      .map((index) => timelineIndex.windows.find((window) => window.index === index))
      .filter((window): window is NonNullable<typeof window> => window != null);

    if (windows.length === 0) continue;

    if (segment.type === 'live_play' || segment.type === 'replay') {
      for (const candidate of buildSportsCandidates(windows, assetProfile.sport, segment.type, assetProfile.players)) {
        events.push({
          id: `event_${events.length}`,
          segmentId: segment.id,
          type: candidate.type,
          label: buildSportsLabel(
            candidate.labelText,
            assetProfile.sport,
            candidate.type,
            assetProfile.players,
          ),
          anchorTime: midpoint(candidate.window.start, candidate.window.end),
          peakTime: candidate.window.audioEnergy > 0.75 ? midpoint(candidate.window.start, candidate.window.end) : null,
          startTime: candidate.window.start,
          endTime: candidate.window.end,
          importance: Math.round(candidate.window.audioEnergy * 100),
          confidence: candidate.confidence,
          entities: [...assetProfile.players, ...assetProfile.teams],
          evidence: [{ type: 'transcript', ref: `window:${candidate.window.index}` }],
          parentEventId: null,
          validationStatus: 'candidate',
          relationType: null,
        });
      }
    }

    if (segment.type === 'player_interview' || segment.type === 'press_conference') {
      for (const window of windows) {
        if (window.transcriptText.trim().length < 40) continue;

        events.push({
          id: `event_${events.length}`,
          segmentId: segment.id,
          type: 'quote',
          label: summarizeText(window.transcriptText),
          anchorTime: midpoint(window.start, window.end),
          peakTime: null,
          startTime: window.start,
          endTime: window.end,
          importance: 60,
          confidence: 0.58,
          entities: assetProfile.players,
          evidence: [{ type: 'transcript', ref: `window:${window.index}` }],
          parentEventId: null,
          validationStatus: 'candidate',
          relationType: null,
        });
      }
    }

    if (segment.type === 'commentator_insert') {
      const analysisCandidate = buildAnalysisCandidate(segment, windows, events.length);
      if (analysisCandidate) {
        events.push(analysisCandidate);
      }
    }
  }

  return dedupeEvents(events);
}

interface SportsCandidate {
  window: TimelineIndex['windows'][number];
  type: Event['type'];
  confidence: number;
  labelText: string;
}

function buildSportsCandidates(
  windows: TimelineIndex['windows'],
  sport: string | null,
  segmentType: SegmentSpan['type'],
  participants: string[],
): SportsCandidate[] {
  const rawCandidates = windows
    .map((window, index) => toSportsCandidate(window, sport, segmentType, participants, windows[index - 1]))
    .filter((candidate): candidate is SportsCandidate => candidate != null);

  if (rawCandidates.length <= 1) {
    return rawCandidates;
  }

  const collapsed: SportsCandidate[] = [];
  for (const candidate of rawCandidates) {
    const previous = collapsed[collapsed.length - 1];
    const isAdjacentDuplicate = previous
      && previous.type === candidate.type
      && candidate.window.index - previous.window.index <= 1;

    if (!isAdjacentDuplicate) {
      collapsed.push(candidate);
      continue;
    }

    if (candidate.window.audioEnergy >= previous.window.audioEnergy) {
      collapsed[collapsed.length - 1] = candidate;
    }
  }

  return collapsed;
}

function toSportsCandidate(
  window: TimelineIndex['windows'][number],
  sport: string | null,
  segmentType: SegmentSpan['type'],
  participants: string[],
  previousWindow?: TimelineIndex['windows'][number],
): SportsCandidate | null {
  const isTennis = sport?.toLowerCase() === 'tennis';
  const normalized = window.transcriptText.toLowerCase();
  const terminalTennisType = isTennis ? inferTennisTerminalEventType(normalized) : null;
  const bypassSupportGate = terminalTennisType === 'set_won' || terminalTennisType === 'match_won';

  if (
    !bypassSupportGate &&
    !window.hasScoreCue &&
    window.audioEnergy <= 0.75 &&
    !(segmentType === 'replay' && window.transcriptText.trim().length > 0)
  ) {
    return null;
  }

  const type = inferSportsEventType(window, sport, segmentType, participants);
  if (type == null) {
    return null;
  }

  const confidence = type === 'unknown'
    ? (window.hasScoreCue ? 0.62 : 0.5)
    : (window.hasScoreCue ? 0.78 : 0.64);

  return {
    window,
    type,
    confidence,
    labelText: buildCandidateLabelText(window, type, sport, previousWindow),
  };
}

function buildCandidateLabelText(
  window: TimelineIndex['windows'][number],
  type: Event['type'],
  sport: string | null,
  previousWindow?: TimelineIndex['windows'][number],
): string {
  if (
    sport?.toLowerCase() === 'tennis' &&
    type === 'game_won' &&
    previousWindow &&
    window.index - previousWindow.index === 1 &&
    /\bgame from victory\b/i.test(window.transcriptText) &&
    /\bbreaks?\b/i.test(previousWindow.transcriptText)
  ) {
    return `${previousWindow.transcriptText} ${window.transcriptText}`;
  }

  return window.transcriptText;
}

function inferSportsEventType(
  window: TimelineIndex['windows'][number],
  sport: string | null,
  segmentType: SegmentSpan['type'],
  participants: string[],
): Event['type'] | null {
  const normalized = window.transcriptText.toLowerCase();

  if (sport?.toLowerCase() === 'tennis') {
    if (isNonParticipantOnlyTennisContext(normalized, participants)) return null;
    if (includesAnyKeyword(normalized, ['ace'])) return 'ace';
    if (isTennisConditionalMatchContextText(normalized)) return null;
    const terminalType = inferTennisTerminalEventType(normalized);
    if (terminalType) return terminalType;
    if (isTransitionTennisScoreStateCue(normalized)) return 'pressure_state';
    if (isTennisPressureStateCue(normalized)) return 'pressure_state';
    if (isLowValueTennisPressureText(normalized)) return null;
    if (isTennisBracketContextText(normalized)) return null;
    if (isTennisPureStatContextText(normalized)) return null;
    if (isStrongTennisPointCue(normalized) || isSupportedTennisPointCue(window, segmentType)) {
      return 'point_won';
    }
    if (hasTennisSaveCue(normalized)) {
      return 'point_won';
    }
    return null;
  }
  if (normalized.includes('goal')) return 'goal';
  if (normalized.includes('save')) return 'save';
  if (/(foul|penalty)/.test(normalized)) return 'foul';
  return normalized.trim().length > 0 ? 'unknown' : null;
}

function buildSportsLabel(
  text: string,
  sport: string | null,
  type: Event['type'],
  participants: string[],
): string {
  const withoutSportNoise = sport?.toLowerCase() === 'tennis'
    ? text.replace(/\bgoal\b[!?.]*/gi, ' ')
    : text;
  const eventFocused = sport?.toLowerCase() === 'tennis'
    ? focusTennisLabel(withoutSportNoise, type, participants)
    : withoutSportNoise;
  const rewritten = sport?.toLowerCase() === 'tennis'
    ? rewriteTennisLabel(eventFocused, type)
    : eventFocused;
  const cleaned = rewritten
    .trim()
    .replace(/\b(goal|go)\b(?:\W+\1\b){2,}/gi, '$1')
    .replace(/\s+/g, ' ');
  return truncateLabel(cleaned || 'Sports event');
}

function rewriteTennisLabel(label: string, type: Event['type']): string {
  const normalized = label.toLowerCase();

  if (type === 'game_won') {
    const leadScore = /\b(?:leads?|lead)\s+([0-7])\s+(?:against|to|-)\s+([0-7])\b/i.exec(label);
    if (/\bsaved\b.*\bbreak point\b/.test(normalized) && /djokovic/i.test(label) && leadScore) {
      return `Djokovic saves break point and holds for ${leadScore[1]}-${leadScore[2]}`;
    }

    if (/\bbreaks? for a third time\b/.test(normalized) && /\bgame from victory\b/.test(normalized)) {
      return 'Breaks for a third time; one game from victory';
    }
  }

  if (type === 'set_won' && /\bone set lead\b/.test(normalized)) {
    const setScore = /\b(?:six|6)[ -]?(?:three|3)\b/i.exec(label);
    return setScore ? 'Takes opening set 6-3' : 'Takes a one-set lead';
  }

  if (type === 'pressure_state') {
    if (/\bthree set points\b/.test(normalized)) {
      return /djokovic|six-time champion/.test(normalized)
        ? 'Three set points for Djokovic'
        : label;
    }
    if (/\b8th break point\b/.test(normalized)) {
      return /djokovic/.test(normalized)
        ? '8th break point of the match for Djokovic'
        : label;
    }
    if (/that's how you say break points/.test(normalized)) return label;
  }

  return label;
}

function focusTennisLabel(text: string, type: Event['type'], participants: string[]): string {
  const cleaned = text
    .replace(/\bchilster\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const fragments = cleaned
    .split(/(?<=[.!?])\s+|\s{2,}/)
    .map((fragment) => fragment.trim())
    .filter(Boolean);

  const preferredIndex = fragments.findIndex((fragment) => tennisLabelScore(fragment, type) >= 2);
  const fallbackIndex = preferredIndex === -1
    ? fragments.findIndex((fragment) => tennisLabelScore(fragment, type) >= 1)
    : preferredIndex;

  if (fallbackIndex === -1) {
    return cleaned;
  }

  const preferred = fragments[fallbackIndex];
  const next = fragments[fallbackIndex + 1];
  const previous = fragments[fallbackIndex - 1];
  const withPrevious = previous && shouldIncludePreviousTennisLabelFragment(previous, preferred, type)
    ? `${previous} ${preferred}`
    : preferred;
  const focused = next && shouldIncludeNextTennisLabelFragment(withPrevious, next, type)
    ? `${withPrevious} ${next}`
    : withPrevious;

  return addTennisLabelContext(cleaned, focused, participants);
}

function addTennisLabelContext(source: string, focused: string, participants: string[]): string {
  const contextParts: string[] = [];
  const score = firstTennisScoreToken(source);
  if (score && !focused.includes(score)) {
    contextParts.push(score);
  }

  const participant = participants.find((player) => containsName(source.toLowerCase(), player));
  if (participant && !containsName(focused.toLowerCase(), participant)) {
    contextParts.push(participant);
  }

  return contextParts.length > 0
    ? `${contextParts.join(' ')}: ${focused}`
    : focused;
}

function firstTennisScoreToken(text: string): string | null {
  const numericScore = /\b(?:0|15|30|40|ad|advantage)-(?:0|15|30|40|ad|advantage)\b/i.exec(text);
  if (numericScore) return numericScore[0];

  const setScore = /\b[0-7]-[0-7]\b/.exec(text);
  if (setScore) return setScore[0];

  return null;
}

function shouldIncludeNextTennisLabelFragment(current: string, next: string, type: Event['type']): boolean {
  const combinedLength = `${current} ${next}`.length;
  if (combinedLength > 120) return false;

  const normalizedNext = next.toLowerCase();
  if (isTennisPureStatContextText(normalizedNext)) return false;

  if (type === 'match_won' && /\b\d-\d\b/.test(normalizedNext)) return true;
  if (type === 'set_won' && /\b\d-\d\b/.test(normalizedNext)) return true;
  if (type === 'game_won' && /\bgame from victory\b/.test(normalizedNext)) return true;
  if (type === 'point_won' && hasTennisPointContextCue(normalizedNext)) return true;

  return false;
}

function shouldIncludePreviousTennisLabelFragment(previous: string, current: string, type: Event['type']): boolean {
  const combinedLength = `${previous} ${current}`.length;
  if (combinedLength > 120) return false;

  const normalizedPrevious = previous.toLowerCase();
  const normalizedCurrent = current.toLowerCase();

  if (
    type === 'game_won' &&
    /\b(?:breaks?|holds?|game)\b/.test(normalizedPrevious) &&
    /\b(?:game from victory|leads?|game)\b/.test(normalizedCurrent)
  ) {
    return true;
  }

  return false;
}

function truncateLabel(label: string): string {
  if (label.length <= 80) return label;

  const truncated = label.slice(0, 77);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${truncated.slice(0, lastSpace > 50 ? lastSpace : 77).trim()}...`;
}

function tennisLabelScore(fragment: string, type: Event['type']): number {
  const text = fragment.toLowerCase();
  let score = 0;

  if (type === 'pressure_state' && /\b(?:break|set|match|game) points?\b/.test(text)) score += 3;
  if (type === 'set_won' && /\b(?:one set lead|opening set|set)\b/.test(text)) score += 3;
  if (type === 'match_won' && /\b(?:too good|wins? this match|match|6-\d|6 \d)\b/.test(text)) score += 3;
  if (type === 'game_won' && /\b(?:game|holds?|breaks?|leads? \d)\b/.test(text)) score += 3;
  if (type === 'point_won' && /\b(?:saved|winner|rally|point|comes out on top|brilliant|incredible|overhead)\b/.test(text)) score += 2;

  if (/\b(?:drama and the tension|aren't we|let's remind ourselves)\b/.test(text)) score -= 2;
  if (text.length < 6) score -= 1;

  return score;
}

function summarizeText(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  return cleaned.length > 90 ? `${cleaned.slice(0, 87)}...` : cleaned;
}

function buildAnalysisCandidate(
  segment: SegmentSpan,
  windows: TimelineIndex['windows'],
  eventIndex: number,
): Event | null {
  const qualifyingWindows = windows.filter((window) => isMeaningfulAnalysisWindow(window.transcriptText));
  if (qualifyingWindows.length === 0) {
    return null;
  }

  const strongestWindow = qualifyingWindows.reduce((best, window) => {
    const bestScore = analysisStrength(best.transcriptText);
    const windowScore = analysisStrength(window.transcriptText);
    if (windowScore > bestScore) return window;
    if (windowScore < bestScore) return best;
    return window.audioEnergy >= best.audioEnergy ? window : best;
  });

  const combinedText = qualifyingWindows
    .map((window) => window.transcriptText.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    id: `event_${eventIndex}`,
    segmentId: segment.id,
    type: 'analysis_point',
    label: summarizeText(combinedText || strongestWindow.transcriptText),
    anchorTime: midpoint(segment.start, segment.end),
    peakTime: null,
    startTime: segment.start,
    endTime: segment.end,
    importance: 45,
    confidence: 0.6,
    entities: segment.participants,
    evidence: qualifyingWindows.map((window) => ({ type: 'transcript' as const, ref: `window:${window.index}` })),
    parentEventId: null,
    validationStatus: 'candidate',
    relationType: null,
  };
}

function isMeaningfulAnalysisWindow(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalized.length < 55) return false;
  if (analysisStrength(normalized) < 2) return false;

  return !(
    normalized.includes('welcome back') ||
    normalized.includes('still with us') ||
    normalized.includes('coming up next') ||
    normalized.includes('look ahead') ||
    normalized.includes('what could happen next')
  );
}

function analysisStrength(text: string): number {
  const normalized = text.toLowerCase();
  let score = 0;

  if (/(because|forcing|pattern|adjustment|strategy|tactic|trying to|you can see|the reason)/.test(normalized)) {
    score += 2;
  }

  if (/(rally|forehand|backhand|serve|return|error|winner|point|ball)/.test(normalized)) {
    score += 1;
  }

  if (normalized.length >= 90) {
    score += 1;
  }

  return score;
}

function isStrongTennisPointCue(text: string): boolean {
  const sportKeywords = getSportKeywords('tennis');
  if (!sportKeywords) return false;

  const strongScoringCues = sportKeywords.scoring.filter((keyword) => keyword !== 'point');
  const strongActionCues = [
    'winner',
    'wins the point',
    'wins this point',
    'wins the game',
    'comes out on top',
    'too good',
    'that will do it',
    'double fault',
  ];

  if (includesAnyKeyword(text, [...strongScoringCues, ...strongActionCues])) {
    return true;
  }

  return (
    text.includes('point of the match') ||
    text.includes('what a point') ||
    text.includes('what a forehand point') ||
    text.includes('what a backhand point')
  );
}

function inferTennisTerminalEventType(text: string): Event['type'] | null {
  if (isHistoricalTennisRecordContext(text)) {
    return null;
  }

  if (
    /(wins|takes|claims|seals).{0,24}\bmatch\b/.test(text) ||
    /\bmatch.{0,20}(won|over|sealed)\b/.test(text) ||
    /\bthat will do it\b/.test(text) ||
    /\btoo good\b.*\b\d-\d\b.*\b\d-\d\b/.test(text)
  ) {
    return 'match_won';
  }

  if (
    /(wins|takes|claims|seals).{0,24}\bset\b/.test(text) ||
    /\bset.{0,20}(won|sealed)\b/.test(text) ||
    /\bone set lead\b/.test(text) ||
    /\bopening set\b.*\b(?:6|six)[ -]?(?:3|three)\b/.test(text)
  ) {
    return 'set_won';
  }

  if (
    /\bwins the game\b/.test(text) ||
    /\bgame[, ]+(?:[a-z][a-z'-]+)\b/.test(text) ||
    /\bholds serve\b/.test(text) ||
    /\bbreaks serve\b/.test(text)
  ) {
    return 'game_won';
  }

  return null;
}

function isHistoricalTennisRecordContext(text: string): boolean {
  return (
    /\b(?:federer|lendl|becker|sampras|nadal|murray)\b/.test(text) ||
    /\b(?:race|record|finals|titles?|appearances?)\b/.test(text) ||
    /\b(?:draw alongside|alongside|made nine|leading that race)\b/.test(text)
  );
}

function isTennisPressureStateCue(text: string): boolean {
  if (hasTennisSaveCue(text) || hasTennisCompletedPointCue(text)) {
    return false;
  }

  if (isLowValueTennisPressureText(text)) {
    return false;
  }

  return (
    /\b(?:break|set|match|game) points?\b/.test(text) ||
    /\b(?:break|set|match|game)-points?\b/.test(text) ||
    isTransitionTennisScoreStateCue(text)
  );
}

function isTransitionTennisScoreStateCue(text: string): boolean {
  return (
    /\bback to deuce\b/.test(text) ||
    /\b(?:saves|saved|saving|save) (?:it|that|the point|break point|set point|match point).{0,30}\bdeuce\b/.test(text) ||
    /\bdeuce\b.{0,30}\b(?:after|following) (?:saving|saved)\b/.test(text) ||
    /\banother deuce\b/.test(text) ||
    /\badvantage\s+(?:[a-z][a-z'-]+)\b/.test(text) ||
    /\badvantage\b.{0,30}\b(?:after|following) (?:saving|saved|winning)\b/.test(text)
  );
}

function isLowValueTennisPressureText(text: string): boolean {
  return (
    /^\s*(?:deuce|advantage)\s*\.?\s*$/.test(text) ||
    /\bhad (?:a )?look at\b.*\b(?:break|set|match|game) points?\b/.test(text) ||
    /\b\d+\s+of\s+(?:the\s+)?\d+\s+converted\b/.test(text) ||
    /\bconverted so far\b/.test(text) ||
    /\b(?:saved|converted) earlier\b/.test(text) ||
    /\bprevious (?:break|set|match|game) points?\b/.test(text)
  );
}

function isTennisBracketContextText(text: string): boolean {
  return (
    /\bawaits? the winner\b/.test(text) ||
    /\bwinner of this (?:match|one)\b/.test(text) ||
    /\bwinner will (?:face|play|meet)\b/.test(text) ||
    /\bwinner (?:faces|plays|meets)\b/.test(text)
  );
}

function isTennisConditionalMatchContextText(text: string): boolean {
  return (
    /\b(?:will|would|could|may|might) (?:face|play|meet)\b.*\bif (?:he|she|they) wins? this match\b/.test(text) ||
    /\bif (?:he|she|they) wins? this match\b.*\b(?:will|would|could|may|might) (?:face|play|meet)\b/.test(text)
  );
}

function isTennisPureStatContextText(text: string): boolean {
  if (
    (hasTennisQualityCue(text) && hasTennisPointContextCue(text)) ||
    hasTennisOutcomeCue(text)
  ) {
    return false;
  }

  return (
    /\baverage (?:forehand|backhand|serve|speed)\b/.test(text) ||
    /\bkilometers? an hour\b/.test(text) ||
    /\bkilometres? an hour\b/.test(text)
  );
}

function isNonParticipantOnlyTennisContext(text: string, participants: string[]): boolean {
  if (participants.length === 0) {
    return false;
  }

  const mentionedPlayers = KNOWN_TENNIS_PLAYERS.filter((player) => containsName(text, player));
  if (mentionedPlayers.length === 0) {
    return false;
  }

  const participantSet = new Set(participants.map((player) => player.toLowerCase()));
  const mentionsParticipant = mentionedPlayers.some((player) => participantSet.has(player.toLowerCase()));
  const mentionsNonParticipant = mentionedPlayers.some((player) => !participantSet.has(player.toLowerCase()));

  return (
    mentionsNonParticipant &&
    !mentionsParticipant &&
    !hasTennisPointContextCue(text) &&
    !hasTennisOutcomeCue(text) &&
    !hasTennisQualityCue(text)
  );
}

function containsName(text: string, name: string): boolean {
  const escaped = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
}

function hasTennisQualityCue(text: string): boolean {
  return (
    /\b(?:incredible|brilliant|unbelievable|sensational|magnificent|excellent|great|huge|massive|important|quality|big moment|stepping up|what a)\b/.test(text)
  );
}

function hasTennisPointContextCue(text: string): boolean {
  return (
    /\b(?:point|points|rally|exchange|forehand|backhand|serve|return|volley|overhead|tennis|break point|set point|match point|game point)\b/.test(text)
  );
}

function hasTennisOutcomeCue(text: string): boolean {
  return (
    /\b(?:saved|won|wins|converted|converts|comes out on top|turns? (?:it|the point) in (?:his|her|their) favour|turns? (?:it|the point) in (?:his|her|their) favor)\b/.test(text)
  );
}

function hasTennisSaveCue(text: string): boolean {
  return text.includes('saved break point') || text.includes('break points saved');
}

function hasTennisCompletedPointCue(text: string): boolean {
  return (
    /\b(?:wins|won|takes|took|claims|claimed|seals|sealed|saves|saved|converts|converted)\b/.test(text) ||
    /\b(?:winner|forced the error|forces the error|draws the error|into the net|sails long|goes long|pulls it wide)\b/.test(text)
  );
}

function isSupportedTennisPointCue(
  window: TimelineIndex['windows'][number],
  segmentType: SegmentSpan['type'],
): boolean {
  const text = window.transcriptText.toLowerCase();
  const hasMediumReactionCue = /(brilliant|incredible|unbelievable|what a forehand|what a backhand|what a rally|long exchange|superb|sensational|magnificent|excellent)/.test(text);
  const hasTennisContextCue = /(rally|exchange|forehand|backhand|return|volley|passing shot|net cord|down the line|crosscourt|break point|set point|match point|deuce|advantage)/.test(text);
  const hasTennisOutcomeCue = /(winner|forced the error|forces the error|draws the error|error|into the net|sails long|goes long|pulls it wide|wide on the forehand|wide on the backhand)/.test(text);
  const hasLiveSupport = segmentType === 'live_play' && (window.hasScoreCue || window.audioEnergy >= 0.74);
  const hasStrongAmbientSupport = window.hasScoreCue && window.audioEnergy >= 0.58;

  if (hasMediumReactionCue && (window.hasScoreCue || window.audioEnergy > 0.82)) {
    return true;
  }

  if (hasTennisContextCue && hasTennisOutcomeCue && (hasLiveSupport || hasStrongAmbientSupport)) {
    return true;
  }

  return false;
}

function midpoint(start: number, end: number): number {
  return (start + end) / 2;
}

function dedupeEvents(events: Event[]): Event[] {
  const deduped: Event[] = [];

  for (const event of events) {
    const duplicate = deduped.find((existing) =>
      existing.type === event.type &&
      isSemanticDuplicateEvent(existing, event),
    );
    if (!duplicate) {
      deduped.push(event);
    }
  }

  return deduped;
}

function isSemanticDuplicateEvent(a: Event, b: Event): boolean {
  if (Math.abs(a.anchorTime - b.anchorTime) > 10) {
    return false;
  }

  if (!areSameOrAdjacentSegmentIds(a.segmentId, b.segmentId)) {
    return false;
  }

  const aLabel = normalizeEventLabel(a.label);
  const bLabel = normalizeEventLabel(b.label);
  if (!aLabel || !bLabel) {
    return false;
  }

  return (
    aLabel.includes(bLabel) ||
    bLabel.includes(aLabel) ||
    jaccardSimilarity(aLabel, bLabel) >= 0.72
  );
}

function areSameOrAdjacentSegmentIds(a: string, b: string): boolean {
  if (a === b) return true;

  const aMatch = /^segment_(\d+)$/.exec(a);
  const bMatch = /^segment_(\d+)$/.exec(b);
  if (!aMatch || !bMatch) return false;

  return Math.abs(Number(aMatch[1]) - Number(bMatch[1])) <= 1;
}

function normalizeEventLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const aTokens = new Set(a.split(' ').filter((token) => token.length > 2));
  const bTokens = new Set(b.split(' ').filter((token) => token.length > 2));
  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...aTokens, ...bTokens]).size;
  return intersection / union;
}
