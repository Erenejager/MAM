import { computeFinegrainEnergy } from './audio-peaks.js';
import type { KeyMoment } from './result-processing.js';

const SCAN_RADIUS = 90;            // how far back/forward to look (seconds)
const LOOK_BACK_MAX = 25;          // max seconds to scan backward from peak
const LOOK_FORWARD_MAX = 20;       // max seconds to scan forward from peak
const RELATIVE_QUIET_FACTOR = 5;   // threshold = min_energy_in_window × this factor
const MIN_ABSOLUTE_THRESHOLD = 0.05; // floor: never treat very-low energy as loud
const FALLBACK_OFFSET_BEFORE = 10; // if no silence found, start this many seconds before peak
const FALLBACK_OFFSET_AFTER = 5;   // if no silence found, end this many seconds after peak

interface BoundedMoment extends KeyMoment {
  startTime: number;
  endTime: number;
  peakTime: number;
}

/**
 * For each curated key moment, scan backward in 1s audio energy
 * to find the silence gap that precedes the action, and forward
 * to find where the action settles. Sets startTime as the primary
 * timestamp so playback begins at the start of the action.
 */
export async function findMomentBoundaries(
  videoPath: string,
  moments: KeyMoment[],
  durationSeconds: number,
): Promise<BoundedMoment[]> {
  if (moments.length === 0) return [];

  const bounded = await Promise.all(
    moments.map(async (moment) => {
      const { offset, energies } = await computeFinegrainEnergy(
        videoPath,
        moment.timestamp,
        SCAN_RADIUS,
        durationSeconds,
      );

      // Index of the peak within the energy array
      const peakIdx = Math.round(moment.timestamp - offset);

      // ── Scan backward for silence gap ──
      const startTime = scanBackward(energies, peakIdx, offset);

      // ── Scan forward for silence gap ──
      const endTime = scanForward(energies, peakIdx, offset, durationSeconds);

      return {
        ...moment,
        startTime,
        endTime,
        peakTime: moment.timestamp,
        timestamp: startTime, // override: playback starts at action beginning
      } as BoundedMoment;
    }),
  );

  const merged = mergeOverlapping(bounded);
  return mergeNearDuplicates(merged);
}

/**
 * When two moments land on the same silence gap, their time windows overlap.
 * Keep the one with the higher priority (importance + moment_type).
 * Fall back to audio_energy only when priorities are equal.
 */
function mergeOverlapping(moments: BoundedMoment[]): BoundedMoment[] {
  if (moments.length <= 1) return moments;

  const merged: BoundedMoment[] = [];
  for (const m of moments) {
    const overlap = merged.find(
      (existing) => existing.startTime < m.endTime && m.startTime < existing.endTime,
    );
    if (overlap) {
      const mPriority = momentPriority(m);
      const overlapPriority = momentPriority(overlap);
      const keepCurrent =
        mPriority > overlapPriority ||
        (mPriority === overlapPriority && m.audio_energy > overlap.audio_energy);

      if (keepCurrent) {
        const idx = merged.indexOf(overlap);
        merged[idx] = m;
        console.log(`[ocr] Merged overlapping: kept ${fmtTime(m.peakTime)} (priority ${mPriority}) over ${fmtTime(overlap.peakTime)} (priority ${overlapPriority})`);
      } else {
        console.log(`[ocr] Merged overlapping: kept ${fmtTime(overlap.peakTime)} (priority ${overlapPriority}) over ${fmtTime(m.peakTime)} (priority ${mPriority})`);
      }
    } else {
      merged.push(m);
    }
  }

  return merged;
}

/** Moment type priority — higher = more significant */
const MOMENT_PRIORITY: Record<string, number> = {
  match_won: 10, set_won: 9, match_point: 8,
  break_of_serve: 7, break_point: 6, break_point_saved: 6,
  ace: 5, double_fault: 5, tiebreak: 5,
  rally: 3, deuce: 3, challenge: 3,
  hold: 2, injury_timeout: 1,
};

function momentPriority(m: BoundedMoment): number {
  const importancePriority =
    m.importance === 'critical' ? 100 :
    m.importance === 'significant' ? 50 : 0;
  const typePriority = MOMENT_PRIORITY[m.moment_type ?? ''] ?? 0;
  return importancePriority + typePriority;
}

/**
 * When two moments are <60s apart (peak-to-peak), keep only the more significant one.
 * The second is likely a replay, celebration, or re-description of the same action.
 * Exception: both moments have different visible scores (actually different events).
 */
