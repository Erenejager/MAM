interface SportKeywordSet {
  detection: string[];
  scoring: string[];
  action: string[];
  context: string[];
}

export const SPORT_KEYWORDS: Record<string, SportKeywordSet> = {
  tennis: {
    detection: [
      'ace',
      'deuce',
      'tiebreak',
      'tie break',
      'serve',
      'second serve',
      'double fault',
      'break point',
      'set point',
      'match point',
      'game point',
      'holds serve',
      'breaks serve',
      'forehand',
      'backhand',
      'volley',
      'overhead',
      'drop shot',
      'passing shot',
      'baseline',
      'rally',
      'ad court',
      'advantage',
      'unforced error',
      'winner',
    ],
    scoring: [
      'point',
      'break point',
      'set point',
      'match point',
      'game point',
      'deuce',
      'advantage',
      'holds serve',
      'breaks serve',
      'mini-break',
      'break back',
      'break points saved',
      'saved break point',
    ],
    action: [
      'ace',
      'double fault',
      'winner',
      'wins the point',
      'wins this point',
      'wins the game',
      'holds',
      'breaks',
      'rally',
      'volley',
      'forehand winner',
      'backhand winner',
      'drop shot',
      'passing shot',
    ],
    context: [
      'chair umpire',
      'change of ends',
      'challenge',
      'hawkeye',
      'hawk-eye',
      'let cord',
      'new balls',
      'second serve',
      'first serve percentage',
    ],
  },
  football: {
    detection: [
      'goal',
      'penalty',
      'corner',
      'offside',
      'touchline',
      'free kick',
      'yellow card',
      'red card',
      'cross',
      'header',
      'striker',
      'keeper',
      'goalkeeper',
      'midfielder',
      'defender',
      'equaliser',
      'equalizer',
    ],
    scoring: [
      'goal',
      'scores',
      'scored',
      'equaliser',
      'equalizer',
      'penalty',
      'own goal',
      'winner',
    ],
    action: [
      'save',
      'shot on target',
      'cross',
      'header',
      'tackle',
      'through ball',
      'counter attack',
      'counterattack',
      'free kick',
      'corner',
    ],
    context: [
      'touchline',
      'offside',
      'added time',
      'stoppage time',
      'first half',
      'second half',
      'full time',
      'half time',
      'var',
    ],
  },
  'american football': {
    detection: [
      'touchdown',
      'quarterback',
      'field goal',
      'interception',
      'line of scrimmage',
      'first down',
      'red zone',
      'end zone',
      'snap',
      'punt',
      'sack',
    ],
    scoring: [
      'touchdown',
      'field goal',
      'extra point',
      'two-point conversion',
      'safety',
    ],
    action: [
      'pass complete',
      'pass incomplete',
      'interception',
      'sack',
      'rush',
      'handoff',
      'punt',
      'kickoff',
    ],
    context: [
      'first down',
      'third down',
      'fourth down',
      'red zone',
      'two minute warning',
    ],
  },
  basketball: {
    detection: [
      'three pointer',
      'three-point',
      'free throw',
      'slam dunk',
      'layup',
      'rebound',
      'assist',
      'shot clock',
      'turnover',
      'fast break',
      'paint',
    ],
    scoring: [
      'three pointer',
      'three-point',
      'free throw',
      'layup',
      'dunk',
      'jumper',
      'buzzer beater',
    ],
    action: [
      'rebound',
      'assist',
      'steal',
      'block',
      'turnover',
      'fast break',
      'foul',
    ],
    context: [
      'shot clock',
      'first quarter',
      'second quarter',
      'third quarter',
      'fourth quarter',
      'overtime',
    ],
  },
  baseball: {
    detection: [
      'home run',
      'strikeout',
      'walk',
      'double play',
      'pitcher',
      'batter',
      'inning',
      'bullpen',
      'fastball',
      'curveball',
      'slider',
    ],
    scoring: [
      'home run',
      'scores',
      'run scores',
      'walk-off',
      'rbi',
    ],
    action: [
      'strikeout',
      'double play',
      'single',
      'double',
      'triple',
      'stolen base',
      'walk',
      'hit by pitch',
    ],
    context: [
      'top of the',
      'bottom of the',
      'inning',
      'bullpen',
      'full count',
      'two outs',
    ],
  },
  hockey: {
    detection: [
      'power play',
      'penalty kill',
      'blue line',
      'slap shot',
      'wrist shot',
      'puck',
      'crease',
      'faceoff',
      'goaltender',
      'empty net',
    ],
    scoring: [
      'goal',
      'scores',
      'power-play goal',
      'empty-net goal',
    ],
    action: [
      'save',
      'faceoff',
      'slap shot',
      'wrist shot',
      'one-timer',
      'check',
      'penalty',
    ],
    context: [
      'power play',
      'penalty kill',
      'blue line',
      'neutral zone',
      'third period',
      'overtime',
    ],
  },
};

export function inferSportFromText(text: string): string | null {
  const normalized = normalizeText(text);

  for (const [sport, keywords] of Object.entries(SPORT_KEYWORDS)) {
    if (includesAnyKeyword(normalized, [
      ...keywords.detection,
      ...keywords.scoring,
      ...keywords.action,
      ...keywords.context,
    ])) {
      return sport;
    }
  }

  return null;
}

export function hasAnySportsCue(text: string): boolean {
  const normalized = normalizeText(text);

  return Object.values(SPORT_KEYWORDS).some((keywords) =>
    includesAnyKeyword(normalized, [...keywords.scoring, ...keywords.action]),
  );
}

export function hasScoreCue(text: string): boolean {
  const normalized = normalizeText(text);

  return Object.values(SPORT_KEYWORDS).some((keywords) =>
    includesAnyKeyword(normalized, keywords.scoring),
  );
}

export function getSportKeywords(sport: string | null): SportKeywordSet | null {
  if (!sport) return null;

  const normalizedSport = normalizeText(sport);
  return SPORT_KEYWORDS[normalizedSport] ?? null;
}

export function includesAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => includesKeyword(text, keyword));
}

function includesKeyword(text: string, keyword: string): boolean {
  const normalizedKeyword = keyword.toLowerCase().trim();
  if (!normalizedKeyword) return false;

  const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}s?([^a-z0-9]|$)`, 'i').test(text);
}

function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}
