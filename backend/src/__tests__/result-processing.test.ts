import { describe, it, expect } from 'vitest';
import { processResults, validateScoreProgression, normalizePlayerOrder } from '../lib/ocr/result-processing.js';
import type { VisionResult } from '../lib/ocr/vision-api.js';
import type { KeyMoment } from '../lib/ocr/result-processing.js';

function makeResult(overrides: Partial<VisionResult>): VisionResult {
  return {
    timestamp: 100,
    matchedKeyword: null,
    transcriptText: '',
    audioEnergy: 0.5,
    frame_scores: [null, null, null, null, null],
    consensus: null,
    score_changed: null,
    score_confidence: 'none',
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
  it('filters explicit replay when importance is null', () => {
    const result = processResults([
      makeResult({ frame_type: 'replay', score_changed: false, score_confidence: 'high', importance: null }),
    ]);
    expect(result.keyMoments).toHaveLength(0);
  });

  it('keeps explicit replay when importance is significant (real moment followed by replay)', () => {
    const result = processResults([
      makeResult({ frame_type: 'replay', score_changed: false, score_confidence: 'high', importance: 'significant' }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter celebration even with score_changed=false and high confidence', () => {
    const result = processResults([
      makeResult({ frame_type: 'live', score_changed: false, score_confidence: 'high' }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter close_up even with score_changed=false and high confidence', () => {
    const result = processResults([
      makeResult({ frame_type: 'live', score_changed: false, score_confidence: 'high' }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter live_play even with score_changed=false', () => {
    const result = processResults([
      makeResult({ frame_type: 'live', score_changed: false, score_confidence: 'high' }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter score_changed=false when score_confidence is low', () => {
    const result = processResults([
      makeResult({ frame_type: 'non_content', score_changed: false, score_confidence: 'low' }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
  });

  it('does NOT filter score_changed=false when importance is critical', () => {
    const result = processResults([
      makeResult({
        frame_type: 'non_content',
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
        frame_type: 'non_content',
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
        frame_type: 'non_content',
        score_changed: false,
        score_confidence: 'high',
        importance: null,
      }),
    ]);
    expect(result.keyMoments).toHaveLength(0);
  });
});

// ─── validateScoreProgression ────────────────────────────────────────────────

function makeKM(overrides: Partial<KeyMoment>): KeyMoment {
  return {
    timestamp: 0,
    label: 'test',
    score_display: null,
    sets: null,
    game_score: null,
    serving: null,
    moment_type: null,
    score_source: null,
    score_confidence: 'high',
    score_changed: null,
    frame_type: null,
    importance: null,
    set_period: null,
    game_time: null,
    transcript: '',
    audio_energy: 0,
    ...overrides,
  };
}

describe('validateScoreProgression — player-order flip', () => {
  it('replaces anchor instead of nulling when completed sets are a consistent player-order flip', () => {
    // This is the exact bug: 13:01 reads [[6,3],[5,2]] (flipped), later [[3,6],[1,1]] is correct
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 781, sets: [[6, 3], [5, 2]], score_confidence: 'low', score_display: '6-3, 5-2' }),
      makeKM({ timestamp: 900, sets: [[3, 6], [1, 1]], score_confidence: 'high', score_display: '3-6, 1-1' }),
      makeKM({ timestamp: 1000, sets: [[3, 6], [3, 2]], score_confidence: 'high', score_display: '3-6, 3-2' }),
    ];
    validateScoreProgression(moments);
    // The flip at 13:01 should update the anchor, not null subsequent scores
    expect(moments[1].sets).toEqual([[3, 6], [1, 1]]);
    expect(moments[2].sets).toEqual([[3, 6], [3, 2]]);
  });

  it('does not treat partial flip as player-order flip', () => {
    // [6,3] vs [4,3] is not a flip — different values entirely
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 100, sets: [[6, 3]], score_confidence: 'high', score_display: '6-3' }),
      makeKM({ timestamp: 200, sets: [[4, 3], [1, 0]], score_confidence: 'high', score_display: '4-3, 1-0' }),
    ];
    validateScoreProgression(moments);
    // [4,3] doesn't flip-match [6,3], so it should be nulled (completed set mismatch)
    expect(moments[1].sets).toBeNull();
  });
});

describe('validateScoreProgression — confidence-aware anchor', () => {
  it('high-confidence score replaces low-confidence anchor on completed-set mismatch', () => {
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 100, sets: [[6, 2], [3, 1]], score_confidence: 'low', score_display: '6-2, 3-1' }),
      makeKM({ timestamp: 200, sets: [[2, 6], [1, 3]], score_confidence: 'high', score_display: '2-6, 1-3' }),
    ];
    validateScoreProgression(moments);
    // High-conf replaces low-conf anchor (this is also a flip, two rules fire)
    expect(moments[1].sets).toEqual([[2, 6], [1, 3]]);
  });

  it('low-confidence score does NOT replace high-confidence anchor on non-flip mismatch', () => {
    // Anchor has 2 sets (so completedPrev is non-empty); new score contradicts completed set 1
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 100, sets: [[6, 3], [4, 2]], score_confidence: 'high' }),
      makeKM({ timestamp: 200, sets: [[5, 3], [2, 1]], score_confidence: 'low' }),
    ];
    validateScoreProgression(moments);
    // [5,3] is not a flip of [6,3] and current is low-conf → null
    expect(moments[1].sets).toBeNull();
  });

  it('low-confidence flip of high-confidence anchor is nulled — normalizePlayerOrder fixes it in the full pipeline', () => {
    // A low-conf flip can't prove it's a column-swap vs a hallucination.
    // validateScoreProgression nulls it; normalizePlayerOrder restores it if it's the majority.
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 100, sets: [[6, 3], [4, 2]], score_confidence: 'high' }),
      makeKM({ timestamp: 200, sets: [[3, 6], [2, 4]], score_confidence: 'low' }),
    ];
    validateScoreProgression(moments);
    expect(moments[1].sets).toBeNull();
  });

  it('low-confidence score sets anchor when no anchor exists yet', () => {
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 100, sets: [[3, 6]], score_confidence: 'low', score_display: '3-6' }),
      makeKM({ timestamp: 200, sets: [[3, 6], [1, 0]], score_confidence: 'low', score_display: '3-6, 1-0' }),
    ];
    validateScoreProgression(moments);
    // Both are valid progressions and should survive
    expect(moments[0].sets).toEqual([[3, 6]]);
    expect(moments[1].sets).toEqual([[3, 6], [1, 0]]);
  });
});

