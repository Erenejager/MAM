// frontend/src/components/import/ImportStageChecklist.tsx
import { Check, X } from 'lucide-react';

type StageStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'skipped';

interface StageRow {
  name: string;
  activeLabel: string;
  completeLabel: string;
  status: StageStatus;
  durationMs: number | null;
}

interface ImportStageChecklistProps {
  stages: StageRow[];
}

function formatStageDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function StageRowView({ stage }: { stage: StageRow }) {
  const isActive = stage.status === 'processing';
  const isComplete = stage.status === 'complete' || stage.status === 'skipped';
  const isFailed = stage.status === 'failed';
  const isPending = stage.status === 'pending';

  let containerClass = 'flex items-center gap-[10px] px-[12px] py-[8px] rounded-lg transition-all duration-200 ';
  let containerStyle: React.CSSProperties = {};

  if (isActive) {
    containerStyle = {
      background: 'rgba(225,29,72,0.06)',
      border: '1px solid rgba(225,29,72,0.15)',
      boxShadow: '0 0 12px rgba(225,29,72,0.08)',
    };
  } else if (isFailed) {
    containerStyle = {
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(225,29,72,0.15)',
    };
  } else {
    containerStyle = {
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
    };
  }

  return (
    <div className={containerClass} style={containerStyle} role="listitem">
      {/* Icon */}
      {isComplete && <Check size={14} className="text-[#10B981] shrink-0" />}
      {isActive && (
        <div
          className="w-[14px] h-[14px] rounded-full border-2 border-cta border-t-transparent shrink-0"
          style={{ animation: 'spin 1s linear infinite' }}
          aria-label="Processing"
        />
      )}
      {isFailed && <X size={14} className="text-cta shrink-0" />}
      {isPending && <span className="text-[#52525b] text-[14px] shrink-0">&#9675;</span>}

      {/* Label */}
      <span
        className={`text-xs ${
          isActive ? 'text-[#e4e4e7]' :
          isComplete ? 'text-[#a1a1aa]' :
          isFailed ? 'text-cta' :
          'text-[#52525b]'
        }`}
      >
        {isActive ? stage.activeLabel :
         isComplete ? stage.completeLabel :
         isFailed ? `${stage.completeLabel.replace(/ed$/, '')} failed` :
         stage.completeLabel.replace(/ed$/, '')}
      </span>

      {/* Duration (completed stages only) */}
      {isComplete && stage.durationMs !== null && (
        <span className="ml-auto font-mono text-[10px] text-[#52525b]">
          {formatStageDuration(stage.durationMs)}
        </span>
      )}
    </div>
  );
}

export function ImportStageChecklist({ stages }: ImportStageChecklistProps) {
  return (
    <div className="flex flex-col gap-[8px]" role="list" aria-label="Import stages">
      {stages.map((stage) => (
        <StageRowView key={stage.name} stage={stage} />
      ))}
    </div>
  );
}

export type { StageRow, StageStatus };
