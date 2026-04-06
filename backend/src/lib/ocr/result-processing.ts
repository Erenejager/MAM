import { GoogleGenerativeAI } from '@google/generative-ai';
import type { VisionResult } from './vision-api.js';

export interface KeyMoment {
  timestamp: number;
  label: string;
  score: string | null;
  set_period: string | null;
  game_time: string | null;
  transcript: string;
  audio_energy: number;
  startTime?: number;
  endTime?: number;
  peakTime?: number;
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

  // Filter out routine and filler moments — keep only critical + significant
  // If no importance was classified, keep it (backward compat with old results)
  const meaningful = chronoValid.filter(
    (r) => !r.importance || r.importance === 'critical' || r.importance === 'significant',
  );

  // Filter out slow-mo replays — all overlay fields are N/A when no scoreboard is visible
  const noReplays = meaningful.filter((r) => {
    const isReplay =
      r.score?.toLowerCase() === 'n/a' &&
      r.set_period?.toLowerCase() === 'n/a' &&
      r.game_time?.toLowerCase() === 'n/a';
    if (isReplay) console.log(`[ocr] Filtered replay at ${Math.floor(r.timestamp / 60)}:${String(Math.floor(r.timestamp % 60)).padStart(2, '0')}`);
    return !isReplay;
  });

  const keyMoments: KeyMoment[] = [];
  for (const r of noReplays) {
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
  // For MVP, keep all chronologically sorted moments.
  // Score progression validation is too fragile across sports
  // (tennis scores reset per game, football extra time, etc.)
  return sorted;
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Plan C: LLM curation pass ──────────────────────────────────────────────

export async function curateKeyMoments(output: OcrOutput): Promise<OcrOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || output.keyMoments.length === 0) return output;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const momentsList = output.keyMoments.map((m, i) => {
    const time = `${Math.floor(m.timestamp / 60)}:${String(Math.floor(m.timestamp % 60)).padStart(2, '0')}`;
    const prevScore = i > 0 ? output.keyMoments[i - 1].score : null;
    const scoreChanged = prevScore && m.score && prevScore !== m.score;
    const scorePart = m.score
      ? scoreChanged
        ? ` | Score: ${prevScore} → ${m.score}`
        : ` | Score: ${m.score} (unchanged)`
      : '';
    return `[${time}] ${m.label}${scorePart}${m.set_period ? ` | ${m.set_period}` : ''}`;
  }).join('\n');

  const prompt = `You are curating a highlight timeline for a ${output.sport ?? 'sports'} match.
${output.players.length > 0 ? `Players: ${output.players.join(' vs ')}` : ''}
${output.competition ? `Competition: ${output.competition}` : ''}

Here are ${output.keyMoments.length} candidate moments:

${momentsList}

YOUR JOB:
1. Remove duplicates and near-duplicates (same event described differently, moments seconds apart covering the same thing)
2. Remove moments that are NOT fan-worthy — routine holds, generic "match in progress", replays of non-critical moments
3. Moments where the score is UNCHANGED are less likely to be important — scrutinize them harder. They may be replays, celebrations, or non-scoring events. Don't auto-remove them (a spectacular rally that doesn't change the score IS worth keeping) but raise the bar.
4. KEEP: decisive moments (set/match won, break of serve, goals, turning points), spectacular plays, momentum shifts, match conclusion
5. For each kept moment, rewrite the label to be SHORT (max 10-12 words) but specific. Include WHO did WHAT.
   - BAD: "Carlos Alcaraz wins a crucial point, bringing the score from Advantage Djokovic to Deuce"
   - GOOD: "Alcaraz saves break point, back to deuce"
   - BAD: "Novak Djokovic wins the match against Carlos Alcaraz"
   - GOOD: "Djokovic wins match 6-3, 6-2"
6. Keep the score and set_period from the original if available
7. Aim for 10-20 moments for a full match, fewer for shorter content

Return JSON array only — no markdown, no explanation:
[
  { "timestamp_str": "M:SS", "label": "short label", "score": "score or null", "set_period": "period or null" }
]`;

  try {
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await model.generateContent([prompt]);
        break;
      } catch (err: unknown) {
        const is429 = err instanceof Error && err.message.includes('429');
        if (!is429 || attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }

    if (!response) return output;

    const text = response.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return output;

    const curated = JSON.parse(jsonMatch[0]) as Array<{
      timestamp_str: string;
      label: string;
      score: string | null;
      set_period: string | null;
    }>;

    if (!Array.isArray(curated) || curated.length === 0) return output;

    // Map curated labels back to original moments by matching timestamps
    const curatedMoments: KeyMoment[] = [];
    for (const c of curated) {
      const parts = c.timestamp_str.split(':').map(Number);
      const targetSec = (parts[0] ?? 0) * 60 + (parts[1] ?? 0);

      // Find closest original moment within 30s
      let best: KeyMoment | null = null;
      let bestDist = 30;
      for (const m of output.keyMoments) {
        const dist = Math.abs(m.timestamp - targetSec);
        if (dist < bestDist) {
          bestDist = dist;
          best = m;
        }
      }

      if (best) {
        curatedMoments.push({
          ...best,
          label: c.label,
          score: c.score ?? best.score,
          set_period: c.set_period ?? best.set_period,
        });
      }
    }

    console.log(`[ocr] Curated: ${output.keyMoments.length} → ${curatedMoments.length} moments`);
    return { ...output, keyMoments: curatedMoments };
  } catch (err) {
    console.error('[ocr] Curation pass failed, using uncurated results:', err);
    return output;
  }
}
