import { resolve, basename, dirname } from 'node:path';
import { unlink, writeFile, readFile, rm, stat, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';
import Groq from 'groq-sdk';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { assets } from '../db/schema.js';
import { opensearchClient } from '../bootstrap/opensearch.js';
import { runOcrPipeline } from './ocr/index.js';

const INDEX_NAME = 'mam-assets';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function updateAsset(id: string, values: Partial<typeof assets.$inferInsert>): void {
  db.update(assets).set(values).where(eq(assets.id, id)).run();
}

/** Retry up to maxAttempts times. Only retries on HTTP 429 (rate-limit). */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const is429 =
        err instanceof Error &&
        (err.message.includes('429') || err.message.toLowerCase().includes('rate limit'));
      if (!is429 || attempt === maxAttempts) throw err;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw lastErr;
}

// ─── Stage 1: ffprobe metadata ────────────────────────────────────────────────

interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  codec: string;
  bitrate: number;
  frameRate: number;
}

function probeFile(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);

      const videoStream = data.streams.find(s => s.codec_type === 'video');
      if (!videoStream) return reject(new Error('No video stream found'));

      const [num, den] = (videoStream.r_frame_rate || '0/1').split('/').map(Number);
      const frameRate = den > 0 ? num / den : 0;

      resolve({
        durationSeconds: data.format.duration ?? 0,
        width: videoStream.width ?? 0,
        height: videoStream.height ?? 0,
        codec: videoStream.codec_name ?? 'unknown',
        bitrate: data.format.bit_rate ? Number(data.format.bit_rate) : 0,
        frameRate,
      });
    });
  });
}

// ─── Stage 2: ffmpeg thumbnail ────────────────────────────────────────────────

function captureThumbnail(
  filePath: string,
  outputPath: string,
  durationSeconds: number,
): Promise<void> {
  // Seek to 5 s into video, or 10% of duration if shorter
  const seekTime = Math.min(5, durationSeconds * 0.1);
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .screenshots({
        count: 1,
        timemarks: [String(seekTime)],
        filename: basename(outputPath),
        folder: dirname(outputPath),
        size: '?x360',
      })
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err));
  });
}

// ─── Stage 2b: Preview frames for scrub preview ──────────────────────────────

function captureFrame(
  filePath: string,
  outputPath: string,
  seekTime: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .screenshots({
        count: 1,
        timemarks: [String(seekTime)],
        filename: basename(outputPath),
        folder: dirname(outputPath),
        size: '?x360',
      })
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err));
  });
}

async function generatePreviewFrames(
  filePath: string,
  assetDir: string,
  durationSeconds: number,
): Promise<void> {
  const frameCount = 6;
  for (let i = 0; i < frameCount; i++) {
    const seekTime = durationSeconds * (i + 0.5) / frameCount;
    const outputPath = resolve(assetDir, `frame_${i}.jpg`);
    await captureFrame(filePath, outputPath, seekTime);
  }
}

// ─── Stage 3: Groq transcription ─────────────────────────────────────────────

interface Segment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptResult {
  text: string;
  segments: Segment[];
}

const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24 MB (safe margin under 25 MB limit)
const CHUNK_DURATION_SECONDS = 600; // 10-minute chunks

async function extractAudioChunk(
  filePath: string,
  outputPath: string,
  startSeconds?: number,
  durationSeconds?: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg(filePath).noVideo().audioFrequency(16000).audioChannels(1).audioCodec('libvorbis');
    if (startSeconds !== undefined) cmd = cmd.setStartTime(startSeconds);
    if (durationSeconds !== undefined) cmd = cmd.setDuration(durationSeconds);
    cmd.output(outputPath).on('end', () => resolve()).on('error', (err: Error) => reject(err)).run();
  });
}

async function transcribeChunk(
  groq: Groq,
  chunkPath: string,
  offsetSeconds: number,
): Promise<{ text: string; segments: Segment[] }> {
  const result = await withRetry(async () => {
    return groq.audio.transcriptions.create({
      file: createReadStream(chunkPath),
      model: 'whisper-large-v3',
      response_format: 'verbose_json',
    });
  });

  const segments: Segment[] = ((result as any).segments ?? []).map(
    (s: { start: number; end: number; text: string }) => ({
      start: s.start + offsetSeconds,
      end: s.end + offsetSeconds,
      text: s.text.trim(),
    }),
  );

  return { text: result.text ?? '', segments };
}

