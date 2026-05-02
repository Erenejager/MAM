export function deriveAudioFacetRow(input) {
  const summary = input.summary ?? {};
  const context = summary.context ?? {};
  const scores = buildScores(summary, context);
  const audioFacets = [];
  const contextFacets = [];
  const opportunityFacets = [];
  const reasons = [];

  if (scores.rally >= 0.55) push(audioFacets, 'rally_texture');
  if (scores.reaction >= 0.6) push(audioFacets, 'reaction_burst');
  if (scores.crowd >= 0.58 && scores.reaction >= 0.45) push(audioFacets, 'crowd_reaction');
  if (scores.playerVocalization >= 0.6) push(audioFacets, 'player_vocalization');
  if (scores.commentator >= 0.68 || scores.speech >= 0.78 || context.speechDensity >= 0.8) {
    push(audioFacets, 'commentator_speech');
  }
  if (scores.umpire >= 0.62 || (context.hasScoreCue && scores.speech >= 0.55)) {
    push(audioFacets, 'umpire_or_score_call');
  }
  if (scores.music >= 0.65 || scores.musicBed >= 0.7) push(audioFacets, 'music_bed');
  if ((summary.rmsEnergy ?? summary.energyMean ?? 0) <= 0.08 || summary.silenceRatio >= 0.75) {
    push(audioFacets, 'quiet_or_reset');
  }
  if (scores.fluxMax >= 0.65 && scores.reaction < 0.62) push(audioFacets, 'transient_audio_spike');

  if (context.hasScoreCue) push(contextFacets, 'score_call_text');
  if (context.hasCommentaryCue || context.speechDensity >= 0.75) push(contextFacets, 'commentary_context');
  if (context.hasReplayCue || hasSuppression(context, 'replay_cue')) push(contextFacets, 'replay_or_recap');
  if (hasSuppression(context, 'music_bed') || scores.music >= 0.65) push(contextFacets, 'changeover_or_music_context');
  if (input.nearestEventDistance <= 5) push(contextFacets, 'near_existing_event');
  if (input.nearestEventType === 'match_won' && input.nearestEventDistance <= 60) {
    push(contextFacets, 'post_match_context');
  }
  if (input.nearestCandidateDistance <= 5) push(contextFacets, 'near_candidate_window');
  if (input.scoreboardVisibleCount > 0) push(contextFacets, 'scoreboard_visible_nearby');
  if (input.scoreboardNearbyCount > 0 && input.scoreboardVisibleCount === 0) {
    push(contextFacets, 'scoreboard_sampled_not_visible');
  }

  const suppressive =
    contextFacets.includes('replay_or_recap') ||
    contextFacets.includes('post_match_context') ||
    audioFacets.includes('music_bed') ||
    (
      audioFacets.includes('commentator_speech') &&
      scores.commentator > scores.reaction &&
      scores.commentator > scores.crowd
    );

  if (audioFacets.includes('reaction_burst') && !suppressive) push(opportunityFacets, 'primary_anchor');
  if (audioFacets.includes('rally_texture') && scores.reaction < 0.62) push(opportunityFacets, 'start_boundary_hint');
  if (audioFacets.includes('umpire_or_score_call') || contextFacets.includes('score_call_text')) {
    push(opportunityFacets, 'score_or_end_boundary_hint');
  }
  if (suppressive) push(opportunityFacets, 'suppress_as_primary');
  if (
    (audioFacets.includes('commentator_speech') || audioFacets.includes('music_bed') || contextFacets.includes('replay_or_recap')) &&
    (input.nearestEventDistance <= 20 || input.nearestCandidateDistance <= 20)
  ) {
    push(opportunityFacets, 'tail_context');
  }
  if (
    !suppressive &&
    input.nearestEventDistance > 8 &&
    input.nearestCandidateDistance > 8 &&
    (scores.reaction >= 0.62 || scores.crowd >= 0.65 || scores.playerVocalization >= 0.65)
  ) {
    push(opportunityFacets, 'uncovered_audio_moment');
  }
  if (
    !suppressive &&
    input.nearestEventDistance <= 8 &&
    (scores.reaction >= 0.55 || scores.rally >= 0.55 || scores.crowd >= 0.58)
  ) {
    push(opportunityFacets, 'strengthen_existing_event');
  }

  if (scores.reaction >= 0.62) reasons.push(`reaction=${formatScore(scores.reaction)}`);
  if (scores.rally >= 0.55) reasons.push(`rally=${formatScore(scores.rally)}`);
  if (scores.crowd >= 0.58) reasons.push(`crowd=${formatScore(scores.crowd)}`);
  if (scores.commentator >= 0.68) reasons.push(`commentator=${formatScore(scores.commentator)}`);
  if (scores.playerVocalization >= 0.6) reasons.push(`player=${formatScore(scores.playerVocalization)}`);
  if (scores.music >= 0.65) reasons.push(`music=${formatScore(scores.music)}`);
  if (context.speechDensity >= 0.75) reasons.push(`speechDensity=${formatScore(context.speechDensity)}`);
  if (context.suppressionReasons?.length) reasons.push(`suppress=${context.suppressionReasons.join('+')}`);

  return {
    scores,
    audioFacets,
    contextFacets,
    opportunityFacets,
    reasons,
  };
}

