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
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);

  const handleFileSelected = useCallback(async (file: File) => {
    setUploadError(null);
    setIsUploading(true);
    setUploadingFileName(file.name);

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
        await queryClient.invalidateQueries({ queryKey: ['assets'] });
      } else if (res.status === 409) {
        setUploadError(`Already imported (asset ${json.existingId})`);
      } else {
        setUploadError(json.error ?? 'Upload failed');
      }
    } catch {
      setUploadError('Network error — is the server running?');
    } finally {
      setIsUploading(false);
      setUploadingFileName(null);
    }
  }, [queryClient]);

  const handleViewAsset = useCallback((assetId: string) => {
    onViewAsset?.(assetId);
  }, [onViewAsset]);

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

      {/* Uploading indicator */}
      {isUploading && uploadingFileName && (
        <div className="mx-xl mb-md px-md py-sm bg-panel border border-border rounded-[8px] flex items-center gap-[8px]">
          <svg className="animate-spin h-[14px] w-[14px] text-cta" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="font-sans text-[12px] text-text-muted">
            Uploading <span className="text-text font-semibold">{uploadingFileName}</span>...
          </span>
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
