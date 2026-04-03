const ACTION_KEYWORDS = new Set([
  'goal', 'scores', 'point', 'wins', 'winner', 'save', 'miss',
  'match', 'set', 'game', 'round', 'half', 'period', 'quarter',
  'break', 'penalty', 'foul', 'card', 'knockout', 'finish',
  'champion', 'victory', 'defeat', 'record', 'final', 'ace',
  'try', 'conversion', 'birdie', 'eagle', 'hole', 'lap',
]);

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface WindowScore {
  windowStart: number;
  windowEnd: number;
  transcriptScore: number;
  matchedKeyword: string | null;
  transcriptText: string;
}

export function scoreTranscript(
  segments: TranscriptSegment[],
  durationSeconds: number,
): WindowScore[] {
  const windowSize = 10;
  const windowCount = Math.ceil(durationSeconds / windowSize);
  const results: WindowScore[] = [];

  for (let i = 0; i < windowCount; i++) {
    const windowStart = i * windowSize;
    const windowEnd = Math.min(windowStart + windowSize, durationSeconds);

    const overlapping = segments.filter(
      (s) => s.end > windowStart && s.start < windowEnd,
    );
    const combinedText = overlapping.map((s) => s.text).join(' ').toLowerCase();
    const words = combinedText.split(/\s+/);

    let matchedKeyword: string | null = null;
    for (const word of words) {
      const clean = word.replace(/^[^a-z]+|[^a-z]+$/g, '');
      if (ACTION_KEYWORDS.has(clean)) {
        matchedKeyword = clean;
        break;
      }
    }

    results.push({
      windowStart,
      windowEnd,
      transcriptScore: matchedKeyword ? 1 : 0,
      matchedKeyword,
      transcriptText: overlapping.map((s) => s.text).join(' ').trim(),
    });
  }

  return results;
}
