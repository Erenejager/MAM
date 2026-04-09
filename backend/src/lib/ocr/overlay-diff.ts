import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CoarsePeak } from './peak-detection.js';
import PQueue from 'p-queue';

const execFileAsync = promisify(execFile);

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
        const windowStart = Math.max(0, Math.floor(peak.timestamp) - 15);
        const windowEnd = Math.min(Math.ceil(durationSeconds), Math.floor(peak.timestamp) + 15);
        const frameCount = windowEnd - windowStart;
        if (frameCount < 2) {
          const framePath = resolve(tempDir, `peak_${pi}.jpg`);
          await extractSingleFrame(videoPath, peak.timestamp, framePath);
          return {
            timestamp: peak.timestamp,
            framePath,
            matchedKeyword: peak.matchedKeyword,
            transcriptText: peak.transcriptText,
            audioEnergy: peak.audioEnergy,
          } as RefinedPeak;
        }

        const framePaths: { time: number; path: string }[] = [];
        for (let t = windowStart; t < windowEnd; t++) {
          const path = resolve(tempDir, `peak_${pi}_t${t}.jpg`);
          await extractSingleFrame(videoPath, t, path);
          framePaths.push({ time: t, path });
        }

        let bestDiff = 0;
        let bestIndex = 0;
        for (let i = 1; i < framePaths.length; i++) {
          const diff = await compareOverlayZones(framePaths[i - 1].path, framePaths[i].path);
          if (diff > bestDiff) {
            bestDiff = diff;
            bestIndex = i;
          }
        }

        const bestFrame = framePaths[bestIndex];

        for (const fp of framePaths) {
          if (fp.path !== bestFrame.path) {
            await unlink(fp.path).catch(() => {});
          }
        }

        return {
          timestamp: bestFrame.time,
          framePath: bestFrame.path,
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

async function compareOverlayZones(
  pathA: string,
  pathB: string,
): Promise<number> {
  const [rawA, rawB] = await Promise.all([
    extractRawPixels(pathA),
    extractRawPixels(pathB),
  ]);

  if (rawA.length !== rawB.length || rawA.length === 0) return 0;

  const width = 640;
  const height = 360;
  const bytesPerPixel = 3;
  const rowBytes = width * bytesPerPixel;

  const topEnd = Math.floor(height * 0.15);
  const bottomStart = Math.floor(height * 0.80);

  let totalDiff = 0;
  let pixelCount = 0;

  for (let y = 0; y < topEnd; y++) {
    const offset = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      if (offset + x < rawA.length && offset + x < rawB.length) {
        totalDiff += Math.abs(rawA[offset + x] - rawB[offset + x]);
        pixelCount++;
      }
    }
  }

  for (let y = bottomStart; y < height; y++) {
    const offset = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      if (offset + x < rawA.length && offset + x < rawB.length) {
        totalDiff += Math.abs(rawA[offset + x] - rawB[offset + x]);
        pixelCount++;
      }
    }
  }

  if (pixelCount === 0) return 0;
  return totalDiff / (pixelCount * 255);
}

async function extractRawPixels(imagePath: string): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    'ffmpeg',
    [
      '-i', imagePath,
      '-vf', 'scale=640:360',
      '-pix_fmt', 'rgb24',
      '-f', 'rawvideo',
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout;
}
