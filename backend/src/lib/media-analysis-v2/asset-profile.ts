import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AssetProfile, EvidenceRef, TranscriptSegment } from './types.js';
import { extractFrameJpeg } from './video-utils.js';
import { callGemini } from '../ocr/vision-api.js';
import { hasAnySportsCue, inferSportFromText } from './sports-keywords.js';

interface AssetProfileInput {
  videoPath: string;
  assetDir: string;
  durationSeconds: number;
  transcriptSegments: TranscriptSegment[];
}

const PROFILE_PROMPT = `Analyze these representative frames and the transcript summary.
Return JSON only:
{
  "domain": "sports|news|mixed|general|unknown",
  "format": "live_match|mixed_broadcast|player_interview|press_conference|studio_show|news_package|feature_package|unknown",
  "sport": "sport name or null",
  "competition": "competition or null",
  "teams": ["team names if known"],
  "players": ["player names if known"],
  "confidence": 0.0
}

Use "mixed_broadcast" for sports assets that include live action plus interviews, studio segments, or commentator inserts.`;

const TENNIS_PLAYER_CANDIDATES = [
  'Alcaraz',
  'Djokovic',
  'Sinner',
  'Federer',
  'Nadal',
  'Murray',
  'Medvedev',
  'Zverev',
  'Tsitsipas',
  'Rublev',
  'Rune',
  'Fritz',
  'Ruud',
  'Shelton',
  'Becker',
  'Lendl',
  'Sampras',
];

export async function profileAsset(input: AssetProfileInput): Promise<AssetProfile> {
  const { videoPath, assetDir, durationSeconds, transcriptSegments } = input;
  const tempDir = resolve(assetDir, 'media_analysis_v2_temp', 'profile');
  await mkdir(tempDir, { recursive: true });

  const transcriptPreview = transcriptSegments
    .slice(0, 20)
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 4000);
  const transcriptText = transcriptSegments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(' ');

  const evidence: EvidenceRef[] = [];

  try {
    const sampleTimes = buildSampleTimes(durationSeconds);
    const imageParts: Array<{ mimeType: string; data: string }> = [];

    for (const [index, time] of sampleTimes.entries()) {
      const framePath = resolve(tempDir, `profile_${index}.jpg`);
      await extractFrameJpeg(videoPath, time, framePath, 360);
      const buf = await readFile(framePath);
      imageParts.push({ mimeType: 'image/jpeg', data: buf.toString('base64') });
      evidence.push({ type: 'frame', ref: `profile:${time.toFixed(1)}s` });
    }

    const prompt = `${PROFILE_PROMPT}\n\nTranscript summary:\n${transcriptPreview || 'No transcript available.'}`;
    const parsed = await callGemini(prompt, imageParts);

    if (parsed) {
      return {
        domain: toEnum(parsed.domain, ['sports', 'news', 'mixed', 'general', 'unknown'], 'unknown'),
        format: toEnum(parsed.format, [
          'live_match',
          'mixed_broadcast',
          'player_interview',
          'press_conference',
          'studio_show',
          'news_package',
          'feature_package',
          'unknown',
        ], inferFormatFromTranscript(transcriptPreview)),
        sport: asNullableString(parsed.sport),
        competition: asNullableString(parsed.competition),
        teams: asStringArray(parsed.teams),
        players: mergePlayers(
          asStringArray(parsed.players),
          inferPlayersFromTranscript(transcriptText, asNullableString(parsed.sport)),
        ),
        confidence: clampConfidence(parsed.confidence, 0.75),
        evidence: [
          ...evidence,
          { type: 'vision', ref: 'asset-profile', confidence: clampConfidence(parsed.confidence, 0.75) },
        ],
      };
    }
  } catch {
    // fall through to heuristic profile
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }

  const inferredFormat = inferFormatFromTranscript(transcriptPreview);
  const inferredDomain =
    inferredFormat === 'live_match' || inferredFormat === 'mixed_broadcast'
      ? 'sports'
      : inferredFormat === 'player_interview' || inferredFormat === 'press_conference'
        ? 'mixed'
        : 'general';

  return {
    domain: inferredDomain,
    format: inferredFormat,
    sport: inferSport(transcriptPreview),
    competition: null,
    teams: [],
    players: inferPlayersFromTranscript(transcriptText, inferSport(transcriptPreview)),
    confidence: 0.45,
    evidence: [{ type: 'heuristic', ref: 'transcript-profile', confidence: 0.45 }],
  };
}

function buildSampleTimes(durationSeconds: number): number[] {
  const clampedDuration = Math.max(1, durationSeconds);
  return [
    Math.min(15, clampedDuration * 0.1),
    clampedDuration * 0.5,
    Math.max(0, Math.min(clampedDuration - 1, clampedDuration * 0.85)),
  ];
}

function inferFormatFromTranscript(text: string): AssetProfile['format'] {
  const normalized = text.toLowerCase();
  const hasSportsCue = hasAnySportsCue(normalized);
  const hasInterviewCue = /(how does it feel|thanks for joining|speak to us|question|answer|interview)/.test(normalized);
  const hasPressCue = /(next question|media|press conference|reporter)/.test(normalized);

  if (hasSportsCue && hasInterviewCue) return 'mixed_broadcast';
  if (hasSportsCue) return 'live_match';
  if (hasPressCue) return 'press_conference';
  if (hasInterviewCue) return 'player_interview';
  return 'unknown';
}

function inferSport(text: string): string | null {
  return inferSportFromText(text);
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value !== 'null'
    ? value.trim()
    : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

export function inferPlayersFromTranscript(text: string, sport: string | null): string[] {
  if (sport?.toLowerCase() !== 'tennis') {
    return [];
  }

  const scores = TENNIS_PLAYER_CANDIDATES
    .map((name) => ({ name, score: scorePlayerMention(text, name) }))
    .filter((candidate) => candidate.score >= 2)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return scores.slice(0, 2).map((candidate) => candidate.name);
}

function scorePlayerMention(text: string, name: string): number {
  const chunks = text.split(/[.!?\n]+/);
  let score = 0;

  for (const chunk of chunks) {
    const mentions = countNameMentions(chunk, name);
    if (mentions === 0) continue;

    const normalized = chunk.toLowerCase();
    if (/(awaits? the winner|winner of this|final tomorrow|recovery)/.test(normalized)) {
      score -= mentions * 2;
      continue;
    }

    if (/(record|race|finals|titles?|draw alongside|made nine|leading that race)/.test(normalized)) {
      score -= mentions;
      continue;
    }

    score += mentions;
  }

  return score;
}

function countNameMentions(text: string, name: string): number {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mentionPattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'gi');
  return [...text.matchAll(mentionPattern)].length;
}

function mergePlayers(primary: string[], fallback: string[]): string[] {
  const merged: string[] = [];
  for (const player of [...primary, ...fallback]) {
    if (!merged.some((existing) => existing.toLowerCase() === player.toLowerCase())) {
      merged.push(player);
    }
  }
  return merged.slice(0, 2);
}

function toEnum<T extends string>(value: unknown, valid: T[], fallback: T): T {
  return typeof value === 'string' && valid.includes(value as T) ? value as T : fallback;
}

function clampConfidence(value: unknown, fallback: number): number {
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : fallback;
}
