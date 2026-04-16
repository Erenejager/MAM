export interface FrameScore {
  visible: boolean;
  sets: [number, number][] | null;
  game_score: string | null;
  serving: string | null;
  score_text: string | null;  // non-tennis: e.g. "PSG 2 - 1 Marseille"
}

export function parseOneFrameScore(raw: unknown): FrameScore | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const visible = obj.visible === true;
  let sets: [number, number][] | null = null;

  if (Array.isArray(obj.sets)) {
    const parsed: [number, number][] = [];
    for (const s of obj.sets) {
      if (Array.isArray(s) && s.length === 2 && typeof s[0] === 'number' && typeof s[1] === 'number') {
        parsed.push([s[0], s[1]]);
      }
    }
    sets = parsed.length > 0 ? parsed : null;
  }

  return {
    visible,
    sets,
    game_score: typeof obj.game_score === 'string' ? obj.game_score : null,
    serving: typeof obj.serving === 'string' ? obj.serving : null,
    score_text: typeof obj.score_text === 'string' ? obj.score_text : null,
  };
}

export interface ConsensusResult {
  consensus: FrameScore | null;
  score_confidence: 'high' | 'low' | 'none';
}

function isReadable(fs: FrameScore | null): fs is FrameScore {
  return fs !== null && fs.visible && (fs.sets !== null || fs.score_text !== null);
}

export function computeConsensus(
  frames: [FrameScore | null, FrameScore | null, FrameScore | null, FrameScore | null, FrameScore | null],
): ConsensusResult {
  const pool = frames.filter(isReadable);

  if (pool.length === 0) {
    return { consensus: null, score_confidence: 'none' };
  }

  if (pool.length === 1) {
    return { consensus: pool[0], score_confidence: 'low' };
  }

  // Majority vote on sets — group frames by their sets value and find the most common.
  // This prevents one hallucinated frame from overriding correct ones.
  const groups = new Map<string, { count: number; frame: FrameScore }>();
  for (const f of pool) {
    const key = JSON.stringify(f.sets);
    const existing = groups.get(key);
    if (existing) existing.count++;
    else groups.set(key, { count: 1, frame: f });
  }

  // Pick the group with the most votes; on a tie prefer the one with more sets entries
  // (more complete scoreboard read) and then later frames (last in pool).
  let best: { count: number; frame: FrameScore } | null = null;
  for (const g of groups.values()) {
    if (
      !best ||
      g.count > best.count ||
      (g.count === best.count &&
        (g.frame.sets?.length ?? 0) > (best.frame.sets?.length ?? 0))
    ) {
      best = g;
    }
  }

  const majority = best!;
  // High confidence: 2+ frames agree. Low: all frames disagree (every frame different).
  const score_confidence: ConsensusResult['score_confidence'] =
    majority.count >= 2 ? 'high' : 'low';

  // For game_score and serving, pick the last matching frame
  // (post-point frames have the most stable scoreboard).
  const matchingFrames = pool.filter(
    (f) => JSON.stringify(f.sets) === JSON.stringify(majority.frame.sets),
  );
  const representative = matchingFrames[matchingFrames.length - 1];

  return { consensus: representative, score_confidence };
}

function setsEqual(a: [number, number][] | null, b: [number, number][] | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (a.length !== b.length) return false;
  return a.every((set, i) => set[0] === b[i][0] && set[1] === b[i][1]);
}

export function detectScoreDelta(
  before: FrameScore | null,
  after: FrameScore | null,
): boolean | null {
  if (!isReadable(before) || !isReadable(after)) return null;
  const setsChanged = !setsEqual(before.sets, after.sets);
  const gameScoreChanged = before.game_score !== after.game_score;
  const scoreTextChanged = before.score_text !== after.score_text;
  return setsChanged || gameScoreChanged || scoreTextChanged;
}
