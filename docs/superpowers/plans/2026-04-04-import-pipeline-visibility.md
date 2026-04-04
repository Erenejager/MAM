# Import Pipeline Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-import ImportView with a queue + history dashboard, and add a hover popover on the TopBar Import pill for at-a-glance pipeline status.

**Architecture:** Two new UI sections share a common set of stage-display components (`StageStepper`, `SegmentedProgress`). The Import tab is rebuilt as `ImportQueueView` consuming the existing `useAssets` hook (filtered client-side). The TopBar gets a hover-sticky `ImportPopover`. No backend changes needed — all data is already available.

**Tech Stack:** React 18, TanStack Query, Framer Motion, Tailwind CSS 3, Lucide icons

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/components/import/StageStepper.tsx` | Reusable 5-dot status stepper (compact) |
| Create | `frontend/src/components/import/SegmentedProgress.tsx` | Horizontal segmented bar with stage labels |
| Create | `frontend/src/components/import/ImportButton.tsx` | CTA button + drag-drop target |
| Create | `frontend/src/components/import/InProgressCard.tsx` | Active import card with segmented progress |
| Create | `frontend/src/components/import/CompletedCard.tsx` | Compact card with dot stepper |
| Create | `frontend/src/components/import/ImportQueueView.tsx` | Full Import tab (replaces ImportView) |
| Create | `frontend/src/components/import/ImportPopover.tsx` | TopBar hover popover |
| Create | `frontend/src/hooks/useIngestingAssets.tsx` | Hook for polling ingesting assets at 2.5s |
| Modify | `frontend/src/components/layout/TopBar.tsx:369-401` | Wrap Import pill with popover hover logic |
| Modify | `frontend/src/App.tsx:8,205-209` | Swap ImportView for ImportQueueView |

---

### Task 1: StageStepper Component

**Files:**
- Create: `frontend/src/components/import/StageStepper.tsx`

The compact 5-dot stepper used in completed cards and the popover. Each dot represents a pipeline stage, colored by status.

- [ ] **Step 1: Create StageStepper component**

```tsx
// frontend/src/components/import/StageStepper.tsx
import type { Asset } from '../../types/asset';

type StageStatus = 'complete' | 'failed' | 'skipped' | 'processing' | 'pending';

