import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: new URL('../.env', import.meta.url) });
loadEnv();

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

const inputPath = process.argv[2];
const outputArg = getArg('--output=');
const limitArg = getArg('--limit=');
const modelArg = getArg('--model=');
const baseUrlArg = getArg('--base-url=');
const apiKeyEnvArg = getArg('--api-key-env=');
const candidateArg = getArg('--candidate=');
const candidatesArg = getArg('--candidates=');
const dumpRequestsArg = getArg('--dump-requests=');
const maxTokensArg = getArg('--max-tokens=');
const dryRun = process.argv.includes('--dry-run');
const noImages = process.argv.includes('--no-images');
const includeLegacyScoreEvidence = process.argv.includes('--include-legacy-score-evidence');

if (!inputPath) {
  console.error([
    'Usage: node backend/scripts/audit-v2-adjudicate-candidates.mjs <packets.json> [options]',
    '',
    'Options:',
    '  --output=/tmp/v2-candidate-adjudications.json',
    '  --limit=5',
    '  --candidate=candidate_window_40',
    '  --candidates=candidate_window_40,candidate_window_43',
    '  --model=gemini-2.5-flash-lite',
    '  --base-url=https://generativelanguage.googleapis.com/v1beta/openai',
    '  --api-key-env=GEMINI_API_KEY',
    '  --dump-requests=/tmp/v2-candidate-llm-requests.json',
    '  --max-tokens=2200',
    '  --include-legacy-score-evidence',
    '  --no-images',
    '  --dry-run',
  ].join('\n'));
  process.exit(1);
}

const outputPath = outputArg ?? deriveOutputPath(inputPath);
const limit = limitArg ? Number(limitArg) : null;
const model = modelArg ?? process.env.MAM_ADJUDICATION_MODEL ?? 'gemini-2.5-flash-lite';
const baseUrl = baseUrlArg ?? process.env.MAM_ADJUDICATION_BASE_URL ?? defaultBaseUrlForModel(model);
const apiKeyEnv = apiKeyEnvArg ?? process.env.MAM_ADJUDICATION_API_KEY_ENV ?? defaultApiKeyEnvForModel(model);
const maxTokens = maxTokensArg ? Number(maxTokensArg) : 2200;
const startedAt = new Date().toISOString();
const source = JSON.parse(await readFile(inputPath, 'utf-8'));
let packets = source.packets ?? [];
const candidateIds = [
  ...(candidateArg ? [candidateArg] : []),
  ...(candidatesArg ? candidatesArg.split(',').map((id) => id.trim()).filter(Boolean) : []),
];

if (candidateIds.length > 0) {
  const selectedIds = new Set(candidateIds);
  packets = packets.filter((packet) => selectedIds.has(packet.candidateWindowId));
}
if (Number.isFinite(limit) && limit > 0) {
  packets = packets.slice(0, limit);
}

if (packets.length === 0) {
  console.error(`No packets selected from ${inputPath}.`);
  process.exit(1);
}

const apiKey = process.env[apiKeyEnv];
if (!dryRun && !apiKey) {
  console.error(`${apiKeyEnv} is not set. Use --dry-run to inspect requests without calling an LLM.`);
  process.exit(1);
}

const adjudications = [];
const failures = [];
const requestDumps = [];

