import { readFile } from 'node:fs/promises';

const resultPath = process.argv[2];
const timesArg = process.argv.find((arg) => arg.startsWith('--times='));
const windowArg = process.argv.find((arg) => arg.startsWith('--window='));

const windowSeconds = windowArg ? Number(windowArg.split('=')[1]) : 20;
const reviewTimes = timesArg
  ? timesArg.split('=')[1].split(',').map(parseTimecode)
  : [];

if (!resultPath || reviewTimes.length === 0) {
  console.error('Usage: node backend/scripts/audit-v2-transcript-validation.mjs <media_analysis_v2/result.json> --times=MM:SS,HH:MM:SS [--window=20]');
  process.exit(1);
}

const result = JSON.parse(await readFile(resultPath, 'utf-8'));
const windows = result.timelineIndex?.windows ?? [];
const events = result.events ?? [];
const candidates = result.candidateWindows ?? [];

console.log('# V2 Transcript Validation Report');
console.log('');
console.log(`result: ${resultPath}`);
console.log(`times: ${reviewTimes.map(formatTime).join(', ')}`);
console.log(`window: +/-${windowSeconds}s`);
console.log('');

for (const time of reviewTimes) {
  const nearbyWindows = windows
    .filter((window) => window.end >= time - windowSeconds && window.start <= time + windowSeconds)
    .sort((a, b) => a.start - b.start);
  const nearestEvent = nearestByTime(events, time, (event) => event.anchorTime ?? event.startTime ?? 0);
  const nearestCandidate = nearestByTime(candidates, time, (candidate) => midpoint(candidate.startTime, candidate.endTime));
  const text = compactText(nearbyWindows.map((window) => window.transcriptText).filter(Boolean).join(' '), 300);
  const cueFlags = transcriptCueFlags(text);

  console.log(`## ${formatTime(time)}`);
  console.log('');
  console.log(`nearest event: ${nearestEvent.item ? `${nearestEvent.item.type}@${formatTime(nearestEvent.time)} d=${formatNumber(nearestEvent.distance)}` : 'none'}`);
  console.log(`nearest candidate: ${nearestCandidate.item ? `${nearestCandidate.item.id ?? nearestCandidate.item.sourceRef ?? 'candidate'} d=${formatNumber(nearestCandidate.distance)}` : 'none'}`);
  console.log(`cue flags: ${cueFlags.join(', ') || 'none'}`);
  console.log('');
  console.log('| segment | relation | text |');
  console.log('| --- | --- | --- |');
  for (const segment of flattenSegments(nearbyWindows)) {
    console.log([
      `${formatTime(segment.start)}-${formatTime(segment.end)}`,
      relation(segment, time),
      compactText(segment.text, 180),
    ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  console.log('');
}

function flattenSegments(inputWindows) {
  const seen = new Set();
  const segments = [];
  for (const window of inputWindows) {
    for (const segment of window.transcriptSegments ?? []) {
      const key = `${segment.start}:${segment.end}:${segment.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push({
        start: segment.start,
        end: segment.end,
        text: String(segment.text ?? '').replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return segments
    .filter((segment) => segment.text)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function transcriptCueFlags(text) {
  const normalized = String(text ?? '').toLowerCase();
  const flags = [];
  if (/\b(replay|slow|remind|again|look back)\b/.test(normalized)) flags.push('recap_or_replay_language');
  if (/\b(point|winner|missed|forehand|backhand|serve|return|rally)\b/.test(normalized)) flags.push('action_language');
  if (/\b(deuce|break point|set point|match point|40|30|15|love)\b/.test(normalized)) flags.push('score_or_pressure_language');
  if (/\b(holds?|breaks?|takes?|wins?|game|set)\b/.test(normalized)) flags.push('result_language');
  if (hasRepeatedText(normalized)) flags.push('repetition_noise');
  return flags;
}

function hasRepeatedText(text) {
  const chunks = text.match(/\b[\w']+(?:\s+\b[\w']+){2,5}/g) ?? [];
  const seen = new Set();
  for (const chunk of chunks) {
    if (seen.has(chunk)) return true;
    seen.add(chunk);
  }
  return false;
}

function relation(segment, time) {
  if (segment.end <= time) return 'before';
  if (segment.start >= time) return 'after';
  return 'overlaps';
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

function parseTimecode(value) {
  const parts = String(value).split(':').map(Number);
  if (parts.some((part) => Number.isNaN(part))) throw new Error(`Invalid timecode: ${value}`);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  throw new Error(`Invalid timecode: ${value}`);
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
