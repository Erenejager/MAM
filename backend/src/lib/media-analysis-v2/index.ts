import type { MediaAnalysisResult, TranscriptSegment } from './types.js';
import { profileAsset } from './asset-profile.js';
import { buildTimelineIndex } from './timeline-index.js';
import { buildAudioPeakIndex } from './audio-peaks.js';
import { classifySegments } from './segment-classifier.js';
import { validateSegments } from './segment-validation.js';
import { generateInitialEvents } from './event-candidates.js';
import { validateAndNormalizeEvents } from './event-validation.js';
import { linkRelatedEvents } from './event-linking.js';
import { addScoreConfirmationEvidence } from './score-confirmation.js';
import { addAudioPeakEvidence } from './audio-evidence.js';
import { annotateEventReliability } from './event-reliability.js';
import { buildAudioReactionEpisodes } from './audio-reaction-episodes.js';
import { buildCandidateWindowPackets } from './candidate-windows.js';
import { saveMediaAnalysisResult } from './storage.js';

export type { TranscriptSegment } from './types.js';
export type {
  AssetProfile,
  SegmentSpan,
  Event,
  TimelineIndex,
  MediaAnalysisResult,
  AudioPeak,
  AudioReactionEpisode,
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

  progress('audio-peaks', 'building local audio peak index');
  const audioPeaks = buildAudioPeakIndex(timelineIndex);

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
  const candidateEvents = generateInitialEvents(assetProfile, timelineIndex, segments, audioPeaks);

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

  progress('audio-evidence', 'attaching nearby audio peak evidence');
  const audioSupportedEvents = addAudioPeakEvidence(confirmedEvents, audioPeaks);
  const events = annotateEventReliability(audioSupportedEvents);

  progress('candidate-windows', 'building LLM-ready candidate window packets');
  const candidateWindows = buildCandidateWindowPackets(timelineIndex, segments, audioPeaks, events);

  progress('audio-reaction-episodes', 'grouping candidate audio peaks into reaction episodes');
  const audioReactionEpisodes = buildAudioReactionEpisodes(audioPeaks, candidateWindows);

  const { audioProfile, ...storedTimelineIndex } = timelineIndex;
  const result = {
    assetProfile,
    timelineIndex: storedTimelineIndex,
    audioProfile,
    audioPeaks,
    audioReactionEpisodes,
    candidateWindows,
    segments,
    events,
  };

  progress('persist', 'saving media-analysis-v2 artifacts');
  await saveMediaAnalysisResult(assetDir, result);

  progress('done', `${segments.length} segments, ${events.length} events`);
  return result;
}
