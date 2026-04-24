import type { MediaAnalysisResult, TranscriptSegment } from './types.js';
import { profileAsset } from './asset-profile.js';
import { buildTimelineIndex } from './timeline-index.js';
import { classifySegments } from './segment-classifier.js';
import { validateSegments } from './segment-validation.js';
import { generateInitialEvents } from './event-candidates.js';
import { validateAndNormalizeEvents } from './event-validation.js';
import { linkRelatedEvents } from './event-linking.js';
import { addScoreConfirmationEvidence } from './score-confirmation.js';
import { annotateEventReliability } from './event-reliability.js';
import { saveMediaAnalysisResult } from './storage.js';

export type { TranscriptSegment } from './types.js';
export type {
  AssetProfile,
  SegmentSpan,
  Event,
  TimelineIndex,
  MediaAnalysisResult,
} from './types.js';

export type MediaAnalysisProgress = (step: string, detail?: string) => void;

export async function runMediaAnalysisV2(
  videoPath: string,
  durationSeconds: number,
  transcriptSegments: TranscriptSegment[],
  assetDir: string,
  onProgress?: MediaAnalysisProgress,
): Promise<MediaAnalysisResult> {
  const progress = onProgress ?? (() => {});

  progress('asset-profile', 'profiling asset domain and format');
  const assetProfile = await profileAsset({
    videoPath,
    assetDir,
    durationSeconds,
    transcriptSegments,
  });

  progress('timeline-index', 'building dense timeline features');
  const timelineIndex = await buildTimelineIndex(
    videoPath,
    durationSeconds,
    transcriptSegments,
    5,
  );

  progress('segments', 'classifying content spans');
  const initialSegments = classifySegments(timelineIndex, assetProfile);

  progress('validate-segments', 'validating uncertain and high-impact spans');
  const segments = await validateSegments({
    videoPath,
    assetDir,
    assetProfile,
    timelineIndex,
    segments: initialSegments,
  });

  progress('events', 'generating initial event candidates');
  const candidateEvents = generateInitialEvents(assetProfile, timelineIndex, segments);

  progress('validate-events', 'validating and normalizing event candidates');
  const validatedEvents = validateAndNormalizeEvents(candidateEvents, {
    assetProfile,
    timelineIndex,
    segments,
  });

  progress('link-events', 'linking replay, commentary, and quote events to primary moments');
  const linkedEvents = linkRelatedEvents(validatedEvents, segments);

  progress('confirm-events', 'attaching optional score/OCR evidence');
  const confirmedEvents = await addScoreConfirmationEvidence(assetDir, linkedEvents);
  const events = annotateEventReliability(confirmedEvents);

  const result = {
    assetProfile,
    timelineIndex,
    segments,
    events,
  };

  progress('persist', 'saving media-analysis-v2 artifacts');
  await saveMediaAnalysisResult(assetDir, result);

  progress('done', `${segments.length} segments, ${events.length} events`);
  return result;
}
