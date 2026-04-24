import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'fluent-ffmpeg';

const execFileAsync = promisify(execFile);

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  codec: string;
  frameRate: number;
}

export function probeVideo(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);

      const videoStream = data.streams.find((s) => s.codec_type === 'video');
      if (!videoStream) {
        return reject(new Error('No video stream found'));
      }

      const [num, den] = (videoStream.r_frame_rate || '0/1').split('/').map(Number);
      const frameRate = den > 0 ? num / den : 0;

      resolve({
        durationSeconds: data.format.duration ?? 0,
        width: videoStream.width ?? 0,
        height: videoStream.height ?? 0,
        codec: videoStream.codec_name ?? 'unknown',
        frameRate,
      });
    });
  });
}

export async function extractFrameJpeg(
  videoPath: string,
  timeSeconds: number,
  outputPath: string,
  height = 360,
): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-ss', String(timeSeconds),
    '-i', videoPath,
    '-frames:v', '1',
    '-vf', `scale=-1:${height}`,
    '-q:v', '3',
    '-y',
    outputPath,
  ], { timeout: 30_000 });
}

export async function computeWindowedAudioEnergy(
  filePath: string,
  durationSeconds: number,
  windowSizeSeconds: number,
): Promise<number[]> {
  const sampleRate = 8000;
  const samplesPerWindow = sampleRate * windowSizeSeconds;
  const windowCount = Math.ceil(durationSeconds / windowSizeSeconds);

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

    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    energies.push(rms);
  }

  const maxEnergy = Math.max(...energies, 1);
  return energies.map((value) => value / maxEnergy);
}
