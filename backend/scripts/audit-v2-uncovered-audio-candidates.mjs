import { readFile } from 'node:fs/promises';
import { deriveAudioFacetRow } from './lib/audio-facets.mjs';

const resultPath = process.argv[2];
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const minReviewArg = process.argv.find((arg) => arg.startsWith('--min-review='));
const minDistanceArg = process.argv.find((arg) => arg.startsWith('--min-distance='));
const clusterGapArg = process.argv.find((arg) => arg.startsWith('--cluster-gap='));

const limit = limitArg ? Number(limitArg.split('=')[1]) : 30;
const minReview = minReviewArg ? Number(minReviewArg.split('=')[1]) : 0.28;
const minDistance = minDistanceArg ? Number(minDistanceArg.split('=')[1]) : 8;
const clusterGap = clusterGapArg ? Number(clusterGapArg.split('=')[1]) : 8;

if (!resultPath) {
  console.error('Usage: node backend/scripts/audit-v2-uncovered-audio-candidates.mjs <media_analysis_v2/result.json> [--limit=30] [--min-review=0.28] [--min-distance=8] [--cluster-gap=8]');
  process.exit(1);
}

const result = JSON.parse(await readFile(resultPath, 'utf-8'));
const audioProfile = result.audioProfile ?? result.timelineIndex?.audioProfile ?? null;
const oneSecond = audioProfile?.summaries?.oneSecond ?? [];
const windows = result.timelineIndex?.windows ?? [];
const events = result.events ?? [];
const candidateWindows = result.candidateWindows ?? [];
const scoreboardDetections = result.scoreboardDetections?.detections ?? [];

if (oneSecond.length === 0) {
  console.error('No audioProfile summaries found.');
  process.exit(1);
}

const rows = oneSecond
  .map(buildRow)
  .filter((row) =>
    row.reviewScore >= minReview &&
    row.nearestEventDistance > minDistance &&
    row.nearestCandidateDistance > minDistance &&
    !row.contextFacets.includes('post_match_context') &&
    !row.contextFacets.includes('replay_or_recap') &&
    !row.audioFacets.includes('music_bed')
  )
  .sort((a, b) => a.anchorTime - b.anchorTime);

const clusters = clusterRows(rows)
  .map(summarizeCluster)
  .sort((a, b) => b.priority - a.priority || a.anchorTime - b.anchorTime)
  .slice(0, limit);

