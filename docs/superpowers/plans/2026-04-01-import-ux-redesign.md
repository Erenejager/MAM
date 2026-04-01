# Import UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the import experience with a stage checklist, time estimates, toast completion, and a dynamic import pill badge.

**Architecture:** New `useImportEstimate` hook handles time estimation via localStorage rolling averages. New `ImportStageChecklist` component renders the four pipeline stages with completed/active/pending/failed states. `ImportView` is rewritten to use the checklist + slim bar instead of a single progress bar, and fires a Sonner toast on completion instead of showing a success screen. `App.tsx` tracks `completedSinceLastVisit` counter and `isIngesting` flag, passing them to `TopBar` which renders the dynamic badge/pulse.

**Tech Stack:** React 18, TanStack Query, Sonner (toast), Tailwind 3, localStorage

**Design spec:** `docs/superpowers/specs/2026-04-01-import-ux-redesign.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/hooks/useImportEstimate.ts` | Time estimation: read/write localStorage averages, compute remaining time, record stage durations |
| Create | `frontend/src/components/import/ImportStageChecklist.tsx` | Render 4 stage rows (completed/active/pending/failed) with durations |
| Create | `frontend/src/components/import/ImportCompletionToast.tsx` | Custom Sonner toast with thumbnail, title, duration, "View asset" link |
| Modify | `frontend/src/components/ImportView.tsx` | Replace progress bar with checklist + slim bar; use estimate hook; fire toast on completion; reset immediately |
| Modify | `frontend/src/components/layout/TopBar.tsx` | Dynamic badge (completedSinceLastVisit) + CTA pulse when ingesting |
| Modify | `frontend/src/App.tsx` | Track completedSinceLastVisit counter; derive isIngesting; pass to TopBar; reset on import view visit |

---

## Task 1: useImportEstimate Hook

**Files:**
- Create: `frontend/src/hooks/useImportEstimate.ts`

- [ ] **Step 1: Create the hook**

```ts
// frontend/src/hooks/useImportEstimate.ts
import { useRef, useCallback } from 'react';

interface StageAverage {
  avgMsPerMb: number;
  samples: number;
}

interface EstimateData {
  metadata: StageAverage;
  thumbnail: StageAverage;
  transcription: StageAverage;
  indexing: StageAverage;
}

const STORAGE_KEY = 'mam-import-estimates';
const STAGES = ['metadata', 'thumbnail', 'transcription', 'indexing'] as const;
type StageName = (typeof STAGES)[number];

function loadEstimates(): EstimateData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveEstimates(data: EstimateData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function useImportEstimate(fileSizeMb: number) {
  const stageStartTimes = useRef<Partial<Record<StageName, number>>>({});
  const stageDurations = useRef<Partial<Record<StageName, number>>>({});

  const markStageStart = useCallback((stage: StageName) => {
    stageStartTimes.current[stage] = Date.now();
  }, []);

  const markStageEnd = useCallback((stage: StageName) => {
    const start = stageStartTimes.current[stage];
    if (!start) return;
    const durationMs = Date.now() - start;
    stageDurations.current[stage] = durationMs;

    // Update rolling average
    const estimates = loadEstimates() ?? {
      metadata: { avgMsPerMb: 0, samples: 0 },
      thumbnail: { avgMsPerMb: 0, samples: 0 },
      transcription: { avgMsPerMb: 0, samples: 0 },
      indexing: { avgMsPerMb: 0, samples: 0 },
    };
    const entry = estimates[stage];
    const msPerMb = fileSizeMb > 0 ? durationMs / fileSizeMb : 0;
    entry.avgMsPerMb = ((entry.avgMsPerMb * entry.samples) + msPerMb) / (entry.samples + 1);
    entry.samples += 1;
    saveEstimates(estimates);
  }, [fileSizeMb]);

  const getStageDuration = useCallback((stage: StageName): number | null => {
    return stageDurations.current[stage] ?? null;
  }, []);

  const getEstimate = useCallback((completedStages: StageName[]): string => {
    const estimates = loadEstimates();
    if (!estimates) return 'Estimating...';

    const hasData = STAGES.some(s => estimates[s].samples > 0);
    if (!hasData) return 'Estimating...';

    const remaining = STAGES.filter(s => !completedStages.includes(s));
    if (remaining.length === 0) return 'Almost done...';

    // If the last stage is running, show "Almost done..."
    if (remaining.length === 1 && remaining[0] === 'indexing') return 'Almost done...';

    let remainingMs = 0;
    for (const stage of remaining) {
      const entry = estimates[stage];
      if (entry.samples > 0) {
        remainingMs += entry.avgMsPerMb * fileSizeMb;
      } else {
        // No data for this stage — use average of known stages as fallback
        const known = STAGES.filter(s => estimates[s].samples > 0);
        if (known.length > 0) {
          const avgAll = known.reduce((sum, s) => sum + estimates[s].avgMsPerMb, 0) / known.length;
          remainingMs += avgAll * fileSizeMb;
        }
      }
    }

    const remainingSec = Math.round(remainingMs / 1000);
    if (remainingSec < 10) return '< 10s remaining';
    if (remainingSec < 60) return `~${Math.round(remainingSec / 5) * 5}s remaining`;
    const mins = Math.round(remainingSec / 60);
    return `~${mins} min remaining`;
  }, [fileSizeMb]);

  const reset = useCallback(() => {
    stageStartTimes.current = {};
    stageDurations.current = {};
  }, []);

  return { markStageStart, markStageEnd, getStageDuration, getEstimate, reset };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useImportEstimate.ts
git commit -m "feat: useImportEstimate hook — time estimation with localStorage rolling averages"
```

