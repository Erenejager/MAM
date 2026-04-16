import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function computeAudioEnergy(
  filePath: string,
  durationSeconds: number,
): Promise<number[]> {
  const sampleRate = 8000;
  const windowSize = 10;
  const samplesPerWindow = sampleRate * windowSize;
  const windowCount = Math.ceil(durationSeconds / windowSize);

  const { stdout } = await execFileAsync(
    'ffmpeg',
    [
      '-i', filePath,
      '-ac', '1',
      '-ar', String(sampleRate),
      '-f', 's16le',
      '-vn',
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 200 * 1024 * 1024, timeout: 120_000 },
  );

  const samples = new Int16Array(
    stdout.buffer,
    stdout.byteOffset,
    stdout.byteLength / 2,
  );

  const energies: number[] = [];
  for (let w = 0; w < windowCount; w++) {
    const start = w * samplesPerWindow;
    const end = Math.min(start + samplesPerWindow, samples.length);
    if (start >= samples.length) {
      energies.push(0);
      continue;
    }
    let sumSq = 0;
    for (let i = start; i < end; i++) {
      sumSq += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSq / (end - start));
    energies.push(rms);
  }

  const maxEnergy = Math.max(...energies, 1);
  return energies.map((e) => e / maxEnergy);
}

/**
 * Compute per-second audio energy for a window around a center time.
 * Returns { offset, energies } where offset is the window start in seconds.
 */
export async function computeFinegrainEnergy(
  filePath: string,
  centerTime: number,
  radius: number,
  durationSeconds: number,
): Promise<{ offset: number; energies: number[] }> {
  const sampleRate = 8000;
  const windowStart = Math.max(0, centerTime - radius);
  const windowEnd = Math.min(durationSeconds, centerTime + radius);
  const windowDuration = windowEnd - windowStart;

  const { stdout } = await execFileAsync(
    'ffmpeg',
    [
      '-ss', String(windowStart),
      '-t', String(windowDuration),
      '-i', filePath,
      '-ac', '1',
      '-ar', String(sampleRate),
      '-f', 's16le',
      '-vn',
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 200 * 1024 * 1024, timeout: 60_000 },
  );

  const samples = new Int16Array(
    stdout.buffer,
    stdout.byteOffset,
    stdout.byteLength / 2,
  );

  const samplesPerSecond = sampleRate;
  const secondCount = Math.ceil(windowDuration);
  const energies: number[] = [];

  for (let s = 0; s < secondCount; s++) {
    const start = s * samplesPerSecond;
    const end = Math.min(start + samplesPerSecond, samples.length);
    if (start >= samples.length) {
      energies.push(0);
      continue;
    }
    let sumSq = 0;
    for (let i = start; i < end; i++) {
      sumSq += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSq / (end - start));
    energies.push(rms);
  }

  const maxEnergy = Math.max(...energies, 1);
  return {
    offset: windowStart,
    energies: energies.map((e) => e / maxEnergy),
  };
}
