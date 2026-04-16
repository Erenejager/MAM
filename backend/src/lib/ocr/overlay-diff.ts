import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { unlink, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CoarsePeak } from './peak-detection.js';
import PQueue from 'p-queue';

const execFileAsync = promisify(execFile);

const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 360;
const FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT * 3; // rgb24

export interface RefinedPeak {
  timestamp: number;
  framePath: string;
  matchedKeyword: string | null;
  transcriptText: string;
  audioEnergy: number;
}

export async function refinePeaks(
  videoPath: string,
  peaks: CoarsePeak[],
  durationSeconds: number,
  tempDir: string,
): Promise<RefinedPeak[]> {
  await mkdir(tempDir, { recursive: true });

  const queue = new PQueue({ concurrency: 6 });

  const settled = await Promise.all(
    peaks.map((peak, pi) =>
      queue.add(async () => {
        const windowStart = Math.max(0, Math.floor(peak.timestamp) - 5);
        const windowEnd = Math.min(Math.ceil(durationSeconds), Math.floor(peak.timestamp) + 5);
        const windowDuration = windowEnd - windowStart;

        const framePath = resolve(tempDir, `peak_${pi}.jpg`);

        if (windowDuration < 2) {
          await extractSingleFrame(videoPath, peak.timestamp, framePath);
          return {
            timestamp: peak.timestamp,
            framePath,
            matchedKeyword: peak.matchedKeyword,
            transcriptText: peak.transcriptText,
            audioEnergy: peak.audioEnergy,
          } as RefinedPeak;
        }

        // Single ffmpeg pass: decode the whole window as raw rgb24 frames at 1 fps.
        // This is one seek + one decode instead of one seek per frame.
        const rawFrames = await extractWindowRaw(videoPath, windowStart, windowDuration);

        let bestDiff = 0;
        let bestIndex = 1; // default to second frame if all diffs are 0
        for (let i = 1; i < rawFrames.length; i++) {
          const diff = compareOverlayZones(rawFrames[i - 1], rawFrames[i]);
          if (diff > bestDiff) {
            bestDiff = diff;
            bestIndex = i;
          }
        }

        const bestTimestamp = windowStart + bestIndex;
        await extractSingleFrame(videoPath, bestTimestamp, framePath);

        return {
          timestamp: bestTimestamp,
          framePath,
          matchedKeyword: peak.matchedKeyword,
          transcriptText: peak.transcriptText,
          audioEnergy: peak.audioEnergy,
        } as RefinedPeak;
      }),
    ),
  );

  return (settled.filter((r): r is RefinedPeak => r != null))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Extract all frames in a window as raw rgb24 in a single ffmpeg pass.
 * Returns one Buffer per frame (each FRAME_BYTES long).
 */
async function extractWindowRaw(
  videoPath: string,
  windowStart: number,
  windowDuration: number,
): Promise<Buffer[]> {
  const maxBytes = (windowDuration + 2) * FRAME_BYTES; // +2 headroom
  const { stdout } = await execFileAsync('ffmpeg', [
    '-ss', String(windowStart),
    '-i', videoPath,
    '-t', String(windowDuration),
    '-vf', `fps=1,scale=${FRAME_WIDTH}:${FRAME_HEIGHT}`,
    '-pix_fmt', 'rgb24',
    '-f', 'rawvideo',
    'pipe:1',
  ], { encoding: 'buffer', maxBuffer: maxBytes });

  const frames: Buffer[] = [];
  for (let offset = 0; offset + FRAME_BYTES <= stdout.length; offset += FRAME_BYTES) {
    frames.push(stdout.subarray(offset, offset + FRAME_BYTES));
  }
  return frames;
}

async function extractSingleFrame(
  videoPath: string,
  timeSeconds: number,
  outputPath: string,
): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-ss', String(timeSeconds),
    '-i', videoPath,
    '-frames:v', '1',
    '-vf', 'scale=-1:360',
    '-q:v', '3',
    '-y',
    outputPath,
  ]);
}

/**
 * Pure-JS overlay zone comparison on in-memory rgb24 buffers.
 * Looks at top 15% and bottom 20% of the frame (score/overlay regions).
 */
function compareOverlayZones(frameA: Buffer, frameB: Buffer): number {
  if (frameA.length !== frameB.length || frameA.length === 0) return 0;

  const rowBytes = FRAME_WIDTH * 3;
  const topEnd = Math.floor(FRAME_HEIGHT * 0.15);
  const bottomStart = Math.floor(FRAME_HEIGHT * 0.80);

  let totalDiff = 0;
  let pixelCount = 0;

  for (let y = 0; y < topEnd; y++) {
    const offset = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      totalDiff += Math.abs(frameA[offset + x] - frameB[offset + x]);
      pixelCount++;
    }
  }

  for (let y = bottomStart; y < FRAME_HEIGHT; y++) {
    const offset = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      totalDiff += Math.abs(frameA[offset + x] - frameB[offset + x]);
      pixelCount++;
    }
  }

  if (pixelCount === 0) return 0;
  return totalDiff / (pixelCount * 255);
}
