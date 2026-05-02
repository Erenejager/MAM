import { readFile } from 'node:fs/promises';

const packetPath = process.argv[2];
const adjudicationArgs = process.argv
  .filter((arg) => arg.startsWith('--adjudication='))
  .map((arg) => arg.split('=')[1]);
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const tierArg = process.argv.find((arg) => arg.startsWith('--tier='));

const limit = limitArg ? Number(limitArg.split('=')[1]) : 100;
const tierFilter = tierArg ? tierArg.split('=')[1] : null;

if (!packetPath) {
  console.error('Usage: node backend/scripts/audit-v2-promotion-tiers.mjs <candidate-packets.json> [--adjudication=/tmp/a.json ...] [--tier=confirmed_scoreboard_transition] [--limit=100]');
  process.exit(1);
}

const packetInput = JSON.parse(await readFile(packetPath, 'utf-8'));
const packets = packetInput.packets ?? packetInput;

if (!Array.isArray(packets)) {
  console.error('Expected packet JSON with a packets array, or an array of packets.');
  process.exit(1);
}

const adjudicationsByCandidate = new Map();
for (const path of adjudicationArgs) {
  const input = JSON.parse(await readFile(path, 'utf-8'));
  for (const row of input.adjudications ?? []) {
    adjudicationsByCandidate.set(row.candidateWindowId, {
      sourcePath: path,
      row,
      adjudication: row.adjudication ?? null,
    });
  }
}

const rows = packets
  .map((packet) => buildTierRow(packet, adjudicationsByCandidate.get(packet.candidateWindowId) ?? null))
  .filter((row) => !tierFilter || row.tier === tierFilter)
  .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || b.priority - a.priority || a.anchorTime - b.anchorTime)
  .slice(0, limit);

const tierCounts = countBy(packets.map((packet) => buildTierRow(packet, adjudicationsByCandidate.get(packet.candidateWindowId) ?? null).tier));

