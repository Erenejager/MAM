// frontend/src/components/import/ImportStageChecklist.tsx
import { AnimatePresence, motion } from 'framer-motion';
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
      {/* Icon with animated transitions */}
      <div className="w-[14px] h-[14px] shrink-0 relative flex items-center justify-center">
        <AnimatePresence mode="wait">
          {isComplete && (
            <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 25 }}>
              <Check size={14} className="text-[#10B981]" />
            </motion.div>
          )}
          {isActive && (
            <motion.div
              key="spin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-[14px] h-[14px] rounded-full border-2 border-cta border-t-transparent"
              style={{ animation: 'spin 1s linear infinite' }}
              aria-label="Processing"
            />
          )}
          {isFailed && (
            <motion.div key="fail" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 25 }}>
              <X size={14} className="text-cta" />
            </motion.div>
          )}
          {isPending && (
            <motion.span key="pending" className="text-[#52525b] text-[14px]">&#9675;</motion.span>
          )}
        </AnimatePresence>
      </div>

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
      {stages.map((stage, i) => (
        <motion.div
          key={stage.name}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.15, delay: i * 0.05 }}
        >
          <StageRowView stage={stage} />
        </motion.div>
      ))}
    </div>
  );
}

export type { StageRow, StageStatus };
