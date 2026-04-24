import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { MediaAnalysisResult } from './types.js';
import { annotateEventReliability, getOcrSupportStatus } from './event-reliability.js';

const ROOT_DIR = 'media_analysis_v2';
const RESULT_FILE = 'result.json';
const SUMMARY_FILE = 'summary.json';
const STATUS_FILE = 'status.json';

export interface MediaAnalysisStatus {
  status: 'idle' | 'running' | 'complete' | 'failed';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface MediaAnalysisSummary {
  generatedAt: string;
  assetProfile: {
    domain: MediaAnalysisResult['assetProfile']['domain'];
    format: MediaAnalysisResult['assetProfile']['format'];
    sport: string | null;
    competition: string | null;
    confidence: number;
  };
  counts: {
    segments: number;
    events: number;
  };
  ocrSupportCounts: Array<{ status: 'supports' | 'weak_support' | 'conflicts'; count: number }>;
  reliabilityCounts: Array<{ bucket: 'top_5' | 'top_10' | 'top_20'; count: number }>;
  segmentTypes: Array<{ type: string; count: number }>;
  eventTypes: Array<{ type: string; count: number }>;
}

export async function saveMediaAnalysisResult(
  assetDir: string,
  result: MediaAnalysisResult,
): Promise<void> {
  const outputDir = resolve(assetDir, ROOT_DIR);
  await mkdir(outputDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const annotatedResult = {
    ...result,
    events: annotateEventReliability(result.events),
  };
  const summary = buildSummary(annotatedResult, generatedAt);

  await Promise.all([
    writeFile(resolve(outputDir, RESULT_FILE), JSON.stringify(annotatedResult, null, 2), 'utf-8'),
    writeFile(resolve(outputDir, SUMMARY_FILE), JSON.stringify(summary, null, 2), 'utf-8'),
    writeFile(resolve(outputDir, STATUS_FILE), JSON.stringify({
      status: 'complete',
      completedAt: generatedAt,
    } satisfies MediaAnalysisStatus, null, 2), 'utf-8'),
  ]);
}

export async function loadMediaAnalysisResult(assetDir: string): Promise<MediaAnalysisResult> {
  const filePath = resolve(assetDir, ROOT_DIR, RESULT_FILE);
  const content = await readFile(filePath, 'utf-8');
  const result = JSON.parse(content) as MediaAnalysisResult;
  return {
    ...result,
    events: annotateEventReliability(result.events),
  };
}

export async function loadMediaAnalysisSummary(assetDir: string): Promise<MediaAnalysisSummary> {
  const filePath = resolve(assetDir, ROOT_DIR, SUMMARY_FILE);
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as MediaAnalysisSummary;
}

export async function saveMediaAnalysisStatus(
  assetDir: string,
  status: MediaAnalysisStatus,
): Promise<void> {
  const outputDir = resolve(assetDir, ROOT_DIR);
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, STATUS_FILE), JSON.stringify(status, null, 2), 'utf-8');
}

export async function loadMediaAnalysisStatus(assetDir: string): Promise<MediaAnalysisStatus> {
  const filePath = resolve(assetDir, ROOT_DIR, STATUS_FILE);
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as MediaAnalysisStatus;
}

function buildSummary(
  result: MediaAnalysisResult,
  generatedAt: string,
): MediaAnalysisSummary {
  return {
    generatedAt,
    assetProfile: {
      domain: result.assetProfile.domain,
      format: result.assetProfile.format,
      sport: result.assetProfile.sport,
      competition: result.assetProfile.competition,
      confidence: result.assetProfile.confidence,
    },
    counts: {
      segments: result.segments.length,
      events: result.events.length,
    },
    ocrSupportCounts: countByStatus(
      result.events
        .map((event) => getOcrSupportStatus(event))
        .filter((status): status is 'supports' | 'weak_support' | 'conflicts' => status != null),
    ),
    reliabilityCounts: countReliabilityBuckets(result.events),
    segmentTypes: countBy(result.segments.map((segment) => segment.type)),
    eventTypes: countBy(result.events.map((event) => event.type)),
  };
}

function countBy(values: string[]): Array<{ type: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

function countByStatus(
  values: Array<'supports' | 'weak_support' | 'conflicts'>,
): Array<{ status: 'supports' | 'weak_support' | 'conflicts'; count: number }> {
  const counts = new Map<'supports' | 'weak_support' | 'conflicts', number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
}

function countReliabilityBuckets(
  events: MediaAnalysisResult['events'],
): Array<{ bucket: 'top_5' | 'top_10' | 'top_20'; count: number }> {
  const thresholds = [5, 10, 20] as const;
  return thresholds
    .map((threshold) => ({
      bucket: `top_${threshold}` as const,
      count: events.filter((event) => (event.reliabilityRank ?? Number.POSITIVE_INFINITY) <= threshold).length,
    }))
    .filter((entry) => entry.count > 0);
}
