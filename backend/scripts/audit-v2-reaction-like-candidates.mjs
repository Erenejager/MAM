import { readFile } from 'node:fs/promises';

const resultPath = process.argv[2];
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const minScoreArg = process.argv.find((arg) => arg.startsWith('--min-score='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 60;
const minScore = minScoreArg ? Number(minScoreArg.split('=')[1]) : 0.55;

if (!resultPath) {
  console.error('Usage: node backend/scripts/audit-v2-reaction-like-candidates.mjs <media_analysis_v2/result.json> [--limit=60] [--min-score=0.55]');
  process.exit(1);
}

const result = JSON.parse(await readFile(resultPath, 'utf-8'));
const audioProfile = result.audioProfile ?? result.timelineIndex?.audioProfile ?? null;
const windows = result.timelineIndex?.windows ?? [];
const events = result.events ?? [];
const peaks = result.audioPeaks ?? [];
const candidateWindows = result.candidateWindows ?? [];
const episodes = result.audioReactionEpisodes ?? [];
const oneSecond = audioProfile?.summaries?.oneSecond ?? [];
const fiveSecond = audioProfile?.summaries?.fiveSecond ?? [];

if (!audioProfile || oneSecond.length === 0) {
  console.error('No audioProfile summaries found. Re-run V2 with audio profile output enabled.');
  process.exit(1);
}

const scoredRows = oneSecond
  .map((summary) => scoreSummary(summary))
  .filter((row) => row.score >= minScore);
const groups = groupRows(scoredRows, 2);
const allCandidates = groups
  .map(buildCandidate)
  .sort((a, b) => b.score - a.score || a.anchorTime - b.anchorTime);
const candidates = allCandidates.slice(0, limit);

console.log('# Reaction-Like Candidate Audit');
console.log('');
console.log(`result: ${resultPath}`);
console.log(`1s summaries: ${oneSecond.length}`);
console.log(`candidate groups above score ${minScore.toFixed(2)}: ${groups.length}`);
console.log(`displayed: ${candidates.length}`);
console.log('');
console.log('| rank | review label | time | score | ctx reaction | ctx speech | ctx rally | ctx shape | suppress | episode role | nearby peak | nearby event | transcript | why |');
console.log('| ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- |');

for (let index = 0; index < candidates.length; index++) {
  const candidate = candidates[index];
  console.log([
    index + 1,
    candidate.reviewLabel,
    formatRange(candidate.startTime, candidate.endTime),
    formatNumber(candidate.score),
    formatNumber(candidate.contextReactionScore),
    formatNumber(candidate.contextSpeechScore),
    formatNumber(candidate.contextRallyScore),
    candidate.contextShape,
    candidate.suppressionReasons.join(','),
    candidate.episodeRole,
    candidate.nearbyPeak,
    candidate.nearbyEvent,
    compactText(candidate.transcript, 150),
    candidate.reason,
  ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
}

const eventCoverageRows = events.map((event) => buildEventCoverageRow(event));
console.log('');
console.log('## Current Event Coverage');
console.log('');
console.log('| event | time | best candidate | score | distance | coverage | note |');
console.log('| --- | --- | --- | ---: | ---: | --- | --- |');
for (const row of eventCoverageRows) {
  console.log([
    row.event,
    formatTime(row.time),
    row.candidateTime,
    formatNumber(row.score),
    formatNumber(row.distance),
    row.coverage,
    row.note,
  ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
}

function scoreSummary(summary) {
  const context = summary.context ?? {};
  const contextReaction = context.reactionBurstScore ?? summary.reactionBurstScore ?? 0;
  const contextSpeech = context.speechDominanceScore ?? summary.speechDominanceScore ?? 0;
  const contextRally = context.rallyTextureScore ?? summary.rallyTextureScore ?? 0;
  const contextCrowd = context.applauseCrowdScore ?? summary.applauseCrowdScore ?? 0;
  const contextMusic = context.musicBedScore ?? summary.musicBedScore ?? 0;
  const suppressionReasons = context.suppressionReasons ?? [];
  const peak = nearestPeak(midpoint(summary.start, summary.end), 6);
  const episodeMember = peak ? episodeMemberForPeak(peak.id) : null;
  const attackScore = clamp01((summary.strongestAttackScore ?? 0) / 0.25);
  const episodePrimaryBoost = episodeMember?.role === 'primary_anchor' ? 0.14 : 0;
  const rawPeakBoost = peak && peak.spikeScore >= 0.25 ? 0.08 : 0;
  const tailPenalty = episodeMember?.role === 'recap_or_speech_tail' ? 0.25 : 0;
  const speechPenalty = Math.max(0, contextSpeech - 0.72) * 0.55;
  const suppressionPenalty = suppressionReasons.includes('replay_cue') ? 0.18 : 0;
  const musicPenalty = contextMusic >= 0.68 ? 0.12 : 0;

  const score = clamp01(
    contextReaction * 0.46
    + contextRally * 0.18
    + contextCrowd * 0.14
    + attackScore * 0.12
    + episodePrimaryBoost
    + rawPeakBoost
    - tailPenalty
    - speechPenalty
    - suppressionPenalty
    - musicPenalty,
  );

  return {
    summary,
    score: round3(score),
    contextReaction,
    contextSpeech,
    contextRally,
    suppressionReasons,
    peak,
    episodeMember,
  };
}

function groupRows(rows, maxGapSeconds) {
  const sorted = [...rows].sort((a, b) => a.summary.start - b.summary.start);
  const groups = [];

  for (const row of sorted) {
    const previous = groups[groups.length - 1];
    const previousRow = previous?.[previous.length - 1] ?? null;
    if (!previous || !previousRow || row.summary.start - previousRow.summary.end > maxGapSeconds) {
      groups.push([row]);
      continue;
    }
    previous.push(row);
  }

  return groups;
}

function buildCandidate(group) {
  const best = [...group].sort((a, b) => b.score - a.score || a.summary.start - b.summary.start)[0];
  const summary = best.summary;
  const anchorTime = summary.strongestAttackTime ?? midpoint(summary.start, summary.end);
  const startTime = Math.min(...group.map((row) => row.summary.start));
  const endTime = Math.max(...group.map((row) => row.summary.end));
  const nearbyEvent = nearestEvent(anchorTime, 12);
  const previousEvent = previousEventWithin(anchorTime, 90);
  const peak = best.peak ?? nearestPeak(anchorTime, 8);
  const member = peak ? episodeMemberForPeak(peak.id) : null;
  const episode = member ? episodeForMember(member) : null;
  const window = nearestWindow(anchorTime);
  const context = summary.context ?? {};
  const suppressionReasons = context.suppressionReasons ?? [];

  return {
    startTime,
    endTime,
    anchorTime,
    score: best.score,
    contextReactionScore: best.contextReaction,
    contextSpeechScore: best.contextSpeech,
    contextRallyScore: best.contextRally,
    contextShape: context.pointShapeHint ?? summary.pointShapeHint ?? 'unknown',
    suppressionReasons,
    episodeRole: member ? `${member.role}${episode ? `/${episode.id}` : ''}` : '',
    nearbyPeak: peak ? `${formatTime(peak.peakTime)} ${peak.id} spike=${formatNumber(peak.spikeScore)} pct=${formatNumber(peak.percentileRank)}` : '',
    nearbyEvent: nearbyEvent ? `${nearbyEvent.type}@${formatTime(nearbyEvent.anchorTime)} ${nearbyEvent.label ?? ''}` : '',
    transcript: transcriptAround(anchorTime, 10, 18),
    reviewLabel: suggestReviewLabel({
      nearbyEvent,
      previousEvent,
      member,
      context,
      suppressionReasons,
      score: best.score,
    }),
    reason: explainCandidate({
      nearbyEvent,
      previousEvent,
      member,
      context,
      suppressionReasons,
      score: best.score,
      window,
    }),
  };
}

function suggestReviewLabel({ nearbyEvent, previousEvent, member, context, suppressionReasons, score }) {
  if (member?.role === 'recap_or_speech_tail') return 'recap_tail';
  if (suppressionReasons.includes('replay_cue')) return 'replay_back_anchor';
  if ((context.pointShapeHint ?? '') === 'recap_only') return 'commentary_false_positive';
  if (suppressionReasons.includes('music_bed')) return 'music_or_changeover';
  if (previousEvent && !nearbyEvent && (context.speechDominanceScore ?? 0) >= 0.65) return 'recap_tail';
  if (nearbyEvent && member?.role === 'primary_anchor') return 'already_captured';
  if (nearbyEvent) return 'better_anchor_for_existing_event';
  if (score >= 0.72 && (context.reactionBurstScore ?? 0) >= 0.62) return 'possible_missed_key_moment';
  return 'unclear';
}

function explainCandidate({ nearbyEvent, previousEvent, member, context, suppressionReasons, score, window }) {
  const reasons = [];
  reasons.push(`score ${formatNumber(score)}`);
  if ((context.reactionBurstScore ?? 0) >= 0.62) reasons.push('strong context reaction');
  if ((context.speechDominanceScore ?? 0) >= 0.78) reasons.push('speech dominant');
  if ((context.rallyTextureScore ?? 0) >= 0.5) reasons.push('rally-like context');
  if (member?.role) reasons.push(`episode ${member.role}`);
  if (nearbyEvent) reasons.push('event nearby');
  if (previousEvent && !nearbyEvent) reasons.push(`previous event ${formatTime(previousEvent.anchorTime)}`);
  if (window?.hasScoreCue) reasons.push('score cue');
  if (suppressionReasons.length > 0) reasons.push(`suppressed: ${suppressionReasons.join(',')}`);
  return reasons.join('; ');
}

function buildEventCoverageRow(event) {
  const nearby = allCandidates
    .map((candidate) => ({
      candidate,
      distance: Math.abs(candidate.anchorTime - event.anchorTime),
    }))
    .filter(({ distance, candidate }) =>
      distance <= 20 ||
      (event.startTime != null && event.endTime != null && candidate.anchorTime >= event.startTime && candidate.anchorTime <= event.endTime),
    )
    .sort((a, b) => b.candidate.score - a.candidate.score || a.distance - b.distance)[0] ?? null;

  const coverage = !nearby
    ? 'weak_or_none'
    : nearby.distance <= 8
      ? 'close'
      : 'nearby';

  return {
    event: `${event.type} ${compactText(event.label ?? '', 80)}`,
    time: event.anchorTime,
    candidateTime: nearby ? formatRange(nearby.candidate.startTime, nearby.candidate.endTime) : '',
    score: nearby?.candidate.score ?? 0,
    distance: nearby?.distance ?? 0,
    coverage,
    note: !nearby
      ? 'no top reaction-like candidate within audit radius'
      : nearby.candidate.reviewLabel,
  };
}

function nearestPeak(time, radiusSeconds) {
  return peaks
    .map((peak) => ({ peak, distance: Math.abs(peak.peakTime - time) }))
    .filter(({ distance }) => distance <= radiusSeconds)
    .sort((a, b) => a.distance - b.distance)[0]?.peak ?? null;
}

function episodeMemberForPeak(audioPeakId) {
  for (const episode of episodes) {
    const member = (episode.members ?? []).find((candidate) => candidate.audioPeakId === audioPeakId);
    if (member) return member;
  }
  return null;
}

function episodeForMember(member) {
  return episodes.find((episode) => episode.members?.some((candidate) => candidate.audioPeakId === member.audioPeakId)) ?? null;
}

function nearestEvent(time, radiusSeconds) {
  return events
    .map((event) => ({ event, distance: Math.abs((event.anchorTime ?? 0) - time) }))
    .filter(({ event, distance }) =>
      distance <= radiusSeconds ||
      (event.startTime != null && event.endTime != null && time >= event.startTime && time <= event.endTime),
    )
    .sort((a, b) => a.distance - b.distance)[0]?.event ?? null;
}

function previousEventWithin(time, radiusSeconds) {
  return events
    .filter((event) => event.anchorTime < time && time - event.anchorTime <= radiusSeconds)
    .sort((a, b) => b.anchorTime - a.anchorTime)[0] ?? null;
}

function nearestWindow(time) {
  return [...windows]
    .sort((a, b) => Math.abs(midpoint(a.start, a.end) - time) - Math.abs(midpoint(b.start, b.end) - time))[0] ?? null;
}

function transcriptAround(time, beforeSeconds, afterSeconds) {
  return windows
    .filter((window) => window.end >= time - beforeSeconds && window.start <= time + afterSeconds)
    .map((window) => window.transcriptText?.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
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

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '';
}

function compactText(text, maxLength) {
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round3(value) {
  return Number(value.toFixed(3));
}
