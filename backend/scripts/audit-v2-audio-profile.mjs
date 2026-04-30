import { readFile } from 'node:fs/promises';

const resultPath = process.argv[2];
const rawTimes = process.argv.slice(3);
const defaultTimes = ['23:07', '73:57', '74:27', '81:27', '82:22'];

if (!resultPath) {
  console.error('Usage: node backend/scripts/audit-v2-audio-profile.mjs <media_analysis_v2/result.json> [timecode...]');
  console.error('Example: node backend/scripts/audit-v2-audio-profile.mjs /tmp/run/media_analysis_v2/result.json 73:57 74:27');
  process.exit(1);
}

const result = JSON.parse(await readFile(resultPath, 'utf-8'));
const audioProfile = result.audioProfile ?? result.timelineIndex?.audioProfile ?? null;
const windows = result.timelineIndex?.windows ?? [];
const peaks = result.audioPeaks ?? [];
const candidateWindows = result.candidateWindows ?? [];
const episodes = result.audioReactionEpisodes ?? [];
const events = result.events ?? [];
const times = (rawTimes.length > 0 ? rawTimes : defaultTimes).map(parseTimecode);

if (!audioProfile) {
  console.error('No audioProfile found in result. Re-run V2 with the observable audio profile enabled.');
  process.exit(1);
}

console.log('# Audio Profile Audit');
console.log('');
console.log(`result: ${resultPath}`);
console.log(`frame size: ${audioProfile.frameSize}s`);
console.log(`sample rate: ${audioProfile.sampleRate}Hz`);
console.log(`frames: ${audioProfile.frames?.length ?? 0}`);
console.log(`1s summaries: ${audioProfile.summaries?.oneSecond?.length ?? 0}`);
console.log(`5s summaries: ${audioProfile.summaries?.fiveSecond?.length ?? 0}`);
console.log(`audio peaks: ${peaks.length}`);
console.log(`reaction episodes: ${episodes.length}`);
if (!hasAudioHintFields(audioProfile)) {
  console.log('');
  console.log('warning: this result was generated before audio hint fields were added; tennis-score columns will be blank.');
}
console.log('');

for (const time of times) {
  printTimeAudit(time);
}

