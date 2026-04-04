import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { runOcrPipeline } from './src/lib/ocr/index.js';
import Database from 'better-sqlite3';

// Change this to test a different asset
const ASSET_ID = '3936415e-cded-4b32-a264-03b12a33d73f';

const STORAGE_ROOT = process.env.STORAGE_ROOT!;
const ASSET_DIR = `${STORAGE_ROOT}/${ASSET_ID}`;
const VIDEO_PATH = `${ASSET_DIR}/original.mp4`;
const TRANSCRIPT_PATH = `${ASSET_DIR}/transcript.json`;

async function main() {
  // Get duration from DB
  const db = new Database(process.env.DATABASE_PATH!);
  const asset = db.prepare('SELECT duration_seconds FROM assets WHERE id = ?').get(ASSET_ID) as { duration_seconds: number };
  if (!asset) { console.error('Asset not found'); return; }
  const duration = asset.duration_seconds;
  console.log(`Asset: ${ASSET_ID}`);
  console.log(`Duration: ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}\n`);

  // Load transcript
  let segments: { start: number; end: number; text: string }[] = [];
  try {
    const raw = await readFile(TRANSCRIPT_PATH, 'utf-8');
    const data = JSON.parse(raw);
    segments = data.segments ?? data;
    if (!Array.isArray(segments)) segments = [];
    console.log(`Transcript segments: ${segments.length}`);
  } catch {
    console.log('No transcript available — using audio only');
  }

  // Run pipeline
  console.log('\nRunning OCR pipeline...');
  const start = Date.now();
  const result = await runOcrPipeline(VIDEO_PATH, duration, segments, ASSET_DIR);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\nCompleted in ${elapsed}s`);
  console.log(`Sport: ${result.sport}`);
  console.log(`Competition: ${result.competition}`);
  console.log(`Players: ${result.players.join(' vs ')}`);
  console.log(`Key Moments: ${result.keyMoments.length}\n`);

  for (const m of result.keyMoments) {
    const mins = Math.floor(m.timestamp / 60);
    const secs = Math.floor(m.timestamp % 60);
    console.log(`[${mins}:${String(secs).padStart(2, '0')}] ${m.label} ${m.score ? `| ${m.score}` : ''} ${m.set_period ?? ''}`);
  }

  // Write to DB
  db.prepare('UPDATE assets SET ocr_status = ?, ocr_sport = ?, ocr_competition = ?, ocr_players = ?, ocr_key_moments = ? WHERE id = ?')
    .run(
      'complete',
      result.sport,
      result.competition,
      result.players.length > 0 ? JSON.stringify(result.players) : null,
      result.keyMoments.length > 0 ? JSON.stringify(result.keyMoments) : null,
      ASSET_ID,
    );
  console.log('\nResults written to DB — refresh asset in browser to see Key Moments tab');
  db.close();
}

main().catch(console.error);
