import { Video } from 'lucide-react';
import { StageStepper } from './StageStepper';
import { storageUrl } from '../../lib/api';
import type { Asset } from '../../types/asset';

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

interface CompletedCardProps {
  asset: Asset;
  onClick: (assetId: string) => void;
}

export function CompletedCard({ asset, onClick }: CompletedCardProps) {
  return (
    <button
      onClick={() => onClick(asset.id)}
      className="bg-[rgba(30,27,75,0.3)] border border-[rgba(45,42,94,0.5)] rounded-[8px] p-[9px] cursor-pointer transition-all duration-150 hover:border-[rgba(45,42,94,0.8)] hover:bg-[rgba(30,27,75,0.5)] text-left w-full"
    >
      <div className="flex gap-[8px] items-center mb-[6px]">
        <div className="w-[36px] h-[26px] rounded-[3px] bg-[rgba(45,42,94,0.5)] border border-[rgba(45,42,94,0.5)] shrink-0 overflow-hidden flex items-center justify-center">
          {asset.thumbnailPath ? (
            <img
              src={storageUrl(asset.thumbnailPath)}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <Video size={10} className="text-[#94A3B8] opacity-50" />
          )}
        </div>
        <div className="min-w-0">
          <div className="font-sans text-[11px] text-text font-semibold truncate">
            {asset.title || asset.originalFilename}
          </div>
          <div className="font-mono text-[9px] text-text-muted">
            {formatRelativeTime(asset.createdAt)}
          </div>
        </div>
      </div>
      <StageStepper asset={asset} />
    </button>
  );
}