export function summarizeAudioFacetTimeline(timeline, options = {}) {
  const points = [...(timeline ?? [])].sort((a, b) => pointOffset(a, options) - pointOffset(b, options));
  const preAnchor = points.filter((point) => pointOffset(point, options) < -1);
  const anchor = points.filter((point) => Math.abs(pointOffset(point, options)) <= 2);
  const postAnchor = points.filter((point) => pointOffset(point, options) > 2);
  const bestReactionPoint = bestPoint(points, (point) => point.reactionBurstScore ?? point.reactionScore ?? 0);
  const bestRallyPoint = bestPoint(points, (point) => point.rallyTextureScore ?? point.rallyScore ?? 0);
  const primaryAnchorPoint = bestPoint(
    points.filter((point) => includes(point.opportunityFacets, 'primary_anchor')),
    (point) => point.reactionBurstScore ?? point.reactionScore ?? 0,
  ) ?? bestReactionPoint;
  const suppressiveTailPoints = postAnchor.filter((point) =>
    includes(point.opportunityFacets, 'suppress_as_primary') ||
    includes(point.opportunityFacets, 'tail_context') ||
    includes(point.contextFacets, 'post_match_context') ||
    includes(point.contextFacets, 'replay_or_recap') ||
    includes(point.audioFacets, 'music_bed')
  );
  const allOpportunities = unique(points.flatMap((point) => point.opportunityFacets ?? []));
  const allContextFacets = unique(points.flatMap((point) => point.contextFacets ?? []));
  const allAudioFacets = unique(points.flatMap((point) => point.audioFacets ?? []));
  const hasSuppressiveAnchor = anchor.some((point) => includes(point.opportunityFacets, 'suppress_as_primary'));
  const hasPrimaryAnchor = anchor.some((point) => includes(point.opportunityFacets, 'primary_anchor'));
  const supportsExistingEvent = points.some((point) =>
    includes(point.opportunityFacets, 'strengthen_existing_event') ||
    includes(point.contextFacets, 'near_existing_event')
  );
  const hasUncoveredAudioMoment = allOpportunities.includes('uncovered_audio_moment');
  const hasPostMatchContext = allContextFacets.includes('post_match_context');
  const hasReplayOrRecap = allContextFacets.includes('replay_or_recap');
  const hasStartBoundaryHint = allOpportunities.includes('start_boundary_hint');
  const hasScoreOrEndBoundaryHint = allOpportunities.includes('score_or_end_boundary_hint');
  const hasStrongReaction = (bestReactionPoint?.reactionBurstScore ?? bestReactionPoint?.reactionScore ?? 0) >= 0.6;
  const hasStrongRally = (bestRallyPoint?.rallyTextureScore ?? bestRallyPoint?.rallyScore ?? 0) >= 0.55;
  const suppressAsPrimary = hasPostMatchContext ||
    hasReplayOrRecap ||
    (hasSuppressiveAnchor && !hasPrimaryAnchor && !supportsExistingEvent && !hasStartBoundaryHint);

  return {
    primaryAnchorTime: primaryAnchorPoint ? pointTime(primaryAnchorPoint) : null,
    primaryAnchorTimecode: primaryAnchorPoint?.timecode ?? null,
    primaryAnchorOffset: primaryAnchorPoint ? round1(pointOffset(primaryAnchorPoint, options)) : null,
    primaryAnchorFacets: primaryAnchorPoint?.audioFacets ?? [],
    primaryAnchorOpportunities: primaryAnchorPoint?.opportunityFacets ?? [],
    bestReaction: bestReactionPoint ? pointScoreSummary(bestReactionPoint, options) : null,
    bestRally: bestRallyPoint ? pointScoreSummary(bestRallyPoint, options) : null,
    preAnchorFacets: unique(preAnchor.flatMap((point) => point.audioFacets ?? [])),
    anchorFacets: unique(anchor.flatMap((point) => point.audioFacets ?? [])),
    postAnchorFacets: unique(postAnchor.flatMap((point) => point.audioFacets ?? [])),
    contextFacets: allContextFacets,
    opportunityFacets: allOpportunities,
    hasPrimaryAnchor,
    hasStrongReaction,
    hasStrongRally,
    hasStartBoundaryHint,
    hasScoreOrEndBoundaryHint,
    hasSuppressiveTail: suppressiveTailPoints.length > 0,
    suppressiveTailStartTime: suppressiveTailPoints[0] ? pointTime(suppressiveTailPoints[0]) : null,
    suppressiveTailStartTimecode: suppressiveTailPoints[0]?.timecode ?? null,
    supportsExistingEvent,
    hasUncoveredAudioMoment,
    suppressAsPrimary,
    audioMomentOpportunity: classifyAudioMomentOpportunity({
      hasPrimaryAnchor,
      hasStrongReaction,
      hasStrongRally,
      hasStartBoundaryHint,
      hasScoreOrEndBoundaryHint,
      supportsExistingEvent,
      hasUncoveredAudioMoment,
      suppressAsPrimary,
      hasPostMatchContext,
      hasReplayOrRecap,
      allAudioFacets,
    }),
  };
}

