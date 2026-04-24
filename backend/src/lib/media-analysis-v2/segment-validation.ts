import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { callGemini } from '../ocr/vision-api.js';
import { extractFrameJpeg } from './video-utils.js';
import type { AssetProfile, SegmentSpan, TimelineIndex } from './types.js';

interface ValidationInput {
  videoPath: string;
  assetDir: string;
  assetProfile: AssetProfile;
  timelineIndex: TimelineIndex;
  segments: SegmentSpan[];
}

const SEGMENT_VALIDATION_PROMPT = `You are validating a media segment classification.
Return JSON only:
{
  "type": "live_play|replay|commentator_insert|sideline_report|player_interview|press_conference|studio_analysis|graphics_only|crowd|unknown",
  "subtype": "short subtype or null",
  "speechMode": "commentary|interview_answer|question|reporter_monologue|ambient|null",
  "scoreboardPresent": true,
  "confidence": 0.0,
  "reason": "short explanation"
}

Choose the best segment type based on the representative frames and transcript excerpt.`;

export async function validateSegments(
  input: ValidationInput,
): Promise<SegmentSpan[]> {
  const { videoPath, assetDir, assetProfile, timelineIndex, segments } = input;
  const tempDir = resolve(assetDir, 'media_analysis_v2_temp', 'segment_validation');
  await mkdir(tempDir, { recursive: true });

  try {
    const validated = await Promise.all(
      segments.map(async (segment) => {
        if (!shouldValidateSegment(segment, assetProfile)) {
          return segment;
        }

        const result = await validateOneSegment(
          videoPath,
          tempDir,
          timelineIndex,
          segment,
        );

        return result ?? segment;
      }),
    );

    return mergeAdjacentSegments(validated);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function shouldValidateSegment(segment: SegmentSpan, assetProfile: AssetProfile): boolean {
  if (segment.confidence < 0.7) return true;
  if (segment.type === 'commentator_insert') {
    return assetProfile.format === 'mixed_broadcast' || assetProfile.format === 'unknown';
  }
  if (segment.type === 'player_interview') {
    return assetProfile.format !== 'live_match';
  }
  if (segment.type === 'replay') return true;
  if (segment.type === 'unknown') return true;
  if (assetProfile.format === 'mixed_broadcast' && segment.type === 'live_play') return true;
  return false;
}

async function validateOneSegment(
  videoPath: string,
  tempDir: string,
  timelineIndex: TimelineIndex,
  segment: SegmentSpan,
): Promise<SegmentSpan | null> {
  const sampleTimes = buildSegmentSampleTimes(segment);
  const imageParts: Array<{ mimeType: string; data: string }> = [];

  for (const [index, time] of sampleTimes.entries()) {
    const framePath = resolve(tempDir, `${segment.id}_${index}.jpg`);
    await extractFrameJpeg(videoPath, time, framePath, 360);
    const buf = await readFile(framePath);
    imageParts.push({ mimeType: 'image/jpeg', data: buf.toString('base64') });
  }

  const transcriptExcerpt = segment.sourceWindowIndexes
    .map((windowIndex) => timelineIndex.windows.find((window) => window.index === windowIndex)?.transcriptText ?? '')
    .filter(Boolean)
    .join(' ')
    .slice(0, 2000);

  const prompt = `${SEGMENT_VALIDATION_PROMPT}

Current guess:
- type: ${segment.type}
- subtype: ${segment.subtype ?? 'null'}
- speechMode: ${segment.speechMode ?? 'null'}
- confidence: ${segment.confidence}

Transcript excerpt:
${transcriptExcerpt || 'No transcript available.'}`;

  try {
    const parsed = await callGemini(prompt, imageParts);
    if (!parsed) return null;

    const nextType = typeof parsed.type === 'string' ? parsed.type : segment.type;
    const nextSubtype = typeof parsed.subtype === 'string' && parsed.subtype !== 'null'
      ? parsed.subtype
      : null;
    const nextSpeechMode = typeof parsed.speechMode === 'string' && parsed.speechMode !== 'null'
      ? parsed.speechMode as SegmentSpan['speechMode']
      : null;
    const nextConfidence = typeof parsed.confidence === 'number'
      ? Math.max(segment.confidence, Math.min(parsed.confidence, 0.98))
      : segment.confidence;

    return {
      ...segment,
      type: nextType as SegmentSpan['type'],
      subtype: nextSubtype,
      speechMode: nextSpeechMode,
      scoreboardPresent: typeof parsed.scoreboardPresent === 'boolean'
        ? parsed.scoreboardPresent
        : segment.scoreboardPresent,
      confidence: nextConfidence,
      evidence: [
        ...segment.evidence,
        {
          type: 'vision',
          ref: `segment-validation:${segment.id}`,
          confidence: nextConfidence,
          note: typeof parsed.reason === 'string' ? parsed.reason : undefined,
        },
      ],
    };
  } catch {
    return null;
  }
}

function buildSegmentSampleTimes(segment: SegmentSpan): number[] {
  const midpoint = (segment.start + segment.end) / 2;
  if (segment.end - segment.start <= 6) {
    return [Math.max(0, midpoint)];
  }
  return [
    Math.max(0, segment.start + 1),
    Math.max(0, midpoint),
    Math.max(0, segment.end - 1),
  ];
}

export function mergeAdjacentSegments(segments: SegmentSpan[]): SegmentSpan[] {
  if (segments.length <= 1) return segments;

  const merged: SegmentSpan[] = [segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const current = segments[i];
    const previous = merged[merged.length - 1];

    if (
      previous.type === current.type &&
      previous.subtype === current.subtype &&
      previous.speechMode === current.speechMode &&
      previous.scoreboardPresent === current.scoreboardPresent &&
      Math.abs(previous.end - current.start) < 0.001
    ) {
      merged[merged.length - 1] = {
        ...previous,
        end: current.end,
        confidence: (previous.confidence + current.confidence) / 2,
        sourceWindowIndexes: [...previous.sourceWindowIndexes, ...current.sourceWindowIndexes],
        evidence: [...previous.evidence, ...current.evidence],
      };
      continue;
    }

    merged.push(current);
  }

  return merged;
}
