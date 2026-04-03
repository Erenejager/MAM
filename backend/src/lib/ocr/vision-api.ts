import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFile } from 'node:fs/promises';
import type { RefinedPeak } from './overlay-diff.js';

export interface VisionResult {
  timestamp: number;
  matchedKeyword: string | null;
  transcriptText: string;
  audioEnergy: number;
  sport: string | null;
  players: string[];
  competition: string | null;
  score: string | null;
  set_period: string | null;
  game_time: string | null;
  venue: string | null;
  broadcaster: string | null;
  event: string | null;
}

const PROMPT = `Analyze this video frame from a sports broadcast. Extract any visible information.
Return JSON only with these fields (omit any field you cannot clearly see):

{
  "sport": "sport name",
  "players": ["player or team names visible"],
  "competition": "tournament or league name",
  "score": "current score as displayed",
  "set_period": "set, half, round, period, quarter if visible",
  "game_time": "match clock or elapsed time if visible",
  "venue": "venue name if visible",
  "broadcaster": "network or channel if visible",
  "event": "what is happening (e.g. goal, break point, replay, timeout)"
}`;

export async function analyzeFrames(
  peaks: RefinedPeak[],
): Promise<VisionResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const results: VisionResult[] = [];

  for (const peak of peaks) {
    try {
      const imageBuffer = await readFile(peak.framePath);
      const base64 = imageBuffer.toString('base64');

      // Retry with exponential backoff on rate limits (429)
      let response;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          response = await model.generateContent([
            PROMPT,
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64,
              },
            },
          ]);
          break;
        } catch (err: unknown) {
          const is429 = err instanceof Error && err.message.includes('429');
          if (!is429 || attempt === 4) throw err;
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      if (!response) continue;

      const text = response.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      results.push({
        timestamp: peak.timestamp,
        matchedKeyword: peak.matchedKeyword,
        transcriptText: peak.transcriptText,
        audioEnergy: peak.audioEnergy,
        sport: parsed.sport ?? null,
        players: Array.isArray(parsed.players) ? parsed.players : [],
        competition: parsed.competition ?? null,
        score: parsed.score ?? null,
        set_period: parsed.set_period ?? null,
        game_time: parsed.game_time ?? null,
        venue: parsed.venue ?? null,
        broadcaster: parsed.broadcaster ?? null,
        event: parsed.event ?? null,
      });
    } catch {
      // Skip frame on non-retryable errors
      continue;
    }
  }

  return results;
}
