import { GoogleGenerativeAI } from '@google/generative-ai';
import type { VisionResult } from './vision-api.js';

export interface KeyMoment {
  timestamp: number;
  label: string;
  score_display: string | null;
  sets: [number, number][] | null;
  game_score: string | null;
  serving: string | null;
  moment_type: string | null;
  score_source: 'visible' | 'interpolated' | null;
  score_confidence: 'high' | 'low' | 'none';
  score_changed: boolean | null;
  frame_type: string | null;
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
  enriched?: boolean;
}

export function processResults(
  results: VisionResult[],
  matchCtx?: { sport: string | null; players: string[]; competition: string | null },
): OcrOutput {
  // Use matchCtx as authoritative source for sport/players/competition
  // (identifyMatch is the dedicated pass for this; analyzeWithScores doesn't return them)
  const sport = matchCtx?.sport ?? null;
  const competition = matchCtx?.competition ?? null;
  const confirmedPlayers = matchCtx?.players ?? [];

  if (results.length === 0) {
    return { sport, competition, players: confirmedPlayers, keyMoments: [] };
  }

  const valid = results.filter(
    (r) => r.consensus || r.event,
  );

  if (valid.length === 0) {
    return { sport, competition, players: confirmedPlayers, keyMoments: [] };
  }

  const sorted = [...valid].sort((a, b) => a.timestamp - b.timestamp);

  // Filter out routine and filler moments
  const meaningful = sorted.filter(
    (r) => !r.importance || r.importance === 'critical' || r.importance === 'significant',
  );

  // Filter out replays — use a three-tier guard to avoid killing real moments
  const REAL_MOMENT_FRAME_TYPES = new Set(['celebration', 'close_up', 'live_play']);
  const noReplays = meaningful.filter((r) => {
    // Tier 1: explicit replay — always filter
    if (r.frame_type === 'replay') {
      console.log(`[ocr] Filtered explicit replay at ${fmtTimestamp(r.timestamp)}`);
      return false;
    }

    // Tier 2: probable replay — only when all safety conditions pass:
    // - score reading is definitively confirmed (high confidence = 2+ readable frames)
    // - frame type is not a known real-moment type
    // - importance was not elevated by Gemini
    const isProbableReplay =
      r.score_changed === false &&
      r.score_confidence === 'high' &&
      !REAL_MOMENT_FRAME_TYPES.has(r.frame_type ?? '') &&
      r.importance !== 'critical' &&
      r.importance !== 'significant';

    if (isProbableReplay) {
      console.log(`[ocr] Filtered probable replay at ${fmtTimestamp(r.timestamp)} (frame_type: ${r.frame_type}, confidence: ${r.score_confidence})`);
      return false;
    }

    return true;
  });

  const keyMoments: KeyMoment[] = [];
  for (const r of noReplays) {
    const label = r.event ?? r.matchedKeyword ?? null;
    if (!label) continue;

    const cs = r.consensus;

    keyMoments.push({
      timestamp: r.timestamp,
      label: capitalizeFirst(label),
      score_display: cs?.sets ? buildScoreDisplay(cs.sets, cs.game_score) : null,
      sets: cs?.sets ?? null,
      game_score: cs?.game_score ?? null,
      serving: cs?.serving ?? null,
      moment_type: null,
      score_source: cs?.sets ? 'visible' : null,
      score_confidence: r.score_confidence,
      score_changed: r.score_changed,
      frame_type: r.frame_type ?? null,
      set_period: r.set_period,
      game_time: r.game_time,
      transcript: r.transcriptText,
      audio_energy: r.audioEnergy,
    });
  }

  return { sport, competition, players: confirmedPlayers, keyMoments };
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

  const isTennis = output.sport?.toLowerCase() === 'tennis';

  const momentsList = output.keyMoments.map((m, i) => {
    const time = fmtTimestamp(m.timestamp);
    const scorePart = m.score_display
      ? m.score_changed
        ? ` | Score: ${m.score_display} [CHANGED]`
        : ` | Score: ${m.score_display} [unchanged]`
      : '';
    return `[#${i} ${time}] ${m.label}${scorePart}${m.set_period ? ` | ${m.set_period}` : ''}`;
  }).join('\n');

  const tennisPrompt = `You are curating a highlight timeline for a Tennis match.
${output.players.length > 0 ? `Players: ${output.players.join(' vs ')}` : ''}
${output.competition ? `Competition: ${output.competition}` : ''}

Here are ${output.keyMoments.length} candidate moments:

${momentsList}

YOUR JOB:
1. Remove duplicates and near-duplicates (same event described differently, moments <30s apart covering the same thing)
2. Remove moments that are NOT fan-worthy — routine holds, generic "match in progress", replays
3. Moments where the score is UNCHANGED are less likely to be important — scrutinize harder
4. KEEP: break of serve, set/match won, break points, match points, spectacular rallies, momentum shifts
5. Rewrite labels to be SHORT (max 10-12 words). Include WHO did WHAT.
   - BAD: "Carlos Alcaraz wins a crucial point, bringing the score to Deuce"
   - GOOD: "Alcaraz saves break point, back to deuce"
6. Aim for 10-20 moments for a full match

IMPORTANT: Do NOT return any score fields. Scores are already locked from frame analysis.

MOMENT TYPES — classify each moment with exactly one:
break_of_serve, set_won, match_won, break_point, break_point_saved, ace, match_point, rally, hold, deuce, tiebreak, challenge, injury_timeout, double_fault

Return JSON array only — no markdown, no explanation:
[
  { "index": 0, "label": "short label", "moment_type": "break_of_serve" }
]`;

  const genericPrompt = `You are curating a highlight timeline for a ${output.sport ?? 'sports'} match.
${output.players.length > 0 ? `Players: ${output.players.join(' vs ')}` : ''}
${output.competition ? `Competition: ${output.competition}` : ''}

Here are ${output.keyMoments.length} candidate moments:

${momentsList}

YOUR JOB:
1. Remove duplicates and near-duplicates (same event described differently, moments seconds apart covering the same thing)
2. Remove moments that are NOT fan-worthy — routine plays, replays of non-critical moments
3. Moments where the score is UNCHANGED are less likely to be important — scrutinize them harder
4. KEEP: decisive moments, spectacular plays, momentum shifts, match conclusion
5. Rewrite labels to be SHORT (max 10-12 words). Include WHO did WHAT.
   - BAD: "Carlos Alcaraz wins a crucial point"
   - GOOD: "Alcaraz saves break point, back to deuce"
6. Aim for 10-20 moments for a full match, fewer for shorter content

IMPORTANT: Do NOT return any score fields. Scores are already locked from frame analysis.

Return JSON array only — no markdown, no explanation:
[
  { "index": 0, "label": "short label" }
]`;

  const prompt = isTennis ? tennisPrompt : genericPrompt;

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

    const curated = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;

    if (!Array.isArray(curated) || curated.length === 0) return output;

    // Match curated entries back to originals by index
    const curatedMoments: KeyMoment[] = [];
    for (const c of curated) {
      const index = typeof c.index === 'number' ? c.index : -1;
      const original = index >= 0 && index < output.keyMoments.length
        ? output.keyMoments[index]
        : null;

      if (!original) {
        // Fallback: try timestamp matching if index is missing
        const parts = String(c.timestamp_str ?? '').split(':').map(Number);
        const targetSec = (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
        let best: KeyMoment | null = null;
        let bestDist = 30;
        for (const m of output.keyMoments) {
          const dist = Math.abs(m.timestamp - targetSec);
          if (dist < bestDist) {
            bestDist = dist;
            best = m;
          }
        }
        if (!best) continue;
        curatedMoments.push({
          ...best,
          label: String(c.label),
          moment_type: typeof c.moment_type === 'string' ? c.moment_type : null,
        });
        continue;
      }

      curatedMoments.push({
        ...original,
        label: String(c.label),
        moment_type: typeof c.moment_type === 'string' ? c.moment_type : null,
      });
    }

    // Sort chronologically
    curatedMoments.sort((a, b) => a.timestamp - b.timestamp);

    // Tennis post-processing
    if (isTennis) {
      validateScoreProgression(curatedMoments);
      interpolateScores(curatedMoments);
    }

    console.log(`[ocr] Curated: ${output.keyMoments.length} → ${curatedMoments.length} moments`);
    return { ...output, keyMoments: curatedMoments };
  } catch (err) {
    console.error('[ocr] Curation pass failed, using uncurated results:', err);
    return output;
  }
}

