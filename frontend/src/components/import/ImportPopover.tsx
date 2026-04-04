import { Video } from 'lucide-react';
import { StageStepper, STAGES } from './StageStepper';
import { storageUrl } from '../../lib/api';
import type { Asset } from '../../types/asset';

const ACTIVE_STAGE_LABELS: Record<string, string> = {
  metadataStatus: 'Extracting metadata...',
  thumbnailStatus: 'Generating thumbnail...',
  transcriptionStatus: 'Transcribing...',
  searchIndexStatus: 'Indexing...',
  ocrStatus: 'OCR + key moments...',
};

function getActiveStageLabel(asset: Asset): string {
  for (const { field } of STAGES) {
    if ((asset[field] as string) === 'processing') {
      return ACTIVE_STAGE_LABELS[field] ?? 'Processing...';
    }
  }
  return 'Queued...';
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatElapsed(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface ImportPopoverProps {
  inProgress: Asset[];
  recentCompleted: Asset[];
  onNavigateToImport: () => void;
}

export function ImportPopover({ inProgress, recentCompleted, onNavigateToImport }: ImportPopoverProps) {
  const displayActive = inProgress.slice(0, 3);
  const extraActive = inProgress.length - 3;
  const displayRecent = recentCompleted.slice(0, 2);

  const hasNothing = inProgress.length === 0 && recentCompleted.length === 0;

  return (
    <div
      className="absolute top-full right-0 mt-[4px] z-50"
      style={{ minWidth: 300 }}
      role="tooltip"
    >
      <div
        className="bg-[rgba(15,15,35,0.95)] border border-[rgba(45,42,94,0.8)] rounded-[10px] overflow-hidden shadow-lg"
        style={{ backdropFilter: 'blur(16px)' }}
      >
        {hasNothing ? (
          <div className="px-[14px] py-[12px] text-[11px] text-text-muted font-sans">
            No recent activity
          </div>
        ) : (
          <>
            {/* Active section */}
            {inProgress.length > 0 && (
              <>
                <div className="px-[14px] py-[10px] border-b border-[rgba(45,42,94,0.5)] flex justify-between items-center">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    Processing
                  </span>
                  <span className="text-[10px] text-cta font-semibold">
                    {inProgress.length} active
                  </span>
                </div>
                {displayActive.map((asset) => (
                  <div key={asset.id} className="px-[14px] py-[10px] border-b border-[rgba(45,42,94,0.3)]">
                    <div className="flex gap-[10px]">
                      <div className="w-[44px] h-[32px] rounded-[3px] bg-[rgba(45,42,94,0.5)] border border-[rgba(45,42,94,0.8)] flex items-center justify-center shrink-0 overflow-hidden">
                        {asset.thumbnailPath ? (
                          <img src={storageUrl(asset.thumbnailPath)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Video size={10} className="text-[#94A3B8] opacity-50" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-text truncate font-sans">
                          {asset.title || asset.originalFilename}
                        </div>
                        <div className="mt-[4px]">
                          <StageStepper asset={asset} dotSize={7} />
                        </div>
                        <div className="text-[9px] text-[#F59E0B] mt-[3px] font-sans">
                          {getActiveStageLabel(asset)} · {formatElapsed(asset.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {extraActive > 0 && (
                  <div className="px-[14px] py-[6px] text-[9px] text-text-muted font-sans border-b border-[rgba(45,42,94,0.3)]">
                    +{extraActive} more
                  </div>
                )}
              </>
            )}

            {/* Recent section */}
            {displayRecent.length > 0 && (
              <>
                <div className="px-[14px] py-[7px] border-b border-[rgba(45,42,94,0.3)]">
                  <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
                    Recent
                  </span>
                </div>
                {displayRecent.map((asset) => (
                  <div key={asset.id} className="px-[14px] py-[7px] flex gap-[10px] items-center">
                    <div className="w-[44px] h-[32px] rounded-[3px] bg-[rgba(45,42,94,0.5)] border border-[rgba(45,42,94,0.5)] shrink-0 overflow-hidden flex items-center justify-center">
                      {asset.thumbnailPath ? (
                        <img src={storageUrl(asset.thumbnailPath)} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <Video size={10} className="text-[#94A3B8] opacity-50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-text-muted truncate font-sans">
                        {asset.title || asset.originalFilename}
                      </div>
                      <div className="mt-[3px]">
                        <StageStepper asset={asset} />
                      </div>
                    </div>
                    <span className="text-[9px] text-text-muted shrink-0 font-sans">
                      {formatRelativeTime(asset.createdAt)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* Footer */}
        <div className="px-[14px] py-[9px] border-t border-[rgba(45,42,94,0.5)] text-center">
          <button
            onClick={onNavigateToImport}
            className="text-[10px] text-cta font-semibold cursor-pointer bg-transparent border-none p-0 hover:underline"
          >
            View all imports →
          </button>
        </div>
      </div>
    </div>
  );
}
