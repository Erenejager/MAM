import type { TimelineIndex, TimelineWindow, TranscriptSegment } from './types.js';
import { computeWindowedAudioEnergy } from './video-utils.js';
import { hasScoreCue } from './sports-keywords.js';

const INTERVIEW_CUES = [
  'interview',
  'speaking to',
  'joins us',
  'joined by',
  'how does it feel',
  'tell us',
  'you said',
  'question',
  'answer',
];

const COMMENTARY_CUES = [
  'looking at',
  'back underway',
  'what a',
  'here we go',
  'live pictures',
  'from the sideline',
  'on the touchline',
  'let us look',
];

const REPLAY_CUES = [
  'replay',
  'take another look',
  'let us see that again',
  'again here',
  'slow motion',
];

export async function buildTimelineIndex(
  videoPath: string,
  durationSeconds: number,
  transcriptSegments: TranscriptSegment[],
  windowSize = 5,
): Promise<TimelineIndex> {
  const audioEnergies = await computeWindowedAudioEnergy(videoPath, durationSeconds, windowSize);
  const windowCount = Math.ceil(durationSeconds / windowSize);
  const windows: TimelineWindow[] = [];

  for (let i = 0; i < windowCount; i++) {
    const start = i * windowSize;
    const end = Math.min(durationSeconds, start + windowSize);
    const overlapping = transcriptSegments.filter((segment) => segment.end > start && segment.start < end);
    const transcriptText = overlapping.map((segment) => segment.text.trim()).join(' ').trim();
    const normalizedText = transcriptText.toLowerCase();
    const speechSeconds = overlapping.reduce((sum, segment) => {
      const overlapStart = Math.max(start, segment.start);
      const overlapEnd = Math.min(end, segment.end);
      return sum + Math.max(0, overlapEnd - overlapStart);
    }, 0);

    windows.push({
      index: i,
      start,
      end,
      transcriptText,
      transcriptSegments: overlapping,
      speechDensity: speechSeconds / Math.max(1, end - start),
      audioEnergy: audioEnergies[i] ?? 0,
      hasQuestionCue: normalizedText.includes('?'),
      hasInterviewCue: includesAny(normalizedText, INTERVIEW_CUES),
      hasCommentaryCue: includesAny(normalizedText, COMMENTARY_CUES),
      hasReplayCue: includesAny(normalizedText, REPLAY_CUES),
      hasScoreCue: hasScoreCue(normalizedText),
    });
  }

  return { windowSize, windows };
}

function includesAny(text: string, cues: string[]): boolean {
  return cues.some((cue) => text.includes(cue));
}
