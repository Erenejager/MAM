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

  const pipelineStart = Date.now();
  let stepStart = Date.now();
  let currentStep = '';

  const STEP_LABELS = {
    'scoring':        'Step 1/8  Scoring transcript + audio energy',
    'peak-detection': 'Step 2/8  Detecting coarse peaks',
    'refine-peaks':   'Step 3/8  Refining peaks (overlay diff)',
    'identify-match': 'Step 4/8  Identifying sport / players (pass 1)',
    'vision-analysis':'Step 5/8  Vision analysis — all peaks (pass 2)',
    'process-results':'Step 6/8  Processing results',
    'curation':       'Step 7/8  LLM curation (pass 3)',
    'boundaries':     'Step 8a   Finding moment boundaries (pass 4)',
    'enrichment':     'Step 8b   Context enrichment (pass 5)',
    'done':           'Done',
  };

  function onProgress(step, detail) {
    const now = Date.now();
    if (currentStep) {
      const stepElapsed = ((now - stepStart) / 1000).toFixed(1);
      console.log(`       ✓ done in ${stepElapsed}s`);
    }
    stepStart = now;
    currentStep = step;
    const totalElapsed = ((now - pipelineStart) / 1000).toFixed(1);
    const label = STEP_LABELS[step] ?? step;
    const suffix = detail ? `  (${detail})` : '';
    if (step === 'done') {
      const total = ((now - pipelineStart) / 1000).toFixed(1);
      console.log(`\n[+${totalElapsed}s] ${label}${suffix} — total ${total}s`);
    } else {
      console.log(`\n[+${totalElapsed}s] ${label}${suffix}`);
    }
  }

  console.log('\nRunning OCR pipeline...');
  const start = Date.now();
  const result = await runOcrPipeline(VIDEO_PATH, duration, segments, ASSET_DIR, onProgress);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`${'='.repeat(60)}`);
  console.log(`Completed in ${elapsed}s`);
  console.log(`Sport:       ${result.sport ?? '—'}`);
  console.log(`Competition: ${result.competition ?? '—'}`);
  console.log(`Players:     ${result.players.length > 0 ? result.players.join(' vs ') : '—'}`);
  console.log(`Key Moments: ${result.keyMoments.length}`);
  console.log('='.repeat(60));

  for (const m of result.keyMoments) {
    const mins = Math.floor(m.timestamp / 60);
    const secs = String(Math.floor(m.timestamp % 60)).padStart(2, '0');
    const score = m.score ? ` | ${m.score}` : '';
    const period = m.set_period ? ` · ${m.set_period}` : '';
    const time = m.game_time ? ` [${m.game_time}]` : '';
    console.log(`[${mins}:${secs}] ${m.label}${score}${period}${time}`);
  }

  db.prepare(`
    UPDATE assets SET
      ocr_status = 'complete',
      ocr_sport = ?,
      ocr_competition = ?,
      ocr_players = ?,
      ocr_key_moments = ?
    WHERE id = ?
  `).run(
    result.sport,
    result.competition,
    result.players.length > 0 ? JSON.stringify(result.players) : null,
    result.keyMoments.length > 0 ? JSON.stringify(result.keyMoments) : null,
    ASSET_ID,
  );
  console.log('\nResults saved to database.');
  db.close();
}

main().catch(console.error);
