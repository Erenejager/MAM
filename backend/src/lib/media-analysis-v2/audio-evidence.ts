import type { AudioPeak, Event } from './types.js';

export function addAudioPeakEvidence(
  events: Event[],
  audioPeaks: AudioPeak[],
): Event[] {
  if (audioPeaks.length === 0) return events;

  return events.map((event) => {
    if (event.evidence.some((entry) => entry.type === 'audio' && entry.ref.startsWith('audio-peak:'))) {
      return event;
    }

    const peak = findSupportingAudioPeak(event, audioPeaks);
    if (!peak) return event;

    return {
      ...event,
      peakTime: event.peakTime ?? peak.peakTime,
      evidence: [
        ...event.evidence,
        {
          type: 'audio',
          ref: `audio-peak:${peak.id}`,
          confidence: audioPeakEvidenceConfidence(event, peak),
          note: `audio peak ${peak.shape}: energy=${peak.audioEnergy.toFixed(2)} spike=${peak.spikeScore.toFixed(2)} percentile=${peak.percentileRank.toFixed(2)}`,
          metadata: {
            peakTime: peak.peakTime,
            audioEnergy: peak.audioEnergy,
            localBaseline: peak.localBaseline,
            spikeScore: peak.spikeScore,
            percentileRank: peak.percentileRank,
            audioPeakShape: peak.shape,
          },
        },
      ],
    };
  });
}

function findSupportingAudioPeak(event: Event, audioPeaks: AudioPeak[]): AudioPeak | null {
  const windowSeconds = event.type === 'set_won' || event.type === 'match_won' ? 18 : 10;
  const nearby = audioPeaks
    .filter((peak) => Math.abs(peak.peakTime - event.anchorTime) <= windowSeconds)
    .sort((a, b) =>
      audioPeakRank(b) - audioPeakRank(a) ||
      Math.abs(a.peakTime - event.anchorTime) - Math.abs(b.peakTime - event.anchorTime),
    );

  return nearby[0] ?? null;
}

function audioPeakRank(peak: AudioPeak): number {
  const shapeBonus = peak.shape === 'spike' ? 0.08 : 0;
  return peak.percentileRank + Math.max(0, peak.spikeScore) + shapeBonus;
}

function audioPeakEvidenceConfidence(event: Event, peak: AudioPeak): number {
  const distance = Math.abs(peak.peakTime - event.anchorTime);
  const distanceScore = distance <= 3 ? 0.2 : distance <= 8 ? 0.12 : 0.06;
  const shapeScore = peak.shape === 'spike' ? 0.08 : 0.02;
  const eventScore = event.type === 'crowd_reaction' ? 0.05 : 0.1;
  return Number(Math.min(0.8, peak.percentileRank * 0.35 + Math.max(0, peak.spikeScore) * 0.35 + distanceScore + shapeScore + eventScore).toFixed(3));
}
