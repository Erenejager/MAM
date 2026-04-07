import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import PQueue from 'p-queue';
import type { RefinedPeak } from './overlay-diff.js';
import { parseOneFrameScore, computeConsensus, detectScoreDelta } from './score-consensus.js';
import type { FrameScore } from './score-consensus.js';

const execFileAsync = promisify(execFile);

export interface VisionResult {
  timestamp: number;
  matchedKeyword: string | null;
  transcriptText: string;
  audioEnergy: number;

  // Score data — structured from per-frame vision readings
  frame_scores: [FrameScore | null, FrameScore | null, FrameScore | null];
  consensus: FrameScore | null;
  score_changed: boolean | null;
  score_confidence: 'high' | 'low' | 'none';

  // Event data
  sport: string | null;
  players: string[];
  competition: string | null;
  frame_type: 'live_play' | 'replay' | 'celebration' | 'close_up' | 'graphics' | 'other' | null;
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

function buildAnalysisWithScoresPrompt(ctx: MatchContext, transcriptText: string, audioEnergy: number): string {
  const sportLine = ctx.sport ? `Sport: ${ctx.sport}` : 'Sport: unknown';
  const playersLine = ctx.players.length > 0 ? `Players: ${ctx.players.join(' vs ')}` : '';
  const compLine = ctx.competition ? `Competition: ${ctx.competition}` : '';
  const energyLevel = audioEnergy > 0.7 ? 'very high (crowd roaring)' : audioEnergy > 0.4 ? 'high' : audioEnergy > 0.2 ? 'moderate' : 'low';

  const isTennis = ctx.sport?.toLowerCase() === 'tennis';

  const p1 = ctx.players[0] ?? 'P1';
  const p2 = ctx.players[1] ?? 'P2';

  const scoreInstructions = isTennis
    ? `For tennis:
- "sets": array of [P1_games, P2_games] per set played so far (including current set in progress).
  P1 is ${p1}, P2 is ${p2}. The FIRST number is ALWAYS ${p1}'s games.
  Example: ${p1} won set 1 6-3, current set is 2-1 → [[6, 3], [2, 1]]
- "game_score": point score in current game ("40-15", "AD-40", "deuce") or null if between games
- "serving": who is serving ("${p1}" or "${p2}") or null if not visible
- "visible": true if scoreboard is readable in this frame`
    : `- "score_text": the score as displayed on screen (e.g. "PSG 2 - 1 Marseille"), or null if not visible
- "visible": true if scoreboard is readable in this frame`;

  const scoreExample = isTennis
    ? `{ "visible": true, "sets": [[6, 3], [5, 2]], "game_score": "40-15", "serving": "${p1}" }`
    : `{ "visible": true, "score_text": "Team A 2 - 1 Team B" }`;

  return `You are analyzing 3 frames from a sports broadcast, taken 5 seconds apart (BEFORE → DURING → AFTER).

${sportLine}
${playersLine}
${compLine}
Crowd energy: ${energyLevel}
Commentary at this moment: "${transcriptText || 'none'}"

══════════════════════════════════════
SECTION 1: SCOREBOARD READING
══════════════════════════════════════
For EACH of the 3 frames, read the scoreboard INDEPENDENTLY.
Do NOT use the commentary or crowd energy to guess or infer scores.
Read ONLY what is visible on the scoreboard graphic.
If the scoreboard is not visible or not readable, set "visible": false.

${scoreInstructions}

══════════════════════════════════════
SECTION 2: EVENT DESCRIPTION
══════════════════════════════════════
Now compare the 3 frames. What happened between them?
Use the frames, commentary, and crowd energy to describe the event.

DETERMINE THE FRAME TYPE:
- live_play: Active gameplay with scoreboard visible
- replay: Slow-motion replay (look for replay graphics, slow movement, no live scoreboard)
- celebration: Player celebrating, fist pump, crowd reaction
- close_up: Close-up of player face, equipment, or ball — no scoreboard
- graphics: Full-screen graphic, stats overlay, interview, pre-match ceremony
- other: Anything else

CLASSIFY the importance:
- CRITICAL: Match point won, set/period won, game-winning moment, championship point, decisive goal, red card, knockout
- SIGNIFICANT: Break of serve, penalty, scoring play, momentum shift, challenge/review, key save, injury timeout
- ROUTINE: Regular point, normal play between events, standard serve hold
- FILLER: Replay/slow-motion, crowd shots, player walking, graphics overlay, interview, pre-match ceremony

Return JSON only:
{
  "scores": [
    ${scoreExample},
    ${scoreExample},
    ${scoreExample}
  ],
  "event": "specific description of what happened",
  "frame_type": "live_play|replay|celebration|close_up|graphics|other",
  "importance": "critical|significant|routine|filler",
  "set_period": "set, half, round, period, quarter if visible, or null",
  "game_time": "match clock or elapsed time if visible, or null",
  "venue": "venue name if visible, or null",
  "broadcaster": "network or channel if visible, or null"
}`;
}

async function extractFrame720p(videoPath: string, timeSeconds: number, outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-ss', String(timeSeconds),
    '-i', videoPath,
    '-frames:v', '1',
    '-vf', 'scale=-1:720',
    '-q:v', '3',
    '-y',
    outputPath,
  ]);
}

