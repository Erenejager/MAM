const RESULT_CUES = [
  'wins the point',
  'wins this point',
  'wins the game',
  'wins the set',
  'wins the match',
  'holds',
  'holds serve',
  'breaks',
  'breaks serve',
  'break point saved',
  'break points saved',
  'saved break point',
  'game djokovic',
  'game alcaraz',
  'set djokovic',
  'set alcaraz',
  'match djokovic',
  'match alcaraz',
];

const PRESSURE_CUES = [
  'break point',
  'break points',
  'set point',
  'set points',
  'match point',
  'match points',
  'game point',
  'game points',
  'deuce',
  'advantage',
];

const ACTION_CUES = [
  'serve',
  'return',
  'rally',
  'forehand',
  'backhand',
  'volley',
  'drop shot',
  'passing shot',
  'winner',
  'ace',
  'double fault',
  'miss',
  'wide',
  'long',
  'net',
];

const RECAP_CUES = [
  'replay',
  'slow motion',
  'take another look',
  'look back',
  'again here',
  'this was',
  'that was',
  'what happened',
  'earlier',
];

const NEXT_POINT_CUES = [
  'first serve',
  'second serve',
  'back underway',
  'to serve',
  'serving',
  'new balls',
];

const SCORE_CALL_REGEX = /\b(?:love|zero|15|30|40|deuce|advantage|all)\b(?:[-\s]+(?:love|zero|15|30|40|all))?/i;

export function summarizeTranscriptWindow(input) {
  const anchorTime = input.anchorTime ?? 0;
  const segments = normalizeSegments(input.segments ?? []);
  const before = segments.filter((segment) => segment.end <= anchorTime);
  const around = segments.filter((segment) => segment.start < anchorTime + 6 && segment.end > anchorTime - 6);
  const after = segments.filter((segment) => segment.start >= anchorTime);
  const allText = segments.map((segment) => segment.text).join(' ');
  const aroundText = around.map((segment) => segment.text).join(' ');
  const afterText = after.map((segment) => segment.text).join(' ');
  const cueSummary = {
    result: findCues(allText, RESULT_CUES),
    pressure: findCues(allText, PRESSURE_CUES),
    action: findCues(allText, ACTION_CUES),
    recap: findCues(allText, RECAP_CUES),
    nextPointSetup: findCues(allText, NEXT_POINT_CUES),
    scoreCall: findScoreCalls(allText),
  };
  const aroundCueSummary = {
    result: findCues(aroundText, RESULT_CUES),
    pressure: findCues(aroundText, PRESSURE_CUES),
    action: findCues(aroundText, ACTION_CUES),
    recap: findCues(aroundText, RECAP_CUES),
    nextPointSetup: findCues(aroundText, NEXT_POINT_CUES),
    scoreCall: findScoreCalls(aroundText),
  };
  const afterCueSummary = {
    result: findCues(afterText, RESULT_CUES),
    pressure: findCues(afterText, PRESSURE_CUES),
    action: findCues(afterText, ACTION_CUES),
    recap: findCues(afterText, RECAP_CUES),
    nextPointSetup: findCues(afterText, NEXT_POINT_CUES),
    scoreCall: findScoreCalls(afterText),
  };
  const transcriptFacets = deriveTranscriptFacets(cueSummary, aroundCueSummary, afterCueSummary);

  return {
    segmentCount: segments.length,
    beforeSegmentCount: before.length,
    aroundSegmentCount: around.length,
    afterSegmentCount: after.length,
    transcriptFacets,
    cueCounts: {
      result: cueSummary.result.length,
      pressure: cueSummary.pressure.length,
      action: cueSummary.action.length,
      recap: cueSummary.recap.length,
      nextPointSetup: cueSummary.nextPointSetup.length,
      scoreCall: cueSummary.scoreCall.length,
    },
    aroundCueCounts: {
      result: aroundCueSummary.result.length,
      pressure: aroundCueSummary.pressure.length,
      action: aroundCueSummary.action.length,
      recap: aroundCueSummary.recap.length,
      nextPointSetup: aroundCueSummary.nextPointSetup.length,
      scoreCall: aroundCueSummary.scoreCall.length,
    },
    afterCueCounts: {
      result: afterCueSummary.result.length,
      pressure: afterCueSummary.pressure.length,
      action: afterCueSummary.action.length,
      recap: afterCueSummary.recap.length,
      nextPointSetup: afterCueSummary.nextPointSetup.length,
      scoreCall: afterCueSummary.scoreCall.length,
    },
    cueExamples: {
      result: cueSummary.result.slice(0, 4),
      pressure: cueSummary.pressure.slice(0, 4),
      action: cueSummary.action.slice(0, 5),
      recap: cueSummary.recap.slice(0, 4),
      nextPointSetup: cueSummary.nextPointSetup.slice(0, 4),
      scoreCall: cueSummary.scoreCall.slice(0, 4),
    },
    transcriptReview: classifyTranscriptReview(cueSummary, aroundCueSummary, afterCueSummary, transcriptFacets),
  };
}

function normalizeSegments(segments) {
  return segments
    .map((segment) => ({
      start: Number(segment.start ?? 0),
      end: Number(segment.end ?? segment.start ?? 0),
      text: String(segment.text ?? '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((segment) => segment.text)
    .sort((a, b) => a.start - b.start);
}

function deriveTranscriptFacets(cues, aroundCues, afterCues) {
  const facets = [];
  if (aroundCues.result.length > 0 || cues.result.length > 0) push(facets, 'result_text');
  if (aroundCues.pressure.length > 0 || cues.pressure.length > 0) push(facets, 'pressure_text');
  if (aroundCues.action.length > 0 || cues.action.length > 0) push(facets, 'action_text');
  if (aroundCues.scoreCall.length > 0 || cues.scoreCall.length > 0) push(facets, 'score_call_text');
  if (aroundCues.recap.length > 0 || cues.recap.length > 0) push(facets, 'recap_text');
  if (afterCues.nextPointSetup.length > 0) push(facets, 'next_point_setup_text');
  if (afterCues.result.length > 0 && aroundCues.result.length === 0) push(facets, 'possible_delayed_result_text');
  return facets;
}

function classifyTranscriptReview(cues, aroundCues, afterCues, facets) {
  if (facets.includes('recap_text') && aroundCues.result.length === 0) return 'recap_or_tail';
  if (aroundCues.result.length > 0) return 'result_supported';
  if (aroundCues.pressure.length > 0 && aroundCues.result.length === 0) return 'pressure_or_setup';
  if (aroundCues.action.length > 0 || aroundCues.scoreCall.length > 0) return 'action_or_score_context';
  if (afterCues.nextPointSetup.length > 0) return 'next_point_setup';
  if (cues.result.length > 0) return 'nearby_result_text';
  return 'generic_or_noisy';
}

function findCues(text, cues) {
  const normalized = String(text ?? '').toLowerCase();
  return cues.filter((cue) => normalized.includes(cue));
}

function findScoreCalls(text) {
  const matches = String(text ?? '').match(new RegExp(SCORE_CALL_REGEX.source, 'gi')) ?? [];
  return [...new Set(matches.map((match) => match.trim().toLowerCase()))];
}

function push(list, value) {
  if (!list.includes(value)) list.push(value);
}