const STAGES: Array<{ field: keyof Asset; label: string }> = [
  { field: 'metadataStatus', label: 'Metadata' },
  { field: 'thumbnailStatus', label: 'Thumbnail' },
  { field: 'transcriptionStatus', label: 'Transcription' },
  { field: 'searchIndexStatus', label: 'Search index' },
  { field: 'ocrStatus', label: 'OCR' },
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to StageStepper

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/import/StageStepper.tsx
git commit -m "feat: add StageStepper component for pipeline status dots"
```

---

### Task 2: SegmentedProgress Component

**Files:**
- Create: `frontend/src/components/import/SegmentedProgress.tsx`

Horizontal segmented progress bar with labeled stages. Used in InProgressCard.

- [ ] **Step 1: Create SegmentedProgress component**

```tsx
// frontend/src/components/import/SegmentedProgress.tsx
import type { Asset } from '../../types/asset';
import { STAGES, resolveStatus } from './StageStepper';

const STAGE_LABELS: Record<string, string> = {
  metadataStatus: 'Meta',
  thumbnailStatus: 'Thumb',
  transcriptionStatus: 'Transcribe',
  searchIndexStatus: 'Index',
  ocrStatus: 'OCR',
};

const BAR_BG: Record<string, string> = {
  complete: '#10B981',
  failed: '#E11D48',
  processing: '#F59E0B',
  pending: 'rgba(255,255,255,0.08)',
};

const LABEL_COLOR: Record<string, string> = {
  complete: '#10B981',
  failed: '#E11D48',
  processing: '#F59E0B',
  pending: 'rgba(148,163,184,0.35)',
};

interface SegmentedProgressProps {
  asset: Asset;
}

export function SegmentedProgress({ asset }: SegmentedProgressProps) {
  const completedCount = STAGES.filter(
    ({ field }) => resolveStatus(asset[field] as string) === 'complete',
  ).length;

  return (
    <div
      role="progressbar"
      aria-valuenow={completedCount}
      aria-valuemax={5}
      aria-label="Import pipeline progress"
      className="flex items-center gap-[2px] w-full"
    >
      {STAGES.map(({ field }) => {
        const status = resolveStatus(asset[field] as string);
        const label = STAGE_LABELS[field];
        const isProcessing = status === 'processing';

        return (
          <div key={field} className="flex-1 flex flex-col items-center gap-[3px]">
            <div
              className="w-full h-[3px] rounded-[2px] overflow-hidden"
              style={{ background: isProcessing ? 'rgba(255,255,255,0.08)' : BAR_BG[status] }}
            >
              {isProcessing && (
                <div
                  className="h-full rounded-[2px] animate-pulse"
                  style={{ width: '60%', background: BAR_BG.processing }}
                />
              )}
            </div>
            <span
              className="text-[8px] font-mono"
              style={{ color: LABEL_COLOR[status] }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to SegmentedProgress

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/import/SegmentedProgress.tsx
git commit -m "feat: add SegmentedProgress component for pipeline stage bars"
```

---

### Task 3: ImportButton Component

**Files:**
- Create: `frontend/src/components/import/ImportButton.tsx`

CTA button that doubles as a drag-and-drop target.

- [ ] **Step 1: Create ImportButton component**

```tsx
// frontend/src/components/import/ImportButton.tsx
import { useState, useRef, useCallback } from 'react';
import { Upload } from 'lucide-react';

interface ImportButtonProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function ImportButton({ onFileSelected, disabled }: ImportButtonProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.relatedTarget === null) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) onFileSelected(file);
  }, [onFileSelected, disabled]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
    e.target.value = '';
  }, [onFileSelected]);

  return (
    <div className="flex justify-center py-md">
      <button
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        disabled={disabled}
        className={`inline-flex items-center gap-[6px] px-[22px] py-[9px] rounded-[8px] border cursor-pointer transition-all duration-200 ${
          isDragOver
            ? 'bg-cta/15 border-cta/40 shadow-[0_0_12px_rgba(225,29,72,0.2)]'
            : 'bg-cta/8 border-cta/20 hover:bg-cta/12 hover:border-cta/30'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-label="Import video — drag and drop or click to browse"
      >
        <Upload size={14} className="text-cta opacity-70" />
        <span className="font-sans text-[12px] text-cta font-semibold">Import Video</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to ImportButton

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/import/ImportButton.tsx
git commit -m "feat: add ImportButton CTA component with drag-drop support"
```

---

### Task 4: useIngestingAssets Hook

**Files:**
- Create: `frontend/src/hooks/useIngestingAssets.ts`

A dedicated hook that polls for ingesting assets at 2.5s intervals. Returns both in-progress and recent completed assets (last 3 days).

- [ ] **Step 1: Create the hook**

```tsx
// frontend/src/hooks/useIngestingAssets.ts
import { useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAssets } from '../lib/api';
import type { Asset } from '../types/asset';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function useIngestingAssets(onImportComplete?: () => void) {
  const { data: allAssets, ...rest } = useQuery({
    queryKey: ['assets'],
    queryFn: () => fetchAssets(),
    refetchInterval: (query) => {
      const assets = query.state.data as Asset[] | undefined;
      if (!assets) return false;
      const hasIngesting = assets.some((a) => a.status === 'ingesting');
      return hasIngesting ? 2500 : false;
    },
  });

  // Track which asset IDs were ingesting on the previous render
  const prevIngestingIds = useRef<Set<string>>(new Set());

  const inProgress = useMemo(
    () =>
      (allAssets ?? [])
        .filter((a) => a.status === 'ingesting')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [allAssets],
  );

  // Detect when an asset transitions from ingesting to ready/error
  useEffect(() => {
    const currentIds = new Set(inProgress.map((a) => a.id));
    for (const prevId of prevIngestingIds.current) {
      if (!currentIds.has(prevId)) {
        // This asset was ingesting before and no longer is — it completed
        onImportComplete?.();
      }
    }
    prevIngestingIds.current = currentIds;
  }, [inProgress, onImportComplete]);

  const recentCompleted = useMemo(() => {
    const cutoff = Date.now() - THREE_DAYS_MS;
    return (allAssets ?? [])
      .filter(
        (a) =>
          (a.status === 'ready' || a.status === 'error') &&
          new Date(a.createdAt).getTime() >= cutoff,
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allAssets]);

  return { inProgress, recentCompleted, allAssets, ...rest };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to useIngestingAssets

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useIngestingAssets.ts
git commit -m "feat: add useIngestingAssets hook with 2.5s polling and 3-day history"
```

---

### Task 5: InProgressCard Component

**Files:**
- Create: `frontend/src/components/import/InProgressCard.tsx`

Active import card with thumbnail, filename, elapsed time, estimate, and segmented progress bar.

- [ ] **Step 1: Create InProgressCard component**

```tsx
// frontend/src/components/import/InProgressCard.tsx
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
    // Calculate elapsed from createdAt
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
      {/* Header: thumbnail + name + time */}
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

      {/* Segmented progress */}
      <SegmentedProgress asset={asset} />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to InProgressCard

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/import/InProgressCard.tsx
git commit -m "feat: add InProgressCard component with segmented pipeline progress"
```

---

### Task 6: CompletedCard Component

**Files:**
- Create: `frontend/src/components/import/CompletedCard.tsx`

Compact card for the completed imports grid.

- [ ] **Step 1: Create CompletedCard component**

```tsx
// frontend/src/components/import/CompletedCard.tsx
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to CompletedCard

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/import/CompletedCard.tsx
git commit -m "feat: add CompletedCard component with dot stepper"
```

---

### Task 7: ImportQueueView (Main Import Tab)

**Files:**
- Create: `frontend/src/components/import/ImportQueueView.tsx`

The full Import tab replacing `ImportView`. Stacked layout: import button, in-progress cards, completed grid.

- [ ] **Step 1: Create ImportQueueView component**

```tsx
// frontend/src/components/import/ImportQueueView.tsx
import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { ImportButton } from './ImportButton';
import { InProgressCard } from './InProgressCard';
import { CompletedCard } from './CompletedCard';
import { useIngestingAssets } from '../../hooks/useIngestingAssets';
import { showCompletionToast } from './ImportCompletionToast';

interface ImportQueueViewProps {
  onViewAsset?: (assetId: string) => void;
  onImportComplete?: () => void;
}

export function ImportQueueView({ onViewAsset, onImportComplete }: ImportQueueViewProps) {
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to ImportQueueView

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/import/ImportQueueView.tsx
git commit -m "feat: add ImportQueueView with queue and 3-day history"
```

---

### Task 8: ImportPopover Component

**Files:**
- Create: `frontend/src/components/import/ImportPopover.tsx`

Hover-sticky popover for the TopBar Import pill. Shows up to 3 active imports with dot steppers, 2 recent completions, and a "View all" link.

- [ ] **Step 1: Create ImportPopover component**

```tsx
// frontend/src/components/import/ImportPopover.tsx
import { Video } from 'lucide-react';
import { StageStepper, STAGES, resolveStatus } from './StageStepper';
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to ImportPopover

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/import/ImportPopover.tsx
git commit -m "feat: add ImportPopover component for TopBar hover preview"
```

---

### Task 9: Wire TopBar with Import Popover

**Files:**
- Modify: `frontend/src/components/layout/TopBar.tsx:7-23` (add props)
- Modify: `frontend/src/components/layout/TopBar.tsx:369-401` (wrap Import pill)

Add hover-sticky logic around the Import pill and render the popover.

- [ ] **Step 1: Add new imports and props to TopBar**

At the top of `TopBar.tsx`, add the import:

```tsx
import { ImportPopover } from '../import/ImportPopover';
```

Add to `TopBarProps` interface (after `onViewModeChange`):

```tsx
  inProgress: import('../../types/asset').Asset[];
  recentCompleted: import('../../types/asset').Asset[];
```

Add to the destructured props:

```tsx
  inProgress,
  recentCompleted,
```

- [ ] **Step 2: Add hover state**

After the existing `const [expanded, setExpanded] = ...` line (line ~42), add:

```tsx
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleImportMouseEnter = () => {
    if (popoverTimeout.current) clearTimeout(popoverTimeout.current);
    setPopoverOpen(true);
  };

  const handleImportMouseLeave = () => {
    popoverTimeout.current = setTimeout(() => setPopoverOpen(false), 150);
  };
```

- [ ] **Step 3: Wrap the Import pill button with popover**

Replace the Import pill button (the `<button onClick={() => onNavigate('import')} ...>` block at lines 369-401) with:

```tsx
          <div
            className="relative"
            onMouseEnter={handleImportMouseEnter}
            onMouseLeave={handleImportMouseLeave}
          >
            <button
              onClick={() => onNavigate('import')}
              className={`${pillBase} ${activeView === 'import' ? pillActive : pillInactive} ${
                isIngesting && activeView !== 'import'
                  ? '!border-cta/20 !bg-cta/8 !text-cta'
                  : ''
              }`}
            >
              <Upload size={11} />
              Import
              {isIngesting && (
                <span
                  className="w-[6px] h-[6px] rounded-full bg-cta ml-[2px]"
                  style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
                  aria-label="Import in progress"
                />
              )}
              {!isIngesting && (completedSinceLastVisit ?? 0) > 0 && (
                <span
                  style={{
                    padding: '1px 5px',
                    background: '#E11D48',
                    borderRadius: 99,
                    fontSize: 8,
                    color: 'white',
                    fontWeight: 600,
                    lineHeight: 1.4,
                  }}
                >
                  {completedSinceLastVisit}
                </span>
              )}
            </button>
            {popoverOpen && (
              <ImportPopover
                inProgress={inProgress}
                recentCompleted={recentCompleted}
                onNavigateToImport={() => {
                  setPopoverOpen(false);
                  onNavigate('import');
                }}
              />
            )}
          </div>
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: Errors about missing props in App.tsx (expected, fixed in next task)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/TopBar.tsx
git commit -m "feat: add hover-sticky import popover to TopBar"
```

---

### Task 10: Wire App.tsx — Swap ImportView for ImportQueueView

**Files:**
- Modify: `frontend/src/App.tsx:8` (import change)
- Modify: `frontend/src/App.tsx:112-113` (use new hook)
- Modify: `frontend/src/App.tsx:138-156` (pass new props to TopBar)
- Modify: `frontend/src/App.tsx:205-209` (swap component)

- [ ] **Step 1: Update imports**

Replace:
```tsx
import { ImportView } from './components/ImportView';
```

With:
```tsx
import { ImportQueueView } from './components/import/ImportQueueView';
```

Add:
```tsx
import { useIngestingAssets } from './hooks/useIngestingAssets';
```

- [ ] **Step 2: Replace useAssets with useIngestingAssets**

Replace:
```tsx
  const { data: allAssets } = useAssets();
  const isIngesting = allAssets?.some(a => a.status === 'ingesting') ?? false;
```

With:
```tsx
  const { inProgress, recentCompleted } = useIngestingAssets(handleImportComplete);
  const isIngesting = inProgress.length > 0;
```

Note: `handleImportComplete` must be declared before this line. Move the `handleImportComplete` callback and `completedSinceLastVisit` state above this line if needed. The hook will call `onImportComplete` whenever an asset transitions from ingesting to ready/error.

- [ ] **Step 3: Pass new props to TopBar**

In the `<TopBar>` JSX, add after the `onViewModeChange` prop:

```tsx
      inProgress={inProgress}
      recentCompleted={recentCompleted}
```

- [ ] **Step 4: Swap ImportView for ImportQueueView**

Replace:
```tsx
              {view === 'import' && (
                <ImportView
                  onViewAsset={handleViewAssetFromToast}
                  onImportComplete={handleImportComplete}
                />
              )}
```

With:
```tsx
              {view === 'import' && (
                <ImportQueueView
                  onViewAsset={handleViewAssetFromToast}
                  onImportComplete={handleImportComplete}
                />
              )}
```

- [ ] **Step 5: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Run dev server and smoke test**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire ImportQueueView and popover into app shell"
```

---

### Task 11: Add ESC key to close popover

**Files:**
- Modify: `frontend/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Add ESC handler for popover**

Inside the TopBar component, add a `useEffect` after the popover state declarations:

```tsx
  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopoverOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [popoverOpen]);
```

- [ ] **Step 2: Add role="tooltip" to popover container**

In `ImportPopover.tsx`, add `role="tooltip"` to the outer `<div>`:

Change:
```tsx
    <div
      className="absolute top-full right-0 mt-[4px] z-50"
      style={{ minWidth: 300 }}
    >
```

To:
```tsx
    <div
      className="absolute top-full right-0 mt-[4px] z-50"
      style={{ minWidth: 300 }}
      role="tooltip"
    >
```

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

```bash
git add frontend/src/components/layout/TopBar.tsx frontend/src/components/import/ImportPopover.tsx
git commit -m "feat: add ESC key dismiss and aria role to import popover"
```

---

### Task 12: Final build verification

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 2: Visual check list**

Verify in the browser:
- Import tab shows large drop zone when no recent imports exist
- Import tab shows compact button + queue + history when there are recent imports
- Hovering the Import pill in TopBar shows the popover
- Moving mouse into the popover keeps it open
- Moving mouse away closes it after ~150ms
- ESC closes the popover
- Clicking "View all imports" navigates to the Import tab
- Clicking a completed card navigates to the asset in the library
- In-progress cards show segmented progress with stage labels
- Completed cards show colored dot steppers

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: polish import pipeline visibility UI"
```
