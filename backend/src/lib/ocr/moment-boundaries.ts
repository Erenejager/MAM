import { computeFinegrainEnergy } from './audio-peaks.js';
import type { KeyMoment } from './result-processing.js';

const SILENCE_THRESHOLD = 0.15; // normalized energy below this = "quiet"
const MIN_GAP_SECONDS = 1.5;   // quiet must last at least this long
const SCAN_RADIUS = 90;        // how far back/forward to look (seconds)
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
 * Scan backward from peakIdx looking for a silence gap (energy < threshold
 * sustained for MIN_GAP_SECONDS). Returns the absolute timestamp of the
 * end of that gap (= where action begins).
 */
function scanBackward(energies: number[], peakIdx: number, offset: number): number {
  let quietCount = 0;
  for (let i = peakIdx - 1; i >= 0; i--) {
    if (energies[i] < SILENCE_THRESHOLD) {
      quietCount++;
      if (quietCount >= MIN_GAP_SECONDS) {
        // Found a sustained silence gap — action starts after it
        return offset + i + quietCount;
      }
    } else {
      quietCount = 0;
    }
  }
  // No silence found — use fallback offset
  return Math.max(0, offset + peakIdx - FALLBACK_OFFSET_BEFORE);
}

/**
 * Scan forward from peakIdx looking for a silence gap.
 * Returns the absolute timestamp of the start of that gap (= where action ends).
 */
function scanForward(
  energies: number[],
  peakIdx: number,
  offset: number,
  durationSeconds: number,
): number {
  let quietCount = 0;
  for (let i = peakIdx + 1; i < energies.length; i++) {
    if (energies[i] < SILENCE_THRESHOLD) {
      quietCount++;
      if (quietCount >= MIN_GAP_SECONDS) {
        // Found silence — action ended just before it
        return offset + i - quietCount + 1;
      }
    } else {
      quietCount = 0;
    }
  }
  // No silence found — use fallback offset
  return Math.min(durationSeconds, offset + peakIdx + FALLBACK_OFFSET_AFTER);
}
