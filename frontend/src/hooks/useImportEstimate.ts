// frontend/src/hooks/useImportEstimate.ts
import { useRef, useCallback } from 'react';

interface StageAverage {
  avgMsPerMb: number;
  samples: number;
}

interface EstimateData {
  metadata: StageAverage;
  thumbnail: StageAverage;
  transcription: StageAverage;
  indexing: StageAverage;
}

const STORAGE_KEY = 'mam-import-estimates';
const STAGES = ['metadata', 'thumbnail', 'transcription', 'indexing'] as const;
type StageName = (typeof STAGES)[number];

function loadEstimates(): EstimateData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveEstimates(data: EstimateData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function useImportEstimate(fileSizeMb: number) {
  const stageStartTimes = useRef<Partial<Record<StageName, number>>>({});
  const stageDurations = useRef<Partial<Record<StageName, number>>>({});

  const markStageStart = useCallback((stage: StageName) => {
    stageStartTimes.current[stage] = Date.now();
  }, []);

  const markStageEnd = useCallback((stage: StageName) => {
    const start = stageStartTimes.current[stage];
    if (!start) return;
    const durationMs = Date.now() - start;
    stageDurations.current[stage] = durationMs;

    const estimates = loadEstimates() ?? {
      metadata: { avgMsPerMb: 0, samples: 0 },
      thumbnail: { avgMsPerMb: 0, samples: 0 },
      transcription: { avgMsPerMb: 0, samples: 0 },
      indexing: { avgMsPerMb: 0, samples: 0 },
    };
    const entry = estimates[stage];
    const msPerMb = fileSizeMb > 0 ? durationMs / fileSizeMb : 0;
    entry.avgMsPerMb = ((entry.avgMsPerMb * entry.samples) + msPerMb) / (entry.samples + 1);
    entry.samples += 1;
    saveEstimates(estimates);
  }, [fileSizeMb]);

  const getStageDuration = useCallback((stage: StageName): number | null => {
    return stageDurations.current[stage] ?? null;
  }, []);

  const getEstimate = useCallback((completedStages: StageName[]): string => {
    const estimates = loadEstimates();
    if (!estimates) return 'Estimating...';

    const hasData = STAGES.some(s => estimates[s].samples > 0);
    if (!hasData) return 'Estimating...';

    const remaining = STAGES.filter(s => !completedStages.includes(s));
    if (remaining.length === 0) return 'Almost done...';
    if (remaining.length === 1 && remaining[0] === 'indexing') return 'Almost done...';

    let remainingMs = 0;
    for (const stage of remaining) {
      const entry = estimates[stage];
      if (entry.samples > 0) {
        remainingMs += entry.avgMsPerMb * fileSizeMb;
      } else {
        const known = STAGES.filter(s => estimates[s].samples > 0);
        if (known.length > 0) {
          const avgAll = known.reduce((sum, s) => sum + estimates[s].avgMsPerMb, 0) / known.length;
          remainingMs += avgAll * fileSizeMb;
        }
      }
    }

    const remainingSec = Math.round(remainingMs / 1000);
    if (remainingSec < 10) return '< 10s remaining';
    if (remainingSec < 60) return `~${Math.round(remainingSec / 5) * 5}s remaining`;
    const mins = Math.round(remainingSec / 60);
    return `~${mins} min remaining`;
  }, [fileSizeMb]);

  const reset = useCallback(() => {
    stageStartTimes.current = {};
    stageDurations.current = {};
  }, []);

  return { markStageStart, markStageEnd, getStageDuration, getEstimate, reset };
}
