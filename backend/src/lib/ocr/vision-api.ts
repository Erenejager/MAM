import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import PQueue from 'p-queue';
import type { RefinedPeak } from './overlay-diff.js';
import { parseOneFrameScore, computeConsensus, detectScoreDelta } from './score-consensus.js';
import type { FrameScore } from './score-consensus.js';

const execFileAsync = promisify(execFile);

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

interface ModelConfig {
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
}

const MODEL_CHAIN: ModelConfig[] = [
  { name: 'gemini-2.5-flash-lite', baseUrl: GEMINI_BASE_URL, apiKeyEnv: 'GEMINI_API_KEY' },
  { name: 'gemini-2.5-flash',      baseUrl: GEMINI_BASE_URL, apiKeyEnv: 'GEMINI_API_KEY' },
  { name: 'gemini-1.5-flash',      baseUrl: GEMINI_BASE_URL, apiKeyEnv: 'GEMINI_API_KEY' },
  { name: 'gpt-4o-mini',           baseUrl: OPENAI_BASE_URL, apiKeyEnv: 'OPENAI_API_KEY' },
];

export interface VisionResult {
  timestamp: number;
  matchedKeyword: string | null;
  transcriptText: string;
  audioEnergy: number;

  // Score data — structured from per-frame vision readings
  frame_scores: [FrameScore | null, FrameScore | null, FrameScore | null, FrameScore | null, FrameScore | null];
  consensus: FrameScore | null;
  score_changed: boolean | null;
  score_confidence: 'high' | 'low' | 'none';

  // Event data
  frame_type: 'live' | 'replay' | 'non_content' | null;
  set_period: string | null;
  game_time: string | null;
  venue: string | null;
  broadcaster: string | null;
  event: string | null;
  importance: 'critical' | 'significant' | 'routine' | 'filler' | null;
}

export interface MatchContext {
  sport: string | null;
  players: string[];
  competition: string | null;
}

const ID_PROMPT = `Analyze this video frame from a sports broadcast. Identify:
Return JSON only:
{
  "sport": "sport name",
  "players": ["player or team names visible"],
  "competition": "tournament or league name"
}`;

