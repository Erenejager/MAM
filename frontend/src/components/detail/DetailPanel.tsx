import { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useAsset } from '../../hooks/useAssets';
import { VideoPlayer } from './VideoPlayer';
import { MetadataSection } from './MetadataSection';
import { CustomFieldsSection } from './CustomFieldsSection';
import { TranscriptList } from './TranscriptList';

interface DetailPanelProps {
  assetId: string;
  onClose: () => void;
}

export function DetailPanel({ assetId, onClose }: DetailPanelProps) {
  const { data: asset, isLoading, error } = useAsset(assetId);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col bg-panel p-4 space-y-4">
        <div className="h-48 bg-background rounded animate-pulse" />
        <div className="h-6 bg-background rounded animate-pulse w-3/4" />
        <div className="h-6 bg-background rounded animate-pulse w-1/2" />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="h-full flex flex-col bg-panel p-4">
        <p className="text-status-failed text-sm">Asset not found</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="font-semibold text-text text-sm truncate pr-4">
          {asset.title || asset.originalFilename}
        </h2>
        <button onClick={onClose} aria-label="Close detail panel" className="text-text-muted hover:text-cta cursor-pointer shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-6">
        <VideoPlayer asset={asset} videoRef={videoRef} />
        <MetadataSection asset={asset} />
        <CustomFieldsSection assetId={assetId} />
        <hr className="border-border" />
        <TranscriptList asset={asset} videoRef={videoRef} />
      </div>
    </div>
  );
}
