import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const resultPath = process.argv[2];
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const includeNoScoreboard = process.argv.includes('--include-no-scoreboard');
const transcriptWindowArg = process.argv.find((arg) => arg.startsWith('--window='));

const outputPath = outputArg ? outputArg.split('=')[1] : '/tmp/v2-candidate-adjudication-packets.json';
const limit = limitArg ? Number(limitArg.split('=')[1]) : 20;
const transcriptWindow = transcriptWindowArg ? Number(transcriptWindowArg.split('=')[1]) : 35;

if (!resultPath) {
  console.error('Usage: node backend/scripts/audit-v2-candidate-adjudication-packets.mjs <media_analysis_v2/result.json> [--output=/tmp/packets.json] [--limit=20] [--window=35] [--include-no-scoreboard]');
  process.exit(1);
}

const result = JSON.parse(await readFile(resultPath, 'utf-8'));
const windows = result.timelineIndex?.windows ?? [];
const audioProfile = result.audioProfile ?? result.timelineIndex?.audioProfile ?? null;
const oneSecond = audioProfile?.summaries?.oneSecond ?? [];
const candidateWindows = result.candidateWindows ?? [];
const events = result.events ?? [];
const audioPeaks = result.audioPeaks ?? [];
const episodes = result.audioReactionEpisodes ?? [];
const detections = result.scoreboardDetections?.detections ?? [];

if (detections.length === 0) {
  console.error('No scoreboardDetections found. Re-run V2 with MAM_SCOREBOARD_DETECTOR_ENABLED=1 first.');
  process.exit(1);
}

const candidateById = new Map(candidateWindows.map((candidate) => [candidate.id, candidate]));
const peakById = new Map(audioPeaks.map((peak) => [peak.id, peak]));
const episodeByCandidateId = new Map(episodes.map((episode) => [episode.primaryCandidateWindowId, episode]));
const detectionsByCandidateId = groupBy(detections, (row) => row.candidateWindowId ?? 'unknown');

const packets = [...detectionsByCandidateId.entries()]
  .map(([candidateWindowId, rows]) => buildPacket(candidateWindowId, rows))
  .filter((packet) => includeNoScoreboard || packet.scoreboard.visibleCount > 0)
  .sort((a, b) =>
    b.auditPriority - a.auditPriority ||
    b.scoreboard.visibleCount - a.scoreboard.visibleCount ||
    a.anchorTime - b.anchorTime,
  )
  .slice(0, limit);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceResult: resultPath,
  instructions: {
    task: 'Adjudicate each candidate tennis moment using the provided transcript, audio facts, selected scoreboard crops, and current V2 event context.',
    constraints: [
      'Do not infer score text from commentary alone.',
      'Treat scoreboard absence as neutral metadata, not proof of replay or recap.',
      'Use selected scoreboard crops and OCR text, when available, to decide score state.',
      'Return structured output for key-moment status, live/replay/recap classification, score_before, score_after, score_changed, winner, confidence, and short reasoning.',
    ],
    suggestedSchema: {
      is_key_moment: 'boolean',
      moment_type: 'point_won | game_won | set_won | match_won | pressure_state | replay | recap | graphic | uncertain',
      is_live_action: 'boolean | null',
      is_replay_or_recap: 'boolean | null',
      scoreboard_readable: 'boolean',
      score_before: 'string | null',
      score_after: 'string | null',
      score_changed: 'boolean | null',
      winner: 'Djokovic | Alcaraz | unknown',
      confidence: 'number 0..1',
      reasoning: 'short string',
    },
  },
  counts: {
    candidateWindows: candidateWindows.length,
    sourceDetections: detections.length,
    packets: packets.length,
    visibleScoreboardFrames: detections.filter((row) => row.scoreboardVisible).length,
  },
  packets,
}, null, 2), 'utf-8');

