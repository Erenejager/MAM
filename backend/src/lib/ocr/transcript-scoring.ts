const HIGH_VALUE_KEYWORDS = new Set([
  // Definitive match outcomes
  'champion', 'championship', 'victory', 'wins', 'winner', 'won',
  'final', 'knockout', 'submission', 'medal', 'trophy', 'title',
]);

const STANDARD_KEYWORDS = new Set([
  // Universal
  'goal', 'scores', 'scored', 'point',
  'save', 'saved', 'miss', 'missed', 'match', 'record',
  'defeat', 'defeated', 'finish', 'finished',
  // Periods
  'set', 'game', 'round', 'half', 'period', 'quarter', 'overtime',
  // Events
  'break', 'penalty', 'foul', 'card',
  'try', 'conversion', 'converts', 'converted',
  // Tennis
  'ace', 'serve', 'forehand', 'backhand', 'volley', 'deuce',
  'advantage', 'tiebreak', 'double', 'bagel',
  // Football
  'offside', 'corner', 'header', 'tackle', 'substitution',
  // Golf
  'birdie', 'eagle', 'bogey', 'hole', 'putt',
  // Racing
  'lap', 'overtake', 'pitstop', 'podium',
  // Combat
  'knockdown', 'takedown', 'clinch',
  // General action
  'incredible', 'amazing', 'brilliant', 'huge', 'unbelievable',
  'survives', 'survived', 'celebrates', 'celebration',
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
  keywordTimestamp: number | null;  // word-level timestamp from Whisper segment
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

    let matchedKeyword: string | null = null;
    let keywordTimestamp: number | null = null;
    let score = 0;

    // Check each segment individually to preserve word-level timestamp
    for (const seg of overlapping) {
      const words = seg.text.toLowerCase().split(/\s+/);
      for (const word of words) {
        const clean = word.replace(/^[^a-z]+|[^a-z]+$/g, '');
        if (HIGH_VALUE_KEYWORDS.has(clean)) {
          if (!matchedKeyword) {
            matchedKeyword = clean;
            keywordTimestamp = seg.start;
          }
          score = Math.min(1.0, score + 0.7);
        } else if (STANDARD_KEYWORDS.has(clean)) {
          if (!matchedKeyword) {
            matchedKeyword = clean;
            keywordTimestamp = seg.start;
          }
          score = Math.min(1.0, score + 0.3);
        }
      }
    }

    results.push({
      windowStart,
      windowEnd,
      transcriptScore: score,
      matchedKeyword,
      keywordTimestamp,
      transcriptText: overlapping.map((s) => s.text).join(' ').trim(),
    });
  }

  return results;
}