function buildScores(summary, context) {
  return {
    energy: summary.rmsEnergy ?? summary.energyMax ?? 0,
    rally: context.rallyTextureScore ?? summary.rallyTextureScore ?? 0,
    reaction: context.reactionBurstScore ?? summary.reactionBurstScore ?? 0,
    speech: context.speechDominanceScore ?? summary.speechDominanceScore ?? 0,
    musicBed: context.musicBedScore ?? summary.musicBedScore ?? 0,
    crowd: context.crowdScore ?? summary.crowdScore ?? context.applauseCrowdScore ?? summary.applauseCrowdScore ?? 0,
    commentator: context.commentatorScore ?? summary.commentatorScore ?? context.speechDominanceScore ?? summary.speechDominanceScore ?? 0,
    umpire: context.umpireScore ?? summary.umpireScore ?? summary.umpireAnnouncementScore ?? 0,
    playerVocalization: context.playerVocalizationScore ?? summary.playerVocalizationScore ?? 0,
    music: context.musicScore ?? summary.musicScore ?? context.musicBedScore ?? summary.musicBedScore ?? 0,
    centroid: summary.spectralCentroidMean ?? 0,
    flatness: summary.spectralFlatnessMean ?? 0,
    fluxMax: summary.spectralFluxMax ?? 0,
  };
}

function classifyAudioMomentOpportunity(input) {
  if (input.hasPostMatchContext) return 'post_match_context';
  if (input.hasReplayOrRecap) return 'suppress_or_tail';
  if (input.hasUncoveredAudioMoment) return 'uncovered_audio_moment';
  if (input.supportsExistingEvent && (input.hasPrimaryAnchor || input.hasStartBoundaryHint || input.hasScoreOrEndBoundaryHint)) {
    return 'strengthen_existing_event';
  }
  if (input.hasPrimaryAnchor && input.hasStrongRally) return 'probable_audio_moment';
  if (input.hasPrimaryAnchor) return 'possible_audio_moment';
  if (input.hasStartBoundaryHint || input.hasScoreOrEndBoundaryHint) return 'boundary_hint';
  if (input.suppressAsPrimary) return 'suppress_or_tail';
  if (input.allAudioFacets.includes('commentator_speech') || input.allAudioFacets.includes('music_bed')) return 'context_only';
  return 'low_signal';
}

function bestPoint(points, scoreFn) {
  return points
    .map((point) => ({ point, score: scoreFn(point) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score || pointOffset(a.point, {}) - pointOffset(b.point, {}))[0]?.point ?? null;
}

function pointScoreSummary(point, options) {
  return {
    time: pointTime(point),
    timecode: point.timecode ?? null,
    offset: round1(pointOffset(point, options)),
    reactionBurstScore: point.reactionBurstScore ?? point.reactionScore ?? 0,
    rallyTextureScore: point.rallyTextureScore ?? point.rallyScore ?? 0,
    crowdScore: point.crowdScore ?? 0,
    commentatorScore: point.commentatorScore ?? 0,
    musicScore: point.musicScore ?? 0,
    audioFacets: point.audioFacets ?? [],
    opportunityFacets: point.opportunityFacets ?? [],
  };
}

function pointTime(point) {
  if (typeof point.time === 'number') return point.time;
  if (typeof point.start === 'number' && typeof point.end === 'number') return (point.start + point.end) / 2;
  return null;
}

function pointOffset(point, options) {
  if (typeof point.secondsFromAudioAnchor === 'number') return point.secondsFromAudioAnchor;
  if (typeof point.offset === 'number') return point.offset;
  const time = pointTime(point);
  if (typeof time === 'number' && typeof options.anchorTime === 'number') return time - options.anchorTime;
  return 0;
}

function includes(list, value) {
  return Array.isArray(list) && list.includes(value);
}

function hasSuppression(context, reason) {
  return Array.isArray(context.suppressionReasons) && context.suppressionReasons.includes(reason);
}

function push(list, value) {
  if (!list.includes(value)) list.push(value);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatScore(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

function round1(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}
