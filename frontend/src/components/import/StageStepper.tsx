import type { Asset } from '../../types/asset';

type StageStatus = 'complete' | 'failed' | 'skipped' | 'processing' | 'pending';

const STAGES: Array<{ field: keyof Asset; label: string }> = [
  { field: 'metadataStatus', label: 'Metadata' },
  { field: 'thumbnailStatus', label: 'Thumbnail' },
  { field: 'transcriptionStatus', label: 'Transcription' },
  { field: 'ocrStatus', label: 'OCR' },
  { field: 'searchIndexStatus', label: 'Search index' },
];

function resolveStatus(raw: string): StageStatus {
  if (raw === 'complete' || raw === 'skipped') return 'complete';
  if (raw === 'failed') return 'failed';
  if (raw === 'processing') return 'processing';
  return 'pending';
}

const DOT_COLOR: Record<StageStatus, string> = {
  complete: 'bg-[#10B981]',
  failed: 'bg-[#E11D48]',
  processing: 'bg-[#F59E0B] animate-pulse',
  skipped: 'bg-[#94A3B8]',
  pending: 'bg-[rgba(148,163,184,0.2)]',
};

interface StageStepperProps {
  asset: Asset;
  dotSize?: number;
}

export function StageStepper({ asset, dotSize = 6 }: StageStepperProps) {
  return (
    <div className="flex gap-[3px] items-center">
      {STAGES.map(({ field, label }) => {
        const status = resolveStatus(asset[field] as string);
        return (
          <div
            key={field}
            className={`rounded-full ${DOT_COLOR[status]}`}
            style={{ width: dotSize, height: dotSize }}
            aria-label={`${label}: ${status}`}
          />
        );
      })}
    </div>
  );
}

export { STAGES, resolveStatus };
export type { StageStatus };
