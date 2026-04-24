import { mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeVideo } from './src/lib/media-analysis-v2/video-utils.js';
import { runMediaAnalysisV2 } from './src/lib/media-analysis-v2/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const videoPath = process.argv[2];
const transcriptPath = process.argv[3];
const assetDir = process.argv[4] ?? resolve(__dirname, '.tmp', 'media-analysis-v2');

if (!videoPath || !transcriptPath) {
  console.error('Usage: node backend/run-media-analysis-v2.mjs <videoPath> <transcriptJsonPath> [assetDir]');
  process.exit(1);
}

const transcriptData = JSON.parse(await readFile(transcriptPath, 'utf-8'));
const transcriptSegments = Array.isArray(transcriptData)
  ? transcriptData
  : transcriptData.segments ?? [];
const metadata = await probeVideo(videoPath);
await mkdir(assetDir, { recursive: true });

const result = await runMediaAnalysisV2(
  videoPath,
  metadata.durationSeconds,
  transcriptSegments,
  assetDir,
  (step, detail) => {
    console.log(`[v2] ${step}${detail ? ` — ${detail}` : ''}`);
  },
);

console.log(JSON.stringify(result, null, 2));
console.log(`\nSaved to ${assetDir}/media_analysis_v2/result.json`);