function buildAnalysisWithScoresPrompt(ctx: MatchContext, transcriptText: string, audioEnergy: number, transcriptSegments?: { start: number; end: number; text: string }[], peakTimestamp?: number): string {
  // Build a ±15s window (30s total) around the peak for Gemini context
  if (transcriptSegments && peakTimestamp !== undefined) {
    const lo = peakTimestamp - 15;
    const hi = peakTimestamp + 15;
    const wider = transcriptSegments
      .filter((s) => s.end > lo && s.start < hi)
      .map((s) => s.text)
      .join(' ')
      .trim();
    if (wider) transcriptText = wider;
  }
  const sportLine = ctx.sport ? `Sport: ${ctx.sport}` : 'Sport: unknown';
  const playersLine = ctx.players.length > 0 ? `Players: ${ctx.players.join(' vs ')}` : '';
  const compLine = ctx.competition ? `Competition: ${ctx.competition}` : '';
  const energyLevel = audioEnergy > 0.7 ? 'very high (crowd roaring)' : audioEnergy > 0.4 ? 'high' : audioEnergy > 0.2 ? 'moderate' : 'low';

  const isTennis = ctx.sport?.toLowerCase() === 'tennis';

  const p1 = ctx.players[0] ?? 'P1';
  const p2 = ctx.players[1] ?? 'P2';

  const scoreExample = isTennis
    ? `{ "visible": true, "sets": [[6, 3], [5, 2]], "game_score": "40-15", "serving": "${p1}" }`
    : `{ "visible": true, "score_text": "Team A 2 - 1 Team B" }`;

  const setDerivation = isTennis
    ? `set_period: use the frame whose sets array has the MOST entries — that frame has the most complete scoreboard.
  Count those entries: [[6,3],[5,3]] → 2 entries → "Set 2". [[6,3]] → 1 entry → "Set 1".
  Use null only if no frame had a readable scoreboard at all.`
    : `set_period: "1st half", "Q3", etc. if visible in any frame, or null.`;

  return `You are analyzing 5 frames from a sports broadcast: [-10s, -5s, 0s (peak action), +5s, +10s].
The +5s and +10s frames are intentionally after the action — scoreboard is most stable there.

${sportLine}
${playersLine}
${compLine}
Crowd energy: ${energyLevel}

--- SCOREBOARD (read each frame independently, visuals only — never infer from commentary) ---
CRITICAL: Player order is FIXED for this entire match. ALWAYS use: sets[0] = ${p1}, sets[1] = ${p2}.
Never swap this order regardless of how the scoreboard appears on screen.
${isTennis ? `Tennis scoreboard has 3 columns per player: SETS | GAMES | POINTS
- sets: [[${p1}_games, ${p2}_games], ...] — one pair per set played, including the current set in progress.
  ${p1} is ALWAYS index 0 (first number). ${p2} is ALWAYS index 1 (second number). Valid range: 0–7.
  WARNING: if you see 15, 30, or 40 in that column, you are reading the POINTS column — do not include those values here.
- game_score: point score on screen, or null between games.
  ALWAYS format as "${p1}_points-${p2}_points" — ${p1} first, ${p2} second. Same order as sets[].
  Valid point values: 0, 15, 30, 40, A only. Examples: "40-15" means ${p1} has 40, ${p2} has 15.
  If you see 1–7, that is a game count — do not use it here.
- serving: "${p1}" or "${p2}", or null.
- visible: true only if the scoreboard is clearly readable in this frame.` : `- score_text: score as shown on screen (e.g. "PSG 2 - 1 Marseille"), or null.
- visible: true only if the scoreboard is clearly readable in this frame.`}

--- EVENT (use all 5 frames + commentary below) ---
Commentary (±15s): "${transcriptText || 'none'}"

Describe the key action at the 0s frame. Visuals first; commentary is supporting context only.

frame_type — classify based on the 0s (peak) frame primarily:
  live        → any live footage: gameplay, celebration, close-up, crowd
  replay      → slow-motion replay (look for REPLAY graphic or repeated camera angle)
  non_content → graphics screen, stats overlay, interview, ceremony

importance — pick the HIGHEST level supported by ANY of the 5 frames (best evidence wins):
  critical    → a set or match just ended: ANY frame shows MORE sets[] entries than a previous frame in this clip, OR commentary says "set", "match won", "championship"
  significant → ANY frame shows: player celebrating, break point, ace, spectacular rally, very high crowd energy — OR any frame is a replay (replay = broadcast confirmed this point was worth showing again)
  routine     → normal live play across all frames, nothing notable
  filler      → ALL frames are non_content (stats screen, interview, ceremony) — no sport visible in any frame

${setDerivation}

Return JSON only:
{
  "scores": [
    ${scoreExample},
    ${scoreExample},
    ${scoreExample},
    ${scoreExample},
    ${scoreExample}
  ],
  "event": "what happened, 15 words or fewer",
  "frame_type": "live|replay|non_content",
  "importance": "critical|significant|routine|filler",
  "set_period": "Set N or null",
  "venue": "venue name if visible, or null"
}`;
}

async function extractFrame480p(videoPath: string, timeSeconds: number, outputPath: string): Promise<void> {
  // 480p is sufficient for scoreboard reading and reduces image token cost ~75%
  await execFileAsync('ffmpeg', [
    '-ss', String(timeSeconds),
    '-i', videoPath,
    '-frames:v', '1',
    '-vf', 'scale=-1:480',
    '-q:v', '3',
    '-y',
    outputPath,
  ]);
}