console.log('# V2 Candidate Adjudication Packets');
console.log('');
console.log(`result: ${resultPath}`);
console.log(`output: ${outputPath}`);
console.log(`source detections: ${detections.length}`);
console.log(`packets: ${packets.length}`);
console.log('');
console.log('| rank | candidate | time | priority | visible/total | selected crops | current events | transcript |');
console.log('| ---: | --- | --- | ---: | ---: | --- | --- | --- |');
packets.forEach((packet, index) => {
  console.log([
    index + 1,
    packet.candidateWindowId,
    formatTime(packet.anchorTime),
    formatNumber(packet.auditPriority),
    `${packet.scoreboard.visibleCount}/${packet.scoreboard.totalSamples}`,
    Object.entries(packet.scoreboard.selectedCrops)
      .filter(([, crop]) => crop != null)
      .map(([role, crop]) => `${role}:${crop.sampleLabel}@${formatTime(crop.sampleTime)} conf=${formatNumber(crop.scoreboardConfidence)}`)
      .join('; '),
    packet.currentEvents.map((event) => `${event.type}@${formatTime(event.anchorTime)} ${event.label}`).join('; '),
    compactText(packet.transcript.around, 150),
  ].map(escapeCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
});

function buildPacket(candidateWindowId, rows) {
  const candidate = candidateById.get(candidateWindowId) ?? null;
  const anchorTime = candidate?.anchorTime ?? rows[0]?.anchorTime ?? 0;
  const episode = episodeByCandidateId.get(candidateWindowId) ?? null;
  const audioPeakId = rows.find((row) => row.audioPeakId)?.audioPeakId ?? episode?.primaryAudioPeakId ?? parseRefId(candidate?.sourceRef);
  const audioPeak = audioPeakId ? peakById.get(audioPeakId) ?? null : null;
  const audioSummary = nearestAudioSummary(anchorTime);
  const selectedCrops = selectCrops(rows);
  const currentEvents = events
    .filter((event) =>
      candidate?.linkedEventIds?.includes(event.id) ||
      Math.abs((event.anchorTime ?? event.startTime ?? 0) - anchorTime) <= 18,
    )
    .map(compactEvent)
    .sort((a, b) => Math.abs(a.anchorTime - anchorTime) - Math.abs(b.anchorTime - anchorTime));
  const nearbyEvents = events
    .filter((event) => Math.abs((event.anchorTime ?? event.startTime ?? 0) - anchorTime) <= 90)
    .map(compactEvent)
    .sort((a, b) => a.anchorTime - b.anchorTime);
  const visibleCount = rows.filter((row) => row.scoreboardVisible).length;
  const linkedBoost = currentEvents.length > 0 ? 0.15 : 0;
  const confidenceBoost = rows.reduce((sum, row) => sum + (row.scoreboardConfidence ?? 0), 0) / Math.max(1, rows.length) * 0.2;
  const priorityBoost = candidate?.priority === 'high' ? 0.18 : candidate?.priority === 'medium' ? 0.08 : 0;

  return {
    candidateWindowId,
    anchorTime,
    timecode: formatTime(anchorTime),
    auditPriority: round3(visibleCount * 0.08 + linkedBoost + confidenceBoost + priorityBoost),
    candidateWindow: candidate ? {
      source: candidate.source,
      sourceRef: candidate.sourceRef,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      priority: candidate.priority,
      facets: candidate.facets,
      segmentId: candidate.segmentId,
      segmentType: candidate.segmentType,
      scoreboardPresent: candidate.scoreboardPresent,
      speechDensity: candidate.speechDensity,
      audioSourceHint: candidate.audioSourceHint,
      linkedEventIds: candidate.linkedEventIds,
      previousEventId: candidate.previousEventId,
    } : null,
    audio: {
      audioPeakId,
      peak: audioPeak ? {
        peakTime: audioPeak.peakTime,
        audioEnergy: audioPeak.audioEnergy,
        localBaseline: audioPeak.localBaseline,
        spikeScore: audioPeak.spikeScore,
        percentileRank: audioPeak.percentileRank,
        shape: audioPeak.shape,
      } : null,
      reactionEpisode: episode ? {
        id: episode.id,
        startTime: episode.startTime,
        endTime: episode.endTime,
        primaryReason: episode.primaryReason,
        confidence: episode.confidence,
        memberCount: episode.memberCount,
      } : null,
      summary: audioSummary ? {
        start: audioSummary.start,
        end: audioSummary.end,
        rmsEnergy: audioSummary.rmsEnergy,
        strongestAttackTime: audioSummary.strongestAttackTime,
        strongestAttackScore: audioSummary.strongestAttackScore,
        rallyTextureScore: audioSummary.context?.rallyTextureScore ?? audioSummary.rallyTextureScore,
        reactionBurstScore: audioSummary.context?.reactionBurstScore ?? audioSummary.reactionBurstScore,
        speechDominanceScore: audioSummary.context?.speechDominanceScore ?? audioSummary.speechDominanceScore,
        musicBedScore: audioSummary.context?.musicBedScore ?? audioSummary.musicBedScore,
        applauseCrowdScore: audioSummary.context?.applauseCrowdScore ?? audioSummary.applauseCrowdScore,
        pointShapeHint: audioSummary.context?.pointShapeHint ?? audioSummary.pointShapeHint,
        suppressionReasons: audioSummary.context?.suppressionReasons ?? [],
      } : null,
    },
    transcript: {
      before: transcriptAround(anchorTime, transcriptWindow, 0),
      around: transcriptAround(anchorTime, transcriptWindow, transcriptWindow),
      after: transcriptAround(anchorTime, 0, transcriptWindow),
    },
    scoreboard: {
      detectorStatus: result.scoreboardDetections?.status ?? 'unknown',
      totalSamples: rows.length,
      visibleCount,
      allSamples: rows
        .sort((a, b) => a.sampleTime - b.sampleTime)
        .map(compactDetection),
      selectedCrops,
    },
    currentEvents,
    nearbyEvents,
    legacyOcrEvidence: currentEvents.flatMap((event) =>
      event.ocrEvidence.map((evidence) => ({
        eventId: event.id,
        ...evidence,
      })),
    ),
    llmPromptSeed: buildPromptSeed({
      anchorTime,
      candidate,
      audioSummary,
      selectedCrops,
      currentEvents,
    }),
  };
}

function selectCrops(rows) {
  const visible = rows
    .filter((row) => row.scoreboardVisible && row.scoreboardCropPath)
    .sort((a, b) => (b.scoreboardConfidence ?? 0) - (a.scoreboardConfidence ?? 0));

  return {
    beforeOrAction: bestCrop(visible, ['action_or_rally_context', 'setup_or_quiet_before', 'fallback_-10s', 'fallback_-5s']),
    reaction: bestCrop(visible, ['reaction_start', 'reaction_peak']),
    settle: bestCrop(visible, ['scoreboard_settle']),
    tailOrContext: bestCrop(visible, ['tail_or_context_check']),
    bestOverall: visible[0] ? compactDetection(visible[0]) : null,
  };
}

function bestCrop(rows, labelNeedles) {
  const row = rows.find((candidate) =>
    labelNeedles.some((needle) => candidate.sampleLabel.includes(needle)),
  );
  return row ? compactDetection(row) : null;
}

function compactDetection(row) {
  return {
    sampleLabel: row.sampleLabel,
    sampleSource: row.sampleSource,
    sampleTime: row.sampleTime,
    timecode: formatTime(row.sampleTime),
    framePath: row.framePath,
    detectorFrame: row.detectorFrame,
    scoreboardVisible: row.scoreboardVisible,
    scoreboardConfidence: row.scoreboardConfidence,
    scoreboardBbox: row.scoreboardBbox,
    scoreboardCropPath: row.scoreboardCropPath,
    imageWidth: row.imageWidth,
    imageHeight: row.imageHeight,
    detectorError: row.detectorError,
  };
}

function compactEvent(event) {
  const anchorTime = event.anchorTime ?? event.startTime ?? 0;
  return {
    id: event.id,
    type: event.type,
    label: event.label,
    anchorTime,
    timecode: formatTime(anchorTime),
    confidence: event.confidence,
    importance: event.importance,
    validationStatus: event.validationStatus ?? null,
    relationType: event.relationType ?? null,
    ocrSupportStatus: event.ocrSupportStatus ?? null,
    reliabilityRank: event.reliabilityRank ?? null,
    evidenceTypes: (event.evidence ?? []).map((entry) => entry.type),
    ocrEvidence: (event.evidence ?? [])
      .filter((entry) => entry.type === 'ocr_context')
      .map((entry) => ({
        ref: entry.ref,
        status: entry.status ?? null,
        confidence: entry.confidence ?? null,
        note: entry.note ?? null,
        metadata: entry.metadata ?? null,
      })),
  };
}

function buildPromptSeed({ anchorTime, candidate, audioSummary, selectedCrops, currentEvents }) {
  return {
    userMessage: [
      `Candidate tennis moment at ${formatTime(anchorTime)}.`,
      candidate ? `Candidate facets: playPhase=${candidate.facets?.playPhase}, contentMode=${candidate.facets?.contentMode}, transcriptRelation=${candidate.facets?.transcriptRelation}.` : '',
      audioSummary ? `Audio: reaction=${formatNumber(audioSummary.context?.reactionBurstScore ?? audioSummary.reactionBurstScore)}, rally=${formatNumber(audioSummary.context?.rallyTextureScore ?? audioSummary.rallyTextureScore)}, speech=${formatNumber(audioSummary.context?.speechDominanceScore ?? audioSummary.speechDominanceScore)}, suppress=${(audioSummary.context?.suppressionReasons ?? []).join(',') || 'none'}.` : '',
      currentEvents.length > 0 ? `Current V2 event(s): ${currentEvents.map((event) => `${event.type} "${event.label}"`).join('; ')}.` : 'No current V2 event is linked nearby.',
      `Selected scoreboard crops: ${Object.entries(selectedCrops).filter(([, crop]) => crop != null).map(([role, crop]) => `${role}=${crop.scoreboardCropPath}`).join('; ') || 'none'}.`,
      'Adjudicate whether this is a key moment, whether it is live/replay/recap/graphic, and whether score state confirms a result or only pressure/setup.',
    ].filter(Boolean).join('\n'),
  };
}

function nearestAudioSummary(time) {
  return oneSecond
    .map((summary) => ({ summary, distance: Math.abs(midpoint(summary.start, summary.end) - time) }))
    .sort((a, b) => a.distance - b.distance)[0]?.summary ?? null;
}

function transcriptAround(time, beforeSeconds, afterSeconds) {
  const start = time - beforeSeconds;
  const end = time + afterSeconds;
  return windows
    .filter((window) => window.end >= start && window.start <= end)
    .map((window) => window.transcriptText)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupBy(values, keyFn) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFn(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function parseRefId(ref) {
  return typeof ref === 'string' ? ref.split(':').at(-1) ?? null : null;
}

function midpoint(start, end) {
  return (start + end) / 2;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '';
}

function formatTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const wholeSeconds = Math.floor(total % 60);
  const suffix = `${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}:${String(wholeSeconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${suffix}` : suffix;
}

function compactText(value, maxLength) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