for (const [index, packet] of packets.entries()) {
  const request = await buildRequest(packet, { model, includeImages: !noImages, maxTokens });
  if (dumpRequestsArg) {
    requestDumps.push({
      candidateWindowId: packet.candidateWindowId,
      timecode: packet.timecode,
      request: redactRequest(request),
    });
  }

  if (dryRun) {
    adjudications.push({
      candidateWindowId: packet.candidateWindowId,
      timecode: packet.timecode,
      status: 'dry_run',
      model,
      requestSummary: summarizeRequest(request),
    });
    continue;
  }

  try {
    const response = await callChatCompletions({ baseUrl, apiKey, request });
    const adjudication = parseAdjudication(response.text);
    adjudications.push({
      candidateWindowId: packet.candidateWindowId,
      timecode: packet.timecode,
      status: adjudication ? 'ok' : 'parse_failed',
      model: response.model ?? model,
      usage: response.usage ?? null,
      adjudication,
      auditFlags: adjudication ? auditAdjudication(adjudication) : ['parse_failed'],
      rawText: adjudication ? undefined : response.text,
    });
    console.log(`[${index + 1}/${packets.length}] ${packet.candidateWindowId} ${packet.timecode}: ${adjudication ? 'ok' : 'parse_failed'}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({
      candidateWindowId: packet.candidateWindowId,
      timecode: packet.timecode,
      status: 'error',
      error: message,
    });
    console.log(`[${index + 1}/${packets.length}] ${packet.candidateWindowId} ${packet.timecode}: error ${message.slice(0, 160)}`);
  }
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  startedAt,
  sourcePackets: inputPath,
  sourceResult: source.sourceResult ?? null,
  auditOnly: true,
  model,
  baseUrl,
  apiKeyEnv,
  options: {
    limit,
    candidate: candidateArg ?? null,
    candidates: candidateIds,
    images: !noImages,
    dryRun,
  },
  counts: {
    selectedPackets: packets.length,
    adjudications: adjudications.length,
    failures: failures.length,
  },
  adjudications,
  failures,
}, null, 2), 'utf-8');

if (dumpRequestsArg) {
  await mkdir(dirname(dumpRequestsArg), { recursive: true });
  await writeFile(dumpRequestsArg, JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourcePackets: inputPath,
    model,
    baseUrl,
    apiKeyEnv,
    imagePayloadsRedacted: true,
    requests: requestDumps,
  }, null, 2), 'utf-8');
}

console.log('# V2 Candidate LLM Adjudication');
console.log('');
console.log(`input: ${inputPath}`);
console.log(`output: ${outputPath}`);
console.log(`model: ${model}`);
console.log(`selected packets: ${packets.length}`);
console.log(`adjudications: ${adjudications.length}`);
console.log(`failures: ${failures.length}`);
if (dryRun) {
  console.log('dry run: no LLM calls were made');
}
if (dumpRequestsArg) {
  console.log(`request dump: ${dumpRequestsArg}`);
}

async function buildRequest(packet, { model, includeImages, maxTokens }) {
  const textPacket = buildTextPacket(packet);
  const content = [
    { type: 'text', text: buildPrompt(textPacket) },
  ];

  if (includeImages) {
    const imageParts = await loadScoreboardImages(packet);
    content.push(...imageParts);
  }

  return {
    model,
    messages: [
      {
        role: 'system',
        content: [
          'You are a strict tennis broadcast adjudicator.',
          'Use only the provided packet and attached scoreboard evidence images.',
          'Treat pipeline event fields as untrusted hints, not ground truth.',
          'Return JSON only, with no markdown.',
        ].join(' '),
      },
      { role: 'user', content },
    ],
    temperature: 0,
    max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.round(maxTokens) : 2200,
  };
}

function buildPrompt(packet) {
  return [
    'Adjudicate this candidate tennis moment.',
    '',
    'Rules:',
    '- Pipeline event context is included only as orientation hints. It may be wrong.',
    '- pipelineEventContext.current contains linked or closest event hypotheses for this candidate.',
    '- pipelineEventContext.nearbyBefore and nearbyAfter contain distinct surrounding event hypotheses, excluding current events.',
    '- Detector scoreboard visibility metadata is not ground truth. For attached full_frame_scoreboard_search images, inspect the whole frame and locate the scoreboard yourself if present.',
    '- Interpret all transcript segments and scoreboard frames by their secondsFromAudioAnchor value.',
    '- Negative secondsFromAudioAnchor happened before the candidate audio peak; positive values happened after it.',
    '- Use audio.rollup as the compact summary of audio timing, but use audio.timeline when exact per-second phase/facet evidence matters.',
    '- Use audio.timeline only to understand phase timing and audio facets: pre-point/rally, reaction peak, score/umpire call, commentary, music/changeover tail, suppression context, late settle, or next-point setup.',
    '- Use transcript.rollup as a compact cue summary. It may show result text, pressure/setup text, action text, score-call text, recap/tail text, or next-point setup text.',
    '- Prefer the time-aligned transcript and visible scoreboard images over pipeline hypotheses.',
    '- Do not infer score text from commentary alone.',
    '- Scoreboards often update after the reaction peak. Compare prePoint/beforeOrAction frames against scoreUpdateCandidate, lateSettle, or nextPointSetup frames when they are readable.',
    '- If a preScoreBaseline frame is readable, prefer it as the before-score baseline. Use prePoint/preAction frames as context or fallback because they may be too close to the point.',
    '- A reaction frame at or near 0s may still show the pre-point score; do not treat an unchanged early reaction frame as proof that no score changed.',
    '- Tennis scoreboard evidence may be a detector crop or a full broadcast frame. Locate the scoreboard first, then read each row label and its set/game/point columns.',
    '- For each frame, first extract scoreboard_available, scoreboard_readable, player rows, serving marker if visible, and all visible score columns in left-to-right order.',
    '- Do not assume a fixed number of sets. A row may show one score column or many score columns depending on match format and match state.',
    '- For each scoreColumns entry, columnIndex is zero-based from left to right after the player name. kind must be set_score, current_set_games, point_score, tiebreak_points, or unknown.',
    '- After raw row extraction, always produce normalizedScoreState for the frame: completedSets, currentSetGames, currentGamePoints, server, and scoreStateCompleteness.',
    '- normalizedScoreState must represent where the match is in tennis terms, not just the visible raw columns. Use null for unknown parts.',
    '- completedSets are completed set scores already shown for each player, ordered left-to-right. currentSetGames are games in the active set. currentGamePoints are the current game points.',
    '- If the broadcast shows only one score column early in a set, treat it as currentSetGames, not completedSets, unless the image or context clearly shows it is a completed set score.',
    '- If a compact live scorebug row shows two score values after the player name, usually interpret the first as currentSetGames and the second as currentGamePoints. Example: Alcaraz 3 0 and Djokovic 5 40 means currentSetGames 3-5 and currentGamePoints 0-40.',
    '- Do not drop a visible point column when normalizing. If the point column is visible but unclear, include it with uncertain=true rather than omitting it.',
    '- If the broadcast shows a final/post-set graphic with completed set score only, put that value in completedSets and leave currentSetGames/currentGamePoints null.',
    '- If a serve marker is visible, set server to that player. If not visible, use unknown; do not infer server from score or transcript.',
    '- Use null for any unreadable or absent field. Do not force server, set, game, or point values when the crop does not clearly show them.',
    '- In scoreboard_readings and scoreboard_transition.based_on_image_labels, use the exact attached image labels from scoreboard.selectedFrames and the image attachment text.',
    '- In this match, rows may appear as ALCARAZ and DJOKOVIC. Winner must follow the row whose score increased, not the top/bottom row position.',
    '- A game winner is the player whose game count increased. A point winner is the player whose point score advanced.',
    '- For point scores, compare each player row to the same player row across frames. Example: if Alcaraz stays at 40 and Djokovic changes from 30 to 40, Djokovic won the point; do not describe the combined score as 30-40=>40-40 and assign it to Alcaraz.',
    '- If game count increases across readable images, moment_type must be game_won, not point_won.',
    '- If a set-ending score is confirmed, moment_type must be set_won, not game_won or point_won.',
    '- If the scoreboard region is too small or ambiguous to read row labels and columns, do not guess; use null/unknown and lower confidence.',
    '- Treat scoreboard absence as neutral; it does not prove replay, recap, or live action.',
    '- Classify live/replay/recap/graphic from the packet and images.',
    '- If exact score state is not readable, set scoreboard_readable=false and use null/unknown values inside scoreboard_transition.',
    '- Set scoreboard_transition.changed=false only when readable frames include a plausible before score and a late/update/setup after score, and they still show no score change.',
    '- If the packet lacks a late enough readable after frame, set scoreboard_transition.changed=null and change_type=unknown rather than false.',
    '- If all readable frames are after the audio anchor and show one stable score, set scoreboard_transition.changed=null and change_type=unknown, and explain that no before/after transition is visible.',
    '- Do not emit free-form score_before, score_after, or score_changed fields. Use scoreboard_transition only.',
    '- Winner may use transcript and pipeline event context, but visible scoreboard row labels outrank text hypotheses when they are readable.',
    '- Keep reasoning short and evidence-based.',
    '- First read each attached scoreboard image independently in scoreboard_readings. Then derive scoreboard_transition from those readings. Then adjudicate from scoreboard_transition plus transcript/audio context.',
    '',
    'Return exactly this JSON shape:',
    JSON.stringify({
      is_key_moment: true,
      moment_type: 'point_won | game_won | set_won | match_won | pressure_state | replay | recap | graphic | uncertain',
      is_live_action: true,
      is_replay_or_recap: false,
      scoreboard_readings: [
        {
          image_label: 'scoreboard_crop_beforeOrAction',
          timecode: 'string',
          secondsFromAudioAnchor: 0,
          scoreboard_available: true,
          scoreboard_readable: true,
          rows: [
            {
              player: 'Alcaraz | Djokovic | unknown',
              isServing: 'boolean or null',
              scoreColumns: [
                {
                  columnIndex: 0,
                  kind: 'set_score | current_set_games | point_score | tiebreak_points | unknown',
                  score: 'string or null',
                  uncertain: false,
                },
              ],
              uncertainFields: ['serving | scoreColumns | player'],
            },
            {
              player: 'Alcaraz | Djokovic | unknown',
              isServing: 'boolean or null',
              scoreColumns: [
                {
                  columnIndex: 0,
                  kind: 'set_score | current_set_games | point_score | tiebreak_points | unknown',
                  score: 'string or null',
                  uncertain: false,
                },
              ],
              uncertainFields: ['serving | scoreColumns | player'],
            },
          ],
          normalizedScoreState: {
            completedSets: [
              {
                setNumber: 1,
                Alcaraz: 'string or null',
                Djokovic: 'string or null',
                uncertain: false,
              },
            ],
            currentSetGames: {
              Alcaraz: 'string or null',
              Djokovic: 'string or null',
              uncertain: false,
            },
            currentGamePoints: {
              Alcaraz: 'string or null',
              Djokovic: 'string or null',
              uncertain: false,
            },
            server: 'Djokovic | Alcaraz | unknown',
            scoreStateCompleteness: {
              completedSets: 'known | partial | unknown | not_applicable',
              currentSetGames: 'known | partial | unknown | not_applicable',
              currentGamePoints: 'known | partial | unknown | not_applicable',
              server: 'known | unknown',
            },
          },
          uncertain_fields: ['short field names'],
          notes: 'short string',
        },
      ],
      scoreboard_transition: {
        based_on_image_labels: ['scoreboard_crop_beforeOrAction', 'scoreboard_crop_settle'],
        changed: true,
        change_type: 'point | game | set | match | no_change | unknown',
        changed_player: 'Djokovic | Alcaraz | unknown',
        before: {
          normalizedScoreState: {
            completedSets: [{ setNumber: 1, Alcaraz: 'string or null', Djokovic: 'string or null', uncertain: false }],
            currentSetGames: { Alcaraz: 'string or null', Djokovic: 'string or null', uncertain: false },
            currentGamePoints: { Alcaraz: 'string or null', Djokovic: 'string or null', uncertain: false },
            server: 'Djokovic | Alcaraz | unknown',
            scoreStateCompleteness: {
              completedSets: 'known | partial | unknown | not_applicable',
              currentSetGames: 'known | partial | unknown | not_applicable',
              currentGamePoints: 'known | partial | unknown | not_applicable',
              server: 'known | unknown',
            },
          },
          rawRowsByPlayer: {
            Alcaraz: { scoreColumns: [{ columnIndex: 0, kind: 'current_set_games | point_score | set_score | unknown', score: 'string or null', uncertain: false }] },
            Djokovic: { scoreColumns: [{ columnIndex: 0, kind: 'current_set_games | point_score | set_score | unknown', score: 'string or null', uncertain: false }] },
          },
        },
        after: {
          normalizedScoreState: {
            completedSets: [{ setNumber: 1, Alcaraz: 'string or null', Djokovic: 'string or null', uncertain: false }],
            currentSetGames: { Alcaraz: 'string or null', Djokovic: 'string or null', uncertain: false },
            currentGamePoints: { Alcaraz: 'string or null', Djokovic: 'string or null', uncertain: false },
            server: 'Djokovic | Alcaraz | unknown',
            scoreStateCompleteness: {
              completedSets: 'known | partial | unknown | not_applicable',
              currentSetGames: 'known | partial | unknown | not_applicable',
              currentGamePoints: 'known | partial | unknown | not_applicable',
              server: 'known | unknown',
            },
          },
          rawRowsByPlayer: {
            Alcaraz: { scoreColumns: [{ columnIndex: 0, kind: 'current_set_games | point_score | set_score | unknown', score: 'string or null', uncertain: false }] },
            Djokovic: { scoreColumns: [{ columnIndex: 0, kind: 'current_set_games | point_score | set_score | unknown', score: 'string or null', uncertain: false }] },
          },
        },
        confidence: 0.0,
        notes: 'short string',
      },
      scoreboard_readable: true,
      winner: 'Djokovic | Alcaraz | unknown',
      confidence: 0.0,
      reasoning: 'short string',
    }, null, 2),
    '',
    'Candidate packet:',
    JSON.stringify(packet, null, 2),
  ].join('\n');
}

function buildTextPacket(packet) {
  const anchorTime = packet.anchorTime ?? 0;
  return {
    candidateWindowId: packet.candidateWindowId,
    timecode: packet.timecode,
    anchorTime: packet.anchorTime,
    candidate: compactCandidate(packet),
    audio: compactAudio(packet.audio),
    transcript: compactTranscript(packet.transcript, anchorTime),
    pipelineEventContext: compactPipelineEventContext(packet, anchorTime),
    ...(includeLegacyScoreEvidence ? {
      legacyStructuredScoreEvidence: (packet.legacyOcrEvidence ?? []).map(compactLegacyOcrEvidence),
    } : {}),
    scoreboard: {
      detectorStatus: packet.scoreboard?.detectorStatus,
      totalSamples: packet.scoreboard?.totalSamples,
      visibleCount: packet.scoreboard?.visibleCount,
      selectedFrames: selectedScoreboardFrames(packet.scoreboard?.selectedCrops, anchorTime),
      allSamples: (packet.scoreboard?.allSamples ?? []).map((sample) => ({
        sampleLabel: sample.sampleLabel,
        sampleTime: sample.sampleTime,
        timecode: sample.timecode,
        secondsFromAudioAnchor: round1(sample.sampleTime - anchorTime),
        scoreboardVisible: sample.scoreboardVisible,
        scoreboardConfidence: sample.scoreboardConfidence,
        scoreboardBbox: sample.scoreboardBbox,
        imageWidth: sample.imageWidth,
        imageHeight: sample.imageHeight,
        detectorError: sample.detectorError,
      })),
    },
  };
}

function compactTranscript(transcript, anchorTime) {
  const segments = dedupeTranscriptSegments([
    ...(transcript?.beforeSegments ?? []),
    ...(transcript?.aroundSegments ?? []),
    ...(transcript?.afterSegments ?? []),
  ]).map((segment) => ({
    start: segment.start,
    end: segment.end,
    startTimecode: segment.startTimecode,
    endTimecode: segment.endTimecode,
    secondsFromAudioAnchorStart: round1(segment.start - anchorTime),
    secondsFromAudioAnchorEnd: round1(segment.end - anchorTime),
    relationToAudioAnchor: segment.end <= anchorTime ? 'before' : segment.start >= anchorTime ? 'after' : 'overlaps_audio_anchor',
    text: segment.text,
  }));

  return {
    anchorTime,
    anchorTimecode: formatTime(anchorTime),
    rollup: transcript?.rollup ?? null,
    segments,
  };
}

function compactPipelineEventContext(packet, anchorTime) {
  const current = dedupeEvents(packet.currentEvents ?? []);
  const currentIds = new Set(current.map((event) => event.id).filter(Boolean));
  const nearby = dedupeEvents(packet.nearbyEvents ?? [])
    .filter((event) => !currentIds.has(event.id));

  return {
    current: current.map((event) => compactEventHypothesis(event, anchorTime)),
    nearbyBefore: nearby
      .filter((event) => event.anchorTime < anchorTime)
      .map((event) => compactEventHypothesis(event, anchorTime)),
    nearbyAfter: nearby
      .filter((event) => event.anchorTime >= anchorTime)
      .map((event) => compactEventHypothesis(event, anchorTime)),
  };
}

function compactCandidate(packet) {
  const candidate = packet.candidateWindow ?? {};
  return {
    id: packet.candidateWindowId,
    anchorTime: packet.anchorTime,
    anchorTimecode: packet.timecode,
    windowStart: candidate.startTime ?? null,
    windowEnd: candidate.endTime ?? null,
    windowStartTimecode: typeof candidate.startTime === 'number' ? formatTime(candidate.startTime) : null,
    windowEndTimecode: typeof candidate.endTime === 'number' ? formatTime(candidate.endTime) : null,
    priority: candidate.priority ?? null,
    facets: candidate.facets ?? null,
    segmentType: candidate.segmentType ?? null,
    speechDensity: candidate.speechDensity ?? null,
    audioSourceHint: candidate.audioSourceHint ?? null,
  };
}

function compactAudio(audio) {
  if (!audio) return null;
  return {
    peak: audio.peak ? {
      peakTime: audio.peak.peakTime,
      peakTimecode: formatTime(audio.peak.peakTime),
      audioEnergy: audio.peak.audioEnergy,
      localBaseline: audio.peak.localBaseline,
      spikeScore: audio.peak.spikeScore,
      percentileRank: audio.peak.percentileRank,
      shape: audio.peak.shape,
    } : null,
    reactionEpisode: audio.reactionEpisode ? {
      startTime: audio.reactionEpisode.startTime,
      endTime: audio.reactionEpisode.endTime,
      startTimecode: formatTime(audio.reactionEpisode.startTime),
      endTimecode: formatTime(audio.reactionEpisode.endTime),
      primaryReason: audio.reactionEpisode.primaryReason,
      confidence: audio.reactionEpisode.confidence,
      memberCount: audio.reactionEpisode.memberCount,
    } : null,
    summary: audio.summary ? {
      start: audio.summary.start,
      end: audio.summary.end,
      startTimecode: formatTime(audio.summary.start),
      endTimecode: formatTime(audio.summary.end),
      rmsEnergy: audio.summary.rmsEnergy,
      strongestAttackTime: audio.summary.strongestAttackTime,
      strongestAttackTimecode: formatTime(audio.summary.strongestAttackTime),
      strongestAttackScore: audio.summary.strongestAttackScore,
      rallyTextureScore: audio.summary.rallyTextureScore,
      reactionBurstScore: audio.summary.reactionBurstScore,
      speechDominanceScore: audio.summary.speechDominanceScore,
      musicBedScore: audio.summary.musicBedScore,
      applauseCrowdScore: audio.summary.applauseCrowdScore,
      pointShapeHint: audio.summary.pointShapeHint,
      suppressionReasons: audio.summary.suppressionReasons,
    } : null,
    rollup: audio.rollup ?? null,
    timeline: (audio.timeline ?? []).map((point) => ({
      timecode: point.timecode,
      secondsFromAudioAnchor: point.secondsFromAudioAnchor,
      phaseHint: point.phaseHint,
      rmsEnergy: point.rmsEnergy,
      reactionBurstScore: point.reactionBurstScore,
      rallyTextureScore: point.rallyTextureScore,
      speechDominanceScore: point.speechDominanceScore,
      applauseCrowdScore: point.applauseCrowdScore,
      crowdScore: point.crowdScore,
      commentatorScore: point.commentatorScore,
      umpireScore: point.umpireScore,
      playerVocalizationScore: point.playerVocalizationScore,
      musicScore: point.musicScore,
      suppressionReasons: point.suppressionReasons,
      audioFacets: point.audioFacets,
      contextFacets: point.contextFacets,
      opportunityFacets: point.opportunityFacets,
    })),
  };
}

function compactEventHypothesis(event, anchorTime) {
  return {
    id: event.id,
    type: event.type,
    label: event.label,
    anchorTime: event.anchorTime,
    timecode: event.timecode,
    secondsFromAudioAnchor: round1(event.anchorTime - anchorTime),
    evidenceTypes: event.evidenceTypes,
  };
}

function compactLegacyOcrEvidence(evidence) {
  const metadata = evidence.metadata ?? {};
  return {
    eventId: evidence.eventId,
    ref: evidence.ref,
    status: evidence.status,
    confidence: evidence.confidence,
    score: metadata.score ?? null,
    scoreBefore: metadata.scoreBefore ?? null,
    scoreAfter: metadata.scoreAfter ?? null,
    scoreChanged: metadata.scoreChanged ?? null,
    scoreTransitionStatus: metadata.scoreTransitionStatus ?? null,
    setPeriod: metadata.setPeriod ?? null,
    selectedBy: metadata.selectedBy ?? null,
    peakTime: metadata.peakTime ?? null,
  };
}

function selectedScoreboardFrames(selectedCrops, anchorTime) {
  const frames = [];
  const seen = new Set();
  for (const [role, crop] of Object.entries(selectedCrops ?? {})) {
    if (!crop?.scoreboardCropPath && !crop?.framePath) continue;
    const imagePath = crop.scoreboardCropPath ?? crop.framePath;
    const key = `${imagePath}:${crop.sampleTime}:${crop.sampleLabel}:${JSON.stringify(crop.scoreboardBbox ?? {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    frames.push({
      imageAttachmentLabel: `scoreboard_crop_${role}`,
      imageAttachmentSource: crop.scoreboardCropPath ? 'scoreboard_crop' : 'full_frame_scoreboard_search',
      role,
      roleTimingHint: roleTimingHint(role),
      sampleLabel: crop.sampleLabel,
      sampleTime: crop.sampleTime,
      timecode: crop.timecode,
      secondsFromAudioAnchor: round1(crop.sampleTime - anchorTime),
      scoreboardVisible: crop.scoreboardCropPath ? crop.scoreboardVisible : null,
      detectorScoreboardVisible: crop.scoreboardVisible,
      scoreboardConfidence: crop.scoreboardConfidence,
      scoreboardBbox: crop.scoreboardBbox,
      imageWidth: crop.imageWidth,
      imageHeight: crop.imageHeight,
    });
  }
  return frames.sort((a, b) => a.sampleTime - b.sampleTime);
}

async function loadScoreboardImages(packet) {
  const parts = [];
  const seen = new Set();
  const selected = packet.scoreboard?.selectedCrops ?? {};

  for (const [role, crop] of Object.entries(selected)) {
    const imagePath = crop?.scoreboardCropPath ?? crop?.framePath;
    if (!imagePath || seen.has(imagePath)) continue;
    seen.add(imagePath);
    try {
      const loadPath = imagePath;
      const buffer = await readFile(loadPath);
      const imageSource = crop.scoreboardCropPath ? 'detector scoreboard crop' : 'full frame scoreboard search';
      const timingHint = roleTimingHint(role);
      const visibilityText = crop.scoreboardVisible
        ? `detector confidence ${formatNumber(crop.scoreboardConfidence)}`
        : 'detector missed or did not crop this frame; visually inspect the full frame and locate any scoreboard';
      parts.push({
        type: 'text',
        text: `Image scoreboard_crop_${role}: ${imageSource}, role=${role}, timing=${timingHint}, ${crop.sampleLabel} at ${crop.timecode}, ${formatSignedSeconds(crop.sampleTime - (packet.anchorTime ?? 0))} from audio anchor ${packet.timecode}, ${visibilityText}.`,
      });
      parts.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${buffer.toString('base64')}`,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      parts.push({
        type: 'text',
        text: `Image scoreboard_crop_${role} could not be loaded: ${message}`,
      });
    }
  }

  return parts;
}

function roleTimingHint(role) {
  switch (role) {
    case 'preScoreBaseline':
      return 'preferred stable before-score baseline';
    case 'prePoint':
    case 'beforeOrAction':
      return 'near-action before-score context; may be too close to point';
    case 'reaction':
      return 'reaction peak; scoreboard may still be pre-update';
    case 'scoreUpdateCandidate':
    case 'settle':
      return 'early after-score update candidate';
    case 'lateSettle':
    case 'tailOrContext':
      return 'late settle after-score check';
    case 'nextPointSetup':
      return 'next-point setup after-score check';
    default:
      return 'scoreboard evidence frame';
  }
}

function dedupeEvents(events) {
  const byId = new Map();
  for (const event of events) {
    if (!event?.id || byId.has(event.id)) continue;
    byId.set(event.id, event);
  }
  return [...byId.values()].sort((a, b) => (a.anchorTime ?? 0) - (b.anchorTime ?? 0));
}

function dedupeTranscriptSegments(segments) {
  const byKey = new Map();
  for (const segment of segments) {
    const key = `${segment.start}:${segment.end}:${segment.text}`;
    if (!byKey.has(key)) byKey.set(key, segment);
  }
  return [...byKey.values()].sort((a, b) => a.start - b.start);
}

async function callChatCompletions({ baseUrl, apiKey, request }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`LLM request failed with ${response.status}: ${bodyText.slice(0, 500)}`);
  }

  const json = JSON.parse(bodyText);
  return {
    model: json.model,
    usage: json.usage,
    text: json.choices?.[0]?.message?.content ?? '',
  };
}

function parseAdjudication(text) {
  const jsonText = extractJsonObject(text);
  if (!jsonText) return null;
  try {
    const value = JSON.parse(jsonText);
    return normalizeAdjudication(value);
  } catch {
    return null;
  }
}

function normalizeAdjudication(value) {
  return {
    is_key_moment: asBoolean(value.is_key_moment),
    moment_type: asString(value.moment_type),
    is_live_action: asNullableBoolean(value.is_live_action),
    is_replay_or_recap: asNullableBoolean(value.is_replay_or_recap),
    scoreboard_readings: Array.isArray(value.scoreboard_readings) ? value.scoreboard_readings : [],
    scoreboard_transition: value.scoreboard_transition && typeof value.scoreboard_transition === 'object'
      ? value.scoreboard_transition
      : null,
    scoreboard_readable: asBoolean(value.scoreboard_readable),
    winner: normalizeWinner(value.winner),
    confidence: clampNumber(value.confidence, 0, 1),
    reasoning: asString(value.reasoning),
  };
}

function auditAdjudication(value) {
  const flags = [];
  const resultTypes = new Set(['point_won', 'game_won', 'set_won', 'match_won']);
  const allowedTypes = new Set([
    'point_won',
    'game_won',
    'set_won',
    'match_won',
    'pressure_state',
    'replay',
    'recap',
    'graphic',
    'uncertain',
  ]);
  const allowedWinners = new Set(['Djokovic', 'Alcaraz', 'unknown']);
  const reasoning = value.reasoning.toLowerCase();

  if (!allowedTypes.has(value.moment_type)) flags.push('invalid_moment_type');
  if (!allowedWinners.has(value.winner)) flags.push('invalid_winner');
  if (reasoning.includes('won by') && value.winner === 'unknown') {
    flags.push('reasoning_names_winner_but_winner_unknown');
  }
  if (!Array.isArray(value.scoreboard_readings) || value.scoreboard_readings.length === 0) {
    flags.push('missing_scoreboard_readings');
  }
  if (
    Array.isArray(value.scoreboard_readings) &&
    value.scoreboard_readings.some((reading) =>
      reading?.scoreboard_readable === true &&
      (!reading.normalizedScoreState || typeof reading.normalizedScoreState !== 'object')
    )
  ) {
    flags.push('missing_normalized_score_state');
  }
  if (!value.scoreboard_transition || typeof value.scoreboard_transition !== 'object') {
    flags.push('missing_scoreboard_transition');
  }
  const readableImageLabels = new Set((value.scoreboard_readings ?? [])
    .filter((reading) => reading?.scoreboard_readable === true)
    .map((reading) => reading.image_label)
    .filter(Boolean));
  const transitionImageLabels = Array.isArray(value.scoreboard_transition?.based_on_image_labels)
    ? value.scoreboard_transition.based_on_image_labels
    : [];
  if (
    value.scoreboard_transition?.changed === true &&
    transitionImageLabels.some((label) => !readableImageLabels.has(label))
  ) {
    flags.push('transition_uses_unreadable_or_missing_image');
  }
  if (value.scoreboard_transition?.changed === true && !value.scoreboard_transition?.change_type) {
    flags.push('transition_changed_without_type');
  }
  if (value.scoreboard_transition?.changed === true && value.scoreboard_transition.change_type === 'no_change') {
    flags.push('transition_changed_but_no_change_type');
  }
  if (value.scoreboard_transition?.changed === false && resultTypes.has(value.moment_type)) {
    flags.push('result_without_visible_transition_confirmation');
  }
  if (
    value.scoreboard_transition?.changed === true &&
    !['point', 'game', 'set', 'match'].includes(value.scoreboard_transition.change_type)
  ) {
    flags.push('transition_changed_with_non_result_type');
  }
  const visiblePointWinner = inferVisiblePointWinner(value.scoreboard_transition);
  if (visiblePointWinner) {
    const changedPlayer = normalizeWinner(value.scoreboard_transition?.changed_player);
    if (changedPlayer !== 'unknown' && changedPlayer !== visiblePointWinner) {
      flags.push('transition_changed_player_mismatch');
    }
    if (value.moment_type === 'point_won' && value.winner !== 'unknown' && value.winner !== visiblePointWinner) {
      flags.push('winner_mismatch_visible_point_transition');
    }
  }
  if (value.confidence > 0.85 && flags.length > 0) {
    flags.push('high_confidence_with_audit_flags');
  }

  return flags;
}

function inferVisiblePointWinner(transition) {
  if (!transition || transition.changed !== true || transition.change_type !== 'point') return null;
  const before = transition.before && typeof transition.before === 'object' ? transition.before : {};
  const after = transition.after && typeof transition.after === 'object' ? transition.after : {};
  const beforeRows = before.rawRowsByPlayer && typeof before.rawRowsByPlayer === 'object'
    ? before.rawRowsByPlayer
    : before;
  const afterRows = after.rawRowsByPlayer && typeof after.rawRowsByPlayer === 'object'
    ? after.rawRowsByPlayer
    : after;
  const playerKeys = new Set([...Object.keys(beforeRows), ...Object.keys(afterRows)]);
  const changedPlayers = [];

  for (const playerKey of playerKeys) {
    const beforeScore = pointScoreForPlayer(beforeRows[playerKey]);
    const afterScore = pointScoreForPlayer(afterRows[playerKey]);
    if (beforeScore == null || afterScore == null || beforeScore === afterScore) continue;
    const player = normalizeWinner(playerKey);
    if (player === 'Djokovic' || player === 'Alcaraz') changedPlayers.push(player);
  }

  return changedPlayers.length === 1 ? changedPlayers[0] : null;
}

function pointScoreForPlayer(playerScore) {
  const columns = Array.isArray(playerScore?.scoreColumns) ? playerScore.scoreColumns : [];
  const pointColumn = columns.find((column) => column?.kind === 'point_score');
  const score = pointColumn?.score;
  return typeof score === 'string' || typeof score === 'number' ? String(score).trim().toLowerCase() : null;
}

function extractJsonObject(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  return start >= 0 && end > start ? raw.slice(start, end + 1) : null;
}

function summarizeRequest(request) {
  const userContent = request.messages.find((message) => message.role === 'user')?.content ?? [];
  return {
    messageCount: request.messages.length,
    contentParts: Array.isArray(userContent) ? userContent.length : 1,
    imageCount: Array.isArray(userContent) ? userContent.filter((part) => part.type === 'image_url').length : 0,
    promptCharacters: JSON.stringify(request.messages).length,
  };
}

function redactRequest(request) {
  return {
    ...request,
    messages: request.messages.map((message) => ({
      ...message,
      content: Array.isArray(message.content)
        ? message.content.map((part) => {
            if (part.type !== 'image_url') return part;
            const url = part.image_url?.url ?? '';
            return {
              ...part,
              image_url: {
                ...part.image_url,
                url: url.replace(/base64,.+$/, 'base64,[redacted]'),
              },
            };
          })
        : message.content,
    })),
  };
}

function defaultBaseUrlForModel(model) {
  return model.startsWith('gpt-') ? OPENAI_BASE_URL : GEMINI_BASE_URL;
}

function defaultApiKeyEnvForModel(model) {
  return model.startsWith('gpt-') ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
}

function deriveOutputPath(path) {
  return path.endsWith('.json')
    ? path.replace(/\.json$/, '.adjudications.json')
    : `${path}.adjudications.json`;
}

function getArg(prefix) {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function asBoolean(value) {
  return value === true;
}

function asNullableBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function asString(value) {
  return typeof value === 'string' ? value : String(value ?? '');
}

function normalizeWinner(value) {
  const text = asString(value).toLowerCase();
  if (text.includes('djokovic')) return 'Djokovic';
  if (text.includes('alcaraz')) return 'Alcaraz';
  if (text === 'unknown') return 'unknown';
  return asString(value);
}

function asNullableString(value) {
  return typeof value === 'string' && value.trim() !== '' && value !== 'null' ? value : null;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(min, Math.min(max, number));
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : 'unknown';
}

function formatSignedSeconds(value) {
  const rounded = round1(value);
  return `${rounded >= 0 ? '+' : ''}${rounded}s`;
}

function formatTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const wholeSeconds = Math.floor(total % 60);
  const suffix = `${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}:${String(wholeSeconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${suffix}` : suffix;
}
