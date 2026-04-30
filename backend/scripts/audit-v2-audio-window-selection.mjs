import { readFile } from 'node:fs/promises';

const resultPath = process.argv[2];
const rawTimes = process.argv.slice(3);

if (!resultPath || rawTimes.length === 0) {
  console.error('Usage: node backend/scripts/audit-v2-audio-window-selection.mjs <media_analysis_v2/result.json> <timecode...>');
  console.error('Example: node backend/scripts/audit-v2-audio-window-selection.mjs /tmp/run/media_analysis_v2/result.json 73:57 74:27');
  process.exit(1);
}

const result = JSON.parse(await readFile(resultPath, 'utf-8'));
const windows = result.timelineIndex?.windows ?? [];
const storedPeaks = result.audioPeaks ?? [];
const candidateWindows = result.candidateWindows ?? [];

if (windows.length === 0) {
  console.error('No timeline windows found in result.');
  process.exit(1);
}

const analysis = analyzeWindows(windows);

console.log('# Audio Window Selection Audit');
console.log('');
console.log(`result: ${resultPath}`);
console.log(`windows: ${windows.length}`);
console.log(`stored audioPeaks: ${storedPeaks.length}`);
console.log('');
console.log('Selection rules currently use 5-second windows:');
console.log('');
console.log('- `audioEnergy`: loudness of that 5-second window');
console.log('- `localBaseline`: median loudness of nearby windows, radius 3, excluding current window');
console.log('- `spikeScore`: `audioEnergy - localBaseline`');
console.log('- `percentileRank`: rank of this window loudness against the full video');
console.log('- raw candidate: local max and either >= p90, or >= p75 with spike >= 0.12');
console.log('- final audio peak: best-ranked raw candidate after merging candidates within 15 seconds');
console.log('- rank: `percentileRank + max(0, spikeScore)`');
console.log('');

for (const rawTime of rawTimes) {
  const time = parseTimecode(rawTime);
  const centerIndex = closestWindowIndex(windows, time);
  const startIndex = Math.max(0, centerIndex - 6);
  const endIndex = Math.min(windows.length - 1, centerIndex + 6);

  console.log(`## Around ${formatTime(time)} (${time.toFixed(1)}s)`);
  console.log('');
  console.log('| window | time | energy | base | spike | pct | prev | next | local max | raw? | final peak? | speech | source hint | text |');
  console.log('| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | --- | --- |');

  for (let index = startIndex; index <= endIndex; index++) {
    const item = analysis[index];
    const finalPeak = storedPeaks.find((peak) => peak.windowIndex === item.window.index);
    const packet = finalPeak
      ? candidateWindows.find((candidate) => candidate.sourceRef === `audio-peak:${finalPeak.id}`)
      : null;
    const sourceHint = packet?.audioSourceHint ?? inferAudioSourceHint(item, item.window.transcriptText ?? '');

    console.log([
      item.window.index,
      formatRange(item.window.start, item.window.end),
      item.energy.toFixed(3),
      item.localBaseline.toFixed(3),
      item.spikeScore.toFixed(3),
      item.percentileRank.toFixed(3),
      formatNumber(item.previous),
      formatNumber(item.next),
      item.isLocalMax ? 'yes' : '',
      item.rawReason,
      finalPeak ? `${finalPeak.id} ${finalPeak.shape}` : '',
      item.window.speechDensity?.toFixed(2) ?? '',
      sourceHint,
      compactText(item.window.transcriptText ?? ''),
    ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  const nearestPeaks = storedPeaks
    .filter((peak) => Math.abs(peak.peakTime - time) <= 35)
    .map((peak) => {
      const packet = candidateWindows.find((candidate) => candidate.sourceRef === `audio-peak:${peak.id}`);
      const window = windows.find((candidate) => candidate.index === peak.windowIndex);
      const sourceHint = packet?.audioSourceHint ?? inferAudioSourceHint({
        window: window ?? {},
        spikeScore: peak.spikeScore,
        percentileRank: peak.percentileRank,
      }, window?.transcriptText ?? '');
      return `${formatTime(peak.peakTime)} ${peak.id} energy=${peak.audioEnergy.toFixed(3)} spike=${peak.spikeScore.toFixed(3)} pct=${peak.percentileRank.toFixed(3)} source=${sourceHint}`;
    });

  console.log('');
  console.log(`Final peaks within 35s: ${nearestPeaks.length > 0 ? nearestPeaks.join('; ') : 'none'}`);
  console.log('');
}

function analyzeWindows(inputWindows) {
  const energies = inputWindows.map((window) => window.audioEnergy ?? 0);
  const p90 = percentile(energies, 0.9);
  const p75 = percentile(energies, 0.75);

  return inputWindows.map((window, index) => {
    const energy = window.audioEnergy ?? 0;
    const local = localEnergies(energies, index, 3);
    const localBaseline = median(local.length > 0 ? local : energies);
    const spikeScore = energy - localBaseline;
    const percentileRank = rankPercentile(energies, energy);
    const previous = energies[index - 1] ?? Number.NEGATIVE_INFINITY;
    const next = energies[index + 1] ?? Number.NEGATIVE_INFINITY;
    const isLocalMax = energy >= previous && energy >= next;
    const isHighGlobal = energy >= p90;
    const isHighLocal = energy >= p75 && spikeScore >= 0.12;
    const rawReason = !isLocalMax
      ? ''
      : isHighGlobal
        ? 'yes p90'
        : isHighLocal
          ? 'yes p75+spike'
          : '';

    return {
      window,
      energy,
      localBaseline,
      spikeScore,
      percentileRank,
      previous,
      next,
      isLocalMax,
      rawReason,
    };
  });
}

function closestWindowIndex(inputWindows, time) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < inputWindows.length; index++) {
    const window = inputWindows[index];
    const distance = Math.abs(midpoint(window.start, window.end) - time);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function inferAudioSourceHint(item, transcript) {
  const speechDensity = item.window.speechDensity ?? 0;
  const text = transcript.toLowerCase();
  if (speechDensity >= 0.65 && item.spikeScore < 0.25) return 'speech_or_commentary';
  if (/\b(?:fans roar|crowd|applause|cheers?|roar)\b/.test(text)) return 'crowd_or_reaction';
  if (item.spikeScore >= 0.35 && item.percentileRank >= 0.98) return 'crowd_or_reaction';
  return 'mixed_or_unknown';
}

function localEnergies(energies, index, radius) {
  const values = [];
  for (let next = Math.max(0, index - radius); next <= Math.min(energies.length - 1, index + radius); next++) {
    if (next !== index) values.push(energies[next]);
  }
  return values;
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * percentileValue)));
  return sorted[index];
}

function rankPercentile(values, value) {
  if (values.length === 0) return 0;
  const lowerOrEqual = values.filter((candidate) => candidate <= value).length;
  return lowerOrEqual / values.length;
}

function median(values) {
  return percentile(values, 0.5);
}

function midpoint(start, end) {
  return (start + end) / 2;
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
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function formatRange(start, end) {
  return `${formatTime(start)}-${formatTime(end)}`;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(3) : '';
}

function compactText(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 90);
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|');
}
