export interface FrameScore {
  visible: boolean;
  sets: [number, number][] | null;
  game_score: string | null;
  serving: string | null;
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
  };
}

export function computeConsensus(_scores: FrameScore[]): FrameScore | null {
  throw new Error('Not implemented');
}

export function detectScoreDelta(_prev: FrameScore | null, _next: FrameScore | null): boolean {
  throw new Error('Not implemented');
}