function mergeNearDuplicates(moments: BoundedMoment[]): BoundedMoment[] {
  if (moments.length <= 1) return moments;

  const NEAR_THRESHOLD = 60; // seconds between peaks (one tennis game can be played in 90s)
  const result: BoundedMoment[] = [moments[0]];

  for (let i = 1; i < moments.length; i++) {
    const prev = result[result.length - 1];
    const curr = moments[i];
    const gap = curr.peakTime - prev.peakTime;

    if (gap < NEAR_THRESHOLD) {
      // If both have different visible scores → genuinely different events, keep both
      const bothConfident = prev.score_confidence === 'high' && curr.score_confidence === 'high';
      const scoresKnown = prev.score_display && curr.score_display;
      if (bothConfident && scoresKnown && prev.score_display !== curr.score_display) {
        result.push(curr);
        continue;
      }

      // Otherwise keep the more significant one
      const prevPriority = MOMENT_PRIORITY[prev.moment_type ?? ''] ?? 0;
      const currPriority = MOMENT_PRIORITY[curr.moment_type ?? ''] ?? 0;

      if (currPriority > prevPriority) {
        console.log(`[ocr] Near-duplicate: ${fmtTime(prev.peakTime)} [${prev.moment_type}] vs ${fmtTime(curr.peakTime)} [${curr.moment_type}] — kept ${fmtTime(curr.peakTime)} (higher priority)`);
        result[result.length - 1] = curr;
      } else if (currPriority === prevPriority && curr.audio_energy > prev.audio_energy) {
        console.log(`[ocr] Near-duplicate: ${fmtTime(prev.peakTime)} vs ${fmtTime(curr.peakTime)} — kept ${fmtTime(curr.peakTime)} (higher energy)`);
        result[result.length - 1] = curr;
      } else {
        console.log(`[ocr] Near-duplicate: ${fmtTime(prev.peakTime)} [${prev.moment_type}] vs ${fmtTime(curr.peakTime)} [${curr.moment_type}] — kept ${fmtTime(prev.peakTime)}`);
      }
    } else {
      result.push(curr);
    }
  }

  return result;
}

function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/**
 * Scan backward from peakIdx to find the noise→quiet transition just before the action.
 *
 * In tennis (and most sports), the decisive moment follows a pre-action silence:
 * the crowd hushes before a serve, and roars after the point. The key moment
 * timestamp should land at the START of that pre-action quiet — not at the roar.
 *
 * Strategy: compute a relative quiet threshold (5× the noise floor in the look-back
 * window) so detection adapts to the local energy level regardless of absolute volume.
 * Then scan backward until we find the noise→quiet transition = where this action began.
 */
function scanBackward(energies: number[], peakIdx: number, offset: number): number {
  const searchStart = Math.max(0, peakIdx - LOOK_BACK_MAX);
  const searchEnd = peakIdx - 1;

  if (searchEnd < searchStart) {
    return Math.max(0, offset + peakIdx - FALLBACK_OFFSET_BEFORE);
  }

  // Relative threshold: 5× the noise floor in this window.
  // Adapts to loud venues (ATP Finals indoor crowd) and quiet ones alike.
  const noiseFloor = Math.min(...energies.slice(searchStart, searchEnd + 1));
  const threshold = Math.max(noiseFloor * RELATIVE_QUIET_FACTOR, MIN_ABSOLUTE_THRESHOLD);

  // Walk backward from just before the peak.
  // Once we enter quiet territory, keep going until we hit noise again —
  // that noise→quiet boundary is where the current action began.
  let inQuiet = false;
  for (let i = searchEnd; i >= searchStart; i--) {
    if (energies[i] < threshold) {
      inQuiet = true;
    } else if (inQuiet) {
      // Was quiet, now noisy going backward → transition found.
      // i+1 is the first quiet second after the preceding noise = action start.
      return offset + i + 1;
    }
  }

  // Quiet all the way to the search boundary — return the boundary itself.
  if (inQuiet) {
    return offset + searchStart;
  }

  // No quiet found anywhere — fall back to a fixed offset before peak.
  return Math.max(0, offset + peakIdx - FALLBACK_OFFSET_BEFORE);
}

/**
 * Scan forward from peakIdx to find where the action ends (crowd settles).
 * Uses the same relative threshold as scanBackward for consistency.
 */
function scanForward(
  energies: number[],
  peakIdx: number,
  offset: number,
  durationSeconds: number,
): number {
  const searchStart = peakIdx + 1;
  const searchEnd = Math.min(energies.length - 1, peakIdx + LOOK_FORWARD_MAX);

  if (searchStart > searchEnd) {
    return Math.min(durationSeconds, offset + peakIdx + FALLBACK_OFFSET_AFTER);
  }

  const noiseFloor = Math.min(...energies.slice(searchStart, searchEnd + 1));
  const threshold = Math.max(noiseFloor * RELATIVE_QUIET_FACTOR, MIN_ABSOLUTE_THRESHOLD);

  // Scan forward: once we leave the loud section and enter quiet, that's where action ends.
  let inQuiet = false;
  for (let i = searchStart; i <= searchEnd; i++) {
    if (energies[i] < threshold) {
      if (!inQuiet) {
        // First quiet second after the peak = crowd settling = action end.
        return offset + i;
      }
      inQuiet = true;
    } else {
      inQuiet = false;
    }
  }

  return Math.min(durationSeconds, offset + peakIdx + FALLBACK_OFFSET_AFTER);
}
