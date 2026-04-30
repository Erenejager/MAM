import { execFile } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const resultPath = process.argv[2];
const assetDir = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const minScoreArg = process.argv.find((arg) => arg.startsWith('--min-score='));
const extractFramesArg = process.argv.find((arg) => arg.startsWith('--extract-frames='));
const videoArg = process.argv.find((arg) => arg.startsWith('--video='));
const detectScoreboard = process.argv.includes('--detect-scoreboard');
const detectorImageArg = process.argv.find((arg) => arg.startsWith('--detector-image='));
const detectorModelDirArg = process.argv.find((arg) => arg.startsWith('--detector-model-dir='));
const detectorModelArg = process.argv.find((arg) => arg.startsWith('--detector-model='));
const detectorOutputArg = process.argv.find((arg) => arg.startsWith('--detector-output='));
const detectorConfArg = process.argv.find((arg) => arg.startsWith('--detector-conf='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 50;
const minScore = minScoreArg ? Number(minScoreArg.split('=')[1]) : 0.52;
const extractFramesDir = extractFramesArg ? extractFramesArg.split('=')[1] : null;
const videoPath = videoArg ? videoArg.split('=')[1] : assetDir ? resolve(assetDir, 'original.mp4') : null;
const detectorImage = detectorImageArg ? detectorImageArg.split('=')[1] : 'scoreboard-detector';
const detectorModelDir = detectorModelDirArg ? detectorModelDirArg.split('=')[1] : resolve(process.cwd(), 'models/scoreboard-yolo');
const detectorModel = detectorModelArg ? detectorModelArg.split('=')[1] : 'best.onnx';
const detectorOutputDir = detectorOutputArg
  ? detectorOutputArg.split('=')[1]
  : extractFramesDir
    ? resolve(extractFramesDir, 'scoreboard-crops')
    : null;
const detectorConf = detectorConfArg ? detectorConfArg.split('=')[1] : '0.25';
const fallbackSampleOffsets = [-10, -5, -2, 0, 2, 5, 10, 15];

if (!resultPath) {
  console.error('Usage: node backend/scripts/audit-v2-ocr-sampling-plan.mjs <media_analysis_v2/result.json> [assetDir] [--limit=50] [--min-score=0.52] [--extract-frames=/tmp/ocr-samples] [--video=/path/video.mp4] [--detect-scoreboard]');
  process.exit(1);
}

const result = JSON.parse(await readFile(resultPath, 'utf-8'));
const audioProfile = result.audioProfile ?? result.timelineIndex?.audioProfile ?? null;
const windows = result.timelineIndex?.windows ?? [];
const events = result.events ?? [];
const peaks = result.audioPeaks ?? [];
const episodes = result.audioReactionEpisodes ?? [];
const oneSecond = audioProfile?.summaries?.oneSecond ?? [];
const legacyOcrContexts = assetDir ? await loadLegacyOcrContexts(assetDir) : [];

if (!audioProfile || oneSecond.length === 0) {
  console.error('No audioProfile summaries found. Re-run V2 with audio profile output enabled.');
  process.exit(1);
}

const scoredRows = oneSecond
  .map((summary) => scoreSummary(summary))
  .filter((row) => row.score >= minScore);
const groups = groupRows(scoredRows, 2);
const candidates = groups
  .map(buildCandidate)
  .sort((a, b) => b.priorityScore - a.priorityScore || a.anchorTime - b.anchorTime)
  .slice(0, limit);

console.log('# V2 OCR Sampling Plan Around Reaction-Like Anchors');
console.log('');
console.log(`result: ${resultPath}`);
if (assetDir) console.log(`assetDir: ${assetDir}`);
console.log(`1s summaries: ${oneSecond.length}`);
console.log(`reaction-like groups: ${groups.length}`);
console.log(`displayed: ${candidates.length}`);
if (extractFramesDir) console.log(`extractFramesDir: ${extractFramesDir}`);
if (detectScoreboard) console.log(`scoreboardDetector: ${detectorImage}`);
console.log('');
console.log('This is a sampling/audit manifest only. It proposes OCR frame times around V2-owned reaction-like anchors; it does not change events.');
console.log('');
console.log('| rank | review class | anchor | audio score | audio-aware samples | before OCR | after OCR | score read | current event | episode role | transcript |');
console.log('| ---: | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |');

for (let index = 0; index < candidates.length; index++) {
  const candidate = candidates[index];
  console.log([
    index + 1,
    candidate.reviewClass,
    formatTime(candidate.anchorTime),
    formatNumber(candidate.audioScore),
    formatSamplePoints(candidate.samplePoints),
    summarizeOcr(candidate.beforeOcr),
    summarizeOcr(candidate.afterOcr),
    summarizeScoreRead(candidate.beforeOcr, candidate.afterOcr),
    candidate.nearbyEvent,
    candidate.episodeRole,
    compactText(candidate.transcript, 160),
  ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
}

console.log('');
console.log('## Manual Anchor Coverage');
console.log('');
console.log('| time | nearest sampled anchor | review class | audio-aware samples | legacy OCR read | current event |');
console.log('| --- | --- | --- | --- | --- | --- |');

for (const time of ['37:48', '40:54', '79:41', '85:02', '86:59'].map(parseTimecode)) {
  const nearby = candidates
    .map((candidate) => ({ candidate, distance: Math.abs(candidate.anchorTime - time) }))
    .filter(({ distance }) => distance <= 45)
    .sort((a, b) => a.distance - b.distance || b.candidate.priorityScore - a.candidate.priorityScore)[0] ?? null;
  const event = nearestEvent(time, 15);
  console.log([
    formatTime(time),
    nearby ? `${formatTime(nearby.candidate.anchorTime)} d=${formatNumber(nearby.distance)}` : '',
    nearby?.candidate.reviewClass ?? '',
    nearby ? formatSamplePoints(nearby.candidate.samplePoints) : '',
    nearby ? summarizeScoreRead(nearby.candidate.beforeOcr, nearby.candidate.afterOcr) : '',
    event ? `${event.type}@${formatTime(event.anchorTime ?? event.startTime ?? 0)} ${event.label ?? ''}` : '',
  ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
}

if (extractFramesDir) {
  if (!videoPath) {
    console.error('Cannot extract frames without a video path. Provide assetDir with original.mp4 or --video=/path/video.mp4.');
    process.exit(1);
  }

  const frameManifest = await extractSampleFrames(candidates, videoPath, extractFramesDir);
  console.log('');
  console.log(`Extracted OCR sample frames to: ${extractFramesDir}`);

  if (detectScoreboard) {
    const detectionRows = await runScoreboardDetector({
      frameManifest,
      detectorImage,
      detectorModelDir,
      detectorModel,
      detectorOutputDir,
      detectorConf,
    });
    await writeFile(resolve(extractFramesDir, 'scoreboard-detections.json'), JSON.stringify(detectionRows, null, 2), 'utf-8');
    console.log(`Ran scoreboard detector and wrote: ${resolve(extractFramesDir, 'scoreboard-detections.json')}`);
  }
} else if (detectScoreboard) {
  console.error('Cannot run scoreboard detector without --extract-frames=/tmp/path.');
  process.exit(1);
}

function scoreSummary(summary) {
  const context = summary.context ?? {};
  const contextReaction = context.reactionBurstScore ?? summary.reactionBurstScore ?? 0;
  const contextSpeech = context.speechDominanceScore ?? summary.speechDominanceScore ?? 0;
  const contextRally = context.rallyTextureScore ?? summary.rallyTextureScore ?? 0;
  const contextCrowd = context.applauseCrowdScore ?? summary.applauseCrowdScore ?? 0;
  const contextMusic = context.musicBedScore ?? summary.musicBedScore ?? 0;
  const suppressionReasons = context.suppressionReasons ?? [];
  const peak = nearestPeak(midpoint(summary.start, summary.end), 6);
  const episodeMember = peak ? episodeMemberForPeak(peak.id) : null;
  const attackScore = clamp01((summary.strongestAttackScore ?? 0) / 0.25);
  const episodePrimaryBoost = episodeMember?.role === 'primary_anchor' ? 0.14 : 0;
  const rawPeakBoost = peak && peak.spikeScore >= 0.25 ? 0.08 : 0;
  const tailPenalty = episodeMember?.role === 'recap_or_speech_tail' ? 0.25 : 0;
  const speechPenalty = Math.max(0, contextSpeech - 0.72) * 0.55;
  const suppressionPenalty = suppressionReasons.includes('replay_cue') ? 0.18 : 0;
  const musicPenalty = contextMusic >= 0.68 ? 0.12 : 0;

  const score = clamp01(
    contextReaction * 0.46
    + contextRally * 0.18
    + contextCrowd * 0.14
    + attackScore * 0.12
    + episodePrimaryBoost
    + rawPeakBoost
    - tailPenalty
    - speechPenalty
    - suppressionPenalty
    - musicPenalty,
  );

  return {
    summary,
    score: round3(score),
    contextReaction,
    contextSpeech,
    contextRally,
    suppressionReasons,
    peak,
    episodeMember,
  };
}

function groupRows(rows, maxGapSeconds) {
  const sorted = [...rows].sort((a, b) => a.summary.start - b.summary.start);
  const groups = [];

  for (const row of sorted) {
    const previous = groups[groups.length - 1];
    const previousRow = previous?.[previous.length - 1] ?? null;
    if (!previous || !previousRow || row.summary.start - previousRow.summary.end > maxGapSeconds) {
      groups.push([row]);
      continue;
    }
    previous.push(row);
  }

  return groups;
}

function buildCandidate(group) {
  const best = [...group].sort((a, b) => b.score - a.score || a.summary.start - b.summary.start)[0];
  const summary = best.summary;
  const anchorTime = summary.strongestAttackTime ?? midpoint(summary.start, summary.end);
  const peak = best.peak ?? nearestPeak(anchorTime, 8);
  const member = peak ? episodeMemberForPeak(peak.id) : null;
  const episode = member ? episodeForMember(member) : null;
  const transcript = transcriptAround(anchorTime, 25, 35);
  const context = summary.context ?? {};
  const suppressionReasons = context.suppressionReasons ?? [];
  const nearbyEvent = nearestEvent(anchorTime, 15);
  const beforeOcr = nearestOcrBefore(anchorTime, 45);
  const afterOcr = nearestOcrAfter(anchorTime, 60);
  const samplePoints = selectAudioAwareSamplePoints(group, anchorTime);
  const reviewClass = classifyReviewClass({
    transcript,
    nearbyEvent,
    member,
    context,
    suppressionReasons,
    beforeOcr,
    afterOcr,
  });
  const priorityScore = round3(best.score + reviewPriorityBoost(reviewClass, nearbyEvent));

  return {
    anchorTime,
    audioScore: best.score,
    priorityScore,
    samplePoints,
    reviewClass,
    beforeOcr,
    afterOcr,
    nearbyEvent: nearbyEvent ? `${nearbyEvent.type}@${formatTime(nearbyEvent.anchorTime ?? nearbyEvent.startTime ?? 0)} ${nearbyEvent.label ?? ''}` : '',
    episodeRole: member ? `${member.role}${episode ? `/${episode.id}` : ''}` : '',
    transcript,
  };
}

function selectAudioAwareSamplePoints(group, anchorTime) {
  const groupStart = Math.min(...group.map((row) => row.summary.start));
  const groupEnd = Math.max(...group.map((row) => row.summary.end));
  const candidates = [];

  const quietBefore = bestSummaryInRange(anchorTime - 14, anchorTime - 3, (summary) =>
    (summary.silenceRatio ?? 0) * 0.7 - (summary.rmsEnergy ?? 0) * 0.3,
  );
  if (quietBefore) candidates.push(samplePoint('setup_or_quiet_before', midpoint(quietBefore.start, quietBefore.end), 'audio'));

  const actionBefore = bestSummaryInRange(anchorTime - 10, anchorTime - 1, (summary) =>
    ((summary.context?.rallyTextureScore ?? summary.rallyTextureScore ?? 0) * 0.55) +
    ((summary.activeDuration ?? 0) * 0.2) +
    ((summary.onsetRate ?? 0) * 0.15) -
    ((summary.context?.speechDominanceScore ?? summary.speechDominanceScore ?? 0) * 0.15),
  );
  if (actionBefore) candidates.push(samplePoint('action_or_rally_context', midpoint(actionBefore.start, actionBefore.end), 'audio'));

  candidates.push(samplePoint('reaction_start', anchorTime, 'audio'));

  const reactionPeak = bestSummaryInRange(groupStart - 1, groupEnd + 4, (summary) =>
    ((summary.context?.reactionBurstScore ?? summary.reactionBurstScore ?? 0) * 0.45) +
    ((summary.rmsEnergy ?? 0) * 0.35) +
    ((summary.energyMax ?? 0) * 0.2),
  );
  if (reactionPeak) candidates.push(samplePoint('reaction_peak', midpoint(reactionPeak.start, reactionPeak.end), 'audio'));

  const scoreboardSettle = bestSummaryInRange(anchorTime + 2, anchorTime + 8, (summary) =>
    ((summary.silenceRatio ?? 0) * 0.3) +
    ((summary.activeDuration ?? 0) * 0.2) -
    Math.abs((summary.rmsEnergy ?? 0) - 0.35) * 0.2 -
    ((summary.context?.musicBedScore ?? summary.musicBedScore ?? 0) * 0.15),
  );
  candidates.push(samplePoint('scoreboard_settle', midpoint(scoreboardSettle?.start ?? anchorTime + 5, scoreboardSettle?.end ?? anchorTime + 5), scoreboardSettle ? 'audio' : 'fallback'));

  const lateSettle = bestSummaryInRange(anchorTime + 8, anchorTime + 16, (summary) =>
    ((summary.context?.speechDominanceScore ?? summary.speechDominanceScore ?? 0) * 0.25) +
    ((summary.activeDuration ?? 0) * 0.2) -
    ((summary.context?.reactionBurstScore ?? summary.reactionBurstScore ?? 0) * 0.15),
  );
  candidates.push(samplePoint('tail_or_context_check', midpoint(lateSettle?.start ?? anchorTime + 12, lateSettle?.end ?? anchorTime + 12), lateSettle ? 'audio' : 'fallback'));

  for (const offset of fallbackSampleOffsets) {
    if (candidates.length >= 8) break;
    candidates.push(samplePoint(`fallback_${offset >= 0 ? '+' : ''}${offset}s`, anchorTime + offset, 'fallback'));
  }

  return dedupeSamplePoints(candidates)
    .filter((point) => point.time >= 0)
    .sort((a, b) => a.time - b.time)
    .slice(0, 8);
}

function bestSummaryInRange(start, end, scoreFn) {
  return oneSecond
    .filter((summary) => summary.end >= start && summary.start <= end)
    .map((summary) => ({ summary, score: scoreFn(summary) }))
    .sort((a, b) => b.score - a.score || Math.abs(midpoint(a.summary.start, a.summary.end) - midpoint(start, end)) - Math.abs(midpoint(b.summary.start, b.summary.end) - midpoint(start, end)))[0]?.summary ?? null;
}

function samplePoint(label, time, source) {
  return {
    label,
    source,
    time: round1(time),
  };
}

function dedupeSamplePoints(points) {
  const output = [];
  for (const point of points) {
    const existing = output.find((candidate) => Math.abs(candidate.time - point.time) < 0.75);
    if (existing) {
      existing.label = `${existing.label}+${point.label}`;
      existing.source = existing.source === 'audio' || point.source === 'audio' ? 'audio' : 'fallback';
      continue;
    }
    output.push({ ...point });
  }
  return output;
}

function classifyReviewClass({ transcript, nearbyEvent, member, context, suppressionReasons, beforeOcr, afterOcr }) {
  const text = transcript.toLowerCase();
  if (nearbyEvent?.type === 'match_won' || /\b(?:through|6-3|6-2|post-match|animation|broadcaster)\b/.test(text)) {
    return 'post_match_or_graphic_check';
  }
  if (suppressionReasons.includes('replay_cue') || member?.role === 'recap_or_speech_tail' || (context.pointShapeHint ?? '') === 'recap_only') {
    return 'replay_or_tail_check';
  }
  if (/\b(?:three|two)?\s*(?:break|set|match|game)\s+points?\b|\badvantage\b|\bdeuce\b|\b(?:chance|chances)\s+to\s+seal\b/.test(text)) {
    return hasOcrScoreChange(beforeOcr, afterOcr) ? 'pressure_with_possible_score_change' : 'pressure_needs_before_after_ocr';
  }
  if (/\b(?:breaks?|wins?|takes?|seals?|holds?|saves?)\b/.test(text)) {
    return hasOcrScoreChange(beforeOcr, afterOcr) ? 'result_phrase_with_score_change' : 'result_phrase_needs_ocr';
  }
  return 'reaction_anchor_needs_ocr';
}

function reviewPriorityBoost(reviewClass, nearbyEvent) {
  let score = 0;
  if (reviewClass.includes('needs_ocr')) score += 0.08;
  if (reviewClass.includes('score_change')) score += 0.12;
  if (nearbyEvent) score += 0.04;
  if (reviewClass === 'post_match_or_graphic_check') score -= 0.08;
  return score;
}

function hasOcrScoreChange(beforeOcr, afterOcr) {
  const beforeScore = beforeOcr?.context?.scoreAfter ?? beforeOcr?.context?.score ?? beforeOcr?.context?.scoreBefore ?? null;
  const afterScore = afterOcr?.context?.scoreAfter ?? afterOcr?.context?.score ?? afterOcr?.context?.scoreBefore ?? null;
  return Boolean(beforeScore && afterScore && beforeScore !== afterScore);
}

async function loadLegacyOcrContexts(root) {
  const momentsDir = resolve(root, 'moments');

  try {
    const entries = await readdir(momentsDir, { withFileTypes: true });
    const contexts = await Promise.all(entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const raw = await readFile(resolve(momentsDir, entry.name, 'context.json'), 'utf-8');
          const parsed = JSON.parse(raw);
          return {
            id: entry.name,
            label: nullableString(parsed.label),
            score: nullableString(parsed.score),
            scoreBefore: nullableString(parsed.scoreBefore),
            scoreAfter: nullableString(parsed.scoreAfter),
            scoreChanged: typeof parsed.scoreChanged === 'boolean' ? parsed.scoreChanged : null,
            peakTime: typeof parsed.peakTime === 'number' ? parsed.peakTime : null,
          };
        } catch {
          return null;
        }
      }));

    return contexts
      .filter((context) => context?.peakTime != null)
      .sort((a, b) => a.peakTime - b.peakTime);
  } catch {
    return [];
  }
}

function nearestOcrBefore(time, radiusSeconds) {
  return legacyOcrContexts
    .map((context) => ({ context, distance: time - context.peakTime }))
    .filter(({ distance }) => distance >= 0 && distance <= radiusSeconds)
    .sort((a, b) => a.distance - b.distance)[0] ?? null;
}

function nearestOcrAfter(time, radiusSeconds) {
  return legacyOcrContexts
    .map((context) => ({ context, distance: context.peakTime - time }))
    .filter(({ distance }) => distance >= 0 && distance <= radiusSeconds)
    .sort((a, b) => a.distance - b.distance)[0] ?? null;
}

function summarizeOcr(entry) {
  if (!entry) return '';
  const { context, distance } = entry;
  const parts = [`moment/${context.id}`, `${formatTime(context.peakTime)} d=${formatNumber(distance)}`];
  if (context.score) parts.push(`score ${context.score}`);
  if (context.scoreBefore || context.scoreAfter) parts.push(`${context.scoreBefore ?? '?'} -> ${context.scoreAfter ?? '?'}`);
  if (context.label) parts.push(context.label);
  return compactText(parts.join(' | '), 120);
}

function summarizeScoreRead(beforeOcr, afterOcr) {
  const before = beforeOcr?.context?.scoreAfter ?? beforeOcr?.context?.score ?? beforeOcr?.context?.scoreBefore ?? null;
  const after = afterOcr?.context?.scoreAfter ?? afterOcr?.context?.score ?? afterOcr?.context?.scoreBefore ?? null;
  if (!before && !after) return '';
  return `${before ?? '?'} -> ${after ?? '?'}${before && after && before !== after ? ' changed' : ''}`;
}

async function extractSampleFrames(inputCandidates, inputVideoPath, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const manifest = [];

  for (let index = 0; index < inputCandidates.length; index++) {
    const candidate = inputCandidates[index];
    const candidateId = `${String(index + 1).padStart(2, '0')}_${formatFilenameTime(candidate.anchorTime)}_${candidate.reviewClass}`;
    const candidateDir = resolve(outputDir, candidateId);
    await mkdir(candidateDir, { recursive: true });

    for (const sample of candidate.samplePoints) {
      const sampleTime = sample.time;
      const filename = `t_${formatFilenameTime(sampleTime)}_${safeFilename(sample.label)}.jpg`;
      const outputPath = resolve(candidateDir, filename);
      await execFileAsync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        String(sampleTime),
        '-i',
        inputVideoPath,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        outputPath,
      ]);
      manifest.push({
        candidate: candidateId,
        anchorTime: candidate.anchorTime,
        reviewClass: candidate.reviewClass,
        sampleLabel: sample.label,
        sampleSource: sample.source,
        sampleTime,
        outputPath,
        detectorFrame: `${candidateId}__${formatFilenameTime(sampleTime)}__${safeFilename(sample.label)}.jpg`,
      });
    }
  }

  await writeFile(resolve(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  return manifest;
}

async function runScoreboardDetector({
  frameManifest,
  detectorImage,
  detectorModelDir,
  detectorModel,
  detectorOutputDir,
  detectorConf,
}) {
  if (!detectorOutputDir) {
    throw new Error('detectorOutputDir is required');
  }

  const detectorInputDir = resolve(detectorOutputDir, 'input-flat');
  const detectorCropDir = resolve(detectorOutputDir, 'crops');
  await mkdir(detectorInputDir, { recursive: true });
  await mkdir(detectorCropDir, { recursive: true });

  for (const row of frameManifest) {
    await copyFile(row.outputPath, resolve(detectorInputDir, row.detectorFrame));
  }

  const dockerArgs = [
    'run',
    '--rm',
    '--user',
    `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    '-v',
    `${detectorModelDir}:/models:ro`,
    '-v',
    `${detectorInputDir}:/input:ro`,
    '-v',
    `${detectorCropDir}:/output`,
    detectorImage,
    '--model',
    `/models/${detectorModel}`,
    '--input',
    '/input',
    '--output',
    '/output',
    '--conf',
    detectorConf,
  ];

  await execFileAsync('docker', dockerArgs, {
    maxBuffer: 20 * 1024 * 1024,
    timeout: 300_000,
  });

  const raw = await readFile(resolve(detectorCropDir, 'results.json'), 'utf-8');
  const detectorRows = JSON.parse(raw);
  const manifestByDetectorFrame = new Map(frameManifest.map((row) => [row.detectorFrame, row]));

  return detectorRows.map((row) => {
    const source = manifestByDetectorFrame.get(row.frame);
    return {
      ...source,
      detectorFrame: row.frame,
      scoreboardVisible: row.visible,
      scoreboardConfidence: row.confidence,
      scoreboardBbox: row.bbox,
      scoreboardCropPath: row.crop_path ? resolve(detectorCropDir, row.crop_path) : null,
      imageWidth: row.image_width,
      imageHeight: row.image_height,
      detectorSource: row.source,
      detectorError: row.error ?? null,
    };
  });
}

function nearestPeak(time, radiusSeconds) {
  return peaks
    .map((peak) => ({ peak, distance: Math.abs(peak.peakTime - time) }))
    .filter(({ distance }) => distance <= radiusSeconds)
    .sort((a, b) => a.distance - b.distance)[0]?.peak ?? null;
}

function episodeMemberForPeak(audioPeakId) {
  for (const episode of episodes) {
    const member = (episode.members ?? []).find((candidate) => candidate.audioPeakId === audioPeakId);
    if (member) return member;
  }
  return null;
}

function episodeForMember(member) {
  return episodes.find((episode) => episode.members?.some((candidate) => candidate.audioPeakId === member.audioPeakId)) ?? null;
}

function nearestEvent(time, radiusSeconds) {
  return events
    .map((event) => ({ event, distance: Math.abs((event.anchorTime ?? 0) - time) }))
    .filter(({ event, distance }) =>
      distance <= radiusSeconds ||
      (event.startTime != null && event.endTime != null && time >= event.startTime && time <= event.endTime),
    )
    .sort((a, b) => a.distance - b.distance)[0]?.event ?? null;
}

function transcriptAround(time, beforeSeconds, afterSeconds) {
  return windows
    .filter((window) => window.end >= time - beforeSeconds && window.start <= time + afterSeconds)
    .map((window) => window.transcriptText?.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
}

function nullableString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseTimecode(value) {
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const parts = value.split(':').map(Number);
  if (parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid timecode: ${value}`);
  }
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  throw new Error(`Invalid timecode: ${value}`);
}

function midpoint(start, end) {
  return (start + end) / 2;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  if (Math.abs(remaining - Math.round(remaining)) < 0.001) {
    return `${minutes}:${String(Math.round(remaining)).padStart(2, '0')}`;
  }
  return `${minutes}:${remaining.toFixed(1).padStart(4, '0')}`;
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '';
}

function formatSamplePoints(points) {
  return points.map((point) => `${point.label}@${formatTime(point.time)}`).join(', ');
}

function formatFilenameTime(seconds) {
  return formatTime(seconds).replace(':', 'm').replace('.', '_') + 's';
}

function safeFilename(value) {
  return value.replace(/[^a-zA-Z0-9_+-]+/g, '_').slice(0, 80);
}

function compactText(text, maxLength) {
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round1(value) {
  return Number(value.toFixed(1));
}

function round3(value) {
  return Number(value.toFixed(3));
}
