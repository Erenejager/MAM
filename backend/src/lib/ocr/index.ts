import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import { scoreTranscript, type TranscriptSegment } from './transcript-scoring.js';
import { computeAudioEnergy } from './audio-peaks.js';
import { detectPeaks } from './peak-detection.js';
import { refinePeaks } from './overlay-diff.js';
import { identifyMatch, analyzeWithScores } from './vision-api.js';
import { processResults, curateKeyMoments, type OcrOutput } from './result-processing.js';
import { findMomentBoundaries } from './moment-boundaries.js';
import { enrichMoments } from './context-enrichment.js';

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
    const [transcriptScores, audioEnergies] = await Promise.all([
      scoreTranscript(transcriptSegments, durationSeconds),
      computeAudioEnergy(videoPath, durationSeconds),
    ]);
    const coarsePeaks = detectPeaks(transcriptScores, audioEnergies, durationSeconds);

    if (coarsePeaks.length === 0) {
      return { sport: null, competition: null, players: [], keyMoments: [], enriched: false };
    }

    const refinedPeaks = await refinePeaks(
      videoPath,
      coarsePeaks,
      durationSeconds,
      tempDir,
    );

    // Pass 1: Quick identification of sport/players/competition from a few frames
    const matchCtx = await identifyMatch(refinedPeaks);

    // Pass 2: Full analysis with context + 3 frames per peak
    const visionResults = await analyzeWithScores(refinedPeaks, matchCtx, videoPath);

    const rawOutput = processResults(visionResults);

    // Pass 3: LLM curation — deduplicate, filter, shorten labels
    const output = await curateKeyMoments(rawOutput);

    // Pass 4: Find moment boundaries — scan audio for silence gaps
    // to shift timestamps from peak (crowd roar) to action start (serve/kick)
    let finalMoments = output.keyMoments;
    if (output.keyMoments.length > 0) {
      console.log(`[ocr] Finding moment boundaries for ${output.keyMoments.length} moments...`);
      const bounded = await findMomentBoundaries(
        videoPath,
        output.keyMoments,
        durationSeconds,
      );
      console.log(`[ocr] Moment boundaries computed — timestamps shifted to action start`);
      finalMoments = bounded;

      // Pass 5: Context enrichment — store rich per-moment data to disk
      console.log(`[ocr] Enriching ${bounded.length} moments with context data...`);
      try {
        await enrichMoments({
          videoPath,
          assetDir,
          durationSeconds,
          moments: bounded,
          transcriptSegments,
          sport: output.sport,
          competition: output.competition,
        });
        console.log(`[ocr] Context enrichment complete`);
      } catch (err) {
        console.error('[ocr] Context enrichment failed:', err);
        // Non-fatal — pipeline result is still valid without enrichment on disk
      }
    }

    return { ...output, keyMoments: finalMoments, enriched: true };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
