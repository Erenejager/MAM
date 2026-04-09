import { describe, it, expect } from 'vitest';
import { processResults } from '../lib/ocr/result-processing.js';
import type { VisionResult } from '../lib/ocr/vision-api.js';

function makeResult(overrides: Partial<VisionResult>): VisionResult {
  return {
    timestamp: 100,
    matchedKeyword: null,
    transcriptText: '',
    audioEnergy: 0.5,
    frame_scores: [null, null, null],
    consensus: null,
    score_changed: null,
    score_confidence: 'none',
    sport: null,
    players: [],
    competition: null,
    frame_type: null,
    set_period: null,
    game_time: null,
    venue: null,
    broadcaster: null,
    event: 'Test event',
    importance: 'significant',
    ...overrides,
  };
}

describe('processResults — replay filter', () => {
  it('filters explicit replay frame_type regardless of score', () => {
    const result = processResults([
      makeResult({ frame_type: 'replay', score_changed: false, score_confidence: 'high' }),
    ]);
    expect(result.keyMoments).toHaveLength(0);
  });

  it('does NOT filter celebration even with score_changed=false and high confidence', () => {
    const result = processResults([
      makeResult({ frame_type: 'celebration', score_changed: false, score_confidence: 'high' }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter close_up even with score_changed=false and high confidence', () => {
    const result = processResults([
      makeResult({ frame_type: 'close_up', score_changed: false, score_confidence: 'high' }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter live_play even with score_changed=false', () => {
    const result = processResults([
      makeResult({ frame_type: 'live_play', score_changed: false, score_confidence: 'high' }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter score_changed=false when score_confidence is low', () => {
    const result = processResults([
      makeResult({ frame_type: 'other', score_changed: false, score_confidence: 'low' }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter score_changed=false when importance is critical', () => {
    const result = processResults([
      makeResult({
        frame_type: 'other',
        score_changed: false,
        score_confidence: 'high',
        importance: 'critical',
      }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter score_changed=false when importance is significant', () => {
    const result = processResults([
      makeResult({
        frame_type: 'other',
        score_changed: false,
        score_confidence: 'high',
        importance: 'significant',
      }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('filters probable replay via Tier 2: score_changed=false, high confidence, null importance, non-live frame', () => {
    const result = processResults([
      makeResult({
        frame_type: 'other',
        score_changed: false,
        score_confidence: 'high',
        importance: null,
      }),
    ]);
    expect(result.keyMoments).toHaveLength(0);
  });
});
