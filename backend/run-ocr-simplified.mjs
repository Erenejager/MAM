import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { runOcrPipeline } from './dist/lib/ocr/index.js';
import Database from 'better-sqlite3';

const ASSET_ID = '3936415e-cded-4b32-a264-03b12a33d73f';

const STORAGE_ROOT = process.env.STORAGE_ROOT;
const ASSET_DIR = `${STORAGE_ROOT}/${ASSET_ID}`;
const VIDEO_PATH = `${ASSET_DIR}/original.mp4`;
const TRANSCRIPT_PATH = `${ASSET_DIR}/transcript.json`;

async function main() {
  const db = new Database(process.env.DATABASE_PATH);
  const asset = db.prepare('SELECT duration_seconds FROM assets WHERE id = ?').get(ASSET_ID);
  if (!asset) { console.error('Asset not found'); return; }
  const duration = asset.duration_seconds;
  console.log(`Asset: ${ASSET_ID}`);
  console.log(`Duration: ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}\n`);

  let segments = [];
  try {
    const raw = await readFile(TRANSCRIPT_PATH, 'utf-8');
    const data = JSON.parse(raw);
    segments = data.segments ?? data;
    if (!Array.isArray(segments)) segments = [];
    console.log(`Transcript segments: ${segments.length}`);
  } catch {
    console.log('No transcript available — using audio only');
  }

  console.log('\nRunning OCR pipeline...\n');
  const start = Date.now();
  const result = await runOcrPipeline(VIDEO_PATH, duration, segments, ASSET_DIR);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Completed in ${elapsed}s`);
  console.log(`Sport: ${result.sport}`);
  console.log(`Competition: ${result.competition}`);
  console.log(`Players: ${result.players.join(' vs ')}`);
  console.log(`Key Moments: ${result.keyMoments.length}`);
  console.log('='.repeat(60));

  for (const m of result.keyMoments) {
    const ts = m.timestamp;
    const mins = Math.floor(ts / 60);
    const secs = Math.floor(ts % 60);
    const peak = m.peakTime ? ` (peak: ${Math.floor(m.peakTime/60)}:${String(Math.floor(m.peakTime%60)).padStart(2,'0')})` : '';
    const range = m.startTime != null && m.endTime != null
      ? ` [${Math.floor(m.startTime/60)}:${String(Math.floor(m.startTime%60)).padStart(2,'0')} → ${Math.floor(m.endTime/60)}:${String(Math.floor(m.endTime%60)).padStart(2,'0')}]`
      : '';
    console.log(`[${mins}:${String(secs).padStart(2, '0')}] ${m.label} ${m.score ? `| ${m.score}` : ''} ${m.set_period ?? ''}${peak}${range}`);
  }

  console.log('\n' + JSON.stringify(result, null, 2));
  db.close();
}

main().catch(console.error);
