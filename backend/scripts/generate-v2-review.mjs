import { readFile, writeFile } from 'node:fs/promises';

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error('Usage: node backend/scripts/generate-v2-review.mjs <result.json> <output.md>');
  process.exit(1);
}

const result = JSON.parse(await readFile(inputPath, 'utf-8'));

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const events = [...result.events].sort((a, b) => a.anchorTime - b.anchorTime);
const lines = [];

lines.push('# Alcaraz vs Djokovic V2 Event Review');
lines.push('');
lines.push(`Source: \`${inputPath}\``);
lines.push('');
lines.push(
  `Profile: domain=${result.assetProfile.domain}, format=${result.assetProfile.format}, sport=${result.assetProfile.sport}, competition=${result.assetProfile.competition ?? 'null'}`,
);
lines.push(`Counts: ${result.segments.length} segments, ${result.events.length} events`);
lines.push('');
lines.push('Review format: add your note after each item, for example `Correct`, `Wrong`, or `Borderline`, plus what should change.');
lines.push('');

for (const [index, event] of events.entries()) {
  lines.push(`## ${index + 1}. ${formatTime(event.anchorTime)} - ${event.type}`);
  lines.push(`- Label: ${event.label}`);
  lines.push(`- Confidence: ${event.confidence}`);
  lines.push(`- Segment: ${event.segmentId}`);

  if (event.startTime != null || event.endTime != null) {
    lines.push(`- Range: ${event.startTime != null ? formatTime(event.startTime) : '?'} -> ${event.endTime != null ? formatTime(event.endTime) : '?'}`);
  }

  if (event.entities?.length) {
    lines.push(`- Entities: ${event.entities.join(', ')}`);
  }

  lines.push('- Review: ');
  lines.push('');
}

await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf-8');
console.log(`Wrote ${outputPath}`);
