import { readFile } from 'node:fs/promises';
import { deriveAudioFacetRow } from './lib/audio-facets.mjs';

const resultPath = process.argv[2];
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const minScoreArg = process.argv.find((arg) => arg.startsWith('--min-score='));
const clusterGapArg = process.argv.find((arg) => arg.startsWith('--cluster-gap='));

const limit = limitArg ? Number(limitArg.split('=')[1]) : 80;
const minScore = minScoreArg ? Number(minScoreArg.split('=')[1]) : 0.24;
const clusterGap = clusterGapArg ? Number(clusterGapArg.split('=')[1]) : 4;

if (!resultPath) {
  console.error('Usage: node backend/scripts/audit-v2-audio-highlight-candidates.mjs <media_analysis_v2/result.json> [--limit=80] [--min-score=0.24] [--cluster-gap=4]');
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
  .map(buildAudioRow)
  .filter((row) => row.highlightScore >= minScore)
  .sort((a, b) => a.anchorTime - b.anchorTime);

const clusters = clusterRows(rows)
  .map(summarizeCluster)
  .sort((a, b) => b.priority - a.priority || a.start - b.start)
  .slice(0, limit);

console.log('# V2 Raw Audio Highlight Candidate Audit');
console.log('');
console.log(`result: ${resultPath}`);
console.log(`1s summaries: ${oneSecond.length}`);
console.log(`events: ${events.length}`);
console.log(`candidate windows: ${candidateWindows.length}`);
console.log(`scoreboard detections: ${scoreboardDetections.length}`);
console.log(`min score: ${formatNumber(minScore)}`);
console.log(`clusters: ${clusters.length}`);
console.log('');
console.log('| time | priority | bucket | span | rally seconds | reaction peak | crowd peak | player peak | coverage | event | candidate | scoreboard | transcript | reason |');
console.log('| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | --- | --- |');
for (const cluster of clusters) {
  console.log([
    cluster.timecode,
    formatNumber(cluster.priority),
    cluster.bucket,
    `${formatTime(cluster.start)}-${formatTime(cluster.end)}`,
    cluster.rallySeconds,
    formatNumber(cluster.reactionPeak),
    formatNumber(cluster.crowdPeak),
    formatNumber(cluster.playerPeak),
    cluster.coverage,
    cluster.nearestEvent,
    cluster.nearestCandidate,
    cluster.scoreboardAvailability,
    compactText(cluster.transcript, 150),
    cluster.reason,
  ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
}

function buildAudioRow(summary) {
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
  const suppressive =
    facetRow.contextFacets.includes('post_match_context') ||
    facetRow.contextFacets.includes('replay_or_recap') ||
    facetRow.audioFacets.includes('music_bed') ||
    (
      facetRow.audioFacets.includes('commentator_speech') &&
      scores.commentator > scores.reaction &&
      scores.commentator > scores.crowd
    );
  const highlightScore = clamp01(
    scores.rally * 0.22
    + scores.reaction * 0.28
    + scores.crowd * 0.22
    + scores.playerVocalization * 0.18
    + (summary.spectralFluxMax ?? 0) * 0.08
    - scores.commentator * 0.04
    - scores.music * 0.10
    - (suppressive ? 0.18 : 0),
  );

  return {
    start: summary.start,
    end: summary.end,
    anchorTime,
    highlightScore: round3(highlightScore),
    reactionScore: scores.reaction,
    rallyScore: scores.rally,
    crowdScore: scores.crowd,
    playerVocalizationScore: scores.playerVocalization,
    commentatorScore: scores.commentator,
    musicScore: scores.music,
    audioFacets: facetRow.audioFacets,
    contextFacets: facetRow.contextFacets,
    opportunityFacets: facetRow.opportunityFacets,
    suppressive,
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
    if (!previous || row.start - previous.at(-1).end > clusterGap) {
      clusters.push([row]);
    } else {
      previous.push(row);
    }
  }
  return clusters;
}

function summarizeCluster(rows) {
  const best = [...rows].sort((a, b) => b.highlightScore - a.highlightScore || a.anchorTime - b.anchorTime)[0];
  const rallyRows = rows.filter((row) => row.rallyScore >= 0.55);
  const reactionPeak = max(rows, (row) => row.reactionScore);
  const crowdPeak = max(rows, (row) => row.crowdScore);
  const playerPeak = max(rows, (row) => row.playerVocalizationScore);
  const scoreboardVisibleCount = rows.reduce((sum, row) => sum + row.scoreboardVisibleCount, 0);
  const scoreboardNearbyCount = rows.reduce((sum, row) => sum + row.scoreboardNearbyCount, 0);
  const transcript = unique(rows.map((row) => String(row.transcript ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)).join(' ');
  const nearestEvent = nearestByTime(events, best.anchorTime, (event) => event.anchorTime ?? event.startTime ?? 0);
  const nearestCandidate = nearestByTime(candidateWindows, best.anchorTime, (candidate) => midpoint(candidate.startTime, candidate.endTime));
  const coverage = coverageLabel(nearestEvent.distance, nearestCandidate.distance);
  const bucket = classifyCluster({
    rows,
    best,
    reactionPeak,
    crowdPeak,
    playerPeak,
    rallySeconds: rallyRows.length,
    scoreboardVisibleCount,
    transcript,
    coverage,
  });
  const priority = round3(
    best.highlightScore
    + Math.min(0.12, rallyRows.length * 0.015)
    + (reactionPeak >= 0.6 ? 0.08 : 0)
    + (crowdPeak >= 0.58 ? 0.05 : 0)
    + (scoreboardVisibleCount > 0 ? 0.04 : 0),
  );

  return {
    start: rows[0].start,
    end: rows.at(-1).end,
    anchorTime: best.anchorTime,
    timecode: formatTime(best.anchorTime),
    priority,
    bucket,
    rallySeconds: rallyRows.length,
    reactionPeak,
    crowdPeak,
    playerPeak,
    coverage,
    nearestEvent: nearestEvent.item ? `${nearestEvent.item.type}@${formatTime(nearestEvent.time)} d=${formatNumber(nearestEvent.distance)}` : 'none',
    nearestCandidate: nearestCandidate.item ? `${nearestCandidate.item.id ?? nearestCandidate.item.sourceRef ?? 'candidate'} d=${formatNumber(nearestCandidate.distance)}` : 'none',
    scoreboardAvailability: `${scoreboardVisibleCount}/${scoreboardNearbyCount}`,
    transcript,
    reason: reasonForCluster({ bucket, best, rallyRows, reactionPeak, crowdPeak, playerPeak, scoreboardVisibleCount, transcript, coverage }),
  };
}

function classifyCluster(input) {
  const hasStrongReaction = input.reactionPeak >= 0.6 || input.crowdPeak >= 0.58 || input.playerPeak >= 0.6;
  const hasLongRally = input.rallySeconds >= 5;
  const hasSustainedRally = input.rallySeconds >= 3;
  const hasScoreboard = input.scoreboardVisibleCount > 0;
  const hasTranscriptCue = /\b(point|winner|break|deuce|hold|game|set|forehand|backhand|serve|return|40|30|15)\b/i.test(input.transcript);
  const hasMostlyUmpireOrSpeech = input.rows.some((row) =>
    row.audioFacets.includes('umpire_or_score_call') &&
    row.commentatorScore > row.reactionScore &&
    row.commentatorScore > row.crowdScore
  );
  const suppressiveRows = input.rows.filter((row) => row.suppressive).length;
  const suppressiveShare = suppressiveRows / Math.max(1, input.rows.length);

  if (suppressiveShare >= 0.5) return 'recap_or_tail_suppress';
  if (input.coverage === 'covered_existing_event') return 'covered_existing_event';
  if (hasLongRally && hasStrongReaction) return 'strong_audio_highlight_candidate';
  if (hasMostlyUmpireOrSpeech && !hasStrongReaction) return 'low_priority_audio_context';
  if (
    (hasLongRally && (hasTranscriptCue || hasScoreboard)) ||
    (hasSustainedRally && hasStrongReaction) ||
    (hasStrongReaction && (hasTranscriptCue || hasScoreboard))
  ) {
    return 'possible_audio_highlight_candidate';
  }
  if (hasSustainedRally) return 'weak_rally_texture';
  return 'low_priority_audio_context';
}

function reasonForCluster(input) {
  const parts = [
    `bucket=${input.bucket}`,
    `best=${formatNumber(input.best.highlightScore)}`,
    `rallySeconds=${input.rallyRows.length}`,
    `reactionPeak=${formatNumber(input.reactionPeak)}`,
    `crowdPeak=${formatNumber(input.crowdPeak)}`,
  ];
  if (input.playerPeak >= 0.6) parts.push(`playerPeak=${formatNumber(input.playerPeak)}`);
  if (input.scoreboardVisibleCount > 0) parts.push('scoreboard_nearby');
  if (input.transcript) parts.push('transcript_context');
  parts.push(input.coverage);
  return parts.join('; ');
}

function coverageLabel(eventDistance, candidateDistance) {
  if (eventDistance <= 8 || candidateDistance <= 8) return 'covered_existing_event';
  if (eventDistance <= 25 || candidateDistance <= 25) return 'near_existing_context';
  return 'uncovered';
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

function max(values, getter) {
  return values.reduce((highest, value) => Math.max(highest, getter(value) ?? 0), 0);
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
