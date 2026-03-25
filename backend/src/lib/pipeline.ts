import { resolve, basename, dirname } from 'node:path';
import { unlink, writeFile, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';
import Groq from 'groq-sdk';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { assets } from '../db/schema.js';
import { opensearchClient } from '../bootstrap/opensearch.js';

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

async function transcribeWithGroq(filePath: string): Promise<TranscriptResult> {
  const tempPath = filePath.replace(/\.[^.]+$/, '-audio.ogg');
  try {
    // Extract 16 kHz mono OGG — required by Groq (25 MB limit; OGG is far smaller than raw video)
    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .noVideo()
        .audioFrequency(16000)
        .audioChannels(1)
        .audioCodec('libvorbis')
        .output(tempPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const result = await groq.audio.transcriptions.create({
      file: createReadStream(tempPath),
      model: 'whisper-large-v3',
      response_format: 'verbose_json',
    });

    const segments: Segment[] = ((result as any).segments ?? []).map(
      (s: { start: number; end: number; text: string }) => ({
        start: s.start,
        end: s.end,
        text: s.text.trim(),
      }),
    );

    return { text: result.text ?? '', segments };
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

// ─── Stage 4: OpenSearch indexing ─────────────────────────────────────────────

async function indexInOpenSearch(
  assetId: string,
  data: {
    title: string | null;
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
    // Hard failure: delete dir + record, leave no orphan
    await rm(assetDir, { recursive: true, force: true }).catch(() => {});
    db.delete(assets).where(eq(assets.id, assetId)).run();
    return;
  }

  // ── Stage 2: Thumbnail (hard failure — asset unusable without visual) ─────
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
    await rm(assetDir, { recursive: true, force: true }).catch(() => {});
    db.delete(assets).where(eq(assets.id, assetId)).run();
    return;
  }

  // ── Stage 3: Transcription (soft failure — asset usable without transcript) ─
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
    } catch (err) {
      updateAsset(assetId, {
        transcriptionStatus: 'failed',
        transcriptionError: err instanceof Error ? err.message : String(err),
      });
      // Soft fail — continue to next stage
    }
  }

  // ── Stage 4: OpenSearch indexing (soft failure — search degrades gracefully) ─
  updateAsset(assetId, { searchIndexStatus: 'processing' });
  const fresh = db.select().from(assets).where(eq(assets.id, assetId)).get();
  try {
    if (fresh) {
      await indexInOpenSearch(assetId, {
        title: fresh.title,
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