async function transcribeWithGroq(filePath: string): Promise<TranscriptResult> {
  const tempDir = resolve(dirname(filePath), 'audio_chunks');
  await mkdir(tempDir, { recursive: true });

  try {
    // First extract full audio to check size
    const fullAudioPath = resolve(tempDir, 'full.ogg');
    await extractAudioChunk(filePath, fullAudioPath);
    const { size } = await stat(fullAudioPath);

    // If small enough, send as single file (no chunking needed)
    if (size <= MAX_CHUNK_SIZE) {
      console.log(`[transcribe] Audio ${(size / 1024 / 1024).toFixed(1)}MB — single request`);
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const result = await transcribeChunk(groq, fullAudioPath, 0);
      return { text: result.text, segments: result.segments };
    }

    // Need chunking — get duration from ffprobe
    await unlink(fullAudioPath).catch(() => {});
    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration ?? 0);
      });
    });

    const chunkCount = Math.ceil(duration / CHUNK_DURATION_SECONDS);
    console.log(`[transcribe] Audio ${(size / 1024 / 1024).toFixed(1)}MB — splitting into ${chunkCount} chunks of ${CHUNK_DURATION_SECONDS / 60}min`);

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const allSegments: Segment[] = [];
    const allTexts: string[] = [];

    for (let i = 0; i < chunkCount; i++) {
      const startSec = i * CHUNK_DURATION_SECONDS;
      const chunkPath = resolve(tempDir, `chunk_${i}.ogg`);

      await extractAudioChunk(filePath, chunkPath, startSec, CHUNK_DURATION_SECONDS);
      console.log(`[transcribe] Chunk ${i + 1}/${chunkCount} (${Math.floor(startSec / 60)}min–${Math.floor(Math.min(startSec + CHUNK_DURATION_SECONDS, duration) / 60)}min)`);

      const result = await transcribeChunk(groq, chunkPath, startSec);
      allTexts.push(result.text);
      allSegments.push(...result.segments);

      await unlink(chunkPath).catch(() => {});
    }

    return { text: allTexts.join(' '), segments: allSegments };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Stage 4: OpenSearch indexing ─────────────────────────────────────────────

