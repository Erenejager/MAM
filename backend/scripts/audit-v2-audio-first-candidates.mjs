import { readFile } from 'node:fs/promises';

const packetPath = process.argv[2];
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const bucketArg = process.argv.find((arg) => arg.startsWith('--bucket='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 50;
const bucketFilter = bucketArg ? bucketArg.split('=')[1] : null;

if (!packetPath) {
  console.error('Usage: node backend/scripts/audit-v2-audio-first-candidates.mjs <candidate-packets.json> [--limit=50] [--bucket=probable_missed_audio_moment]');
  process.exit(1);
}

const input = JSON.parse(await readFile(packetPath, 'utf-8'));
const packets = input.packets ?? input;

if (!Array.isArray(packets)) {
  console.error('Expected packet JSON with a packets array, or an array of packets.');
  process.exit(1);
}

const rows = packets
  .map(buildReviewRow)
  .filter((row) => !bucketFilter || row.reviewBucket === bucketFilter)
  .sort((a, b) => bucketRank(a.reviewBucket) - bucketRank(b.reviewBucket) || b.priority - a.priority || a.anchorTime - b.anchorTime)
  .slice(0, limit);

const bucketCounts = countBy(packets.map((packet) => buildReviewRow(packet).reviewBucket));

console.log('# V2 Audio-First Candidate Audit');
console.log('');
console.log(`packets: ${packets.length}`);
console.log(`displayed rows: ${rows.length}`);
if (bucketFilter) console.log(`bucket filter: ${bucketFilter}`);
console.log(`bucket counts: ${Object.entries(bucketCounts).map(([bucket, count]) => `${bucket}=${count}`).join(', ')}`);
console.log('');
console.log('| candidate | time | priority | bucket | audio | transcript | event | visible | reason |');
console.log('| --- | --- | ---: | --- | --- | --- | --- | ---: | --- |');

for (const row of rows) {
  console.log([
    row.candidateId,
    row.timecode,
    formatNumber(row.priority),
    row.reviewBucket,
    row.audioOpportunity,
    row.transcriptReview,
    row.currentEvent,
    row.visibleScoreboards,
    row.reason,
  ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
}

function buildReviewRow(packet) {
  const audioRollup = packet.audio?.rollup ?? {};
  const transcriptRollup = packet.transcript?.rollup ?? {};
  const currentEvents = packet.currentEvents ?? [];
  const scoreboard = packet.scoreboard ?? {};
  const audioOpportunity = audioRollup.audioMomentOpportunity ?? 'unknown';
  const transcriptReview = transcriptRollup.transcriptReview ?? 'unknown';
  const visibleScoreboards = scoreboard.visibleCount ?? 0;
  const hasCurrentEvent = currentEvents.length > 0;
  const currentEvent = currentEvents
    .map((event) => `${event.type}@${formatTime(event.anchorTime)}`)
    .join('; ') || 'none';
  const priority = packet.auditPriority ?? 0;
  const { reviewBucket, reason } = classifyPacket({
    audioOpportunity,
    transcriptReview,
    audioRollup,
    transcriptRollup,
    hasCurrentEvent,
    visibleScoreboards,
    currentEvents,
  });

  return {
    candidateId: packet.candidateWindowId,
    anchorTime: packet.anchorTime ?? 0,
    timecode: packet.timecode ?? formatTime(packet.anchorTime ?? 0),
    priority,
    reviewBucket,
    audioOpportunity,
    transcriptReview,
    currentEvent,
    visibleScoreboards,
    reason,
  };
}

function classifyPacket(input) {
  if (
    input.audioOpportunity === 'post_match_context' ||
    input.audioOpportunity === 'suppress_or_tail' ||
    input.audioRollup.suppressAsPrimary
  ) {
    return {
      reviewBucket: 'post_match_or_recap_suppress',
      reason: 'audio rollup suppresses primary moment',
    };
  }

  if (input.hasCurrentEvent && input.audioOpportunity === 'strengthen_existing_event') {
    return {
      reviewBucket: 'covered_existing_event',
      reason: `linked/current event already present; transcript=${input.transcriptReview}`,
    };
  }

  if (
    !input.hasCurrentEvent &&
    (input.audioOpportunity === 'probable_audio_moment' || input.audioOpportunity === 'uncovered_audio_moment') &&
    ['result_supported', 'action_or_score_context', 'nearby_result_text'].includes(input.transcriptReview)
  ) {
    return {
      reviewBucket: input.visibleScoreboards > 0 ? 'needs_scoreboard_confirmation' : 'probable_missed_audio_moment',
      reason: `audio=${input.audioOpportunity}; transcript=${input.transcriptReview}`,
    };
  }

  if (
    !input.hasCurrentEvent &&
    (input.audioOpportunity === 'probable_audio_moment' || input.audioOpportunity === 'uncovered_audio_moment')
  ) {
    return {
      reviewBucket: 'probable_missed_audio_moment',
      reason: `audio=${input.audioOpportunity}; weak transcript support`,
    };
  }

  if (
    input.audioOpportunity === 'boundary_hint' ||
    input.audioRollup.hasStartBoundaryHint ||
    input.audioRollup.hasScoreOrEndBoundaryHint ||
    input.audioRollup.hasSuppressiveTail
  ) {
    return {
      reviewBucket: 'boundary_or_tail_helper',
      reason: `boundary/tail evidence; transcript=${input.transcriptReview}`,
    };
  }

  if (input.visibleScoreboards > 0 && input.transcriptReview !== 'generic_or_noisy') {
    return {
      reviewBucket: 'needs_scoreboard_confirmation',
      reason: `scoreboard visible and transcript=${input.transcriptReview}`,
    };
  }

  return {
    reviewBucket: 'low_priority_context',
    reason: `audio=${input.audioOpportunity}; transcript=${input.transcriptReview}`,
  };
}

function bucketRank(bucket) {
  return {
    probable_missed_audio_moment: 0,
    needs_scoreboard_confirmation: 1,
    covered_existing_event: 2,
    boundary_or_tail_helper: 3,
    post_match_or_recap_suppress: 4,
    low_priority_context: 5,
  }[bucket] ?? 99;
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function formatTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const wholeSeconds = Math.floor(total % 60);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}`;
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}`;
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '';
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}
