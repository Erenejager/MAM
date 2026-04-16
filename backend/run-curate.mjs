/**
 * run-curate.mjs
 *
 * Run only the Gemini curation pass on existing OCR key moments in the DB.
 * Does NOT re-run the full OCR pipeline — reads existing data, curates, saves back.
 *
 * Usage:
 *   node run-curate.mjs                    # runs on Djokovic/Alcaraz (default)
 *   node run-curate.mjs <uuid>             # run by exact UUID
 *   node run-curate.mjs alcaraz            # search by title substring
 */

import 'dotenv/config';
import { resolve } from 'node:path';
import { curateKeyMoments } from './dist/lib/ocr/result-processing.js';
import Database from 'better-sqlite3';

const DEFAULT_ASSET_ID = '3936415e-cded-4b32-a264-03b12a33d73f';
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

  if (!asset.ocr_key_moments) {
    console.error('No OCR key moments found for this asset — run the full OCR pipeline first.');
    process.exit(1);
  }

  const keyMoments = JSON.parse(asset.ocr_key_moments);
  const players = asset.ocr_players ? JSON.parse(asset.ocr_players) : [];

  console.log(`Asset:       ${asset.title}`);
  console.log(`Sport:       ${asset.ocr_sport ?? '—'}`);
  console.log(`Competition: ${asset.ocr_competition ?? '—'}`);
  console.log(`Players:     ${players.join(' vs ') || '—'}`);
  console.log(`Moments in:  ${keyMoments.length}`);
  console.log();

  const ocrOutput = {
    sport: asset.ocr_sport,
    competition: asset.ocr_competition,
    players,
    keyMoments,
    enriched: !!asset.ocr_enriched,
  };

  console.log('Running curation pass...\n');
  const start = Date.now();
  const curated = await curateKeyMoments(ocrOutput);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // Save back to DB
  db.prepare(`
    UPDATE assets SET ocr_key_moments = ? WHERE id = ?
  `).run(
    curated.keyMoments.length > 0 ? JSON.stringify(curated.keyMoments) : null,
    asset.id,
  );
  db.close();

  const line = '='.repeat(64);
  console.log(line);
  console.log(`Completed in ${elapsed}s`);
  console.log(`Key Moments: ${keyMoments.length} → ${curated.keyMoments.length}`);
  console.log(line);
  console.log();

  for (const m of curated.keyMoments) {
    const ts = fmtTime(m.timestamp);
    const type = m.moment_type ? ` {${m.moment_type}}` : '';
    const period = m.set_period ? ` · ${m.set_period}` : '';
    const score = m.score_display ? ` | ${m.score_display}` : '';
    const conf = m.score_confidence !== 'none' ? ` (${m.score_confidence})` : '';
    const range = m.startTime != null && m.endTime != null
      ? ` [${fmtTime(m.startTime)}→${fmtTime(m.endTime)}]`
      : '';
    console.log(`[${ts}]${type}${period}  ${m.label}${score}${conf}${range}`);
  }

  console.log('\nResults saved to database.');
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