function printTimeAudit(time) {
  const window = nearestWindow(windows, time);
  const eventMatches = events.filter((event) =>
    Math.abs((event.anchorTime ?? 0) - time) <= 12 ||
    (event.startTime != null && event.endTime != null && time >= event.startTime && time <= event.endTime),
  );
  const nearbyPeaks = peaks
    .filter((peak) => Math.abs(peak.peakTime - time) <= 35)
    .sort((a, b) => Math.abs(a.peakTime - time) - Math.abs(b.peakTime - time));
  const nearbyEpisodes = episodes
    .filter((episode) => episode.endTime >= time - 35 && episode.startTime <= time + 35)
    .sort((a, b) => Math.abs(a.primaryAnchorTime - time) - Math.abs(b.primaryAnchorTime - time));
  const oneSecondRows = summariesAround(audioProfile.summaries?.oneSecond ?? [], time, 8);
  const fiveSecondRows = summariesAround(audioProfile.summaries?.fiveSecond ?? [], time, 20);
  const frameRows = framesAround(audioProfile.frames ?? [], time, 4);

  console.log(`## Around ${formatTime(time)} (${time.toFixed(1)}s)`);
  console.log('');
  console.log(`timeline window: ${window ? `${formatRange(window.start, window.end)} speech=${formatNumber(window.speechDensity)} energy=${formatNumber(window.audioEnergy)}` : 'none'}`);
  console.log(`transcript: ${window ? compactText(window.transcriptText ?? '', 220) : ''}`);
  console.log(`events: ${eventMatches.length > 0 ? eventMatches.map(summarizeEvent).join('; ') : 'none'}`);
  console.log(`peaks within 35s: ${nearbyPeaks.length > 0 ? nearbyPeaks.map(summarizePeak).join('; ') : 'none'}`);
  console.log(`episodes within 35s: ${nearbyEpisodes.length > 0 ? nearbyEpisodes.map(summarizeEpisode).join('; ') : 'none'}`);
  console.log('');

  console.log('### 1s Audio Hints');
  console.log('');
  console.log('| time | rms | mean | max | std | burst | onset | regular | silence | active | attack | rally | react | speech | music | crowd | shape | ctx rally | ctx react | ctx speech | ctx shape | suppress |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- |');
  for (const row of oneSecondRows) {
    console.log(formatSummaryRow(row));
  }
  console.log('');

  console.log('### 5s Audio Hints');
  console.log('');
  console.log('| time | rms | mean | max | std | burst | onset | regular | silence | active | attack | rally | react | speech | music | crowd | shape | ctx rally | ctx react | ctx speech | ctx shape | suppress |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- |');
  for (const row of fiveSecondRows) {
    console.log(formatSummaryRow(row));
  }
  console.log('');

  console.log('### 0.5s Frames');
  console.log('');
  console.log('| time | rms | peak | delta | zcr | silence | burst |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const frame of frameRows) {
    console.log([
      formatRange(frame.start, frame.end),
      formatNumber(frame.rmsEnergy),
      formatNumber(frame.peakEnergy),
      signedNumber(frame.energyDelta),
      formatNumber(frame.zeroCrossingRate),
      formatNumber(frame.silenceRatio),
      formatNumber(frame.burstScore),
    ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  console.log('');
}

function summariesAround(summaries, time, radiusSeconds) {
  return summaries.filter((summary) =>
    summary.end >= time - radiusSeconds && summary.start <= time + radiusSeconds,
  );
}

function framesAround(frames, time, radiusSeconds) {
  return frames.filter((frame) =>
    frame.end >= time - radiusSeconds && frame.start <= time + radiusSeconds,
  );
}

function nearestWindow(inputWindows, time) {
  return [...inputWindows]
    .sort((a, b) => Math.abs(midpoint(a.start, a.end) - time) - Math.abs(midpoint(b.start, b.end) - time))[0] ?? null;
}

function summarizePeak(peak) {
  const packet = candidateWindows.find((candidate) => candidate.sourceRef === `audio-peak:${peak.id}`);
  const hint = packet?.audioSourceHint ? ` ${packet.audioSourceHint}` : '';
  return `${formatTime(peak.peakTime)} ${peak.id}${hint} energy=${formatNumber(peak.audioEnergy)} spike=${formatNumber(peak.spikeScore)} pct=${formatNumber(peak.percentileRank)} ${peak.shape}`;
}

function summarizeEpisode(episode) {
  const members = (episode.members ?? [])
    .map((member) => `${formatTime(member.anchorTime)} ${member.audioPeakId}:${member.role}`)
    .join(', ');
  return `${episode.id} primary=${formatTime(episode.primaryAnchorTime)} ${episode.primaryReason} members=[${members}]`;
}

function summarizeEvent(event) {
  return `${event.type}@${formatTime(event.anchorTime ?? event.startTime ?? 0)} ${compactText(event.label ?? '', 80)}`;
}

function formatSummaryRow(row) {
  return [
    formatRange(row.start, row.end),
    formatNumber(row.rmsEnergy),
    formatNumber(row.energyMean),
    formatNumber(row.energyMax),
    formatNumber(row.energyStdDev),
    row.burstCount ?? 0,
    formatNumber(row.onsetRate),
    formatNumber(row.onsetRegularity),
    formatNumber(row.silenceRatio),
    formatNumber(row.activeDuration),
    row.strongestAttackTime == null
      ? ''
      : `${formatTime(row.strongestAttackTime)} ${formatNumber(row.strongestAttackScore)}`,
    formatNumber(row.rallyTextureScore),
    formatNumber(row.reactionBurstScore),
    formatNumber(row.speechDominanceScore),
    formatNumber(row.musicBedScore),
    formatNumber(row.applauseCrowdScore),
    row.pointShapeHint ?? '',
    formatNumber(row.context?.rallyTextureScore),
    formatNumber(row.context?.reactionBurstScore),
    formatNumber(row.context?.speechDominanceScore),
    row.context?.pointShapeHint ?? '',
    row.context?.suppressionReasons?.join(',') ?? '',
  ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |');
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

function midpoint(start, end) {
  return (start + end) / 2;
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '';
}

function signedNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return value >= 0 ? `+${value.toFixed(3)}` : value.toFixed(3);
}

function compactText(text, maxLength) {
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|');
}

function hasAudioHintFields(profile) {
  const summary = profile.summaries?.fiveSecond?.[0] ?? profile.summaries?.oneSecond?.[0] ?? null;
  return summary?.rallyTextureScore != null && summary?.reactionBurstScore != null;
}
