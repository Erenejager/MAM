import { describe, it, expect } from 'vitest';
import { parseOneFrameScore, computeConsensus, detectScoreDelta, type FrameScore } from '../lib/ocr/score-consensus.js';

describe('parseOneFrameScore', () => {
  it('returns structured score when visible with valid sets', () => {
    const raw = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner' };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({
      visible: true,
      sets: [[6, 3], [5, 2]],
      game_score: '40-15',
      serving: 'Sinner',
      score_text: null,
    });
  });

  it('returns null sets when visible is false', () => {
    const raw = { visible: false, sets: null, game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({ visible: false, sets: null, game_score: null, serving: null, score_text: null });
  });

  it('returns null sets when sets array is invalid', () => {
    const raw = { visible: true, sets: 'garbage', game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({ visible: true, sets: null, game_score: null, serving: null, score_text: null });
  });

  it('filters out invalid set entries', () => {
    const raw = { visible: true, sets: [[6, 3], 'bad', [5, 2]], game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({ visible: true, sets: [[6, 3], [5, 2]], game_score: null, serving: null, score_text: null });
  });

  it('returns null sets when sets array is empty after filtering', () => {
    const raw = { visible: true, sets: ['bad', 'worse'], game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({ visible: true, sets: null, game_score: null, serving: null, score_text: null });
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

describe('computeConsensus', () => {
  it('returns NONE confidence when no frames are readable', () => {
    const frames: [FrameScore | null, FrameScore | null, FrameScore | null] = [
      { visible: false, sets: null, game_score: null, serving: null, score_text: null },
      null,
      { visible: false, sets: null, game_score: null, serving: null, score_text: null },
    ];
    const result = computeConsensus(frames);
    expect(result.consensus).toBeNull();
    expect(result.score_confidence).toBe('none');
  });

  it('returns LOW confidence when only 1 frame is readable', () => {
    const frames: [FrameScore | null, FrameScore | null, FrameScore | null] = [
      null,
      { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner', score_text: null },
      { visible: false, sets: null, game_score: null, serving: null, score_text: null },
    ];
    const result = computeConsensus(frames);
    expect(result.consensus?.sets).toEqual([[6, 3], [5, 2]]);
    expect(result.score_confidence).toBe('low');
  });

  it('returns HIGH confidence when 2+ frames are readable, prefers AFTER', () => {
    const before: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner', score_text: null };
    const after: FrameScore = { visible: true, sets: [[6, 3], [5, 3]], game_score: null, serving: null, score_text: null };
    const frames: [FrameScore | null, FrameScore | null, FrameScore | null] = [before, null, after];
    const result = computeConsensus(frames);
    expect(result.consensus?.sets).toEqual([[6, 3], [5, 3]]);
    expect(result.score_confidence).toBe('high');
  });

  it('returns HIGH confidence when all 3 are readable, prefers AFTER', () => {
    const before: FrameScore = { visible: true, sets: [[6, 3], [4, 2]], game_score: '30-0', serving: 'Sinner', score_text: null };
    const during: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner', score_text: null };
    const after: FrameScore = { visible: true, sets: [[6, 3], [5, 3]], game_score: null, serving: null, score_text: null };
    const frames: [FrameScore | null, FrameScore | null, FrameScore | null] = [before, during, after];
    const result = computeConsensus(frames);
    expect(result.consensus?.sets).toEqual([[6, 3], [5, 3]]);
    expect(result.score_confidence).toBe('high');
  });

  it('prefers DURING when AFTER is not readable', () => {
    const before: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner', score_text: null };
    const during: FrameScore = { visible: true, sets: [[6, 3], [5, 3]], game_score: null, serving: null, score_text: null };
    const frames: [FrameScore | null, FrameScore | null, FrameScore | null] = [before, during, null];
    const result = computeConsensus(frames);
    expect(result.consensus?.sets).toEqual([[6, 3], [5, 3]]);
    expect(result.score_confidence).toBe('high');
  });
});

describe('detectScoreDelta', () => {
  it('returns true when BEFORE and AFTER scores differ', () => {
    const before: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner', score_text: null };
    const after: FrameScore = { visible: true, sets: [[6, 3], [5, 3]], game_score: null, serving: null, score_text: null };
    expect(detectScoreDelta(before, after)).toBe(true);
  });

  it('returns false when BEFORE and AFTER scores are the same', () => {
    const before: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner', score_text: null };
    const after: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner', score_text: null };
    expect(detectScoreDelta(before, after)).toBe(false);
  });

  it('returns null when BEFORE is not readable', () => {
    const after: FrameScore = { visible: true, sets: [[6, 3], [5, 3]], game_score: null, serving: null, score_text: null };
    expect(detectScoreDelta(null, after)).toBeNull();
  });

  it('returns null when AFTER is not readable', () => {
    const before: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner', score_text: null };
    expect(detectScoreDelta(before, null)).toBeNull();
  });

  it('returns null when both are not readable', () => {
    expect(detectScoreDelta(null, null)).toBeNull();
  });

  it('detects game_score change even when sets are the same', () => {
    const before: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '30-15', serving: 'Sinner', score_text: null };
    const after: FrameScore = { visible: true, sets: [[6, 3], [5, 2]], game_score: '40-15', serving: 'Sinner', score_text: null };
    expect(detectScoreDelta(before, after)).toBe(true);
  });

  it('detects score_text change for non-tennis sports', () => {
    const before: FrameScore = { visible: true, sets: null, game_score: null, serving: null, score_text: 'Team A 0 - 0 Team B' };
    const after: FrameScore = { visible: true, sets: null, game_score: null, serving: null, score_text: 'Team A 1 - 0 Team B' };
    expect(detectScoreDelta(before, after)).toBe(true);
  });

  it('returns false when score_text is identical for non-tennis sports', () => {
    const before: FrameScore = { visible: true, sets: null, game_score: null, serving: null, score_text: 'Team A 1 - 0 Team B' };
    const after: FrameScore = { visible: true, sets: null, game_score: null, serving: null, score_text: 'Team A 1 - 0 Team B' };
    expect(detectScoreDelta(before, after)).toBe(false);
  });
});

describe('parseOneFrameScore — non-tennis score_text', () => {
  it('captures score_text for non-tennis sports', () => {
    const raw = { visible: true, score_text: 'PSG 2 - 1 Marseille', sets: null, game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result).toEqual({
      visible: true,
      sets: null,
      game_score: null,
      serving: null,
      score_text: 'PSG 2 - 1 Marseille',
    });
  });

  it('returns score_text: null when field is absent', () => {
    const raw = { visible: true, sets: [[6, 3]], game_score: null, serving: null };
    const result = parseOneFrameScore(raw);
    expect(result?.score_text).toBeNull();
  });
});

describe('computeConsensus — non-tennis readable check', () => {
  it('treats frame as readable when score_text is present even without sets', () => {
    const frame: FrameScore = {
      visible: true,
      sets: null,
      game_score: null,
      serving: null,
      score_text: 'Team A 1 - 0 Team B',
    };
    const result = computeConsensus([frame, null, null]);
    expect(result.score_confidence).toBe('low'); // only 1 readable frame
    expect(result.consensus?.score_text).toBe('Team A 1 - 0 Team B');
  });

  it('returns HIGH confidence for 2 non-tennis readable frames', () => {
    const frame: FrameScore = {
      visible: true, sets: null, game_score: null, serving: null,
      score_text: 'Team A 2 - 0 Team B',
    };
    const result = computeConsensus([frame, null, frame]);
    expect(result.score_confidence).toBe('high');
  });
});
