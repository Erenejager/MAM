import type { VisionResult } from './vision-api.js';

export interface KeyMoment {
  timestamp: number;
  label: string;
  score: string | null;
  set_period: string | null;
  game_time: string | null;
  transcript: string;
  audio_energy: number;
}

export interface OcrOutput {
  sport: string | null;
  competition: string | null;
  players: string[];
  keyMoments: KeyMoment[];
}

export function processResults(results: VisionResult[]): OcrOutput {
  if (results.length === 0) {
    return { sport: null, competition: null, players: [], keyMoments: [] };
  }

  const valid = results.filter(
    (r) => r.sport || r.score || r.players.length > 0 || r.event,
  );

  if (valid.length === 0) {
    return { sport: null, competition: null, players: [], keyMoments: [] };
  }

  const sport = mostFrequent(valid.map((r) => r.sport).filter(Boolean) as string[]);
  const competition = mostFrequent(
    valid.map((r) => r.competition).filter(Boolean) as string[],
  );

  const playerCounts = new Map<string, { count: number; original: string }>();
  for (const r of valid) {
    for (const p of r.players) {
      const key = p.toLowerCase().trim();
      const existing = playerCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        playerCounts.set(key, { count: 1, original: p });
      }
    }
  }
  const confirmedPlayers = [...playerCounts.values()]
    .filter((p) => p.count >= 3 || valid.length < 5)
    .map((p) => p.original);

  const consistent = sport
    ? valid.filter((r) => !r.sport || r.sport.toLowerCase() === sport.toLowerCase())
    : valid;

  const sorted = [...consistent].sort((a, b) => a.timestamp - b.timestamp);
  const chronoValid = validateChronology(sorted);

  const keyMoments: KeyMoment[] = [];
  for (const r of chronoValid) {
    const label = r.event ?? r.matchedKeyword ?? null;
    if (!label) continue;

    keyMoments.push({
      timestamp: r.timestamp,
      label: capitalizeFirst(label),
      score: r.score,
      set_period: r.set_period,
      game_time: r.game_time,
      transcript: r.transcriptText,
      audio_energy: r.audioEnergy,
    });
  }

  return { sport, competition, players: confirmedPlayers, keyMoments };
}

function mostFrequent(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v.toLowerCase().trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return values.find((v) => v.toLowerCase().trim() === best) ?? null;
}

function validateChronology(sorted: VisionResult[]): VisionResult[] {
  if (sorted.length <= 1) return sorted;

  const result: VisionResult[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];

    if (!curr.score || !prev.score) {
      result.push(curr);
      continue;
    }

    if (curr.set_period && prev.set_period && curr.set_period !== prev.set_period) {
      result.push(curr);
      continue;
    }

    const prevSum = digitSum(prev.score);
    const currSum = digitSum(curr.score);

    if (currSum >= prevSum) {
      result.push(curr);
    }
  }

  return result;
}

function digitSum(score: string): number {
  const digits = score.match(/\d+/g);
  if (!digits) return 0;
  return digits.reduce((sum, d) => sum + parseInt(d, 10), 0);
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
