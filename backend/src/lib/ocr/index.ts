import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import { scoreTranscript, type TranscriptSegment } from './transcript-scoring.js';
import { computeAudioEnergy } from './audio-peaks.js';
import { detectPeaks } from './peak-detection.js';
import { refinePeaks } from './overlay-diff.js';
import { analyzeFrames } from './vision-api.js';
import { processResults, type OcrOutput } from './result-processing.js';

export type { TranscriptSegment } from './transcript-scoring.js';
export type { OcrOutput } from './result-processing.js';

export async function runOcrPipeline(
  videoPath: string,
  durationSeconds: number,
  transcriptSegments: TranscriptSegment[],
  assetDir: string,
): Promise<OcrOutput> {
  const tempDir = resolve(assetDir, 'ocr_temp');

  try {
    const transcriptScores = scoreTranscript(transcriptSegments, durationSeconds);
    const audioEnergies = await computeAudioEnergy(videoPath, durationSeconds);
    const coarsePeaks = detectPeaks(transcriptScores, audioEnergies);

    if (coarsePeaks.length === 0) {
      return { sport: null, competition: null, players: [], keyMoments: [] };
    }

    const refinedPeaks = await refinePeaks(
      videoPath,
      coarsePeaks,
      durationSeconds,
      tempDir,
    );

    const visionResults = await analyzeFrames(refinedPeaks);

    const output = processResults(visionResults);

    return output;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
