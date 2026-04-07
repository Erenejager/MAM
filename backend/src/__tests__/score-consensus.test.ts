import { describe, it, expect } from 'vitest';
import { parseOneFrameScore, computeConsensus, detectScoreDelta } from '../lib/ocr/score-consensus.js';

describe('parseOneFrameScore', () => {
  it('returns structured score when visible with valid sets', () => {
    const raw = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner' };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({
      visible: true,
      sets: [[6, 3], [5, 2]],
      game_score: '40-15',
      serving: 'Sinner',
    });
  });

  it('returns null sets when visible is false', () => {
    const raw = { visible: false, sets: null, game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({ visible: false, sets: null, game_score: null, serving: null });
  });

  it('returns null sets when sets array is invalid', () => {
    const raw = { visible: true, sets: 'garbage', game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({ visible: true, sets: null, game_score: null, serving: null });
  });

  it('filters out invalid set entries', () => {
    const raw = { visible: true, sets: [[6, 3], 'bad', [5, 2]], game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({ visible: true, sets: [[6, 3], [5, 2]], game_score: null, serving: null });
  });

  it('returns null sets when sets array is empty after filtering', () => {
    const raw = { visible: true, sets: ['bad', 'worse'], game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({ visible: true, sets: null, game_score: null, serving: null });
  });

  it('handles null input gracefully', () => {
    const result = parseOneFrameScore(null);
    expect(result).toBeNull();
  });

  it('handles undefined input gracefully', () => {
    const result = parseOneFrameScore(undefined);
    expect(result).toBeNull();
  });
});