---

## Task 2: ImportStageChecklist Component

**Files:**
- Create: `frontend/src/components/import/ImportStageChecklist.tsx`

- [ ] **Step 1: Create the directory and component**

```bash
mkdir -p frontend/src/components/import
```

```tsx
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
    containerClass += '';
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/import/ImportStageChecklist.tsx
git commit -m "feat: ImportStageChecklist component — completed/active/pending/failed stage rows"
```

---

## Task 3: ImportCompletionToast Component

**Files:**
- Create: `frontend/src/components/import/ImportCompletionToast.tsx`

- [ ] **Step 1: Create the toast component**

```tsx
// frontend/src/components/import/ImportCompletionToast.tsx
import { toast } from 'sonner';

interface CompletionToastData {
  assetId: string;
  title: string;
  thumbnailPath: string | null;
  durationSeconds: number | null;
  fileSize: number | null;
  transcriptionFailed: boolean;
  onView: (assetId: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function CompletionToastContent({ data, toastId }: { data: CompletionToastData; toastId: string | number }) {
  const duration = formatDuration(data.durationSeconds);
  const size = formatSize(data.fileSize);
  const parts = ['Import complete', duration, size].filter(Boolean);
  const subtitle = data.transcriptionFailed
    ? 'Import complete \u00B7 transcription failed'
    : parts.join(' \u00B7 ');

  return (
    <div className="flex gap-[12px] items-start">
      {/* Thumbnail */}
      <div
        className="w-[48px] h-[48px] rounded-[6px] bg-[rgba(255,255,255,0.05)] shrink-0 overflow-hidden flex items-center justify-center"
      >
        {data.thumbnailPath ? (
          <img
            src={`/storage/${data.thumbnailPath}`}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <svg className="w-5 h-5 text-[#52525b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
          </svg>
        )}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-[#e4e4e7] font-semibold truncate">
          {data.title}
        </div>
        <div className={`text-[10px] mt-[2px] ${data.transcriptionFailed ? 'text-[#F59E0B]' : 'text-[#71717a]'}`}>
          {subtitle}
        </div>
        <button
          className="text-[10px] text-cta underline mt-[6px] cursor-pointer bg-transparent border-none p-0"
          onClick={() => {
            data.onView(data.assetId);
            toast.dismiss(toastId);
          }}
        >
          View asset
        </button>
      </div>
    </div>
  );
}

export function showCompletionToast(data: CompletionToastData) {
  toast.custom(
    (id) => <CompletionToastContent data={data} toastId={id} />,
    {
      duration: 8000,
      style: {
        background: 'rgba(15,15,30,0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      },
    }
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/import/ImportCompletionToast.tsx
git commit -m "feat: ImportCompletionToast — rich toast with thumbnail, title, and View link"
```

