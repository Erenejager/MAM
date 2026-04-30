import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const resultPath = process.argv[2];
const assetDir = process.argv[3] ?? null;
const showAll = process.argv.includes('--all');

if (!resultPath) {
  console.error('Usage: node backend/scripts/audit-v2-audio-peaks.mjs <media_analysis_v2/result.json> [assetDir]');
  process.exit(1);
}

const result = JSON.parse(await readFile(resultPath, 'utf-8'));
const windows = result.timelineIndex?.windows ?? [];
const segments = result.segments ?? [];
const events = result.events ?? [];
const ocrContexts = assetDir ? await loadLegacyOcrContexts(assetDir) : [];
const peaks = detectAudioPeaks(windows);
const rows = peaks.map((peak) => buildAuditRow(peak, windows, segments, events, ocrContexts));
const displayedRows = showAll ? rows : rows.filter((row) => row.priority !== 'low');

console.log(`# Audio Peak Audit`);
console.log('');
console.log(`result: ${resultPath}`);
if (assetDir) console.log(`assetDir: ${assetDir}`);
console.log(`windows: ${windows.length}`);
console.log(`events: ${events.length}`);
console.log(`peaks: ${rows.length}`);
console.log(`displayed: ${displayedRows.length}${showAll ? ' (--all)' : ' (priority medium/high)'}`);
console.log('');
console.log('| priority | time | energy | base | spike | pct | shape | segment | current event | OCR/score | nearby transcript | interpretation |');
console.log('| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |');

