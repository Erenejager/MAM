import type { VisionResult } from './vision-api.js';
import { callGemini } from './vision-api.js';

const REAL_MOMENT_FRAME_TYPES = new Set(['live']);

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
  importance: 'critical' | 'significant' | 'routine' | 'filler' | null;
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

  // Filter out replays — but never drop a replay that Gemini marked critical or significant,
  // because important points (break points, match winners) are always followed by slow-mo replays
  // and the peak may land on that replay frame.
  const noReplays = meaningful.filter((r) => {
    const isImportant = r.importance === 'critical' || r.importance === 'significant';

    // Tier 1: explicit replay — drop only if not important
    if (r.frame_type === 'replay') {
      if (isImportant) return true;
      console.log(`[ocr] Filtered non-important replay at ${fmtTimestamp(r.timestamp)}`);
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
      !isImportant;

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
      score_display: cs ? buildScoreDisplay(cs) : null,
      sets: cs?.sets ?? null,
      game_score: cs?.game_score ?? null,
      serving: cs?.serving ?? null,
      moment_type: null,
      score_source: (cs?.sets || cs?.score_text) ? 'visible' : null,
      score_confidence: r.score_confidence,
      score_changed: r.score_changed,
      frame_type: r.frame_type ?? null,
      importance: r.importance ?? null,
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
  if (output.keyMoments.length === 0) return output;

  // Log pre-curation moments
  console.log(`[ocr] Pre-curation moments (${output.keyMoments.length}):`);
  for (const m of output.keyMoments) {
    const mins = Math.floor(m.timestamp / 60);
    const secs = String(Math.floor(m.timestamp % 60)).padStart(2, '0');
    const score = m.score_display ? ` | ${m.score_display}` : '';
    const period = m.set_period ? ` · ${m.set_period}` : '';
    console.log(`  [${mins}:${secs}] ${m.label}${score}${period} (${m.importance ?? '?'})`);
  }

  const isTennis = output.sport?.toLowerCase() === 'tennis';

  const SET_WIN_KEYWORDS = /wins? (the |this )?(first |second |third )?set|takes? (the )?set|set point (won|converted)|championship point/i;
  const MATCH_WIN_KEYWORDS = /wins? (the )?match|wins? (the )?(game|tournament|final)|match (point )?(won|converted)/i;

  const momentsList = output.keyMoments.map((m, i) => {
    const time = fmtTimestamp(m.timestamp);

    // Detect set/match transitions using reliable signals only:
    // 1. Gemini's importance=critical (detected more set entries visually across frames)
    // 2. Transcript commentary confirming the event
    // NOT m.sets — score numbers are too often hallucinated or nulled
    let annotation = '';
    if (isTennis && m.importance === 'critical') {
      const transcript = m.transcript ?? '';
      if (MATCH_WIN_KEYWORDS.test(transcript) || MATCH_WIN_KEYWORDS.test(m.label)) {
        annotation = ' [MATCH WON]';
      } else if (SET_WIN_KEYWORDS.test(transcript) || SET_WIN_KEYWORDS.test(m.label)) {
        annotation = ' [SET WON]';
      } else {
        annotation = ' [SET OR MATCH WON]';
      }
    }

    const importanceTag = m.importance === 'critical' ? ' ⚑' : '';
    const scorePart = m.score_display
      ? m.score_changed
        ? ` | Score: ${m.score_display}${annotation || ' [CHANGED]'}`
        : ` | Score: ${m.score_display} [unchanged]`
      : annotation
        ? ` |${annotation}`
        : '';
    const servingPart = m.serving ? ` | Serving: ${m.serving}` : '';
    return `[#${i} ${time}] ${m.label}${scorePart}${servingPart}${m.set_period ? ` | ${m.set_period}` : ''}${importanceTag}`;
  }).join('\n');

  const tennisPrompt = `You are curating a highlight timeline for a Tennis match.
${output.players.length > 0 ? `Players: ${output.players.join(' vs ')}` : ''}
${output.competition ? `Competition: ${output.competition}` : ''}

Here are ${output.keyMoments.length} candidate moments:

${momentsList}

YOUR JOB:
1. Remove duplicates and near-duplicates (same event described differently, moments <30s apart covering the same thing)
2. Remove moments with NO sport content — crowd shots with nothing happening, generic "players on court"
3. ALWAYS KEEP moments marked ⚑ (critical) — these are set/match wins detected from the video frames
4. ALWAYS KEEP: break of serve, break point (won or saved), match point, ace, double fault, spectacular rally, tiebreak
5. KEEP if notable: hold under pressure, deuce after long rally, player reaction after key point
6. REMOVE: routine holds with no drama, generic "match in progress", water breaks
7. Rewrite labels to be SHORT (max 10-12 words). Include WHO did WHAT.
   - BAD: "Carlos Alcaraz wins a crucial point, bringing the score to Deuce"
   - GOOD: "Alcaraz saves break point, back to deuce"
8. Aim for 15-25 moments for a full match. Err on the side of keeping fan-worthy moments.

IMPORTANT: Do NOT return any score fields. Scores are already locked from frame analysis.

MOMENT TYPES — classify each moment with exactly one:
break_of_serve, set_won, match_won, break_point, break_point_saved, ace, match_point, rally, hold, deuce, tiebreak, challenge, injury_timeout, double_fault

SERVING field tells you who is serving. Use it to classify correctly:
- break_of_serve: server LOSES the game
- hold / break_point_saved: server WINS the point or game
- break_point: returner has a break point opportunity (server is under pressure)
Do NOT label a moment break_of_serve or break_point if the server won the point.

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
    console.log('[ocr] Curation — calling model chain');
    const raw = await callGemini(prompt, [], true);

    if (!raw) return output;

    const curated = (Array.isArray(raw) ? raw : []) as Array<Record<string, unknown>>;

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
      normalizePlayerOrder(curatedMoments);  // normalize before validation so minority moments aren't destroyed first
      validateScoreProgression(curatedMoments);
      repairSetPeriods(curatedMoments);      // derive set_period from sets[] — more reliable than Gemini's label
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
 *
 * Anchor replacement rules (to prevent one bad frame poisoning everything after it):
 * - A high-confidence score (2+ frames agree) replaces a low-confidence anchor.
 * Player-order flips are no longer handled here — see normalizePlayerOrder for that.
 */
export function validateScoreProgression(moments: KeyMoment[]): void {
  let prevSets: [number, number][] | null = null;
  let prevSetsConfidence: 'high' | 'low' | 'none' = 'none';

  for (const m of moments) {
    if (!m.sets) continue;

    // Rule: no set can have more than 13 games
    const invalidSet = m.sets.some(([a, b]) => a + b > 13 || a < 0 || b < 0);
    if (invalidSet) {
      console.log(`[ocr] Score validation: impossible set score at ${fmtTimestamp(m.timestamp)} — ${JSON.stringify(m.sets)}, nulling`);
      nullScore(m);
      continue;
    }

    // Rule: completed sets (all except the last) must have a winner with at least 6 games
    // A set can't end at [3,0] — minimum winning score is 6. Catches hallucinated early-set readings.
    const completedSets = m.sets.slice(0, -1);
    const impossibleCompletedSet = completedSets.some(([a, b]) => Math.max(a, b) < 6);
    if (impossibleCompletedSet) {
      console.log(`[ocr] Score validation: impossible completed set (max < 6) at ${fmtTimestamp(m.timestamp)} — ${JSON.stringify(m.sets)}, nulling`);
      nullScore(m);
      continue;
    }

    if (prevSets) {
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
        // A high-confidence score contradicting a low-confidence anchor
        // is more likely to be correct — replace the anchor rather than discarding the score.
        const currentBeatsAnchor = m.score_confidence === 'high' && prevSetsConfidence !== 'high';
        if (currentBeatsAnchor) {
          console.log(`[ocr] Score validation: high-conf score replaces low-conf anchor at ${fmtTimestamp(m.timestamp)} — prev: ${JSON.stringify(prevSets)}, curr: ${JSON.stringify(m.sets)}`);
          prevSets = m.sets;
          prevSetsConfidence = m.score_confidence;
          continue;
        }

        console.log(`[ocr] Score validation: completed set mismatch at ${fmtTimestamp(m.timestamp)} — prev: ${JSON.stringify(prevSets)}, curr: ${JSON.stringify(m.sets)}, nulling`);
        nullScore(m);
        continue;
      }

      // Rule: games within the current set can only increase.
      // Only enforced when staying in the same set (same sets.length).
      // When sets.length increases, a new set started — reset is expected and valid.
      if (m.sets.length === prevSets.length) {
        const currSetGames = m.sets[m.sets.length - 1][0] + m.sets[m.sets.length - 1][1];
        const prevSetGames = prevSets[prevSets.length - 1][0] + prevSets[prevSets.length - 1][1];
        if (currSetGames < prevSetGames) {
          console.log(`[ocr] Score validation: games decreased within Set ${m.sets.length} at ${fmtTimestamp(m.timestamp)} (${prevSetGames} → ${currSetGames}), nulling`);
          nullScore(m);
          continue;
        }
      }
      // When m.sets.length > prevSets.length: new set started — always valid, no check needed
    }

    // This score passed validation — becomes the new anchor.
    // High-confidence scores (2+ frames agree) are preferred; they replace any existing anchor.
    // Low-confidence scores only set the anchor if none exists yet.
    if (m.score_confidence === 'high' || !prevSets) {
      prevSets = m.sets;
      prevSetsConfidence = m.score_confidence;
    }
  }
}

/**
 * Post-processing normalization for player order.
 * Gemini is instructed to always output P1 first, but sometimes swaps columns.
 * After score validation, use majority vote across moments with completed sets to
 * determine the canonical orientation, then flip minority moments to match.
 *
 * This replaces the unconditional flip logic that was in validateScoreProgression.
 */
export function normalizePlayerOrder(moments: KeyMoment[]): void {
  // Need at least one completed set to determine orientation — sets.length >= 2
  const withCompleted = moments.filter((m) => m.sets && m.sets.length >= 2);
  if (withCompleted.length < 2) return;

  // Use the first qualifying moment as the reference orientation
  const refCompleted = withCompleted[0].sets!.slice(0, -1);

  // Vote: how many moments are in the same orientation vs flipped relative to reference?
  let aVotes = 1; // reference counts as A
  let bVotes = 0;

  for (const m of withCompleted.slice(1)) {
    const completed = m.sets!.slice(0, -1);
    const minLen = Math.min(refCompleted.length, completed.length);
    if (minLen === 0) continue;

    const isA = refCompleted
      .slice(0, minLen)
      .every((s, i) => s[0] === completed[i][0] && s[1] === completed[i][1]);
    const isB = refCompleted
      .slice(0, minLen)
      .every((s, i) => s[0] === completed[i][1] && s[1] === completed[i][0]);

    if (isA) aVotes++;
    else if (isB) bVotes++;
  }

  if (bVotes === 0) return; // All moments agree — nothing to normalize

  const flipA = bVotes > aVotes;
  console.log(
    `[ocr] Player-order normalization: ${aVotes} orientation-A, ${bVotes} orientation-B — ` +
    `flipping ${flipA ? 'A' : 'B'} (minority) to canonical`,
  );

  for (const m of moments) {
    if (!m.sets) continue;

    // Determine this moment's orientation by comparing against the reference
    const completed = m.sets.slice(0, -1);
    const minLen = Math.min(refCompleted.length, completed.length);

    let orientation: 'A' | 'B' | 'unknown';
    if (minLen > 0) {
      const isA = refCompleted
        .slice(0, minLen)
        .every((s, i) => s[0] === completed[i][0] && s[1] === completed[i][1]);
      const isB = refCompleted
        .slice(0, minLen)
        .every((s, i) => s[0] === completed[i][1] && s[1] === completed[i][0]);
      orientation = isA ? 'A' : isB ? 'B' : 'unknown';
    } else {
      // Single-set moment — no completed sets to compare; treat as A (default canonical)
      orientation = 'A';
    }

    const shouldFlip = (orientation === 'A' && flipA) || (orientation === 'B' && !flipA);
    if (shouldFlip) {
      m.sets = m.sets.map(([a, b]) => [b, a] as [number, number]);
      // Flip game_score to match the new player order: "X-Y" → "Y-X"
      // Handles all tennis point formats: "40-15", "A-40", "40-A", "40-40", "0-0"
      if (m.game_score) {
        const parts = m.game_score.split('-');
        if (parts.length === 2) {
          m.game_score = `${parts[1]}-${parts[0]}`;
        }
      }
      m.score_display = buildScoreDisplay({ sets: m.sets, game_score: m.game_score });
      console.log(
        `[ocr] Normalized player order at ${fmtTimestamp(m.timestamp)}: ${JSON.stringify(m.sets)}`,
      );
    }
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

/** Build score_display from either structured sets (tennis) or raw score_text (other sports) */
function buildScoreDisplay(cs: { sets: [number, number][] | null; game_score: string | null; score_text?: string | null }): string | null {
  if (cs.sets) {
    const setStrs = cs.sets.map(([p1, p2]) => `${p1}-${p2}`);
    const setsStr = setStrs.join(', ');
    return cs.game_score ? `${setsStr} (${cs.game_score})` : setsStr;
  }
  return cs.score_text ?? null;
}

/**
 * Derive set_period from the structured sets data rather than trusting Gemini's label.
 * sets.length tells us exactly which set we're in. For moments where the score was nulled,
 * propagate the period from the nearest preceding moment that had a valid score.
 */
function repairSetPeriods(moments: KeyMoment[]): void {
  let lastKnownPeriod: string | null = null;
  for (const m of moments) {
    if (m.sets && m.sets.length > 0) {
      m.set_period = `Set ${m.sets.length}`;
      lastKnownPeriod = m.set_period;
    } else if (lastKnownPeriod) {
      m.set_period = lastKnownPeriod;
    }
  }
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