async function callGemini(
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  prompt: string,
  images: Array<{ mimeType: string; data: string }>,
): Promise<Record<string, unknown> | null> {
  let response;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      response = await model.generateContent([
        prompt,
        ...images.map((img) => ({ inlineData: img })),
      ]);
      break;
    } catch (err: unknown) {
      const is429 = err instanceof Error && err.message.includes('429');
      if (!is429 || attempt === 4) throw err;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  if (!response) return null;
  const text = response.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  return JSON.parse(jsonMatch[0]);
}

// Quick identification pass — sample a few frames to detect sport/players/competition
export async function identifyMatch(
  peaks: RefinedPeak[],
): Promise<MatchContext> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { sport: null, players: [], competition: null };

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
      const parsed = await callGemini(model, ID_PROMPT, [
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

  // Deduplicate players
  const playerCounts = new Map<string, { count: number; original: string }>();
  for (const p of allPlayers) {
    const key = p.toLowerCase().trim();
    const existing = playerCounts.get(key);
    if (existing) existing.count++;
    else playerCounts.set(key, { count: 1, original: p });
  }
  const players = [...playerCounts.values()].map((p) => p.original);

  console.log(`[ocr] Identified: ${sport ?? 'unknown sport'} | ${players.join(' vs ') || 'unknown players'} | ${competition ?? 'unknown competition'}`);
  return { sport, players, competition };
}

// Full analysis pass with context + 3 frames per peak at 720p
export async function analyzeWithScores(
  peaks: RefinedPeak[],
  ctx: MatchContext,
  videoPath: string,
): Promise<VisionResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const queue = new PQueue({ concurrency: 10 });

  const results = await Promise.all(
    peaks.map((peak) =>
      queue.add(async () => {
        try {
          const prompt = buildAnalysisWithScoresPrompt(ctx, peak.transcriptText, peak.audioEnergy);

          // Re-extract 3 frames at 720p for better scoreboard reading
          const tempDir = resolve(peak.framePath, '..');
          const hqBefore = resolve(tempDir, `hq_before_${peak.timestamp}.jpg`);
          const hqDuring = resolve(tempDir, `hq_during_${peak.timestamp}.jpg`);
          const hqAfter = resolve(tempDir, `hq_after_${peak.timestamp}.jpg`);

          const beforeTime = Math.max(0, peak.timestamp - 5);
          const afterTime = peak.timestamp + 5;

          await Promise.all([
            extractFrame720p(videoPath, beforeTime, hqBefore),
            extractFrame720p(videoPath, peak.timestamp, hqDuring),
            extractFrame720p(videoPath, afterTime, hqAfter),
          ]);

          // Load 720p frames
          const imageParts: Array<{ mimeType: string; data: string }> = [];

          try {
            const buf = await readFile(hqBefore);
            imageParts.push({ mimeType: 'image/jpeg', data: buf.toString('base64') });
          } catch { /* before frame may not exist at video start */ }

          const mainBuf = await readFile(hqDuring);
          imageParts.push({ mimeType: 'image/jpeg', data: mainBuf.toString('base64') });

          try {
            const buf = await readFile(hqAfter);
            imageParts.push({ mimeType: 'image/jpeg', data: buf.toString('base64') });
          } catch { /* after frame may not exist at video end */ }

          const parsed = await callGemini(model, prompt, imageParts);

          // Clean up 720p temp frames
          await Promise.all([
            unlink(hqBefore).catch(() => {}),
            unlink(hqDuring).catch(() => {}),
            unlink(hqAfter).catch(() => {}),
          ]);

          if (!parsed) return null;

          // Parse per-frame scores
          const rawScores = Array.isArray(parsed.scores) ? parsed.scores : [];
          const frame_scores: [FrameScore | null, FrameScore | null, FrameScore | null] = [
            parseOneFrameScore(rawScores[0]),
            parseOneFrameScore(rawScores[1]),
            parseOneFrameScore(rawScores[2]),
          ];

          // Compute consensus and delta
          const { consensus, score_confidence } = computeConsensus(frame_scores);
          const score_changed = detectScoreDelta(frame_scores[0], frame_scores[2]);

          const frameType = String(parsed.frame_type ?? '').toLowerCase();
          const validFrameTypes = ['live_play', 'replay', 'celebration', 'close_up', 'graphics', 'other'];

          return {
            timestamp: peak.timestamp,
            matchedKeyword: peak.matchedKeyword,
            transcriptText: peak.transcriptText,
            audioEnergy: peak.audioEnergy,
            frame_scores,
            consensus,
            score_changed,
            score_confidence,
            sport: parsed.sport as string ?? null,
            players: Array.isArray(parsed.players) ? (parsed.players as string[]) : [],
            competition: parsed.competition as string ?? null,
            frame_type: validFrameTypes.includes(frameType)
              ? (frameType as VisionResult['frame_type'])
              : null,
            set_period: parsed.set_period as string ?? null,
            game_time: parsed.game_time as string ?? null,
            venue: parsed.venue as string ?? null,
            broadcaster: parsed.broadcaster as string ?? null,
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