describe('validateScoreProgression — basic rules', () => {
  it('nulls scores where games decrease within the current set', () => {
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 100, sets: [[3, 2]], score_confidence: 'high' }),
      makeKM({ timestamp: 200, sets: [[1, 1]], score_confidence: 'high' }),
    ];
    validateScoreProgression(moments);
    expect(moments[1].sets).toBeNull();
  });

  it('allows set transition — new set games reset without being nulled', () => {
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 100, sets: [[6, 3]], score_confidence: 'high' }),          // Set 1 in progress
      makeKM({ timestamp: 200, sets: [[6, 3], [0, 0]], score_confidence: 'high' }),  // Set 2 starts at 0-0
      makeKM({ timestamp: 300, sets: [[6, 3], [2, 1]], score_confidence: 'high' }),  // Set 2 progresses
    ];
    validateScoreProgression(moments);
    expect(moments[0].sets).toEqual([[6, 3]]);
    expect(moments[1].sets).toEqual([[6, 3], [0, 0]]);
    expect(moments[2].sets).toEqual([[6, 3], [2, 1]]);
  });

  it('still nulls backward reads within Set 2 after transition', () => {
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 100, sets: [[6, 3], [3, 2]], score_confidence: 'high' }),  // Set 2 at 3-2
      makeKM({ timestamp: 200, sets: [[6, 3], [1, 0]], score_confidence: 'high' }),  // Set 2 going backward → null
    ];
    validateScoreProgression(moments);
    expect(moments[1].sets).toBeNull();
  });

  it('nulls impossible set (>13 games total)', () => {
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 100, sets: [[8, 7]], score_confidence: 'high' }),
    ];
    validateScoreProgression(moments);
    expect(moments[0].sets).toBeNull();
  });

  it('nulls completed set where winner has <6 games', () => {
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 100, sets: [[4, 2], [1, 0]], score_confidence: 'high' }),
    ];
    validateScoreProgression(moments);
    expect(moments[0].sets).toBeNull();
  });
});