// ─── Tennis score helpers ────────────────────────────────────────────────────

function totalGames(sets: [number, number][]): number {
  return sets.reduce((sum, [a, b]) => sum + a + b, 0);
}

/**
 * Validate score progression — tennis scores must move forward.
 * When a score is impossible given the surrounding context, null it out
 * so it won't be displayed (better no score than a wrong score).
 *
 * Rules:
 * - Total games played can only increase or stay the same chronologically
 * - A single set can't exceed 13 games (7-6 tiebreak)
 * - Number of sets can't decrease
 * - Completed sets (all sets except the last) must stay consistent once established
 */
function validateScoreProgression(moments: KeyMoment[]): void {
  let prevSets: [number, number][] | null = null;
  let prevTotal = 0;

  for (const m of moments) {
    if (!m.sets) continue;

    // Rule: no set can have more than 13 games
    const invalidSet = m.sets.some(([a, b]) => a + b > 13 || a < 0 || b < 0);
    if (invalidSet) {
      console.log(`[ocr] Score validation: impossible set score at ${fmtTimestamp(m.timestamp)} — ${JSON.stringify(m.sets)}, nulling`);
      nullScore(m);
      continue;
    }

    const currTotal = totalGames(m.sets);

    if (prevSets) {
      // Rule: can't go back to fewer sets
      if (m.sets.length < prevSets.length) {
        console.log(`[ocr] Score validation: set count decreased at ${fmtTimestamp(m.timestamp)} (${prevSets.length} → ${m.sets.length}), nulling`);
        nullScore(m);
        continue;
      }

      // Rule: completed sets must stay consistent
      // Compare all sets except the current (last) one with previous completed sets
      const completedNow = m.sets.slice(0, -1);
      const completedPrev = prevSets.slice(0, Math.min(prevSets.length - 1, completedNow.length));
      let completedMismatch = false;
      for (let i = 0; i < completedPrev.length; i++) {
        if (completedNow[i] && (completedNow[i][0] !== completedPrev[i][0] || completedNow[i][1] !== completedPrev[i][1])) {
          completedMismatch = true;
          break;
        }
      }
      if (completedMismatch) {
        console.log(`[ocr] Score validation: completed set mismatch at ${fmtTimestamp(m.timestamp)} — prev: ${JSON.stringify(prevSets)}, curr: ${JSON.stringify(m.sets)}, nulling`);
        nullScore(m);
        continue;
      }

      // Rule: total games can't decrease (with tolerance for set transitions)
      // When a new set starts, total stays the same or increases
      if (currTotal < prevTotal - 1) {
        console.log(`[ocr] Score validation: total games decreased at ${fmtTimestamp(m.timestamp)} (${prevTotal} → ${currTotal}), nulling`);
        nullScore(m);
        continue;
      }
    }

    // This score passed validation — becomes the new anchor
    prevSets = m.sets;
    prevTotal = currTotal;
  }
}

function nullScore(m: KeyMoment): void {
  m.sets = null;
  m.score_display = null;
  m.score_source = null;
}

function fmtTimestamp(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Build deterministic score_display from structured sets + game_score */
function buildScoreDisplay(sets: [number, number][], gameScore: string | null): string {
  const setStrs = sets.map(([p1, p2]) => `${p1}-${p2}`);
  const setsStr = setStrs.join(', ');
  if (gameScore) {
    return `${setsStr} (${gameScore})`;
  }
  return setsStr;
}

/** Mark moments without visible scores as interpolated — but don't fake a score_display */
function interpolateScores(moments: KeyMoment[]): void {
  for (const m of moments) {
    if (!m.sets) {
      m.score_source = 'interpolated';
      m.score_display = null; // don't show a score we're not confident about
    }
  }
}

