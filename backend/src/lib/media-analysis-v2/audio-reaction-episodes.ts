import type {
  AudioPeak,
  AudioReactionEpisode,
  AudioReactionEpisodeMember,
  CandidateWindowPacket,
} from './types.js';

const EPISODE_GAP_SECONDS = 45;

export function buildAudioReactionEpisodes(
  audioPeaks: AudioPeak[],
  candidateWindows: CandidateWindowPacket[],
): AudioReactionEpisode[] {
  const peaksById = new Map(audioPeaks.map((peak) => [peak.id, peak]));
  const packets = candidateWindows
    .map((packet) => {
      const peak = peaksById.get(audioPeakIdFromSourceRef(packet.sourceRef));
      return peak ? { packet, peak } : null;
    })
    .filter((entry): entry is { packet: CandidateWindowPacket; peak: AudioPeak } => entry != null)
    .sort((a, b) => a.packet.anchorTime - b.packet.anchorTime);

  const groups: Array<Array<{ packet: CandidateWindowPacket; peak: AudioPeak }>> = [];

  for (const entry of packets) {
    const previousGroup = groups[groups.length - 1];
    const previousEntry = previousGroup?.[previousGroup.length - 1] ?? null;

    if (!previousGroup || !previousEntry || entry.packet.anchorTime - previousEntry.packet.anchorTime > EPISODE_GAP_SECONDS) {
      groups.push([entry]);
      continue;
    }

    previousGroup.push(entry);
  }

  return groups.map((group, index) => buildEpisode(index, group));
}

function buildEpisode(
  index: number,
  group: Array<{ packet: CandidateWindowPacket; peak: AudioPeak }>,
): AudioReactionEpisode {
  const primary = selectPrimaryAnchor(group);
  const members = group.map(({ packet, peak }): AudioReactionEpisodeMember => ({
    candidateWindowId: packet.id,
    audioPeakId: peak.id,
    anchorTime: packet.anchorTime,
    role: roleForMember(packet, peak, primary.packet.id),
    audioSourceHint: packet.audioSourceHint,
    spikeScore: peak.spikeScore,
    percentileRank: peak.percentileRank,
  }));
  const startTime = Math.min(...group.map(({ packet }) => packet.startTime));
  const endTime = Math.max(...group.map(({ packet }) => packet.endTime));
  const primaryReason = isStrongReactionAnchor(primary.packet, primary.peak)
    ? 'first_strong_reaction'
    : 'best_available_peak';

  return {
    id: `audio_reaction_episode_${index}`,
    startTime: Number(startTime.toFixed(3)),
    endTime: Number(endTime.toFixed(3)),
    primaryCandidateWindowId: primary.packet.id,
    primaryAudioPeakId: primary.peak.id,
    primaryAnchorTime: primary.packet.anchorTime,
    primaryReason,
    confidence: episodeConfidence(primary.packet, primary.peak, group.length),
    memberCount: members.length,
    members,
    evidence: [{
      type: 'audio',
      ref: `audio-peak:${primary.peak.id}`,
      confidence: episodeConfidence(primary.packet, primary.peak, group.length),
      note: primaryReason === 'first_strong_reaction'
        ? 'reaction episode primary anchor selected as first strong reaction-like peak'
        : 'reaction episode primary anchor selected as best available audio peak',
      metadata: {
        peakTime: primary.peak.peakTime,
        audioEnergy: primary.peak.audioEnergy,
        localBaseline: primary.peak.localBaseline,
        spikeScore: primary.peak.spikeScore,
        percentileRank: primary.peak.percentileRank,
        audioPeakShape: primary.peak.shape,
      },
    }],
  };
}

function selectPrimaryAnchor(
  group: Array<{ packet: CandidateWindowPacket; peak: AudioPeak }>,
): { packet: CandidateWindowPacket; peak: AudioPeak } {
  const firstStrongReaction = group.find(({ packet, peak }) => isStrongReactionAnchor(packet, peak));
  if (firstStrongReaction) return firstStrongReaction;

  return [...group].sort((a, b) =>
    peakRank(b.packet, b.peak) - peakRank(a.packet, a.peak) ||
    a.packet.anchorTime - b.packet.anchorTime,
  )[0];
}

function roleForMember(
  packet: CandidateWindowPacket,
  peak: AudioPeak,
  primaryCandidateWindowId: string,
): AudioReactionEpisodeMember['role'] {
  if (packet.id === primaryCandidateWindowId) return 'primary_anchor';
  if (
    packet.audioSourceHint === 'speech_or_commentary' ||
    packet.facets.contentMode === 'replay_or_slow_motion' ||
    packet.facets.transcriptRelation === 'previous_action_recap'
  ) {
    return 'recap_or_speech_tail';
  }
  if (peak.spikeScore < 0.25 && (packet.speechDensity ?? 0) >= 0.65) return 'recap_or_speech_tail';
  return 'episode_tail';
}

function isStrongReactionAnchor(packet: CandidateWindowPacket, peak: AudioPeak): boolean {
  if (packet.audioSourceHint !== 'crowd_or_reaction') return false;
  return peak.shape === 'spike' && peak.spikeScore >= 0.35 && peak.percentileRank >= 0.98;
}

function peakRank(packet: CandidateWindowPacket, peak: AudioPeak): number {
  const sourceScore = packet.audioSourceHint === 'crowd_or_reaction'
    ? 0.3
    : packet.audioSourceHint === 'mixed_or_unknown'
      ? 0.1
      : -0.2;
  const shapeScore = peak.shape === 'spike' ? 0.08 : 0;
  return peak.percentileRank + Math.max(0, peak.spikeScore) + sourceScore + shapeScore;
}

function episodeConfidence(
  packet: CandidateWindowPacket,
  peak: AudioPeak,
  memberCount: number,
): number {
  const sourceScore = packet.audioSourceHint === 'crowd_or_reaction'
    ? 0.18
    : packet.audioSourceHint === 'mixed_or_unknown'
      ? 0.08
      : 0;
  const memberPenalty = memberCount > 1 ? 0.03 : 0;
  return Number(Math.min(0.9, peak.percentileRank * 0.34 + Math.max(0, peak.spikeScore) * 0.34 + sourceScore - memberPenalty).toFixed(3));
}

function audioPeakIdFromSourceRef(sourceRef: string): string {
  return sourceRef.replace(/^audio-peak:/, '');
}
