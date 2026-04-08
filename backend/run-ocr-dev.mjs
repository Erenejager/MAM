/**
 * run-ocr-dev.mjs
 *
 * Dev script to run (or re-run) the OCR pipeline on any asset.
 *
 * Usage:
 *   node run-ocr-dev.mjs                    # runs on Djokovic/Alcaraz (default)
 *   node run-ocr-dev.mjs alcaraz            # search by title substring
 *   node run-ocr-dev.mjs 3936415e-cded-...  # run by exact UUID
 */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runOcrPipeline } from './dist/lib/ocr/index.js';
import Database from 'better-sqlite3';

const DEFAULT_ASSET_ID = '3936415e-cded-4b32-a264-03b12a33d73f';
const STORAGE_ROOT = process.env.STORAGE_ROOT;
const DB_PATH = process.env.DATABASE_PATH;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = String(Math.floor(secs % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

async function main() {
  const arg = process.argv[2];
  const db = new Database(DB_PATH);

  // Resolve asset
  let asset;
  if (!arg) {
    asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(DEFAULT_ASSET_ID);
  } else if (UUID_RE.test(arg)) {
    asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(arg);
  } else {
    asset = db.prepare("SELECT * FROM assets WHERE lower(title) LIKE lower('%' || ? || '%') LIMIT 1").get(arg);
  }

  if (!asset) {
    console.error(`Asset not found${arg ? ` matching "${arg}"` : ''}`);
    process.exit(1);
  }

  const assetDir = resolve(STORAGE_ROOT, asset.id);
  const ext = asset.filepath.split('.').pop();
  const videoPath = resolve(assetDir, `original.${ext}`);
  const transcriptPath = resolve(assetDir, 'transcript.json');

  if (!existsSync(videoPath)) {
    console.error(`Video file not found: ${videoPath}`);
    process.exit(1);
  }

  console.log(`Asset:    ${asset.title}`);
  console.log(`ID:       ${asset.id}`);
  console.log(`Duration: ${fmtTime(asset.duration_seconds)}`);
  console.log(`Previous: ocr_status=${asset.ocr_status ?? 'null'} | enriched=${asset.ocr_enriched ?? 0}`);
  console.log();

  // Load transcript
  let segments = [];
  try {
    const raw = await readFile(transcriptPath, 'utf-8');
    const data = JSON.parse(raw);
    segments = data.segments ?? data;
    if (!Array.isArray(segments)) segments = [];
    console.log(`Transcript: ${segments.length} segments`);
  } catch {
    console.log('Transcript: not available — using audio + vision only');
  }

  // Reset OCR state so pipeline runs fresh
  db.prepare(`UPDATE assets SET ocr_status = 'pending', ocr_enriched = 0 WHERE id = ?`).run(asset.id);

  console.log('\nRunning OCR pipeline...\n');
  const start = Date.now();
  let result;
  try {
    result = await runOcrPipeline(videoPath, asset.duration_seconds, segments, assetDir);
  } catch (err) {
    db.prepare(`UPDATE assets SET ocr_status = 'failed', ocr_error = ? WHERE id = ?`).run(String(err), asset.id);
    throw err;
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // Save to DB
  db.prepare(`
    UPDATE assets SET
      ocr_status = 'complete',
      ocr_error = NULL,
      ocr_sport = ?,
      ocr_competition = ?,
      ocr_players = ?,
      ocr_key_moments = ?,
      ocr_enriched = ?
    WHERE id = ?
  `).run(
    result.sport,
    result.competition,
    result.players.length > 0 ? JSON.stringify(result.players) : null,
    result.keyMoments.length > 0 ? JSON.stringify(result.keyMoments) : null,
    result.enriched ? 1 : 0,
    asset.id,
  );
  db.close();

  // Print summary
  const line = '='.repeat(64);
  console.log(line);
  console.log(`Completed in ${elapsed}s`);
  console.log(`Sport:       ${result.sport ?? '—'}`);
  console.log(`Competition: ${result.competition ?? '—'}`);
  console.log(`Players:     ${result.players.length > 0 ? result.players.join(' vs ') : '—'}`);
  console.log(`Key Moments: ${result.keyMoments.length}`);
  console.log(`Enriched:    ${result.enriched}`);
  console.log(line);
  console.log();

  for (const m of result.keyMoments) {
    const ts = fmtTime(m.timestamp);
    const range = m.startTime != null && m.endTime != null
      ? ` [${fmtTime(m.startTime)}→${fmtTime(m.endTime)}]`
      : '';
    const type = m.moment_type ? ` {${m.moment_type}}` : '';
    const period = m.set_period ? ` · ${m.set_period}` : '';
    const score = m.score_display ? ` | ${m.score_display}` : '';
    const conf = m.score_confidence !== 'none' ? ` (${m.score_confidence})` : '';
    const serving = m.serving ? ` ↑${m.serving}` : '';
    console.log(`[${ts}]${type}${period}  ${m.label}${score}${conf}${serving}${range}`);
  }

  if (result.keyMoments.length === 0) {
    console.log('  (no key moments detected)');
  }

  console.log('\nResults saved to database.');
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
