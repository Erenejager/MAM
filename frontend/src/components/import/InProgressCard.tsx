import { useState, useEffect, useRef } from 'react';
import { Video } from 'lucide-react';
import { SegmentedProgress } from './SegmentedProgress';
import { storageUrl } from '../../lib/api';
import type { Asset } from '../../types/asset';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface InProgressCardProps {
  asset: Asset;
}

export function InProgressCard({ asset }: InProgressCardProps) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = new Date(asset.createdAt).getTime();
    setElapsed(Math.floor((Date.now() - start) / 1000));

    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [asset.createdAt]);

  const activeStage = (() => {
    if (asset.metadataStatus === 'processing') return 'Extracting metadata...';
    if (asset.thumbnailStatus === 'processing') return 'Generating thumbnail...';
    if (asset.transcriptionStatus === 'processing') return 'Transcribing audio...';
    if (asset.searchIndexStatus === 'processing') return 'Indexing for search...';
    if (asset.ocrStatus === 'processing') return 'OCR + key moments...';
    return 'Queued...';
  })();

  return (
    <div className="bg-[rgba(30,27,75,0.4)] border border-[rgba(45,42,94,0.8)] rounded-[8px] p-[12px]">
      <div className="flex items-center gap-[10px] mb-[10px]">
        <div className="w-[44px] h-[32px] rounded-[3px] bg-[rgba(45,42,94,0.5)] border border-[rgba(45,42,94,0.8)] flex items-center justify-center shrink-0 overflow-hidden">
          {asset.thumbnailPath ? (
            <img
              src={storageUrl(asset.thumbnailPath)}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <Video size={12} className="text-[#94A3B8] opacity-50" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-sans text-[12px] font-semibold text-text truncate">
            {asset.title || asset.originalFilename}
          </div>
        </div>
        <span className="font-mono text-[10px] text-text tabular-nums shrink-0">
          {formatElapsed(elapsed)}
        </span>
        <span className="font-mono text-[9px] text-text-muted shrink-0">
          {activeStage}
        </span>
      </div>
      <SegmentedProgress asset={asset} />
    </div>
  );
}
