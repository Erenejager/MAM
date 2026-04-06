import { describe, it, expect } from 'vitest';
import { scoreTranscript, type TranscriptSegment } from '../lib/ocr/transcript-scoring.js';

describe('scoreTranscript', () => {
  it('returns keywordTimestamp from the segment containing the matched keyword', () => {
    const segments: TranscriptSegment[] = [
      { start: 2.1, end: 4.5, text: 'and he hits an ace' },
      { start: 5.0, end: 8.0, text: 'the crowd goes wild' },
    ];

    const results = scoreTranscript(segments, 20);

    // The keyword "ace" is in the segment starting at 2.1s, which falls in window [0, 10)
    const window0 = results[0];
    expect(window0.matchedKeyword).toBe('ace');
    expect(window0.keywordTimestamp).toBe(2.1);
  });

  it('returns null keywordTimestamp when no keyword matched', () => {
    const segments: TranscriptSegment[] = [
      { start: 0, end: 5, text: 'nothing interesting happening here' },
    ];

    const results = scoreTranscript(segments, 10);
    expect(results[0].matchedKeyword).toBeNull();
    expect(results[0].keywordTimestamp).toBeNull();
  });

  it('uses the earliest keyword-bearing segment when multiple keywords exist in a window', () => {
    const segments: TranscriptSegment[] = [
      { start: 1.0, end: 3.0, text: 'what an incredible shot' },
      { start: 4.0, end: 6.0, text: 'amazing goal by the striker' },
    ];

    const results = scoreTranscript(segments, 10);
    // "incredible" is found first in iteration, and its segment starts at 1.0
    expect(results[0].keywordTimestamp).toBe(1.0);
  });
});
