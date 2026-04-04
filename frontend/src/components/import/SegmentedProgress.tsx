import type { Asset } from '../../types/asset';
import { STAGES, resolveStatus } from './StageStepper';

const STAGE_LABELS: Record<string, string> = {
  metadataStatus: 'Meta',
  thumbnailStatus: 'Thumb',
  transcriptionStatus: 'Transcribe',
  searchIndexStatus: 'Index',
  ocrStatus: 'OCR',
};

const BAR_BG: Record<string, string> = {
  complete: '#10B981',
  failed: '#E11D48',
  processing: '#F59E0B',
  pending: 'rgba(255,255,255,0.08)',
};

const LABEL_COLOR: Record<string, string> = {
  complete: '#10B981',
  failed: '#E11D48',
  processing: '#F59E0B',
  pending: 'rgba(148,163,184,0.35)',
};

interface SegmentedProgressProps {
  asset: Asset;
}

export function SegmentedProgress({ asset }: SegmentedProgressProps) {
  const completedCount = STAGES.filter(
    ({ field }) => resolveStatus(asset[field] as string) === 'complete',
  ).length;

  return (
    <div
      role="progressbar"
      aria-valuenow={completedCount}
      aria-valuemax={5}
      aria-label="Import pipeline progress"
      className="flex items-center gap-[2px] w-full"
    >
      {STAGES.map(({ field }) => {
        const status = resolveStatus(asset[field] as string);
        const label = STAGE_LABELS[field];
        const isProcessing = status === 'processing';

        return (
          <div key={field} className="flex-1 flex flex-col items-center gap-[3px]">
            <div
              className="w-full h-[3px] rounded-[2px] overflow-hidden"
              style={{ background: isProcessing ? 'rgba(255,255,255,0.08)' : BAR_BG[status] }}
            >
              {isProcessing && (
                <div
                  className="h-full rounded-[2px] animate-pulse"
                  style={{ width: '60%', background: BAR_BG.processing }}
                />
              )}
            </div>
            <span
              className="text-[8px] font-mono"
              style={{ color: LABEL_COLOR[status] }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