---

## Task 4: Rewrite ImportView with Checklist + Estimates

**Files:**
- Modify: `frontend/src/components/ImportView.tsx`

This is the largest task. Replace the single progress bar with the stage checklist + slim bar, integrate the estimate hook, and fire the completion toast instead of showing a success screen.

- [ ] **Step 1: Rewrite ImportView.tsx**

Replace the entire content of `frontend/src/components/ImportView.tsx` with:

```tsx
// frontend/src/components/ImportView.tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImportStageChecklist } from './import/ImportStageChecklist';
import { showCompletionToast } from './import/ImportCompletionToast';
import { useImportEstimate } from '../hooks/useImportEstimate';
import type { StageRow, StageStatus } from './import/ImportStageChecklist';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetRecord {
  id: string;
  status: 'ingesting' | 'ready' | 'error';
  title: string | null;
  originalFilename: string;
  thumbnailPath: string | null;
  durationSeconds: number | null;
  fileSize: number | null;
  metadataStatus: string;
  thumbnailStatus: string;
  transcriptionStatus: string;
  searchIndexStatus: string;
}

type ViewState =
  | { phase: 'idle' }
  | { phase: 'uploading'; fileSizeMb: number }
  | { phase: 'polling'; assetId: string; fileSizeMb: number }
  | { phase: 'error'; message: string };

type StageName = 'metadata' | 'thumbnail' | 'transcription' | 'indexing';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getStageStatus(raw: string): StageStatus {
  if (raw === 'processing') return 'processing';
  if (raw === 'complete') return 'complete';
  if (raw === 'failed') return 'failed';
  if (raw === 'skipped') return 'complete'; // treat skipped as done
  return 'pending';
}

const STAGE_DEFS: Array<{ name: StageName; field: keyof AssetRecord; activeLabel: string; completeLabel: string }> = [
  { name: 'metadata', field: 'metadataStatus', activeLabel: 'Extracting metadata...', completeLabel: 'Metadata extracted' },
  { name: 'thumbnail', field: 'thumbnailStatus', activeLabel: 'Generating thumbnail...', completeLabel: 'Thumbnail generated' },
  { name: 'transcription', field: 'transcriptionStatus', activeLabel: 'Transcribing audio...', completeLabel: 'Audio transcribed' },
  { name: 'indexing', field: 'searchIndexStatus', activeLabel: 'Indexing for search...', completeLabel: 'Search indexed' },
];

// ─── Polling hook ─────────────────────────────────────────────────────────────

function useAssetPolling(assetId: string | null, enabled: boolean) {
  return useQuery<AssetRecord>({
    queryKey: ['asset-import', assetId],
    queryFn: async () => {
      const res = await fetch(`/api/assets/${assetId}`);
      if (res.status === 404) throw new Error('Asset not found — pipeline may have failed');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<AssetRecord>;
    },
    enabled: enabled && assetId !== null,
    refetchInterval: (query) => {
      const data = query.state.data as AssetRecord | undefined;
      if (!data) return 2500;
      if (data.status === 'ready' || data.status === 'error') return false;
      return 2500;
    },
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ImportViewProps {
  onViewAsset?: (assetId: string) => void;
  onImportComplete?: () => void;
}

export function ImportView({ onViewAsset, onImportComplete }: ImportViewProps) {
  const [view, setView] = useState<ViewState>({ phase: 'idle' });
  const [isDragOver, setIsDragOver] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevStatusRef = useRef<Record<StageName, string>>({
    metadata: 'pending', thumbnail: 'pending', transcription: 'pending', indexing: 'pending',
  });
  const queryClient = useQueryClient();

  const fileSizeMb = (view.phase === 'uploading' || view.phase === 'polling')
    ? view.fileSizeMb : 0;

  const estimate = useImportEstimate(fileSizeMb);

  const pollingAssetId = view.phase === 'polling' ? view.assetId : null;
  const { data: asset, error: pollError } = useAssetPolling(
    pollingAssetId,
    view.phase === 'polling',
  );

  // Track stage transitions for timing
  useEffect(() => {
    if (!asset || view.phase !== 'polling') return;

    for (const def of STAGE_DEFS) {
      const curr = asset[def.field] as string;
      const prev = prevStatusRef.current[def.name];

      if (prev !== 'processing' && curr === 'processing') {
        estimate.markStageStart(def.name);
      }
      if (prev === 'processing' && (curr === 'complete' || curr === 'failed' || curr === 'skipped')) {
        estimate.markStageEnd(def.name);
      }

      prevStatusRef.current[def.name] = curr;
    }
  }, [asset, view.phase, estimate]);

  // React to polling results
  useEffect(() => {
    if (view.phase !== 'polling') return;
    if (pollError) {
      stopElapsed();
      setView({ phase: 'error', message: (pollError as Error).message });
      return;
    }
    if (!asset) return;
    if (asset.status === 'ready') {
      stopElapsed();
      const transcriptionFailed = asset.transcriptionStatus === 'failed';
      showCompletionToast({
        assetId: asset.id,
        title: asset.title || asset.originalFilename,
        thumbnailPath: asset.thumbnailPath,
        durationSeconds: asset.durationSeconds,
        fileSize: asset.fileSize,
        transcriptionFailed,
        onView: (id) => onViewAsset?.(id),
      });
      onImportComplete?.();
      estimate.reset();
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      setView({ phase: 'idle' });
    } else if (asset.status === 'error') {
      stopElapsed();
      setView({ phase: 'error', message: 'Processing failed. Please try importing again.' });
    }
  }, [asset, pollError, view.phase, onViewAsset, onImportComplete, estimate, queryClient]);

  function startElapsed() {
    setElapsed(0);
    elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
  }

  function stopElapsed() {
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  }

  useEffect(() => () => stopElapsed(), []);

  // ── Upload ──────────────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File) => {
    const sizeMb = file.size / (1024 * 1024);
    setView({ phase: 'uploading', fileSizeMb: sizeMb });
    startElapsed();
    prevStatusRef.current = {
      metadata: 'pending', thumbnail: 'pending', transcription: 'pending', indexing: 'pending',
    };

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/assets', { method: 'POST', body: formData });
      const json = await res.json() as { id?: string; existingId?: string; error?: string };

      if (res.status === 202) {
        setView({ phase: 'polling', assetId: json.id!, fileSizeMb: sizeMb });
      } else if (res.status === 409) {
        stopElapsed();
        setView({ phase: 'error', message: `Already imported (asset ID: ${json.existingId})` });
      } else {
        stopElapsed();
        setView({ phase: 'error', message: json.error ?? 'Upload failed' });
      }
    } catch {
      stopElapsed();
      setView({ phase: 'error', message: 'Network error — is the server running?' });
    }
  }, []);

  // ── Drag-and-drop ───────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { if (e.relatedTarget === null) setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  }, [uploadFile]);

  // ── Build stage rows ────────────────────────────────────────────────────────
  const stageRows: StageRow[] = STAGE_DEFS.map((def) => ({
    name: def.name,
    activeLabel: def.activeLabel,
    completeLabel: def.completeLabel,
    status: asset ? getStageStatus(asset[def.field] as string) : 'pending',
    durationMs: estimate.getStageDuration(def.name),
  }));

  // Overall progress: 25% per completed stage, +12% for active stage
  const completedCount = stageRows.filter(s => s.status === 'complete').length;
  const hasActive = stageRows.some(s => s.status === 'processing');
  const slimProgress = view.phase === 'uploading'
    ? 2
    : (completedCount * 25) + (hasActive ? 12 : 0);

  // Completed stage names for estimate
  const completedStages = STAGE_DEFS
    .filter(def => asset && (asset[def.field] === 'complete' || asset[def.field] === 'skipped' || asset[def.field] === 'failed'))
    .map(def => def.name);

  const estimateText = (view.phase === 'polling' || view.phase === 'uploading')
    ? estimate.getEstimate(completedStages)
    : '';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="h-full bg-background flex items-center justify-center"
      onDragOver={view.phase === 'idle' ? handleDragOver : undefined}
      onDragLeave={view.phase === 'idle' ? handleDragLeave : undefined}
      onDrop={view.phase === 'idle' ? handleDrop : undefined}
    >
      {/* ── Idle: drop zone ── */}
      {view.phase === 'idle' && (
        <div
          className={[
            'flex flex-col items-center gap-lg p-3xl rounded-xl border border-dashed transition-colors duration-200 cursor-pointer bg-glass glass-blur',
            isDragOver ? 'border-cta glow-cta' : 'border-glass-border',
          ].join(' ')}
          style={{ minWidth: 420 }}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          aria-label="Drop video file or click to browse"
        >
          <svg
            className={`w-16 h-16 ${isDragOver ? 'text-cta' : 'text-text-muted'} transition-colors`}
            fill="none" viewBox="0 0 48 48" stroke="currentColor" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 36H8a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4h-4M24 12v24M16 20l8-8 8 8" />
          </svg>
          <div className="text-center">
            <p className="text-text font-sans text-lg font-semibold">{isDragOver ? 'Release to import' : 'Drop video here'}</p>
            <p className="text-text-muted font-sans text-sm mt-xs">or click to browse</p>
          </div>
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {/* ── Uploading / Polling: checklist progress ── */}
      {(view.phase === 'uploading' || view.phase === 'polling') && (
        <div
          className="flex flex-col gap-md p-3xl rounded-xl border border-glass-border bg-glass glass-blur"
          style={{ minWidth: 420, maxWidth: 480 }}
        >
          {/* Slim progress bar */}
          <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${slimProgress}%`,
                background: '#E11D48',
                boxShadow: '0 0 6px rgba(225,29,72,0.3)',
              }}
            />
          </div>

          {/* Timer + estimate */}
          <div className="flex justify-between items-center">
            <span className="font-mono text-[11px] text-[#e4e4e7] tabular-nums">
              {formatElapsed(elapsed)} elapsed
            </span>
            <span className="font-mono text-[11px] text-[#71717a]">
              {estimateText}
            </span>
          </div>

          {/* Stage checklist */}
          <ImportStageChecklist stages={stageRows} />
        </div>
      )}

      {/* ── Error ── */}
      {view.phase === 'error' && (
        <div
          className="flex flex-col items-center gap-md p-3xl rounded-xl border border-status-failed/40 bg-glass glass-blur"
          style={{ minWidth: 420 }}
        >
          <div className="w-12 h-12 rounded-full bg-glass glass-blur border border-glass-border flex items-center justify-center">
            <svg className="w-6 h-6 text-status-failed" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="font-sans text-text font-semibold">Import failed</p>
          <p className="font-sans text-text-muted text-sm text-center">{view.message}</p>
          <button
            className="mt-sm px-xl py-sm bg-cta hover:bg-cta-hover text-text font-sans text-sm font-semibold rounded transition-colors"
            onClick={() => setView({ phase: 'idle' })}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ImportView.tsx
git commit -m "feat: rewrite ImportView — stage checklist, slim bar, time estimates, toast completion"
```

---

## Task 5: Dynamic Import Badge + Pulse in TopBar and App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/TopBar.tsx`

Wire up the `completedSinceLastVisit` counter and `isIngesting` flag.

- [ ] **Step 1: Update App.tsx**

Add state tracking and pass new props to TopBar and ImportView.

In `frontend/src/App.tsx`, make these changes:

**A. Add a `completedSinceLastVisit` state and `isIngesting` derived value.** After the existing `const [isUploading, setIsUploading] = useState(false);` (line 59), add:

```tsx
const [completedSinceLastVisit, setCompletedSinceLastVisit] = useState(0);
const { data: allAssets } = useAssets();
const isIngesting = allAssets?.some(a => a.status === 'ingesting') ?? false;
```

Also add the `useAssets` import — it should already be importable from `'./hooks/useAssets'`. Check if it's already imported; if not, add:

```tsx
import { useAssets } from './hooks/useAssets';
```

**B. Add `handleImportComplete` callback** (after `handleNavigate`):

```tsx
const handleImportComplete = useCallback(() => {
  if (view !== 'import') {
    setCompletedSinceLastVisit(c => c + 1);
  }
}, [view]);
```

**C. Reset counter when navigating to import.** Update `handleNavigate`:

```tsx
const handleNavigate = useCallback(
  (target: 'library' | 'settings' | 'import') => {
    setView(target);
    if (target === 'import') setCompletedSinceLastVisit(0);
    if (target !== 'library') setSelectedAssetId(null);
  },
  []
);
```

**D. Add `handleViewAssetFromToast` callback** (after handleImportComplete):

```tsx
const handleViewAssetFromToast = useCallback((assetId: string) => {
  setSelectedAssetId(assetId);
  setView('library');
}, []);
```

**E. Pass new props to TopBar:**

```tsx
<TopBar
  // ... existing props ...
  isIngesting={isIngesting}
  completedSinceLastVisit={completedSinceLastVisit}
/>
```

**F. Pass new props to ImportView:**

```tsx
{view === 'import' && (
  <ImportView
    onViewAsset={handleViewAssetFromToast}
    onImportComplete={handleImportComplete}
  />
)}
```

- [ ] **Step 2: Update TopBar.tsx**

**A. Add new props to the interface:**

```tsx
interface TopBarProps {
  // ... existing props ...
  isIngesting?: boolean;
  completedSinceLastVisit?: number;
}
```

Add them to the destructured props as well.

**B. Replace the Import pill button** (the one with `<Upload size={11} /> Import`). Replace with:

```tsx
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
  {/* Pulsing dot when ingesting */}
  {isIngesting && (
    <span
      className="w-[6px] h-[6px] rounded-full bg-cta ml-[2px]"
      style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
      aria-label="Import in progress"
    />
  )}
  {/* Badge for completed imports */}
  {!isIngesting && completedSinceLastVisit > 0 && (
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
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/layout/TopBar.tsx
git commit -m "feat: dynamic import badge (completed count) + CTA pulse when ingesting"
```

---

## Summary

| Task | What it does | Files |
|------|-------------|-------|
| 1 | useImportEstimate hook — time estimation with localStorage rolling averages | New: `useImportEstimate.ts` |
| 2 | ImportStageChecklist — 4 stage rows with completed/active/pending/failed states | New: `ImportStageChecklist.tsx` |
| 3 | ImportCompletionToast — rich Sonner toast with thumbnail + View link | New: `ImportCompletionToast.tsx` |
| 4 | Rewrite ImportView — checklist + slim bar + estimates + toast on completion | Modify: `ImportView.tsx` |
| 5 | Dynamic badge + pulse in TopBar + App state tracking | Modify: `App.tsx`, `TopBar.tsx` |
