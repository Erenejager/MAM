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

describe('scoreTranscript — keyword tiers', () => {
  it('scores a high-value keyword at 0.7', () => {
    const segments: TranscriptSegment[] = [
      { start: 1.0, end: 4.0, text: 'Alcaraz is the champion' },
    ];
    const results = scoreTranscript(segments, 10);
    expect(results[0].transcriptScore).toBeCloseTo(0.7);
    expect(results[0].matchedKeyword).toBe('champion');
  });

  it('scores a standard keyword at 0.3', () => {
    const segments: TranscriptSegment[] = [
      { start: 1.0, end: 4.0, text: 'he hits an ace' },
    ];
    const results = scoreTranscript(segments, 10);
    expect(results[0].transcriptScore).toBeCloseTo(0.3);
    expect(results[0].matchedKeyword).toBe('ace');
  });

  it('accumulates multiple standard keywords and does not exceed 1.0', () => {
    const segments: TranscriptSegment[] = [
      { start: 1.0, end: 9.0, text: 'incredible amazing brilliant play' },
    ];
    const results = scoreTranscript(segments, 10);
    // 3 standard keywords: 0.3 + 0.3 + 0.3 = 0.9
    expect(results[0].transcriptScore).toBeCloseTo(0.9);
  });

  it('caps score at 1.0', () => {
    const segments: TranscriptSegment[] = [
      { start: 1.0, end: 9.0, text: 'incredible amazing brilliant champion victory' },
    ];
    const results = scoreTranscript(segments, 10);
    expect(results[0].transcriptScore).toBeCloseTo(1.0);
  });

  it('no keyword window still scores 0', () => {
    const segments: TranscriptSegment[] = [
      { start: 0, end: 5, text: 'the ball rolls slowly across the grass' },
    ];
    const results = scoreTranscript(segments, 10);
    expect(results[0].transcriptScore).toBe(0);
    expect(results[0].matchedKeyword).toBeNull();
  });
});