console.log('# V2 Audit-Only Promotion Tiers');
console.log('');
console.log(`packets: ${packets.length}`);
console.log(`adjudication files: ${adjudicationArgs.length}`);
console.log(`adjudicated candidates: ${adjudicationsByCandidate.size}`);
console.log(`displayed rows: ${rows.length}`);
if (tierFilter) console.log(`tier filter: ${tierFilter}`);
console.log(`tier counts: ${Object.entries(tierCounts).map(([tier, count]) => `${tier}=${count}`).join(', ')}`);
console.log('');
console.log('| candidate | time | priority | tier | suggested action | audio | transcript | event | visible | adjudication | transition | reason |');
console.log('| --- | --- | ---: | --- | --- | --- | --- | --- | ---: | --- | --- | --- |');
for (const row of rows) {
  console.log([
    row.candidateId,
    row.timecode,
    formatNumber(row.priority),
    row.tier,
    row.suggestedAction,
    row.audioOpportunity,
    row.transcriptReview,
    row.currentEvent,
    row.visibleScoreboards,
    row.adjudicationSummary,
    row.transitionSummary,
    row.reason,
  ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
}

function buildTierRow(packet, adjudicationEntry) {
  const audioRollup = packet.audio?.rollup ?? {};
  const transcriptRollup = packet.transcript?.rollup ?? {};
  const currentEvents = packet.currentEvents ?? [];
  const scoreboard = packet.scoreboard ?? {};
  const adjudication = adjudicationEntry?.adjudication ?? null;
  const transition = adjudication?.scoreboard_transition ?? null;
  const audioOpportunity = audioRollup.audioMomentOpportunity ?? 'unknown';
  const transcriptReview = transcriptRollup.transcriptReview ?? 'unknown';
  const visibleScoreboards = scoreboard.visibleCount ?? 0;
  const hasCurrentEvent = currentEvents.length > 0;
  const currentEvent = currentEvents
    .map((event) => `${event.type}@${formatTime(event.anchorTime)}`)
    .join('; ') || 'none';
  const classification = classifyTier({
    audioOpportunity,
    transcriptReview,
    audioRollup,
    hasCurrentEvent,
    visibleScoreboards,
    adjudication,
    transition,
  });

  return {
    candidateId: packet.candidateWindowId,
    anchorTime: packet.anchorTime ?? 0,
    timecode: packet.timecode ?? formatTime(packet.anchorTime ?? 0),
    priority: packet.auditPriority ?? 0,
    audioOpportunity,
    transcriptReview,
    currentEvent,
    visibleScoreboards,
    adjudicationSummary: summarizeAdjudication(adjudication),
    transitionSummary: summarizeTransition(transition),
    ...classification,
  };
}

function classifyTier(input) {
  if (
    input.adjudication?.is_key_moment === true &&
    input.adjudication?.is_live_action === true &&
    input.adjudication?.is_replay_or_recap !== true &&
    input.transition?.changed === true &&
    input.transition?.change_type &&
    input.transition.change_type !== 'unknown'
  ) {
    return {
      tier: 'confirmed_scoreboard_transition',
      suggestedAction: input.hasCurrentEvent ? 'validate_existing_event' : 'eligible_for_future_promotion',
      reason: `LLM confirmed live ${input.adjudication.moment_type}; scoreboard transition=${input.transition.change_type}/${input.transition.changed_player ?? 'unknown'}`,
    };
  }

  if (
    input.audioOpportunity === 'post_match_context' ||
    input.audioOpportunity === 'suppress_or_tail' ||
    input.audioRollup.suppressAsPrimary ||
    input.adjudication?.is_replay_or_recap === true
  ) {
    return {
      tier: 'suppress_recap_or_post_match',
      suggestedAction: 'suppress_as_primary',
      reason: 'post-match/recap/tail evidence',
    };
  }

  if (input.hasCurrentEvent && input.audioOpportunity === 'strengthen_existing_event') {
    return {
      tier: 'covered_existing_event',
      suggestedAction: 'do_not_create_duplicate',
      reason: `existing event nearby; transcript=${input.transcriptReview}`,
    };
  }

  if (
    !input.hasCurrentEvent &&
    (input.audioOpportunity === 'probable_audio_moment' || input.audioOpportunity === 'uncovered_audio_moment') &&
    input.visibleScoreboards > 0
  ) {
    return {
      tier: 'needs_scoreboard_confirmation',
      suggestedAction: 'run_or_review_llm_adjudication',
      reason: `audio=${input.audioOpportunity}; visibleScoreboards=${input.visibleScoreboards}; transcript=${input.transcriptReview}`,
    };
  }

  if (
    !input.hasCurrentEvent &&
    (input.audioOpportunity === 'probable_audio_moment' || input.audioOpportunity === 'uncovered_audio_moment') &&
    ['result_supported', 'action_or_score_context', 'nearby_result_text'].includes(input.transcriptReview)
  ) {
    return {
      tier: 'probable_audio_transcript_moment',
      suggestedAction: 'manual_review_or_frame_sampling',
      reason: `audio=${input.audioOpportunity}; transcript=${input.transcriptReview}; no visible scoreboard`,
    };
  }

  if (
    input.audioOpportunity === 'boundary_hint' ||
    input.audioRollup.hasStartBoundaryHint ||
    input.audioRollup.hasScoreOrEndBoundaryHint ||
    input.audioRollup.hasSuppressiveTail
  ) {
    return {
      tier: 'boundary_or_tail_helper',
      suggestedAction: 'use_for_boundaries_only',
      reason: `boundary/tail evidence; transcript=${input.transcriptReview}`,
    };
  }

  return {
    tier: 'manual_review',
    suggestedAction: 'manual_review_before_any_promotion',
    reason: `audio=${input.audioOpportunity}; transcript=${input.transcriptReview}`,
  };
}

function summarizeAdjudication(adjudication) {
  if (!adjudication) return 'none';
  return [
    adjudication.is_key_moment === true ? 'key' : 'not_key',
    adjudication.moment_type ?? 'unknown',
    adjudication.winner ? `winner=${adjudication.winner}` : '',
    adjudication.is_live_action === true ? 'live' : adjudication.is_live_action === false ? 'not_live' : '',
    adjudication.is_replay_or_recap === true ? 'replay_or_recap' : '',
  ].filter(Boolean).join(' ');
}

function summarizeTransition(transition) {
  if (!transition) return 'none';
  return [
    `changed=${transition.changed}`,
    transition.change_type ? `type=${transition.change_type}` : '',
    transition.changed_player ? `player=${transition.changed_player}` : '',
  ].filter(Boolean).join(' ');
}

function tierRank(tier) {
  return {
    confirmed_scoreboard_transition: 0,
    needs_scoreboard_confirmation: 1,
    probable_audio_transcript_moment: 2,
    covered_existing_event: 3,
    boundary_or_tail_helper: 4,
    suppress_recap_or_post_match: 5,
    manual_review: 6,
  }[tier] ?? 99;
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '';
}

function formatTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const wholeSeconds = Math.floor(total % 60);
  const suffix = `${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}:${String(wholeSeconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${suffix}` : suffix;
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}