for (const row of displayedRows) {
  console.log([
    row.priority,
    formatTime(row.time),
    row.energy.toFixed(2),
    row.localBaseline.toFixed(2),
    row.spikeScore.toFixed(2),
    row.percentileRank.toFixed(2),
    row.shape,
    escapeCell(row.segmentType),
    escapeCell(row.currentEvent),
    escapeCell(row.ocr),
    escapeCell(row.transcript),
    escapeCell(row.interpretation),
  ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
}

function detectAudioPeaks(windows) {
  if (windows.length === 0) return [];

  const energies = windows.map((window) => window.audioEnergy ?? 0);
  const p90 = percentile(energies, 0.9);
  const p75 = percentile(energies, 0.75);
  const raw = [];

  for (let index = 0; index < windows.length; index++) {
    const window = windows[index];
    const energy = window.audioEnergy ?? 0;
    const local = localEnergies(energies, index, 3);
    const localBaseline = median(local.length > 0 ? local : energies);
    const spikeScore = energy - localBaseline;
    const percentileRank = rankPercentile(energies, energy);
    const previous = energies[index - 1] ?? -Infinity;
    const next = energies[index + 1] ?? -Infinity;
    const isLocalMax = energy >= previous && energy >= next;
    const isHigh = energy >= p90 || (energy >= p75 && spikeScore >= 0.12);

    if (!isLocalMax || !isHigh) continue;

    raw.push({
      window,
      time: midpoint(window.start, window.end),
      energy,
      localBaseline,
      spikeScore,
      percentileRank,
      score: percentileRank + Math.max(0, spikeScore),
      shape: classifyShape(energies, index, energy, localBaseline),
    });
  }

  return groupPeaks(raw, 15);
}

function groupPeaks(peaks, mergeSeconds) {
  const grouped = [];

  for (const peak of peaks) {
    const previous = grouped[grouped.length - 1];
    if (!previous || peak.time - previous.time > mergeSeconds) {
      grouped.push(peak);
      continue;
    }

    if (peak.score > previous.score) {
      grouped[grouped.length - 1] = peak;
    }
  }

  return grouped;
}

function classifyShape(energies, index, energy, baseline) {
  const neighbors = localEnergies(energies, index, 2);
  const sustainedNeighbors = neighbors.filter((value) => value >= baseline + 0.08).length;
  if (energy - baseline < 0.08 || sustainedNeighbors >= 3) return 'sustained';
  return 'spike';
}

function buildAuditRow(peak, windows, segments, events, ocrContexts) {
  const time = peak.time;
  const segment = segments.find((candidate) =>
    time >= candidate.start && time <= candidate.end,
  );
  const currentEvents = events.filter((event) =>
    Math.abs((event.anchorTime ?? 0) - time) <= 8 ||
    (event.startTime != null && event.endTime != null && time >= event.startTime && time <= event.endTime),
  );
  const ocr = nearestOcrContext(ocrContexts, time);
  const transcript = nearbyTranscript(windows, time, 10, 15);

  return {
    time,
    energy: peak.energy,
    localBaseline: peak.localBaseline,
    spikeScore: peak.spikeScore,
    percentileRank: peak.percentileRank,
    shape: peak.shape,
    segmentType: segment ? `${segment.type}${segment.subtype ? `:${segment.subtype}` : ''}` : 'none',
    currentEvent: summarizeEvents(currentEvents),
    ocr: summarizeOcr(ocr, time),
    transcript,
    interpretation: inferInterpretation(peak, segment, currentEvents, ocr, transcript),
    priority: inferPriority(peak, segment, currentEvents, ocr, transcript),
  };
}

function inferPriority(peak, segment, currentEvents, ocr, transcript) {
  const text = transcript.toLowerCase();
  const ocrDistance = ocr?.distance ?? Infinity;

  if (currentEvents.length > 0) return 'high';
  if (segment?.type === 'crowd' && peak.percentileRank >= 0.98) return 'high';
  if (ocrDistance <= 12 && hasTennisContext(text)) return 'high';
  if (peak.percentileRank >= 0.98 && hasTennisContext(text)) return 'high';
  if (peak.percentileRank >= 0.95 && peak.spikeScore >= 0.2 && hasTennisContext(text)) return 'medium';
  if (ocrDistance <= 25 && peak.spikeScore >= 0.2) return 'medium';
  if (/(bench|changeover|change over|sit down|chair|resting|between games)/.test(text) && peak.percentileRank >= 0.95) {
    return 'medium';
  }

  return 'low';
}

function inferInterpretation(peak, segment, currentEvents, ocr, transcript) {
  const text = transcript.toLowerCase();
  if (segment?.type === 'replay') return 'secondary/replay candidate';
  if (/(bench|changeover|change over|sit down|chair|resting|between games)/.test(text)) {
    return 'recap/changeover candidate';
  }
  if (currentEvents.length > 0) return 'supports existing event timing';
  if (segment?.type === 'crowd') return 'audio-only crowd_reaction candidate';
  if (segment?.type === 'live_play' && hasTennisContext(text)) {
    return ocr ? 'possible tennis event; check OCR score movement' : 'possible tennis event; needs transcript/OCR confirmation';
  }
  if (peak.shape === 'sustained') return 'likely sustained crowd/noise';
  return 'unconfirmed audio peak';
}

function hasTennisContext(text) {
  return /\b(point|rally|forehand|backhand|serve|return|volley|winner|break|set|match|game|deuce|advantage|brilliant|impressive|incredible|unbelievable)\b/.test(text);
}

function nearbyTranscript(windows, time, beforeSeconds, afterSeconds) {
  return windows
    .filter((window) => window.end >= time - beforeSeconds && window.start <= time + afterSeconds)
    .map((window) => window.transcriptText?.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

function summarizeEvents(items) {
  if (items.length === 0) return '';
  return items
    .map((event) => `${event.type}: ${event.label ?? ''}`.trim())
    .join('; ')
    .slice(0, 120);
}

async function loadLegacyOcrContexts(root) {
  const momentsDir = resolve(root, 'moments');

  try {
    const entries = await readdir(momentsDir, { withFileTypes: true });
    const contexts = await Promise.all(entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const raw = await readFile(resolve(momentsDir, entry.name, 'context.json'), 'utf-8');
          const parsed = JSON.parse(raw);
          return {
            id: entry.name,
            label: parsed.label ?? null,
            score: parsed.score ?? null,
            scoreBefore: parsed.scoreBefore ?? null,
            scoreAfter: parsed.scoreAfter ?? null,
            peakTime: typeof parsed.peakTime === 'number' ? parsed.peakTime : null,
          };
        } catch {
          return null;
        }
      }));

    return contexts
      .filter((context) => context?.peakTime != null)
      .sort((a, b) => a.peakTime - b.peakTime);
  } catch {
    return [];
  }
}

function nearestOcrContext(contexts, time) {
  const nearby = contexts
    .map((context) => ({ context, distance: Math.abs(context.peakTime - time) }))
    .filter(({ distance }) => distance <= 45)
    .sort((a, b) => a.distance - b.distance)[0];
  return nearby ?? null;
}

function summarizeOcr(entry, time) {
  if (!entry) return '';
  const { context, distance } = entry;
  const parts = [`moment/${context.id}`, `${formatTime(context.peakTime)} (${distance.toFixed(1)}s)`];
  if (context.score) parts.push(`score ${context.score}`);
  if (context.scoreBefore || context.scoreAfter) {
    parts.push(`${context.scoreBefore ?? '?'} -> ${context.scoreAfter ?? '?'}`);
  }
  if (context.label) parts.push(context.label);
  return parts.join(' | ').slice(0, 140);
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
  return Number(((start + end) / 2).toFixed(3));
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds ?? 0);
  const minutes = Math.floor(safe / 60);
  const rest = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}
