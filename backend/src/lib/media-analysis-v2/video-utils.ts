import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'fluent-ffmpeg';
import type { AudioProfile, AudioProfileFrame, AudioProfileWindowSummary } from './types.js';

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
  const samples = await extractPcmSamples(filePath, sampleRate);
  return computeWindowedAudioEnergyFromSamples(samples, sampleRate, durationSeconds, windowSizeSeconds);
}

export async function computeAudioProfile(
  filePath: string,
  durationSeconds: number,
  frameSizeSeconds = 0.5,
): Promise<AudioProfile> {
  const sampleRate = 8000;
  const samples = await extractPcmSamples(filePath, sampleRate);
  return buildAudioProfileFromSamples(samples, sampleRate, durationSeconds, frameSizeSeconds);
}

export function buildAudioProfileFromSamples(
  samples: Int16Array,
  sampleRate: number,
  durationSeconds: number,
  frameSizeSeconds = 0.5,
): AudioProfile {
  const frames = buildAudioProfileFrames(samples, sampleRate, durationSeconds, frameSizeSeconds);
  return {
    frameSize: frameSizeSeconds,
    sampleRate,
    frames,
    summaries: {
      oneSecond: summarizeAudioProfileWindows(samples, sampleRate, durationSeconds, frames, 1),
      fiveSecond: summarizeAudioProfileWindows(samples, sampleRate, durationSeconds, frames, 5),
    },
  };
}

async function extractPcmSamples(filePath: string, sampleRate: number): Promise<Int16Array> {
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

  return new Int16Array(
    stdout.buffer,
    stdout.byteOffset,
    stdout.byteLength / 2,
  );
}

