import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { extractFrameJpeg } from './video-utils.js';
import type {
  AudioReactionEpisode,
  CandidateWindowPacket,
  ScoreboardDetection,
  ScoreboardDetectionRun,
  TimelineIndex,
} from './types.js';

const execFileAsync = promisify(execFile);

interface DetectorConfig {
  enabled: boolean;
  image: string;
  modelDir: string;
  model: string;
  confidence: string;
  limit: number;
}

interface ScoreboardSample {
  candidateWindowId: string | null;
  audioPeakId: string | null;
  linkedEventIds: string[];
  anchorTime: number;
  sampleLabel: string;
  sampleSource: 'audio' | 'fallback';
  sampleTime: number;
  framePath: string;
  detectorFrame: string;
}

interface DetectorRow {
  frame: string;
  visible: boolean;
  confidence?: number | null;
  bbox?: ScoreboardDetection['scoreboardBbox'];
  crop_path?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  source?: string | null;
  error?: string | null;
}

export async function runScoreboardDetectionStage(input: {
  videoPath: string;
  assetDir: string;
  durationSeconds: number;
  timelineIndex: TimelineIndex;
  candidateWindows: CandidateWindowPacket[];
  audioReactionEpisodes: AudioReactionEpisode[];
}): Promise<ScoreboardDetectionRun> {
  const config = getDetectorConfig();
  const generatedAt = new Date().toISOString();

  if (!config.enabled) {
    return {
      status: 'skipped',
      enabled: false,
      generatedAt,
      detectorImage: null,
      detectorModel: null,
      sampleCount: 0,
      visibleCount: 0,
      detections: [],
    };
  }

  try {
    const outputDir = resolve(input.assetDir, 'media_analysis_v2', 'scoreboard_detections');
    const frameDir = resolve(outputDir, 'frames');
    const detectorInputDir = resolve(outputDir, 'input-flat');
    const cropDir = resolve(outputDir, 'crops');
    await Promise.all([
      mkdir(frameDir, { recursive: true }),
      mkdir(detectorInputDir, { recursive: true }),
      mkdir(cropDir, { recursive: true }),
    ]);

    const samples = await extractScoreboardSamples({
      ...input,
      frameDir,
      limit: config.limit,
    });

    if (samples.length === 0) {
      return {
        status: 'complete',
        enabled: true,
        generatedAt,
        detectorImage: config.image,
        detectorModel: config.model,
        sampleCount: 0,
        visibleCount: 0,
        detections: [],
      };
    }

    for (const sample of samples) {
      await copyFile(sample.framePath, resolve(detectorInputDir, sample.detectorFrame));
    }

    await execFileAsync('docker', [
      'run',
      '--rm',
      '--user',
      `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      '-v',
      `${config.modelDir}:/models:ro`,
      '-v',
      `${detectorInputDir}:/input:ro`,
      '-v',
      `${cropDir}:/output`,
      config.image,
      '--model',
      `/models/${config.model}`,
      '--input',
      '/input',
      '--output',
      '/output',
      '--conf',
      config.confidence,
    ], {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 300_000,
    });

    const detectorRows = JSON.parse(
      await readFile(resolve(cropDir, 'results.json'), 'utf-8'),
    ) as DetectorRow[];
    const sampleByDetectorFrame = new Map(samples.map((sample) => [sample.detectorFrame, sample]));
    const detections = detectorRows.map((row) => {
      const sample = sampleByDetectorFrame.get(row.frame);
      return normalizeDetectionRow(row, sample, cropDir);
    });

    return {
      status: 'complete',
      enabled: true,
      generatedAt,
      detectorImage: config.image,
      detectorModel: config.model,
      sampleCount: samples.length,
      visibleCount: detections.filter((detection) => detection.scoreboardVisible).length,
      detections,
    };
  } catch (error) {
    return {
      status: 'failed',
      enabled: true,
      generatedAt,
      detectorImage: config.image,
      detectorModel: config.model,
      sampleCount: 0,
      visibleCount: 0,
      detections: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function getDetectorConfig(): DetectorConfig {
  return {
    enabled: process.env.MAM_SCOREBOARD_DETECTOR_ENABLED === '1',
    image: process.env.MAM_SCOREBOARD_DETECTOR_IMAGE ?? 'scoreboard-detector',
    modelDir: process.env.MAM_SCOREBOARD_DETECTOR_MODEL_DIR ?? defaultModelDir(),
    model: process.env.MAM_SCOREBOARD_DETECTOR_MODEL ?? 'best.onnx',
    confidence: process.env.MAM_SCOREBOARD_DETECTOR_CONF ?? '0.25',
    limit: Number(process.env.MAM_SCOREBOARD_DETECTOR_LIMIT ?? 40),
  };
}

function defaultModelDir(): string {
  const fromCwd = resolve(process.cwd(), 'models/scoreboard-yolo');
  if (existsSync(fromCwd)) return fromCwd;

  const fromBackendCwd = resolve(process.cwd(), '../models/scoreboard-yolo');
  if (existsSync(fromBackendCwd)) return fromBackendCwd;

  return fromCwd;
}

async function extractScoreboardSamples(input: {
  videoPath: string;
  durationSeconds: number;
  timelineIndex: TimelineIndex;
  candidateWindows: CandidateWindowPacket[];
  audioReactionEpisodes: AudioReactionEpisode[];
  frameDir: string;
  limit: number;
}): Promise<ScoreboardSample[]> {
  const windowsById = new Map(input.candidateWindows.map((window) => [window.id, window]));
  const anchors = input.audioReactionEpisodes
    .map((episode) => ({
      episode,
      candidateWindow: windowsById.get(episode.primaryCandidateWindowId) ?? null,
    }))
    .filter(({ candidateWindow }) => candidateWindow != null)
    .sort((a, b) =>
      b.episode.confidence - a.episode.confidence ||
      a.episode.primaryAnchorTime - b.episode.primaryAnchorTime,
    )
    .slice(0, Math.max(1, input.limit));
  const samples: ScoreboardSample[] = [];

  for (const { episode, candidateWindow } of anchors) {
    const candidate = candidateWindow as CandidateWindowPacket;
    const anchorTime = episode.primaryAnchorTime;
    const samplePoints = selectScoreboardSamplePoints(input.timelineIndex, anchorTime, input.durationSeconds);
    const anchorId = safeFilename(`${candidate.id}_${formatFilenameTime(anchorTime)}`);

    for (const point of samplePoints) {
      const detectorFrame = `${anchorId}__${formatFilenameTime(point.time)}__${safeFilename(point.label)}.jpg`;
      const framePath = resolve(input.frameDir, detectorFrame);
      await extractFrameJpeg(input.videoPath, point.time, framePath, 720);
      samples.push({
        candidateWindowId: candidate.id,
        audioPeakId: episode.primaryAudioPeakId,
        linkedEventIds: candidate.linkedEventIds,
        anchorTime,
        sampleLabel: point.label,
        sampleSource: point.source,
        sampleTime: point.time,
        framePath,
        detectorFrame,
      });
    }
  }

  return samples;
}

function selectScoreboardSamplePoints(
  timelineIndex: TimelineIndex,
  anchorTime: number,
  durationSeconds: number,
): Array<{ label: string; source: 'audio' | 'fallback'; time: number }> {
  const oneSecond = timelineIndex.audioProfile?.summaries.oneSecond ?? [];
  const points: Array<{ label: string; source: 'audio' | 'fallback'; time: number }> = [];
  const bestBefore = bestSummaryInRange(oneSecond, anchorTime - 10, anchorTime - 2, (summary) =>
    (summary.context?.rallyTextureScore ?? summary.rallyTextureScore ?? 0) * 0.6 +
    (summary.activeDuration ?? 0) * 0.25 -
    (summary.context?.speechDominanceScore ?? summary.speechDominanceScore ?? 0) * 0.2,
  );
  const bestSettle = bestSummaryInRange(oneSecond, anchorTime + 2, anchorTime + 8, (summary) =>
    (summary.silenceRatio ?? 0) * 0.3 +
    (summary.activeDuration ?? 0) * 0.2 -
    Math.abs((summary.rmsEnergy ?? 0) - 0.35) * 0.2,
  );

  if (bestBefore) points.push({ label: 'action_or_rally_context', source: 'audio', time: midpoint(bestBefore.start, bestBefore.end) });
  points.push({ label: 'reaction_start', source: 'audio', time: anchorTime });
  points.push({
    label: 'scoreboard_settle',
    source: bestSettle ? 'audio' : 'fallback',
    time: bestSettle ? midpoint(bestSettle.start, bestSettle.end) : anchorTime + 5,
  });
  points.push({ label: 'tail_or_context_check', source: 'fallback', time: anchorTime + 12 });

  return dedupeSamplePoints(points)
    .map((point) => ({
      ...point,
      time: round1(Math.min(Math.max(0, point.time), Math.max(0, durationSeconds - 0.1))),
    }))
    .sort((a, b) => a.time - b.time);
}

function bestSummaryInRange<T extends { start: number; end: number }>(
  summaries: T[],
  start: number,
  end: number,
  scoreFn: (summary: T) => number,
): T | null {
  return summaries
    .filter((summary) => summary.end >= start && summary.start <= end)
    .map((summary) => ({ summary, score: scoreFn(summary) }))
    .sort((a, b) => b.score - a.score)[0]?.summary ?? null;
}

function dedupeSamplePoints<T extends { label: string; source: 'audio' | 'fallback'; time: number }>(points: T[]): T[] {
  const output: T[] = [];
  for (const point of points) {
    if (!output.some((candidate) => Math.abs(candidate.time - point.time) < 0.75)) {
      output.push(point);
    }
  }
  return output;
}

function normalizeDetectionRow(
  row: DetectorRow,
  sample: ScoreboardSample | undefined,
  cropDir: string,
): ScoreboardDetection {
  return {
    candidateWindowId: sample?.candidateWindowId ?? null,
    audioPeakId: sample?.audioPeakId ?? null,
    linkedEventIds: sample?.linkedEventIds ?? [],
    anchorTime: sample?.anchorTime ?? 0,
    sampleLabel: sample?.sampleLabel ?? '',
    sampleSource: sample?.sampleSource ?? 'fallback',
    sampleTime: sample?.sampleTime ?? 0,
    framePath: sample?.framePath ?? '',
    detectorFrame: row.frame,
    scoreboardVisible: row.visible,
    scoreboardConfidence: typeof row.confidence === 'number' ? row.confidence : null,
    scoreboardBbox: row.bbox ?? null,
    scoreboardCropPath: row.crop_path ? resolve(cropDir, row.crop_path) : null,
    imageWidth: typeof row.image_width === 'number' ? row.image_width : null,
    imageHeight: typeof row.image_height === 'number' ? row.image_height : null,
    detectorSource: row.source ?? null,
    detectorError: row.error ?? null,
  };
}

function midpoint(start: number, end: number): number {
  return (start + end) / 2;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatFilenameTime(seconds: number): string {
  return seconds.toFixed(1).replace('.', 'p').replace('-', 'm');
}

function safeFilename(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80);
}