describe('normalizePlayerOrder', () => {
  it('does nothing when all moments are in the same orientation', () => {
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 100, sets: [[6, 3], [2, 1]] }),
      makeKM({ timestamp: 200, sets: [[6, 3], [4, 2]] }),
      makeKM({ timestamp: 300, sets: [[6, 3], [5, 4]] }),
    ];
    normalizePlayerOrder(moments);
    expect(moments[0].sets).toEqual([[6, 3], [2, 1]]);
    expect(moments[1].sets).toEqual([[6, 3], [4, 2]]);
    expect(moments[2].sets).toEqual([[6, 3], [5, 4]]);
  });

  it('flips minority moments to match majority orientation', () => {
    // 3 moments in orientation A ([6,3]) vs 1 in orientation B ([3,6]) — B is minority
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 100, sets: [[6, 3], [1, 0]] }),
      makeKM({ timestamp: 200, sets: [[6, 3], [3, 2]] }),
      makeKM({ timestamp: 300, sets: [[6, 3], [5, 3]] }),
      makeKM({ timestamp: 400, sets: [[3, 6], [2, 1]] }), // minority — should be flipped
    ];
    normalizePlayerOrder(moments);
    expect(moments[3].sets).toEqual([[6, 3], [1, 2]]);
  });

  it('flips all A moments when B is the majority', () => {
    // The 86:26 scenario: anchor was correct [3,6] but a bad frame overwrote it.
    // After validation, most moments are in [3,6] — the one bad [6,3] was nulled.
    // Here we test the inverse: majority legitimately is [3,6], minority is [6,3].
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 100, sets: [[6, 3], [2, 1]] }), // wrong orientation — minority
      makeKM({ timestamp: 200, sets: [[3, 6], [1, 2]] }),
      makeKM({ timestamp: 300, sets: [[3, 6], [3, 4]] }),
      makeKM({ timestamp: 400, sets: [[3, 6], [4, 5]] }),
    ];
    normalizePlayerOrder(moments);
    expect(moments[0].sets).toEqual([[3, 6], [1, 2]]);
    expect(moments[1].sets).toEqual([[3, 6], [1, 2]]);
  });

  it('does nothing when fewer than 2 moments have completed sets', () => {
    const moments: KeyMoment[] = [
      makeKM({ timestamp: 100, sets: [[3, 2]] }), // only 1 set — no completed sets
      makeKM({ timestamp: 200, sets: [[6, 3], [2, 1]] }),
    ];
    normalizePlayerOrder(moments);
    // Not enough data to vote (only 1 moment with completed sets) — leave as-is
    expect(moments[0].sets).toEqual([[3, 2]]);
    expect(moments[1].sets).toEqual([[6, 3], [2, 1]]);
  });
});

describe('processResults — importance propagation', () => {
  it('carries importance from VisionResult through to KeyMoment', () => {
    const result = processResults([
      makeResult({ importance: 'critical', frame_type: 'live' }),
    ]);
    expect(result.keyMoments[0].importance).toBe('critical');
  });

  it('sets importance to null when VisionResult importance is null', () => {
    const result = processResults([
      makeResult({ importance: null, frame_type: 'live' }),
    ]);
    expect(result.keyMoments).toHaveLength(1);
    expect(result.keyMoments[0].importance).toBeNull();
  });
});
