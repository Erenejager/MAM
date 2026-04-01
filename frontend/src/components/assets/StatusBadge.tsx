import { cn } from '../../lib/cn';
import type { Asset } from '../../types/asset';

interface StatusBadgeProps {
  status: Asset['status'];
  transcriptionStatus: Asset['transcriptionStatus'];
}

export function StatusBadge({ status, transcriptionStatus }: StatusBadgeProps) {
  let label: string;
  let colorClass: string;

  if (status === 'ingesting') {
    label = 'Ingesting...';
    colorClass = 'text-status-processing';
  } else if (status === 'error') {
    label = 'Error';
    colorClass = 'text-status-failed';
  } else if (transcriptionStatus === 'pending') {
    label = 'Transcription pending';
    colorClass = 'text-status-pending';
  } else if (transcriptionStatus === 'processing') {
    label = 'Transcribing...';
    colorClass = 'text-status-processing';
  } else if (transcriptionStatus === 'failed') {
    label = 'Transcription failed';
    colorClass = 'text-status-failed';
  } else {
    return null;
  }

  const showPulse = status === 'ingesting' || transcriptionStatus === 'processing';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-[3px] text-[10px] px-xs py-0 rounded-full bg-background/50 glass-blur-sm border border-[rgba(255,255,255,0.08)] leading-relaxed',
        colorClass
      )}
    >
      {showPulse && (
        <span className={cn('w-[5px] h-[5px] rounded-full animate-pulse', `bg-current`)} />
      )}
      {label}
    </span>
  );
}
