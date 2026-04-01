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
  if (raw === 'skipped') return 'complete';
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

  const completedCount = stageRows.filter(s => s.status === 'complete').length;
  const hasActive = stageRows.some(s => s.status === 'processing');
  const slimProgress = view.phase === 'uploading'
    ? 2
    : (completedCount * 25) + (hasActive ? 12 : 0);

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
