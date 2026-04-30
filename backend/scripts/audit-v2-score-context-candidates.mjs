import { readFile } from 'node:fs/promises';

const resultPath = process.argv[2];
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const minScoreArg = process.argv.find((arg) => arg.startsWith('--min-score='));
const transcriptWindowArg = process.argv.find((arg) => arg.startsWith('--window='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 80;
const minScore = minScoreArg ? Number(minScoreArg.split('=')[1]) : 0.52;
const transcriptWindow = transcriptWindowArg ? Number(transcriptWindowArg.split('=')[1]) : 35;

if (!resultPath) {
  console.error('Usage: node backend/scripts/audit-v2-score-context-candidates.mjs <media_analysis_v2/result.json> [--limit=80] [--min-score=0.52] [--window=35]');
  process.exit(1);
}

const result = JSON.parse(await readFile(resultPath, 'utf-8'));
const audioProfile = result.audioProfile ?? result.timelineIndex?.audioProfile ?? null;
const windows = result.timelineIndex?.windows ?? [];
const events = result.events ?? [];
const peaks = result.audioPeaks ?? [];
const episodes = result.audioReactionEpisodes ?? [];
const oneSecond = audioProfile?.summaries?.oneSecond ?? [];

if (!audioProfile || oneSecond.length === 0) {
  console.error('No audioProfile summaries found. Re-run V2 with audio profile output enabled.');
  process.exit(1);
}

const scoredRows = oneSecond
  .map((summary) => scoreSummary(summary))
  .filter((row) => row.score >= minScore);
const groups = groupRows(scoredRows, 2);
const allAudioCandidates = groups
  .map(buildCandidate)
  .sort((a, b) => b.auditPriority - a.auditPriority || b.audioScore - a.audioScore || a.anchorTime - b.anchorTime);
const allCandidates = allAudioCandidates
  .filter((candidate) =>
    candidate.scoreSignals.length > 0 ||
    candidate.pressureSignals.length > 0 ||
    candidate.outcomeSignals.length > 0 ||
    candidate.recapSignals.length > 0,
  )
  .sort((a, b) => b.auditPriority - a.auditPriority || b.audioScore - a.audioScore || a.anchorTime - b.anchorTime);
const candidates = allCandidates.slice(0, limit);

console.log('# Score-Context Candidate Audit');
console.log('');
console.log(`result: ${resultPath}`);
console.log(`1s summaries: ${oneSecond.length}`);
console.log(`audio rows above score ${minScore.toFixed(2)}: ${scoredRows.length}`);
console.log(`score-context groups: ${allCandidates.length}`);
console.log(`displayed: ${candidates.length}`);
console.log('');
console.log('This audit is intentionally non-promotional: it checks whether audio reaction candidates have nearby transcript score/pressure/outcome evidence before OCR-backed attribution exists.');
console.log('');
console.log('| rank | audit label | time | audio score | score ctx | pressure | outcome | recap/replay | nearby event | episode role | transcript | review question |');
console.log('| ---: | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |');

for (let index = 0; index < candidates.length; index++) {
  const candidate = candidates[index];
  console.log([
    index + 1,
    candidate.auditLabel,
    formatRange(candidate.startTime, candidate.endTime),
    formatNumber(candidate.audioScore),
    formatSignals(candidate.scoreSignals),
    formatSignals(candidate.pressureSignals),
    formatSignals(candidate.outcomeSignals),
    formatSignals(candidate.recapSignals),
    candidate.nearbyEvent,
    candidate.episodeRole,
    compactText(candidate.transcript, 180),
    candidate.reviewQuestion,
  ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
}

console.log('');
console.log('## Known Manual Review Anchors');
console.log('');
console.log('| time | nearest audit candidate | label | transcript evidence | current event |');
console.log('| --- | --- | --- | --- | --- |');
for (const time of ['37:48', '40:54', '79:41', '85:02', '86:59'].map(parseTimecode)) {
  const nearby = allAudioCandidates
    .map((candidate) => ({ candidate, distance: Math.abs(candidate.anchorTime - time) }))
    .filter(({ distance }) => distance <= 45)
    .sort((a, b) => a.distance - b.distance || b.candidate.auditPriority - a.candidate.auditPriority)[0] ?? null;
  const event = nearestEvent(time, 15);
  console.log([
    formatTime(time),
    nearby ? `${formatRange(nearby.candidate.startTime, nearby.candidate.endTime)} d=${formatNumber(nearby.distance)}` : '',
    nearby?.candidate.auditLabel ?? '',
    nearby ? [
      formatSignals(nearby.candidate.scoreSignals),
      formatSignals(nearby.candidate.pressureSignals),
      formatSignals(nearby.candidate.outcomeSignals),
      formatSignals(nearby.candidate.recapSignals),
    ].filter(Boolean).join(' / ') : '',
    event ? `${event.type}@${formatTime(event.anchorTime ?? event.startTime ?? 0)} ${event.label ?? ''}` : '',
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
  const context = summary.context ?? {};
  const anchorTime = summary.strongestAttackTime ?? midpoint(summary.start, summary.end);
  const startTime = Math.min(...group.map((row) => row.summary.start));
  const endTime = Math.max(...group.map((row) => row.summary.end));
  const transcript = transcriptAround(anchorTime, transcriptWindow, transcriptWindow);
  const transcriptBefore = transcriptAround(anchorTime - transcriptWindow / 2, transcriptWindow, 0);
  const transcriptAfter = transcriptAround(anchorTime + transcriptWindow / 2, 0, transcriptWindow);
  const signals = extractScoreSignals(transcript, transcriptBefore, transcriptAfter);
  const peak = best.peak ?? nearestPeak(anchorTime, 8);
  const member = peak ? episodeMemberForPeak(peak.id) : null;
  const episode = member ? episodeForMember(member) : null;
  const nearbyEvent = nearestEvent(anchorTime, 15);
  const previousEvent = previousEventWithin(anchorTime, 180);
  const suppressionReasons = context.suppressionReasons ?? [];
  const recapPenalty = signals.recapSignals.length > 0 || suppressionReasons.includes('replay_cue') || member?.role === 'recap_or_speech_tail' ? 0.25 : 0;
  const pressureOnlyPenalty = signals.pressureSignals.length > 0 && signals.outcomeSignals.length === 0 ? 0.12 : 0;
  const signalBoost = clamp01(
    signals.scoreSignals.length * 0.1 +
    signals.pressureSignals.length * 0.1 +
    signals.outcomeSignals.length * 0.16,
  );
  const auditPriority = round3(best.score + signalBoost - recapPenalty - pressureOnlyPenalty);
  const auditLabel = classifyCandidate({
    context,
    suppressionReasons,
    member,
    previousEvent,
    scoreSignals: signals.scoreSignals,
    pressureSignals: signals.pressureSignals,
    outcomeSignals: signals.outcomeSignals,
    recapSignals: signals.recapSignals,
  });

  return {
    startTime,
    endTime,
    anchorTime,
    audioScore: best.score,
    auditPriority,
    auditLabel,
    scoreSignals: signals.scoreSignals,
    pressureSignals: signals.pressureSignals,
    outcomeSignals: signals.outcomeSignals,
    recapSignals: signals.recapSignals,
    transcript,
    nearbyEvent: nearbyEvent ? `${nearbyEvent.type}@${formatTime(nearbyEvent.anchorTime ?? nearbyEvent.startTime ?? 0)} ${nearbyEvent.label ?? ''}` : '',
    episodeRole: member ? `${member.role}${episode ? `/${episode.id}` : ''}` : '',
    reviewQuestion: reviewQuestionForLabel(auditLabel),
  };
}

function extractScoreSignals(transcript, transcriptBefore, transcriptAfter) {
  const outcomeSignals = uniq([
    ...matchSignals(transcript, /\b(?:breaks?|broken|takes?|wins?|seals?|closes?|converts?|saves?|holds?)\b[^.]{0,50}\b(?:point|game|set|match|break|serve)\b/gi),
    ...matchSignals(transcriptAfter, /\b(?:breaks?|broken|takes?|wins?|seals?|closes?|converts?|saves?|holds?)\b[^.]{0,50}\b(?:point|game|set|match|break|serve)\b/gi),
    ...matchSignals(transcript, /\b(?:back to|to)\s+deuce\b/gi),
    ...matchSignals(transcriptAfter, /\b(?:back to|to)\s+deuce\b/gi),
    ...matchSignals(transcript, /\b(?:gets?|levels?|moves?)\s+(?:back\s+)?to\s+(?:40\s*-\s*40|deuce)\b/gi),
    ...matchSignals(transcriptAfter, /\b(?:gets?|levels?|moves?)\s+(?:back\s+)?to\s+(?:40\s*-\s*40|deuce)\b/gi),
    ...matchSignals(transcript, /\b(?:djokovic|alcaraz)\s+(?:breaks?|takes?|wins?|saves?|holds?|seals?)\b/gi),
    ...matchSignals(transcriptAfter, /\b(?:djokovic|alcaraz)\s+(?:breaks?|takes?|wins?|saves?|holds?|seals?)\b/gi),
  ]).filter(isOutcomeSignal);

  return {
    scoreSignals: uniq([
      ...matchSignals(transcript, /\b[0-7]\s*-\s*[0-7]\b/gi),
      ...matchSignals(transcript, /\b(?:love|0|15|30|40|ad|advantage)\s*[- ]\s*(?:love|0|15|30|40|ad|advantage)\b/gi),
      ...matchSignals(transcript, /\b(?:deuce|all|forty all|40 all)\b/gi),
    ]),
    pressureSignals: uniq([
      ...matchSignals(transcriptBefore, /\b(?:break|set|match|game)\s+points?\b/gi),
      ...matchSignals(transcriptBefore, /\b(?:three|two|double)\s+(?:break|set|match|game)\s+points?\b/gi),
      ...matchSignals(transcriptBefore, /\b(?:chance|chances|opportunity|opportunities)\s+(?:to|for)\s+[^.]{0,40}\b/gi),
      ...matchSignals(transcriptBefore, /\badvantage\s+[a-z]+/gi),
    ]),
    outcomeSignals,
    recapSignals: uniq([
      ...matchSignals(transcript, /\b(?:replay|slow motion|recap|highlights?|animation|graphic|broadcaster|sponsor|presentation|trophy|celebration|post-match|montage)\b/gi),
      ...matchSignals(transcript, /\b(?:look at|watch)\s+(?:this|that|it|the replay|again)\b/gi),
    ]),
  };
}

function classifyCandidate({ context, suppressionReasons, member, previousEvent, scoreSignals, pressureSignals, outcomeSignals, recapSignals }) {
  if (previousEvent?.type === 'match_won' && scoreSignals.length > 0) {
    return 'post_match_score_context';
  }
  if (recapSignals.length > 0 || suppressionReasons.includes('replay_cue') || member?.role === 'recap_or_speech_tail') {
    return 'recap_or_replay';
  }
  if ((context.pointShapeHint ?? '') === 'recap_only') {
    return 'recap_or_replay';
  }
  if (scoreSignals.length > 0 && pressureSignals.length > 0 && outcomeSignals.length > 0) {
    return 'result_candidate_needs_ocr';
  }
  if (pressureSignals.length > 0 && outcomeSignals.length === 0) {
    return 'pressure_setup_only';
  }
  if (scoreSignals.length > 0 && outcomeSignals.length > 0) {
    return 'possible_result_needs_review';
  }
  if (outcomeSignals.length > 0) {
    return 'outcome_phrase_needs_score';
  }
  if (scoreSignals.length > 0 || pressureSignals.length > 0) {
    return 'score_context_only';
  }
  return 'ambiguous';
}

function reviewQuestionForLabel(label) {
  if (label === 'result_candidate_needs_ocr') return 'Does video/OCR confirm the score changed after this point?';
  if (label === 'pressure_setup_only') return 'Is this only before a point, or does a point finish here?';
  if (label === 'possible_result_needs_review') return 'Is this a live result or commentator recap?';
  if (label === 'outcome_phrase_needs_score') return 'Can scoreboard/OCR confirm the outcome phrase changed the score?';
  if (label === 'recap_or_replay') return 'Should this back-anchor to an earlier live point?';
  if (label === 'post_match_score_context') return 'Post-match score context; do not emit a new live event without OCR/video evidence.';
  if (label === 'score_context_only') return 'Is the score context current at this timestamp?';
  return 'Needs video review before attribution.';
}

function isOutcomeSignal(value) {
  return !/\b(?:break|set|match|game)\s+points?\b/i.test(value);
}

function matchSignals(text, regex) {
  const matches = [];
  for (const match of text.matchAll(regex)) {
    const value = match[0].replace(/\s+/g, ' ').trim();
    if (value.length > 0) matches.push(value);
  }
  return matches;
}

function uniq(values) {
  return [...new Set(values.map((value) => value.toLowerCase()))].slice(0, 5);
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

function transcriptAround(time, beforeSeconds, afterSeconds) {
  return windows
    .filter((window) => window.end >= time - beforeSeconds && window.start <= time + afterSeconds)
    .map((window) => window.transcriptText?.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
}

function parseTimecode(value) {
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const parts = value.split(':').map(Number);
  if (parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid timecode: ${value}`);
  }
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  throw new Error(`Invalid timecode: ${value}`);
}

function midpoint(start, end) {
  return (start + end) / 2;
}

function formatSignals(signals) {
  return signals.join(', ');
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