console.log('# V2 Uncovered Audio Candidate Audit');
console.log('');
console.log(`result: ${resultPath}`);
console.log(`1s summaries: ${oneSecond.length}`);
console.log(`candidate windows: ${candidateWindows.length}`);
console.log(`events: ${events.length}`);
console.log(`scoreboard detections: ${scoreboardDetections.length}`);
console.log(`min review: ${formatNumber(minReview)}`);
console.log(`min distance: ${formatNumber(minDistance)}s`);
console.log(`clusters: ${clusters.length}`);
console.log('');
console.log('| time | priority | review | span | bucket | audio | opportunity | event | candidate | scoreboard | transcript | reason |');
console.log('| --- | ---: | ---: | --- | --- | --- | --- | --- | --- | ---: | --- | --- |');
for (const cluster of clusters) {
  console.log([
    cluster.timecode,
    formatNumber(cluster.priority),
    formatNumber(cluster.best.reviewScore),
    `${formatTime(cluster.start)}-${formatTime(cluster.end)}`,
    cluster.bucket,
    cluster.audioFacets.join(','),
    cluster.opportunityFacets.join(','),
    cluster.nearestEvent,
    cluster.nearestCandidate,
    cluster.scoreboardAvailability,
    compactText(cluster.transcript, 140),
    cluster.reason,
  ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
}

function buildRow(summary) {
  const anchorTime = summary.strongestAttackTime ?? midpoint(summary.start, summary.end);
  const nearestEvent = nearestByTime(events, anchorTime, (event) => event.anchorTime ?? event.startTime ?? 0);
  const nearestCandidate = nearestByTime(candidateWindows, anchorTime, (candidate) => midpoint(candidate.startTime, candidate.endTime));
  const nearbyScoreboardRows = scoreboardDetections.filter((row) => Math.abs((row.time ?? row.sampleTime ?? 0) - anchorTime) <= 8);
  const visibleScoreboards = nearbyScoreboardRows.filter((row) => row.scoreboardVisible || row.visible);
  const facetRow = deriveAudioFacetRow({
    summary,
    nearestEventType: nearestEvent.item?.type,
    nearestEventDistance: nearestEvent.distance,
    nearestCandidateDistance: nearestCandidate.distance,
    scoreboardNearbyCount: nearbyScoreboardRows.length,
    scoreboardVisibleCount: visibleScoreboards.length,
  });
  const scores = facetRow.scores;
  const reviewScore = clamp01(
    scores.reaction * 0.26
    + scores.rally * 0.18
    + scores.crowd * 0.18
    + scores.playerVocalization * 0.16
    + scores.umpire * 0.08
    - scores.commentator * 0.08
    - scores.music * 0.08
    + (summary.spectralFluxMax ?? 0) * 0.12,
  );

  return {
    start: summary.start,
    end: summary.end,
    anchorTime,
    reviewScore: round3(reviewScore),
    reactionScore: scores.reaction,
    rallyScore: scores.rally,
    crowdScore: scores.crowd,
    commentatorScore: scores.commentator,
    audioFacets: facetRow.audioFacets,
    contextFacets: facetRow.contextFacets,
    opportunityFacets: facetRow.opportunityFacets,
    nearestEventDistance: nearestEvent.distance,
    nearestCandidateDistance: nearestCandidate.distance,
    nearestEvent: nearestEvent.item ? `${nearestEvent.item.type}@${formatTime(nearestEvent.time)} d=${formatNumber(nearestEvent.distance)}` : 'none',
    nearestCandidate: nearestCandidate.item ? `${nearestCandidate.item.id ?? nearestCandidate.item.sourceRef ?? 'candidate'} d=${formatNumber(nearestCandidate.distance)}` : 'none',
    scoreboardNearbyCount: nearbyScoreboardRows.length,
    scoreboardVisibleCount: visibleScoreboards.length,
    transcript: nearestWindow(anchorTime)?.transcriptText ?? '',
  };
}

function clusterRows(inputRows) {
  const clusters = [];
  for (const row of inputRows) {
    const previous = clusters.at(-1);
    if (!previous || row.anchorTime - previous.at(-1).anchorTime > clusterGap) {
      clusters.push([row]);
    } else {
      previous.push(row);
    }
  }
  return clusters;
}

function summarizeCluster(rows) {
  const best = [...rows].sort((a, b) => b.reviewScore - a.reviewScore || a.anchorTime - b.anchorTime)[0];
  const audioFacets = unique(rows.flatMap((row) => row.audioFacets));
  const opportunityFacets = unique(rows.flatMap((row) => row.opportunityFacets));
  const transcript = unique(rows.map((row) => String(row.transcript ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)).join(' ');
  const scoreboardVisibleCount = rows.reduce((sum, row) => sum + row.scoreboardVisibleCount, 0);
  const scoreboardNearbyCount = rows.reduce((sum, row) => sum + row.scoreboardNearbyCount, 0);
  const bucket = classifyCluster({ best, transcript, scoreboardVisibleCount, audioFacets, opportunityFacets });

  return {
    start: rows[0].start,
    end: rows.at(-1).end,
    anchorTime: best.anchorTime,
    timecode: formatTime(best.anchorTime),
    best,
    priority: round3(best.reviewScore + (scoreboardVisibleCount > 0 ? 0.08 : 0) + transcriptBoost(transcript)),
    bucket,
    audioFacets,
    opportunityFacets,
    nearestEvent: best.nearestEvent,
    nearestCandidate: best.nearestCandidate,
    scoreboardAvailability: `${scoreboardVisibleCount}/${scoreboardNearbyCount}`,
    transcript,
    reason: reasonForCluster({ bucket, best, transcript, scoreboardVisibleCount, audioFacets, opportunityFacets }),
  };
}

function classifyCluster({ best, transcript, scoreboardVisibleCount, audioFacets, opportunityFacets }) {
  const text = transcript.toLowerCase();
  const hasActionText = /\b(point|break|deuce|forehand|backhand|serve|return|missed|winner|hold|game|set point|break point|40|30|15)\b/.test(text);
  const hasResultOrScoreText = /\b(deuce|break point|set point|match point|winner|holds?|breaks?|takes?|wins?|game|set|40|30|15)\b/.test(text);
  const hasReactionAudio = audioFacets.includes('reaction_burst') || audioFacets.includes('crowd_reaction');
  const hasStrongReactionOrCrowd = best.reactionScore >= 0.6 || best.crowdScore >= 0.58 || hasReactionAudio;
  const rallyOnly = audioFacets.includes('rally_texture') &&
    !hasReactionAudio &&
    !audioFacets.includes('umpire_or_score_call') &&
    !audioFacets.includes('player_vocalization');
  const mostlySpeech = audioFacets.includes('commentator_speech') && !audioFacets.includes('reaction_burst') && best.commentatorScore > best.reactionScore;

  if (mostlySpeech) return 'manual_review_commentary_or_recap_risk';
  if (scoreboardVisibleCount > 0 && (hasStrongReactionOrCrowd || hasResultOrScoreText)) return 'needs_scoreboard_confirmation';
  if (hasStrongReactionOrCrowd && hasActionText) return 'manual_review_audio_transcript';
  if (hasStrongReactionOrCrowd) return 'manual_review_audio_only';
  if (rallyOnly || audioFacets.includes('rally_texture')) return 'boundary_or_tail_helper';
  return 'low_priority_audio_texture';
}

function reasonForCluster({ bucket, best, transcript, scoreboardVisibleCount, audioFacets }) {
  const parts = [`bucket=${bucket}`, `bestReview=${formatNumber(best.reviewScore)}`];
  if (scoreboardVisibleCount > 0) parts.push('scoreboard_nearby');
  if (transcript) parts.push('transcript_context');
  if (audioFacets.length) parts.push(`audio=${audioFacets.join('+')}`);
  return parts.join('; ');
}

function transcriptBoost(text) {
  return /\b(point|break|deuce|winner|hold|game|set point|break point|40|30|15)\b/i.test(text) ? 0.04 : 0;
}

function nearestWindow(time) {
  return nearestByTime(windows, time, (window) => midpoint(window.start, window.end)).item;
}

function nearestByTime(items, time, getTime) {
  if (items.length === 0) return { item: null, time: 0, distance: Number.POSITIVE_INFINITY };
  const item = [...items].sort((a, b) => Math.abs(getTime(a) - time) - Math.abs(getTime(b) - time))[0];
  const itemTime = getTime(item);
  return { item, time: itemTime, distance: Math.abs(itemTime - time) };
}

function midpoint(start, end) {
  return (start + end) / 2;
}

function unique(values) {
  return [...new Set(values)];
}

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
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

function compactText(value, maxLength) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
