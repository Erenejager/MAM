import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import PQueue from 'p-queue';
import { computeFinegrainEnergy } from './audio-peaks.js';
import type { KeyMoment } from './result-processing.js';
import type { TranscriptSegment } from './transcript-scoring.js';

const execFileAsync = promisify(execFile);

const AUDIO_CURVE_RADIUS = 90;
const TRANSCRIPT_RADIUS = 60;
const WIDE_FRAME_RADIUS = 30;
const WIDE_FRAME_INTERVAL = 5;
const DENSE_FRAME_RADIUS = 5;
const FRAME_CONCURRENCY = 10;

export interface EnrichmentInput {
  videoPath: string;
  assetDir: string;
  durationSeconds: number;
  moments: KeyMoment[];
  transcriptSegments: TranscriptSegment[];
  sport: string | null;
  competition: string | null;
}

export interface MomentContext {
  label: string;
  score: string | null;
  set_period: string | null;
  game_time: string | null;
  sport: string | null;
  competition: string | null;
  peakTime: number;
  suggestedStartTime: number | undefined;
  suggestedEndTime: number | undefined;
  scoreBefore: string | null;
  scoreAfter: string | null;
  scoreChanged: boolean;
  audioEnergy: number;
  momentIndex: number;
}

export async function enrichMoments(input: EnrichmentInput): Promise<void> {
  const { videoPath, assetDir, durationSeconds, moments, transcriptSegments, sport, competition } = input;

  for (let i = 0; i < moments.length; i++) {
    const moment = moments[i];
    const momentDir = resolve(assetDir, 'moments', String(i));
    await mkdir(resolve(momentDir, 'frames'), { recursive: true });

    const peakTime = moment.peakTime ?? moment.timestamp;

    // 1. Audio curve (±90s, 1s windows)
    await extractAudioCurve(videoPath, momentDir, peakTime, durationSeconds);

    // 2. Key frames (±30s@5s + ±5s@1s)
    await extractKeyFrames(videoPath, momentDir, peakTime, durationSeconds);

    // 3. Transcript segments (±60s)
    const nearbySegments = transcriptSegments.filter(
      (s) => s.end > peakTime - TRANSCRIPT_RADIUS && s.start < peakTime + TRANSCRIPT_RADIUS,
    );
    await writeFile(
      resolve(momentDir, 'transcript.json'),
      JSON.stringify(nearbySegments, null, 2),
      'utf-8',
    );

    // 4. Context JSON
    const prevScoreDisplay = i > 0 ? moments[i - 1].score_display : null;
    const currentScoreDisplay = moment.score_display;

    const context: MomentContext = {
      label: moment.label,
      score: currentScoreDisplay,
      set_period: moment.set_period,
      game_time: moment.game_time,
      sport,
      competition,
      peakTime,
      suggestedStartTime: moment.startTime,
      suggestedEndTime: moment.endTime,
      scoreBefore: prevScoreDisplay,
      scoreAfter: currentScoreDisplay,
      scoreChanged: moment.score_changed ?? false,
      audioEnergy: moment.audio_energy,
      momentIndex: i,
    };

    await writeFile(
      resolve(momentDir, 'context.json'),
      JSON.stringify(context, null, 2),
      'utf-8',
    );
  }
}

async function extractAudioCurve(
  videoPath: string,
  momentDir: string,
  peakTime: number,
  durationSeconds: number,
): Promise<void> {
  try {
    const { offset, energies } = await computeFinegrainEnergy(
      videoPath,
      peakTime,
      AUDIO_CURVE_RADIUS,
      durationSeconds,
    );
    await writeFile(
      resolve(momentDir, 'audio-curve.json'),
      JSON.stringify({ offset, peakTime, energies }, null, 2),
      'utf-8',
    );
  } catch (err) {
    console.error(`[enrich] Audio curve extraction failed for peak at ${peakTime}:`, err);
    await writeFile(
      resolve(momentDir, 'audio-curve.json'),
      JSON.stringify({ offset: 0, peakTime, energies: [] }),
      'utf-8',
    );
  }
}

async function extractKeyFrames(
  videoPath: string,
  momentDir: string,
  peakTime: number,
  durationSeconds: number,
): Promise<void> {
  const framesDir = resolve(momentDir, 'frames');
  const ffmpegQueue = new PQueue({ concurrency: FRAME_CONCURRENCY });

  const frameTimes = new Set<number>();

  // Wide frames: ±30s at 5s intervals
  for (let offset = -WIDE_FRAME_RADIUS; offset <= WIDE_FRAME_RADIUS; offset += WIDE_FRAME_INTERVAL) {
    const t = Math.round(peakTime + offset);
    if (t >= 0 && t <= durationSeconds) frameTimes.add(t);
  }

  // Dense frames: ±5s at 1s intervals
  for (let offset = -DENSE_FRAME_RADIUS; offset <= DENSE_FRAME_RADIUS; offset++) {
    const t = Math.round(peakTime + offset);
    if (t >= 0 && t <= durationSeconds) frameTimes.add(t);
  }

  const sortedTimes = [...frameTimes].sort((a, b) => a - b);

  await Promise.all(
    sortedTimes.map((t) => {
      const relOffset = t - Math.round(peakTime);
      const sign = relOffset >= 0 ? '+' : '-';
      const filename = `frame_${sign}${String(Math.abs(relOffset)).padStart(3, '0')}.jpg`;
      const outputPath = resolve(framesDir, filename);
      return ffmpegQueue.add(() => extractSingleFrame(videoPath, t, outputPath));
    }),
  );
}

async function extractSingleFrame(
  videoPath: string,
  timeSeconds: number,
  outputPath: string,
): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-ss', String(timeSeconds),
    '-i', videoPath,
    '-frames:v', '1',
    '-vf', 'scale=-1:360',
    '-q:v', '3',
    '-y',
    outputPath,
  ]);
}
