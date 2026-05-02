import { readFile } from 'node:fs/promises';
import { deriveAudioFacetRow, summarizeAudioFacetTimeline } from './lib/audio-facets.mjs';

const resultPath = process.argv[2];
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const minScoreArg = process.argv.find((arg) => arg.startsWith('--min-score='));
const timelineLimitArg = process.argv.find((arg) => arg.startsWith('--timeline-limit='));
const timelineRadiusArg = process.argv.find((arg) => arg.startsWith('--timeline-radius='));
const candidateArg = process.argv.find((arg) => arg.startsWith('--candidate='));
const timeArg = process.argv.find((arg) => arg.startsWith('--time='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 80;
const minScore = minScoreArg ? Number(minScoreArg.split('=')[1]) : 0.5;
const timelineLimit = timelineLimitArg ? Number(timelineLimitArg.split('=')[1]) : 8;
const timelineRadius = timelineRadiusArg ? Number(timelineRadiusArg.split('=')[1]) : 12;
const focusCandidateId = candidateArg ? candidateArg.split('=')[1] : null;
const focusTime = timeArg ? parseTimecode(timeArg.split('=')[1]) : null;

if (!resultPath) {
  console.error('Usage: node backend/scripts/audit-v2-audio-map.mjs <media_analysis_v2/result.json> [--limit=80] [--min-score=0.5]');
  process.exit(1);
}

const result = JSON.parse(await readFile(resultPath, 'utf-8'));
const audioProfile = result.audioProfile ?? result.timelineIndex?.audioProfile ?? null;
const oneSecond = audioProfile?.summaries?.oneSecond ?? [];
const windows = result.timelineIndex?.windows ?? [];
const events = result.events ?? [];
const candidateWindows = result.candidateWindows ?? [];
const scoreboardDetections = result.scoreboardDetections?.detections ?? [];

if (!audioProfile || oneSecond.length === 0) {
  console.error('No audioProfile summaries found. Re-run V2 with audio profile output enabled.');
  process.exit(1);
}

const rows = oneSecond.map(buildAudioMapRow);
const interestingRows = rows
  .filter((row) => row.maxClassScore >= minScore || row.reactionScore >= minScore || row.rallyScore >= minScore)
  .sort((a, b) => b.reviewScore - a.reviewScore || a.start - b.start)
  .slice(0, limit);

console.log('# Audio Map Audit');
console.log('');
console.log(`result: ${resultPath}`);
console.log(`1s summaries: ${oneSecond.length}`);
console.log(`displayed rows: ${interestingRows.length}`);
console.log(`min score: ${minScore.toFixed(2)}`);
console.log(`scoreboard detections: ${scoreboardDetections.length}`);
console.log(`candidate timelines: ${Math.min(timelineLimit, candidateWindows.length)}`);
console.log(`timeline radius: ${timelineRadius}s`);
if (focusCandidateId) console.log(`focus candidate: ${focusCandidateId}`);
if (focusTime != null) console.log(`focus time: ${formatTime(focusTime)}`);
console.log('');

printSection('Top Audio Windows', interestingRows);
printSection('Top Reaction Moments', topRows('reactionScore'));
printSection('Top Rally Texture', topRows('rallyScore'));
printSection('Top Crowd Moments', topRows('crowdScore'));
printSection('Top Player Vocalization Spikes', topRows('playerVocalizationScore'));
printSection('Suppressed Speech Or Music', rows
  .filter((row) => row.commentatorScore >= minScore || row.musicScore >= minScore || row.suppressionReasons.length > 0)
  .sort((a, b) => Math.max(b.commentatorScore, b.musicScore) - Math.max(a.commentatorScore, a.musicScore))
  .slice(0, limit));
printSection('Strong Audio Without Candidate Or Event', rows
  .filter((row) => row.reviewScore >= minScore && row.nearestCandidateDistance > 8 && row.nearestEventDistance > 8)
  .sort((a, b) => b.reviewScore - a.reviewScore)
  .slice(0, limit));
printFocusedTimeTimeline();
printCandidateTimelines();

function printSection(title, inputRows) {
  console.log(`## ${title}`);
  console.log('');
  console.log('| time | review | energy | react | rally | crowd | comm | umpire | player | music | audio facets | context facets | opportunity | reasons | transcript | event | candidate | scoreboard |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of inputRows) {
    console.log([
      formatRange(row.start, row.end),
      formatNumber(row.reviewScore),
      formatNumber(row.energy),
      formatNumber(row.reactionScore),
      formatNumber(row.rallyScore),
      formatNumber(row.crowdScore),
      formatNumber(row.commentatorScore),
      formatNumber(row.umpireScore),
      formatNumber(row.playerVocalizationScore),
      formatNumber(row.musicScore),
      row.audioFacets.join(','),
      row.contextFacets.join(','),
      row.opportunityFacets.join(','),
      row.reasons.join(','),
      compactText(row.transcript, 130),
      row.nearestEvent,
      row.nearestCandidate,
      row.scoreboardAvailability,
    ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  console.log('');
}

function topRows(key) {
  return [...rows]
    .filter((row) => row[key] >= minScore)
    .sort((a, b) => b[key] - a[key] || a.start - b.start)
    .slice(0, limit);
}

function printCandidateTimelines() {
  const candidates = candidateWindows
    .filter((candidate) => {
      if (!focusCandidateId) return true;
      return (candidate.id ?? candidate.sourceRef) === focusCandidateId;
    })
    .map((candidate) => {
      const anchor = candidate.anchorTime ?? midpoint(candidate.startTime, candidate.endTime);
      const timelineRows = rows.filter((row) => Math.abs(midpoint(row.start, row.end) - anchor) <= timelineRadius);
      const bestReviewScore = timelineRows.reduce((max, row) => Math.max(max, row.reviewScore), 0);
      const bestSignalScore = timelineRows.reduce((max, row) => Math.max(
        max,
        row.reactionScore,
        row.rallyScore,
        row.maxClassScore,
      ), 0);
      const opportunities = unique(timelineRows.flatMap((row) => row.opportunityFacets));
      const rollup = summarizeAudioFacetTimeline(timelineRows, { anchorTime: anchor });
      return { candidate, anchor, timelineRows, bestReviewScore, bestSignalScore, opportunities, rollup };
    })
    .filter((item) => focusCandidateId || item.bestSignalScore >= minScore || item.opportunities.includes('uncovered_audio_moment'))
    .sort((a, b) => b.bestSignalScore - a.bestSignalScore || b.bestReviewScore - a.bestReviewScore || a.anchor - b.anchor)
    .slice(0, timelineLimit);

  console.log('## Candidate Audio Facet Timelines');
  console.log('');
  if (candidates.length === 0) {
    console.log(focusCandidateId
      ? `_No timeline matched candidate ${focusCandidateId}. Try a lower --min-score or check the id._`
      : '_No candidate timelines matched the current threshold._');
    console.log('');
    return;
  }

  for (const item of candidates) {
    const candidateId = item.candidate.id ?? item.candidate.sourceRef ?? 'candidate';
    console.log(`### ${candidateId} @ ${formatTime(item.anchor)}`);
    console.log('');
    console.log([
      `bestSignal=${formatNumber(item.bestSignalScore)}`,
      `bestReview=${formatNumber(item.bestReviewScore)}`,
      `audioMomentOpportunity=${item.rollup.audioMomentOpportunity}`,
      `primaryAnchor=${item.rollup.primaryAnchorTimecode ?? 'none'}`,
      `suppressiveTail=${item.rollup.hasSuppressiveTail ? 'yes' : 'no'}`,
      `opportunities=${item.opportunities.join(',') || 'none'}`,
    ].join(' '));
    console.log('');
    console.log('| offset | time | review | react | rally | crowd | comm | player | music | audio facets | context facets | opportunity | transcript |');
    console.log('| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |');
    for (const row of item.timelineRows) {
      const offset = midpoint(row.start, row.end) - item.anchor;
      console.log([
        formatSignedNumber(offset),
        formatRange(row.start, row.end),
        formatNumber(row.reviewScore),
        formatNumber(row.reactionScore),
        formatNumber(row.rallyScore),
        formatNumber(row.crowdScore),
        formatNumber(row.commentatorScore),
        formatNumber(row.playerVocalizationScore),
        formatNumber(row.musicScore),
        row.audioFacets.join(','),
        row.contextFacets.join(','),
        row.opportunityFacets.join(','),
        compactText(row.transcript, 120),
      ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
    console.log('');
  }
}

function printFocusedTimeTimeline() {
  if (focusTime == null) return;

  const timelineRows = rows.filter((row) => Math.abs(midpoint(row.start, row.end) - focusTime) <= timelineRadius);
  console.log('## Focused Audio Facet Timeline');
  console.log('');
  console.log(`time=${formatTime(focusTime)} rows=${timelineRows.length}`);
  console.log('');
  console.log('| offset | time | review | react | rally | crowd | comm | player | music | audio facets | context facets | opportunity | event | candidate | transcript |');
  console.log('| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |');
  for (const row of timelineRows) {
    const offset = midpoint(row.start, row.end) - focusTime;
    console.log([
      formatSignedNumber(offset),
      formatRange(row.start, row.end),
      formatNumber(row.reviewScore),
      formatNumber(row.reactionScore),
      formatNumber(row.rallyScore),
      formatNumber(row.crowdScore),
      formatNumber(row.commentatorScore),
      formatNumber(row.playerVocalizationScore),
      formatNumber(row.musicScore),
      row.audioFacets.join(','),
      row.contextFacets.join(','),
      row.opportunityFacets.join(','),
      row.nearestEvent,
      row.nearestCandidate,
      compactText(row.transcript, 120),
    ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  console.log('');
}

function buildAudioMapRow(summary) {
  const context = summary.context ?? {};
  const anchorTime = summary.strongestAttackTime ?? midpoint(summary.start, summary.end);
  const nearestTimelineWindow = nearestWindow(windows, anchorTime);
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
  const reactionScore = facetRow.scores.reaction;
  const rallyScore = facetRow.scores.rally;
  const crowdScore = facetRow.scores.crowd;
  const commentatorScore = facetRow.scores.commentator;
  const umpireScore = facetRow.scores.umpire;
  const playerVocalizationScore = facetRow.scores.playerVocalization;
  const musicScore = facetRow.scores.music;
  const maxClassScore = Math.max(crowdScore, commentatorScore, umpireScore, playerVocalizationScore, musicScore);
  const reviewScore = clamp01(
    reactionScore * 0.26
    + rallyScore * 0.18
    + crowdScore * 0.18
    + playerVocalizationScore * 0.16
    + umpireScore * 0.08
    - commentatorScore * 0.08
    - musicScore * 0.08
    + (summary.spectralFluxMax ?? 0) * 0.12,
  );

  return {
    start: summary.start,
    end: summary.end,
    reviewScore: round3(reviewScore),
    energy: summary.rmsEnergy ?? summary.energyMax ?? 0,
    reactionScore,
    rallyScore,
    crowdScore,
    commentatorScore,
    umpireScore,
    playerVocalizationScore,
    musicScore,
    maxClassScore,
    spectralCentroidMean: summary.spectralCentroidMean ?? 0,
    spectralFlatnessMean: summary.spectralFlatnessMean ?? 0,
    spectralFluxMax: summary.spectralFluxMax ?? 0,
    pointShapeHint: context.pointShapeHint ?? summary.pointShapeHint ?? '',
    suppressionReasons: context.suppressionReasons ?? [],
    audioFacets: facetRow.audioFacets,
    contextFacets: facetRow.contextFacets,
    opportunityFacets: facetRow.opportunityFacets,
    reasons: facetRow.reasons,
    transcript: nearestTimelineWindow?.transcriptText ?? '',
    nearestEvent: nearestEvent.item ? `${nearestEvent.item.type}@${formatTime(nearestEvent.time)} d=${formatNumber(nearestEvent.distance)}` : 'none',
    nearestEventDistance: nearestEvent.distance,
    nearestCandidate: nearestCandidate.item ? `${nearestCandidate.item.id ?? nearestCandidate.item.sourceRef ?? 'candidate'} d=${formatNumber(nearestCandidate.distance)}` : 'none',
    nearestCandidateDistance: nearestCandidate.distance,
    scoreboardAvailability: scoreboardDetections.length === 0
      ? 'not_run'
      : `${visibleScoreboards.length}/${nearbyScoreboardRows.length}`,
  };
}

function nearestWindow(inputWindows, time) {
  return [...inputWindows]
    .sort((a, b) => Math.abs(midpoint(a.start, a.end) - time) - Math.abs(midpoint(b.start, b.end) - time))[0] ?? null;
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

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  if (Math.abs(remaining - Math.round(remaining)) < 0.001) {
    return `${minutes}:${String(Math.round(remaining)).padStart(2, '0')}`;
  }
  return `${minutes}:${remaining.toFixed(1).padStart(4, '0')}`;
}

function formatRange(start, end) {
  return `${formatTime(start)}-${formatTime(end)}`;
}

function parseTimecode(value) {
  const parts = String(value).split(':').map(Number);
  if (parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid --time value: ${value}`);
  }
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  throw new Error(`Invalid --time value: ${value}`);
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '';
}

function compactText(text, maxLength) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|');
}

function unique(values) {
  return [...new Set(values)];
}

function formatSignedNumber(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}s`;
}

function round3(value) {
  return Number(value.toFixed(3));
}

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