async function indexInOpenSearch(
  assetId: string,
  data: {
    title: string | null;
    description: string | null;
    tags: string | null;
    transcriptText: string | null;
    durationSeconds: number | null;
    codec: string | null;
    width: number | null;
    height: number | null;
    createdAt: string | null;
  },
): Promise<void> {
  await opensearchClient.index({
    index: INDEX_NAME,
    id: assetId,
    body: {
      id: assetId,
      title: data.title ?? '',
      description: data.description ?? '',
      tags: JSON.parse(data.tags ?? '[]') as string[],
      transcript: data.transcriptText ?? '',
      duration_seconds: data.durationSeconds,
      codec: data.codec,
      resolution:
        data.width && data.height ? `${data.width}x${data.height}` : null,
      created_at: data.createdAt,
    },
  });
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runPipeline(assetId: string): Promise<void> {
  const storageRoot = process.env.STORAGE_ROOT!;

  // Fetch asset record
  const asset = db.select().from(assets).where(eq(assets.id, assetId)).get();
  if (!asset) return; // Already deleted (e.g. duplicate race)

  const filePath = resolve(storageRoot, asset.filepath);
  const assetDir = resolve(storageRoot, assetId);

  // ── Stage 1: Metadata (hard failure — asset unusable without it) ──────────
  updateAsset(assetId, { metadataStatus: 'processing' });
  let meta: VideoMetadata;
  try {
    meta = await probeFile(filePath);
    updateAsset(assetId, {
      metadataStatus: 'complete',
      durationSeconds: meta.durationSeconds,
      width: meta.width,
      height: meta.height,
      codec: meta.codec,
      bitrate: meta.bitrate,
      frameRate: meta.frameRate,
    });
  } catch (err) {
    console.error(`[pipeline] Stage 1 (metadata) failed for ${assetId}:`, err);
    // Hard failure: delete dir + record, leave no orphan
    await rm(assetDir, { recursive: true, force: true }).catch(() => {});
    db.delete(assets).where(eq(assets.id, assetId)).run();
    return;
  }

  // ── Stage 2: Thumbnail (soft failure — asset still usable without thumbnail) ─
  updateAsset(assetId, { thumbnailStatus: 'processing' });
  const thumbnailAbsPath = resolve(assetDir, 'thumbnail.jpg');
  const thumbnailRelPath = `${assetId}/thumbnail.jpg`;
  try {
    await captureThumbnail(filePath, thumbnailAbsPath, meta.durationSeconds);
    updateAsset(assetId, {
      thumbnailStatus: 'complete',
      thumbnailPath: thumbnailRelPath,
    });
  } catch (err) {
    console.error(`[pipeline] Stage 2 (thumbnail) failed for ${assetId}:`, err);
    updateAsset(assetId, { thumbnailStatus: 'failed' });
    // Continue — asset is still playable without a thumbnail
  }

  // ── Stage 2b: Preview frames (soft failure) ────────────────────────────────
  updateAsset(assetId, { framesStatus: 'processing' });
  try {
    await generatePreviewFrames(filePath, assetDir, meta.durationSeconds);
    updateAsset(assetId, { framesStatus: 'complete' });
  } catch (err) {
    console.error(`[pipeline] Stage 2b (preview frames) failed for ${assetId}:`, err);
    updateAsset(assetId, { framesStatus: 'failed' });
  }

  // ── Stage 3: Transcription (soft failure — asset usable without transcript) ─
  let transcriptOk = false;
  if (!process.env.GROQ_API_KEY) {
    updateAsset(assetId, { transcriptionStatus: 'skipped' });
  } else {
    updateAsset(assetId, { transcriptionStatus: 'processing' });
    try {
      const transcript = await withRetry(() => transcribeWithGroq(filePath));
      const transcriptAbsPath = resolve(assetDir, 'transcript.json');
      const transcriptRelPath = `${assetId}/transcript.json`;
      await writeFile(transcriptAbsPath, JSON.stringify(transcript, null, 2), 'utf-8');
      updateAsset(assetId, {
        transcriptionStatus: 'complete',
        transcriptText: transcript.text,
        transcriptPath: transcriptRelPath,
      });
      transcriptOk = true;
    } catch (err) {
      console.error(`[pipeline] Stage 3 (transcription) failed for ${assetId}:`, err);
      updateAsset(assetId, {
        transcriptionStatus: 'failed',
        transcriptionError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Stage: OCR Key Moments ──────────────────────────────────────────────────
  if (!process.env.GEMINI_API_KEY || !transcriptOk) {
    updateAsset(assetId, { ocrStatus: 'skipped' });
  } else {
    updateAsset(assetId, { ocrStatus: 'processing' });
    try {
      // Load transcript segments if available
      let segments: { start: number; end: number; text: string }[] = [];
      const transcriptFile = resolve(assetDir, 'transcript.json');
      try {
        const raw = await readFile(transcriptFile, 'utf-8');
        const data = JSON.parse(raw);
        segments = data.segments ?? data;
        if (!Array.isArray(segments)) segments = [];
      } catch {
        // No transcript available — OCR will rely on audio only
      }

      const duration = meta.durationSeconds;
      if (duration < 10) {
        // Video too short for meaningful analysis
        updateAsset(assetId, { ocrStatus: 'skipped' });
      } else {
        const result = await runOcrPipeline(
          filePath,
          duration,
          segments,
          assetDir,
        );

        if (result.keyMoments.length === 0) {
          updateAsset(assetId, { ocrStatus: 'complete' });
        } else {
          updateAsset(assetId, {
            ocrStatus: 'complete',
            ocrSport: result.sport,
            ocrCompetition: result.competition,
            ocrPlayers: result.players.length > 0 ? JSON.stringify(result.players) : null,
            ocrKeyMoments: JSON.stringify(result.keyMoments),
            ocrEnriched: result.enriched ?? false,
          });
        }
      }
    } catch (err) {
      updateAsset(assetId, {
        ocrStatus: 'failed',
        ocrError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Stage 4: OpenSearch indexing (soft failure — search degrades gracefully) ─
  updateAsset(assetId, { searchIndexStatus: 'processing' });
  const fresh = db.select().from(assets).where(eq(assets.id, assetId)).get();
  try {
    if (fresh) {
      await indexInOpenSearch(assetId, {
        title: fresh.title,
        description: fresh.description,
        tags: fresh.tags,
        transcriptText: fresh.transcriptText,
        durationSeconds: fresh.durationSeconds,
        codec: fresh.codec,
        width: fresh.width,
        height: fresh.height,
        createdAt: fresh.createdAt,
      });
    }
    updateAsset(assetId, { searchIndexStatus: 'complete' });
  } catch (err) {
    updateAsset(assetId, { searchIndexStatus: 'failed' });
    // Soft fail — app continues without search for this asset
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  updateAsset(assetId, { status: 'ready' });
}
