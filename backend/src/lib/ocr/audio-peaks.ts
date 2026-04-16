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

export async function computeFinegrainEnergy(
  filePath: string,
  centerTime: number,
  radius: number,
  durationSeconds: number,
): Promise<{ offset: number; energies: number[] }> {
  const sampleRate = 8000;
  const windowSize = 1; // 1-second windows
  const samplesPerWindow = sampleRate * windowSize;

  const startTime = Math.max(0, centerTime - radius);
  const endTime = Math.min(durationSeconds, centerTime + radius);
  const windowDuration = endTime - startTime;
  const windowCount = Math.ceil(windowDuration / windowSize);

  const { stdout } = await execFileAsync(
    'ffmpeg',
    [
      '-ss', String(startTime),
      '-i', filePath,
      '-t', String(windowDuration),
      '-ac', '1',
      '-ar', String(sampleRate),
      '-f', 's16le',
      '-vn',
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024, timeout: 60_000 },
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
  return { offset: startTime, energies: energies.map((e) => e / maxEnergy) };
}