// Exported so result-processing.ts can share the same model chain.
// Images array may be empty for text-only calls (e.g. curation).
export async function callGemini(prompt: string, images: Array<{ mimeType: string; data: string }>, arrayResponse: true): Promise<unknown[] | null>;
export async function callGemini(prompt: string, images: Array<{ mimeType: string; data: string }>, arrayResponse?: false): Promise<Record<string, unknown> | null>;
export async function callGemini(
  prompt: string,
  images: Array<{ mimeType: string; data: string }>,
  arrayResponse = false,
): Promise<Record<string, unknown> | unknown[] | null> {
  const content: unknown[] = [
    { type: 'text', text: prompt },
    ...images.map((img) => ({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.data}` },
    })),
  ];

  for (const model of MODEL_CHAIN) {
    const apiKey = process.env[model.apiKeyEnv];
    if (!apiKey) continue; // skip if key not configured

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${model.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model.name,
            messages: [{ role: 'user', content }],
            max_tokens: 2000,
            temperature: 0,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => res.statusText);
          const isRetryable = res.status === 429 || res.status === 503;
          console.log(`[ocr] ${model.name} error (attempt ${attempt}, status=${res.status}): ${errText.slice(0, 120)}`);
          if (!isRetryable || attempt === 3) break; // try next model
          const base = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, base + Math.random() * base));
          continue;
        }

        const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        const text = json.choices?.[0]?.message?.content ?? '';
        if (attempt > 1 || model !== MODEL_CHAIN[0]) {
          console.log(`[ocr] succeeded with ${model.name}`);
        }
        const pattern = arrayResponse ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
        const matched = text.match(pattern);
        if (!matched) return null;
        return JSON.parse(matched[0]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[ocr] ${model.name} fetch error (attempt ${attempt}): ${msg.slice(0, 120)}`);
        if (attempt === 3) break; // try next model
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }
  return null;
}

// Quick identification pass — sample a few frames to detect sport/players/competition
export async function identifyMatch(
  peaks: RefinedPeak[],
): Promise<MatchContext> {
  // Sample 3 frames: start, middle, end
  const sampleIndices = [
    0,
    Math.floor(peaks.length / 2),
    peaks.length - 1,
  ].filter((v, i, a) => a.indexOf(v) === i);

  const allPlayers: string[] = [];
  let sport: string | null = null;
  let competition: string | null = null;

  for (const idx of sampleIndices) {
    try {
      const imageBuffer = await readFile(peaks[idx].framePath);
      const base64 = imageBuffer.toString('base64');
      const parsed = await callGemini(ID_PROMPT, [
        { mimeType: 'image/jpeg', data: base64 },
      ]);
      if (!parsed) continue;
      if (parsed.sport && !sport) sport = parsed.sport as string;
      if (parsed.competition && !competition) competition = parsed.competition as string;
      if (Array.isArray(parsed.players)) allPlayers.push(...(parsed.players as string[]));
    } catch {
      continue;
    }
  }

  // Deduplicate players — merge names that are substrings of each other
  // e.g. "Alcaraz" and "Carlos Alcaraz" → keep "Carlos Alcaraz"
  const playerCounts = new Map<string, { count: number; original: string }>();
  for (const p of allPlayers) {
    const norm = p.toLowerCase().trim();
    // Check if this name is already covered by an existing entry (or vice versa)
    let merged = false;
    for (const [key, entry] of playerCounts) {
      if (key.includes(norm) || norm.includes(key)) {
        // Keep the longer (more complete) form
        const better = norm.length > key.length ? p : entry.original;
        const betterKey = better.toLowerCase().trim();
        playerCounts.delete(key);
        playerCounts.set(betterKey, { count: entry.count + 1, original: better });
        merged = true;
        break;
      }
    }
    if (!merged) {
      playerCounts.set(norm, { count: 1, original: p });
    }
  }
  // Sort by frequency descending, take top entries
  const players = [...playerCounts.values()]
    .sort((a, b) => b.count - a.count)
    .map((p) => p.original);

  console.log(`[ocr] Identified: ${sport ?? 'unknown sport'} | ${players.join(' vs ') || 'unknown players'} | ${competition ?? 'unknown competition'}`);
  return { sport, players, competition };
}

// Full analysis pass with context + 3 frames per peak at 720p
export async function analyzeWithScores(
  peaks: RefinedPeak[],
  ctx: MatchContext,
  videoPath: string,
  transcriptSegments?: { start: number; end: number; text: string }[],
): Promise<VisionResult[]> {
  const queue = new PQueue({ concurrency: 1 });

  const results = await Promise.all(
    peaks.map((peak) =>
      queue.add(async () => {
        try {
          const prompt = buildAnalysisWithScoresPrompt(ctx, peak.transcriptText, peak.audioEnergy, transcriptSegments, peak.timestamp);

          // Extract 5 frames: -10s, -5s, 0 (peak), +5s, +10s
          // Post-point frames (+5, +10) catch the scoreboard when broadcast holds it steady
          const tempDir = resolve(peak.framePath, '..');
          const hqMinus10 = resolve(tempDir, `hq_m10_${peak.timestamp}.jpg`);
          const hqMinus5  = resolve(tempDir, `hq_m5_${peak.timestamp}.jpg`);
          const hqPeak    = resolve(tempDir, `hq_peak_${peak.timestamp}.jpg`);
          const hqPlus5   = resolve(tempDir, `hq_p5_${peak.timestamp}.jpg`);
          const hqPlus10  = resolve(tempDir, `hq_p10_${peak.timestamp}.jpg`);

          const timeMinus10 = Math.max(0, peak.timestamp - 10);
          const timeMinus5  = Math.max(0, peak.timestamp - 5);
          const timePlus5   = peak.timestamp + 5;
          const timePlus10  = peak.timestamp + 10;

          await Promise.all([
            extractFrame480p(videoPath, timeMinus10, hqMinus10),
            extractFrame480p(videoPath, timeMinus5, hqMinus5),
            extractFrame480p(videoPath, peak.timestamp, hqPeak),
            extractFrame480p(videoPath, timePlus5, hqPlus5),
            extractFrame480p(videoPath, timePlus10, hqPlus10),
          ]);

          const imageParts: Array<{ mimeType: string; data: string }> = [];
          for (const [path, label] of [
            [hqMinus10, '-10s'],
            [hqMinus5,  '-5s'],
            [hqPeak,    'peak'],
            [hqPlus5,   '+5s'],
            [hqPlus10,  '+10s'],
          ] as const) {
            try {
              const buf = await readFile(path);
              imageParts.push({ mimeType: 'image/jpeg', data: buf.toString('base64') });
            } catch { /* frame may not exist at video boundaries */ void label; }
          }

          const parsed = await callGemini(prompt, imageParts);

          // Clean up temp frames
          await Promise.all([
            unlink(hqMinus10).catch(() => {}),
            unlink(hqMinus5).catch(() => {}),
            unlink(hqPeak).catch(() => {}),
            unlink(hqPlus5).catch(() => {}),
            unlink(hqPlus10).catch(() => {}),
          ]);

          if (!parsed) return null;

          // Parse per-frame scores
          const rawScores = Array.isArray(parsed.scores) ? parsed.scores : [];
          const frame_scores: [FrameScore | null, FrameScore | null, FrameScore | null, FrameScore | null, FrameScore | null] = [
            parseOneFrameScore(rawScores[0]),
            parseOneFrameScore(rawScores[1]),
            parseOneFrameScore(rawScores[2]),
            parseOneFrameScore(rawScores[3]),
            parseOneFrameScore(rawScores[4]),
          ];

          // Compute consensus and delta (compare -10s frame vs +10s frame for widest delta)
          const { consensus, score_confidence } = computeConsensus(frame_scores);
          const score_changed = detectScoreDelta(frame_scores[0], frame_scores[4]);

          const frameType = String(parsed.frame_type ?? '').toLowerCase();
          const validFrameTypes = ['live', 'replay', 'non_content'];

          return {
            timestamp: peak.timestamp,
            matchedKeyword: peak.matchedKeyword,
            transcriptText: peak.transcriptText,
            audioEnergy: peak.audioEnergy,
            frame_scores,
            consensus,
            score_changed,
            score_confidence,
            frame_type: validFrameTypes.includes(frameType)
              ? (frameType as VisionResult['frame_type'])
              : null,
            set_period: parsed.set_period as string ?? null,
            game_time: parsed.game_time as string ?? null,
            venue: parsed.venue as string ?? null,
            broadcaster: null,
            event: parsed.event as string ?? null,
            importance: ['critical', 'significant', 'routine', 'filler'].includes(
              String(parsed.importance).toLowerCase(),
            )
              ? (String(parsed.importance).toLowerCase() as VisionResult['importance'])
              : null,
          } as VisionResult;
        } catch {
          return null;
        }
      }),
    ),
  );

  return results.filter((r): r is VisionResult => r !== null);
}
