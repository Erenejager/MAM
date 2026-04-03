import type { WindowScore } from './transcript-scoring.js';

export interface CoarsePeak {
  timestamp: number;
  combinedScore: number;
  matchedKeyword: string | null;
  transcriptText: string;
  audioEnergy: number;
}

const MAX_PEAKS = 30;
const MERGE_DISTANCE = 30;

export function detectPeaks(
  transcriptScores: WindowScore[],
  audioEnergies: number[],
): CoarsePeak[] {
  const combined = transcriptScores.map((ts, i) => ({
    windowStart: ts.windowStart,
    windowEnd: ts.windowEnd,
    combinedScore: 0.6 * ts.transcriptScore + 0.4 * (audioEnergies[i] ?? 0),
    matchedKeyword: ts.matchedKeyword,
    transcriptText: ts.transcriptText,
    audioEnergy: audioEnergies[i] ?? 0,
  }));

  const peaks: typeof combined = [];
  for (let i = 0; i < combined.length; i++) {
    const prev = combined[i - 1]?.combinedScore ?? 0;
    const curr = combined[i].combinedScore;
    const next = combined[i + 1]?.combinedScore ?? 0;
    if (curr > 0 && curr >= prev && curr >= next) {
      peaks.push(combined[i]);
    }
  }

  peaks.sort((a, b) => b.combinedScore - a.combinedScore);

  const merged: CoarsePeak[] = [];
  for (const peak of peaks) {
    const timestamp = (peak.windowStart + peak.windowEnd) / 2;
    const tooClose = merged.some(
      (m) => Math.abs(m.timestamp - timestamp) < MERGE_DISTANCE,
    );
    if (!tooClose) {
      merged.push({
        timestamp,
        combinedScore: peak.combinedScore,
        matchedKeyword: peak.matchedKeyword,
        transcriptText: peak.transcriptText,
        audioEnergy: peak.audioEnergy,
      });
    }
    if (merged.length >= MAX_PEAKS) break;
  }

  merged.sort((a, b) => a.timestamp - b.timestamp);

  return merged;
}
