import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImportButton } from './ImportButton';
import { InProgressCard } from './InProgressCard';
import { CompletedCard } from './CompletedCard';
import { useIngestingAssets } from '../../hooks/useIngestingAssets';

interface ImportQueueViewProps {
  onViewAsset?: (assetId: string) => void;
}

export function ImportQueueView({ onViewAsset }: ImportQueueViewProps) {
  const { inProgress, recentCompleted } = useIngestingAssets();
  const queryClient = useQueryClient();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const hasActivity = inProgress.length > 0 || recentCompleted.length > 0;

  const handleFileSelected = useCallback(async (file: File) => {
    setUploadError(null);
    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/assets`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const json = await res.json() as { id?: string; existingId?: string; error?: string };

      if (res.status === 202) {
        // Asset created — will appear in inProgress via query invalidation
        queryClient.invalidateQueries({ queryKey: ['assets'] });
      } else if (res.status === 409) {
        setUploadError(`Already imported (asset ${json.existingId})`);
      } else {
        setUploadError(json.error ?? 'Upload failed');
      }
    } catch {
      setUploadError('Network error — is the server running?');
    } finally {
      setIsUploading(false);
    }
  }, [queryClient]);

  const handleViewAsset = useCallback((assetId: string) => {
    onViewAsset?.(assetId);
  }, [onViewAsset]);

  // Show large drop zone when no activity
  if (!hasActivity) {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <div
          className="flex flex-col items-center gap-lg p-3xl rounded-xl border border-dashed border-glass-border bg-glass glass-blur cursor-pointer transition-colors duration-200 hover:border-cta/30"
          style={{ minWidth: 420 }}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleFileSelected(file);
            };
            input.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFileSelected(file);
          }}
          role="button"
          aria-label="Drop video file or click to browse"
        >
          <svg
            className="w-16 h-16 text-text-muted transition-colors"
            fill="none" viewBox="0 0 48 48" stroke="currentColor" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 36H8a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4h-4M24 12v24M16 20l8-8 8 8" />
          </svg>
          <div className="text-center">
            <p className="text-text font-sans text-lg font-semibold">Drop video here</p>
            <p className="text-text-muted font-sans text-sm mt-xs">or click to browse</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-background overflow-y-auto">
      {/* Import button */}
      <ImportButton onFileSelected={handleFileSelected} disabled={isUploading} />

      {/* Upload error */}
      {uploadError && (
        <div className="mx-xl mb-md px-md py-sm bg-[rgba(225,29,72,0.08)] border border-[rgba(225,29,72,0.2)] rounded-[8px] text-[12px] text-cta font-sans flex items-center justify-between">
          <span>{uploadError}</span>
          <button
            onClick={() => setUploadError(null)}
            className="text-cta/60 hover:text-cta text-[10px] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* In Progress */}
      {inProgress.length > 0 && (
        <div className="px-xl pb-md">
          <div className="flex items-center gap-[8px] mb-[10px]">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              In Progress
            </span>
            <span className="font-mono text-[9px] bg-cta/15 text-cta px-[6px] py-[2px] rounded-[4px] font-semibold">
              {inProgress.length}
            </span>
          </div>
          <div className="flex flex-col gap-[8px]">
            {inProgress.map((asset) => (
              <InProgressCard key={asset.id} asset={asset} />
            ))}
          </div>
        </div>
      )}

      {/* Divider (only if both sections visible) */}
      {inProgress.length > 0 && recentCompleted.length > 0 && (
        <div className="h-[1px] bg-[rgba(45,42,94,0.4)] mx-xl my-[4px]" />
      )}

      {/* Completed */}
      <div className="px-xl pb-xl pt-md">
        <div className="flex items-center gap-[8px] mb-[10px]">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Completed
          </span>
          <span className="font-mono text-[9px] text-text-muted">last 3 days</span>
        </div>
        {recentCompleted.length === 0 ? (
          <p className="text-[12px] text-text-muted font-sans">No imports in the last 3 days</p>
        ) : (
          <div className="grid gap-[8px]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {recentCompleted.map((asset) => (
              <CompletedCard key={asset.id} asset={asset} onClick={handleViewAsset} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