function computeWindowedAudioEnergyFromSamples(
  samples: Int16Array,
  sampleRate: number,
  durationSeconds: number,
  windowSizeSeconds: number,
): number[] {
  const samplesPerWindow = sampleRate * windowSizeSeconds;
  const windowCount = Math.ceil(durationSeconds / windowSizeSeconds);

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

function buildAudioProfileFrames(
  samples: Int16Array,
  sampleRate: number,
  durationSeconds: number,
  frameSizeSeconds: number,
): AudioProfileFrame[] {
  const samplesPerFrame = Math.max(1, Math.round(sampleRate * frameSizeSeconds));
  const frameCount = Math.ceil(durationSeconds / frameSizeSeconds);
  const rawFrames: Array<{
    index: number;
    start: number;
    end: number;
    rms: number;
    peak: number;
    zeroCrossingRate: number;
    silenceRatio: number;
  }> = [];

  for (let index = 0; index < frameCount; index++) {
    const startSample = index * samplesPerFrame;
    const endSample = Math.min(startSample + samplesPerFrame, samples.length);
    const start = Number((index * frameSizeSeconds).toFixed(3));
    const end = Number(Math.min(durationSeconds, start + frameSizeSeconds).toFixed(3));
    rawFrames.push({
      index,
      start,
      end,
      ...measureSamples(samples, startSample, endSample),
    });
  }

  const maxRms = Math.max(...rawFrames.map((frame) => frame.rms), 1);
  const maxPeak = Math.max(...rawFrames.map((frame) => frame.peak), 1);

  return rawFrames.map((frame, index) => {
    const rmsEnergy = round3(frame.rms / maxRms);
    const peakEnergy = round3(frame.peak / maxPeak);
    const previousEnergy = index > 0 ? rawFrames[index - 1].rms / maxRms : rmsEnergy;
    const energyDelta = round3(rmsEnergy - previousEnergy);
    const burstScore = round3(Math.max(0, energyDelta) * 0.7 + peakEnergy * 0.3);
    return {
      index: frame.index,
      start: frame.start,
      end: frame.end,
      rmsEnergy,
      peakEnergy,
      energyDelta,
      zeroCrossingRate: round3(frame.zeroCrossingRate),
      silenceRatio: round3(frame.silenceRatio),
      burstScore,
    };
  });
}

function summarizeAudioProfileWindows(
  samples: Int16Array,
  sampleRate: number,
  durationSeconds: number,
  frames: AudioProfileFrame[],
  windowSize: number,
): AudioProfileWindowSummary[] {
  const windowCount = Math.ceil(durationSeconds / windowSize);
  const rawWindowEnergies = computeRawWindowRms(samples, sampleRate, durationSeconds, windowSize);
  const maxWindowEnergy = Math.max(...rawWindowEnergies, 1);
  const summaries: AudioProfileWindowSummary[] = [];

  for (let index = 0; index < windowCount; index++) {
    const start = index * windowSize;
    const end = Math.min(durationSeconds, start + windowSize);
    const contained = frames.filter((frame) => frame.end > start && frame.start < end);
    const energies = contained.map((frame) => frame.rmsEnergy);
    const energyMean = mean(energies);
    const energyMax = energies.length > 0 ? Math.max(...energies) : 0;
    const burstFrames = contained.filter((frame) => frame.burstScore >= 0.18 && frame.energyDelta >= 0.06);
    const activeFrames = contained.filter((frame) => frame.rmsEnergy >= 0.08 && frame.silenceRatio < 0.85);
    const sustainedFrames = contained.filter((frame) => frame.rmsEnergy >= 0.35);
    const strongestAttack = [...contained].sort((a, b) => b.energyDelta - a.energyDelta)[0] ?? null;
    const zeroCrossingRateMean = mean(contained.map((frame) => frame.zeroCrossingRate));
    const onsetRegularity = computeOnsetRegularity(burstFrames);
    const activeDuration = activeFrames.reduce((sum, frame) => sum + frameDuration(frame), 0);
    const sustainedLoudnessDuration = sustainedFrames.reduce((sum, frame) => sum + frameDuration(frame), 0);
    const strongestAttackScore = Math.max(0, strongestAttack?.energyDelta ?? 0);
    const hints = deriveAudioProfileHints({
      windowSize: Math.max(1, end - start),
      energyMean,
      energyMax,
      energyStdDev: stdDev(energies),
      burstCount: burstFrames.length,
      onsetRate: burstFrames.length / Math.max(1, end - start),
      onsetRegularity,
      silenceRatio: mean(contained.map((frame) => frame.silenceRatio)),
      activeDuration,
      sustainedLoudnessDuration,
      strongestAttackScore,
      zeroCrossingRateMean,
    });

    summaries.push({
      index,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      windowSize,
      rmsEnergy: (rawWindowEnergies[index] ?? 0) / maxWindowEnergy,
      energyMean: round3(energyMean),
      energyMax: round3(energyMax),
      energyStdDev: round3(stdDev(energies)),
      burstCount: burstFrames.length,
      onsetRate: round3(burstFrames.length / Math.max(1, end - start)),
      silenceRatio: round3(mean(contained.map((frame) => frame.silenceRatio))),
      activeDuration: round3(activeDuration),
      sustainedLoudnessDuration: round3(sustainedLoudnessDuration),
      strongestAttackTime: strongestAttack ? round3((strongestAttack.start + strongestAttack.end) / 2) : null,
      strongestAttackScore: round3(strongestAttackScore),
      zeroCrossingRateMean: round3(zeroCrossingRateMean),
      onsetRegularity: round3(onsetRegularity),
      ...hints,
    });
  }

  return summaries;
}

function deriveAudioProfileHints(features: {
  windowSize: number;
  energyMean: number;
  energyMax: number;
  energyStdDev: number;
  burstCount: number;
  onsetRate: number;
  onsetRegularity: number;
  silenceRatio: number;
  activeDuration: number;
  sustainedLoudnessDuration: number;
  strongestAttackScore: number;
  zeroCrossingRateMean: number;
}): Pick<AudioProfileWindowSummary,
  | 'rallyTextureScore'
  | 'reactionBurstScore'
  | 'speechDominanceScore'
  | 'musicBedScore'
  | 'umpireAnnouncementScore'
  | 'applauseCrowdScore'
  | 'pointShapeHint'
> {
  const activeRatio = clamp01(features.activeDuration / features.windowSize);
  const sustainedRatio = clamp01(features.sustainedLoudnessDuration / features.windowSize);
  const burstDensityScore = clamp01(features.onsetRate / 2);
  const moderateEnergyScore = clamp01(1 - Math.abs(features.energyMean - 0.35) / 0.35);
  const lowVarianceScore = clamp01(1 - features.energyStdDev / 0.22);
  const lowZcrScore = clamp01(1 - features.zeroCrossingRateMean / 0.25);
  const noisyTextureScore = clamp01(features.zeroCrossingRateMean / 0.35);
  const attackScore = clamp01(features.strongestAttackScore / 0.35);
  const highEnergyScore = clamp01(features.energyMax / 0.65);
  const nonSilentScore = clamp01(1 - features.silenceRatio);

  const rallyTextureScore = round3(
    0.35 * burstDensityScore
    + 0.25 * activeRatio
    + 0.25 * moderateEnergyScore
    + 0.15 * (1 - sustainedRatio),
  );
  const reactionBurstScore = round3(
    0.45 * attackScore
    + 0.35 * highEnergyScore
    + 0.2 * Math.max(burstDensityScore, noisyTextureScore),
  );
  const speechDominanceScore = round3(
    0.4 * lowZcrScore
    + 0.25 * (1 - burstDensityScore)
    + 0.2 * activeRatio
    + 0.15 * lowVarianceScore,
  );
  const musicBedScore = round3(
    0.35 * sustainedRatio
    + 0.25 * lowVarianceScore
    + 0.25 * features.onsetRegularity
    + 0.15 * nonSilentScore,
  );
  const umpireAnnouncementScore = round3(
    0.35 * speechDominanceScore
    + 0.25 * attackScore
    + 0.25 * (1 - sustainedRatio)
    + 0.15 * clamp01(features.silenceRatio + 0.15),
  );
  const applauseCrowdScore = round3(
    0.35 * reactionBurstScore
    + 0.3 * noisyTextureScore
    + 0.2 * sustainedRatio
    + 0.15 * burstDensityScore,
  );

  return {
    rallyTextureScore,
    reactionBurstScore,
    speechDominanceScore,
    musicBedScore,
    umpireAnnouncementScore,
    applauseCrowdScore,
    pointShapeHint: inferPointShapeHint({
      activeRatio,
      rallyTextureScore,
      reactionBurstScore,
      speechDominanceScore,
      musicBedScore,
      activeDuration: features.activeDuration,
    }),
  };
}

function inferPointShapeHint(features: {
  activeRatio: number;
  activeDuration: number;
  rallyTextureScore: number;
  reactionBurstScore: number;
  speechDominanceScore: number;
  musicBedScore: number;
}): AudioProfileWindowSummary['pointShapeHint'] {
  if (features.musicBedScore >= 0.7 || features.speechDominanceScore >= 0.78) return 'recap_only';
  if (features.reactionBurstScore >= 0.68 && features.rallyTextureScore < 0.35) return 'reaction_only';
  if (features.rallyTextureScore >= 0.55 && features.reactionBurstScore >= 0.45) {
    if (features.activeDuration >= 8) return 'long_rally';
    if (features.activeDuration >= 3) return 'medium_rally';
    return 'short_point';
  }
  if (features.activeRatio > 0 && features.activeDuration < 3 && features.reactionBurstScore >= 0.45) {
    return 'short_point';
  }
  return 'unknown';
}

function computeOnsetRegularity(frames: AudioProfileFrame[]): number {
  if (frames.length < 3) return 0;
  const gaps: number[] = [];
  for (let index = 1; index < frames.length; index++) {
    const previousMidpoint = (frames[index - 1].start + frames[index - 1].end) / 2;
    const currentMidpoint = (frames[index].start + frames[index].end) / 2;
    gaps.push(currentMidpoint - previousMidpoint);
  }

  const averageGap = mean(gaps);
  if (averageGap <= 0) return 0;
  return round3(clamp01(1 - stdDev(gaps) / averageGap));
}

function computeRawWindowRms(
  samples: Int16Array,
  sampleRate: number,
  durationSeconds: number,
  windowSizeSeconds: number,
): number[] {
  const samplesPerWindow = sampleRate * windowSizeSeconds;
  const windowCount = Math.ceil(durationSeconds / windowSizeSeconds);
  const energies: number[] = [];

  for (let index = 0; index < windowCount; index++) {
    const start = index * samplesPerWindow;
    const end = Math.min(start + samplesPerWindow, samples.length);
    energies.push(measureSamples(samples, start, end).rms);
  }

  return energies;
}

function measureSamples(
  samples: Int16Array,
  start: number,
  end: number,
): { rms: number; peak: number; zeroCrossingRate: number; silenceRatio: number } {
  if (start >= samples.length || end <= start) {
    return { rms: 0, peak: 0, zeroCrossingRate: 0, silenceRatio: 1 };
  }

  let sumSq = 0;
  let peak = 0;
  let crossings = 0;
  let silent = 0;
  let previous = samples[start] ?? 0;
  const silenceThreshold = 32768 * 0.015;

  for (let index = start; index < end; index++) {
    const sample = samples[index] ?? 0;
    const abs = Math.abs(sample);
    sumSq += sample * sample;
    peak = Math.max(peak, abs);
    if (abs <= silenceThreshold) silent++;
    if ((sample >= 0 && previous < 0) || (sample < 0 && previous >= 0)) crossings++;
    previous = sample;
  }

  const length = Math.max(1, end - start);
  return {
    rms: Math.sqrt(sumSq / length),
    peak,
    zeroCrossingRate: crossings / length,
    silenceRatio: silent / length,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function frameDuration(frame: AudioProfileFrame): number {
  return Math.max(0, frame.end - frame.start);
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
