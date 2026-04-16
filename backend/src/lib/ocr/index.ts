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

export type ProgressCallback = (step: string, detail?: string) => void;

export async function runOcrPipeline(
  videoPath: string,
  durationSeconds: number,
  transcriptSegments: TranscriptSegment[],
  assetDir: string,
  onProgress?: ProgressCallback,
): Promise<OcrOutput> {
  const tempDir = resolve(assetDir, 'ocr_temp');
  const progress = onProgress ?? (() => {});

  try {
    progress('scoring', 'transcript scoring + audio energy (parallel)');
    const [transcriptScores, audioEnergies] = await Promise.all([
      scoreTranscript(transcriptSegments, durationSeconds),
      computeAudioEnergy(videoPath, durationSeconds),
    ]);

    progress('peak-detection', 'detecting coarse peaks');
    const coarsePeaks = detectPeaks(transcriptScores, audioEnergies, durationSeconds);

    if (coarsePeaks.length === 0) {
      progress('done', 'no peaks found');
      return { sport: null, competition: null, players: [], keyMoments: [], enriched: false };
    }

    progress('refine-peaks', `refining ${coarsePeaks.length} peaks via overlay diff`);
    const refinedPeaks = await refinePeaks(
      videoPath,
      coarsePeaks,
      durationSeconds,
      tempDir,
    );

    // Pass 1: Quick identification of sport/players/competition from a few frames
    progress('identify-match', 'pass 1 — identifying sport / players / competition');
    const matchCtx = await identifyMatch(refinedPeaks);

    // Pass 2: Full analysis with context + 3 frames per peak
    progress('vision-analysis', `pass 2 — full vision analysis of ${refinedPeaks.length} peaks`);
    const visionResults = await analyzeWithScores(refinedPeaks, matchCtx, videoPath, transcriptSegments);

    progress('process-results', 'processing vision results');
    const rawOutput = processResults(visionResults, matchCtx);

    // Pass 3: LLM curation — deduplicate, filter, shorten labels
    progress('curation', `pass 3 — curating ${rawOutput.keyMoments.length} raw moments`);
    const output = await curateKeyMoments(rawOutput);

    // Pass 4: Find moment boundaries — scan audio for silence gaps
    // to shift timestamps from peak (crowd roar) to action start (serve/kick)
    let finalMoments = output.keyMoments;
    if (output.keyMoments.length > 0) {
      progress('boundaries', `pass 4 — finding boundaries for ${output.keyMoments.length} moments`);
      const bounded = await findMomentBoundaries(
        videoPath,
        output.keyMoments,
        durationSeconds,
      );
      finalMoments = bounded;

      // Pass 5: Context enrichment — store rich per-moment data to disk
      progress('enrichment', `pass 5 — enriching ${bounded.length} moments with context`);
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
      } catch (err) {
        console.error('[ocr] Context enrichment failed:', err);
        // Non-fatal — pipeline result is still valid without enrichment on disk
      }
    }

    progress('done', `${finalMoments.length} moments`);
    return { ...output, keyMoments: finalMoments, enriched: true };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
