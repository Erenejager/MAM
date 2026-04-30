import type { AudioPeak, TimelineIndex } from './types.js';

export function buildAudioPeakIndex(timelineIndex: TimelineIndex): AudioPeak[] {
  const windows = timelineIndex.windows;
  if (windows.length === 0) return [];

  const energies = windows.map((window) => window.audioEnergy);
  const p90 = percentile(energies, 0.9);
  const p75 = percentile(energies, 0.75);
  const raw: AudioPeak[] = [];

  for (let index = 0; index < windows.length; index++) {
    const window = windows[index];
    const audioEnergy = window.audioEnergy;
    const local = localEnergies(energies, index, 3);
    const localBaseline = median(local.length > 0 ? local : energies);
    const spikeScore = Number((audioEnergy - localBaseline).toFixed(3));
    const percentileRank = Number(rankPercentile(energies, audioEnergy).toFixed(3));
    const previous = energies[index - 1] ?? Number.NEGATIVE_INFINITY;
    const next = energies[index + 1] ?? Number.NEGATIVE_INFINITY;
    const isLocalMax = audioEnergy >= previous && audioEnergy >= next;
    const isHigh = audioEnergy >= p90 || (audioEnergy >= p75 && spikeScore >= 0.12);

    if (!isLocalMax || !isHigh) continue;

    raw.push({
      id: `audio_peak_${raw.length}`,
      groupId: '',
      windowIndex: window.index,
      startTime: window.start,
      endTime: window.end,
      peakTime: midpoint(window.start, window.end),
      audioEnergy,
      localBaseline: Number(localBaseline.toFixed(3)),
      spikeScore,
      percentileRank,
      shape: classifyShape(energies, index, audioEnergy, localBaseline),
    });
  }

  return groupAudioPeaks(raw, 15);
}

function groupAudioPeaks(peaks: AudioPeak[], mergeSeconds: number): AudioPeak[] {
  const grouped: AudioPeak[] = [];

  for (const peak of peaks) {
    const previous = grouped[grouped.length - 1];
    if (!previous || peak.peakTime - previous.peakTime > mergeSeconds) {
      grouped.push({ ...peak, groupId: `audio_peak_group_${grouped.length}` });
      continue;
    }

    if (peakRank(peak) > peakRank(previous)) {
      grouped[grouped.length - 1] = {
        ...peak,
        groupId: previous.groupId,
      };
    }
  }

  return grouped.map((peak, index) => ({
    ...peak,
    id: `audio_peak_${index}`,
  }));
}

function peakRank(peak: AudioPeak): number {
  return peak.percentileRank + Math.max(0, peak.spikeScore);
}

function classifyShape(
  energies: number[],
  index: number,
  energy: number,
  baseline: number,
): AudioPeak['shape'] {
  const neighbors = localEnergies(energies, index, 2);
  const sustainedNeighbors = neighbors.filter((value) => value >= baseline + 0.08).length;
  if (energy - baseline < 0.08 || sustainedNeighbors >= 3) return 'sustained';
  return 'spike';
}

function localEnergies(energies: number[], index: number, radius: number): number[] {
  const values: number[] = [];
  for (let next = Math.max(0, index - radius); next <= Math.min(energies.length - 1, index + radius); next++) {
    if (next !== index) values.push(energies[next]);
  }
  return values;
}

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * percentileValue)));
  return sorted[index];
}

function rankPercentile(values: number[], value: number): number {
  if (values.length === 0) return 0;
  const lowerOrEqual = values.filter((candidate) => candidate <= value).length;
  return lowerOrEqual / values.length;
}

function median(values: number[]): number {
  return percentile(values, 0.5);
}

function midpoint(start: number, end: number): number {
  return Number(((start + end) / 2).toFixed(3));
}
