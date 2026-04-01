import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetRecord {
  id: string;
  status: 'ingesting' | 'ready' | 'error';
  metadataStatus: string;
  thumbnailStatus: string;
  transcriptionStatus: string;
  searchIndexStatus: string;
}

type ViewState =
  | { phase: 'idle' }
  | { phase: 'uploading' }
  | { phase: 'polling'; assetId: string }
  | { phase: 'success' }
  | { phase: 'error'; message: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveStageLabel(asset: AssetRecord): string {
  if (asset.metadataStatus === 'processing') return 'Extracting metadata…';
  if (asset.metadataStatus !== 'complete') return 'Analysing file…';
  if (asset.thumbnailStatus === 'processing') return 'Generating thumbnail…';
  if (asset.thumbnailStatus !== 'complete') return 'Generating thumbnail…';
  if (asset.transcriptionStatus === 'processing') return 'Transcribing audio…';
  if (
    asset.transcriptionStatus !== 'complete' &&
    asset.transcriptionStatus !== 'failed' &&
    asset.transcriptionStatus !== 'skipped'
  )
    return 'Transcribing audio…';
  if (asset.searchIndexStatus === 'processing') return 'Indexing…';
  return 'Finishing up…';
}

function deriveProgress(asset: AssetRecord): number {
  let p = 10;
  if (asset.metadataStatus === 'complete') p = 35;
  if (asset.thumbnailStatus === 'complete') p = 60;
  if (
    asset.transcriptionStatus === 'complete' ||
    asset.transcriptionStatus === 'failed' ||
    asset.transcriptionStatus === 'skipped'
  )
    p = 85;
  if (
    asset.searchIndexStatus === 'complete' ||
    asset.searchIndexStatus === 'failed' ||
    asset.searchIndexStatus === 'skipped'
  )
    p = 95;
  if (asset.status === 'ready') p = 100;
  return p;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full h-2 bg-glass glass-blur rounded-full overflow-hidden border border-glass-border">
      <div
        className="h-full bg-cta rounded-full transition-all duration-700 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

// ─── Polling hook ─────────────────────────────────────────────────────────────

function useAssetPolling(assetId: string | null, enabled: boolean) {
  return useQuery<AssetRecord>({
    queryKey: ['asset', assetId],
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

export function ImportView() {
  const [view, setView] = useState<ViewState>({ phase: 'idle' });
  const [isDragOver, setIsDragOver] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pollingAssetId = view.phase === 'polling' ? view.assetId : null;
  const { data: asset, error: pollError } = useAssetPolling(
    pollingAssetId,
    view.phase === 'polling',
  );

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
      setView({ phase: 'success' });
      setTimeout(() => setView({ phase: 'idle' }), 2500);
    } else if (asset.status === 'error') {
      stopElapsed();
      setView({ phase: 'error', message: 'Processing failed. Please try importing again.' });
    }
  }, [asset, pollError, view.phase]);

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

  // Cleanup interval on unmount
  useEffect(() => () => stopElapsed(), []);

  // ── Upload ──────────────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File) => {
    setView({ phase: 'uploading' });
    startElapsed();

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/assets', { method: 'POST', body: formData });
      const json = await res.json() as { id?: string; existingId?: string; error?: string };

      if (res.status === 202) {
        setView({ phase: 'polling', assetId: json.id! });
      } else if (res.status === 409) {
        stopElapsed();
        setView({
          phase: 'error',
          message: `Already imported (asset ID: ${json.existingId})`,
        });
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
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.relatedTarget === null) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile],
  );

  // ── File picker ─────────────────────────────────────────────────────────────
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
      e.target.value = '';
    },
    [uploadFile],
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  const progress = asset && view.phase === 'polling' ? deriveProgress(asset) : 0;
  const stageLabel = asset && view.phase === 'polling' ? deriveStageLabel(asset) : 'Uploading…';

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
            isDragOver
              ? 'border-cta glow-cta'
              : 'border-glass-border',
          ].join(' ')}
          style={{ minWidth: 420 }}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          aria-label="Drop video file or click to browse"
        >
          <svg
            className={`w-16 h-16 ${isDragOver ? 'text-cta' : 'text-text-muted'} transition-colors`}
            fill="none"
            viewBox="0 0 48 48"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 36H8a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4h-4M24 12v24M16 20l8-8 8 8"
            />
          </svg>
          <div className="text-center">
            <p className="text-text font-sans text-lg font-semibold">
              {isDragOver ? 'Release to import' : 'Drop video here'}
            </p>
            <p className="text-text-muted font-sans text-sm mt-xs">or click to browse</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* ── Uploading / Polling: progress view ── */}
      {(view.phase === 'uploading' || view.phase === 'polling') && (
        <div
          className="flex flex-col gap-lg p-3xl rounded-xl border border-glass-border bg-glass glass-blur"
          style={{ minWidth: 420 }}
        >
          <div className="flex items-center justify-between">
            <span className="font-sans text-sm text-text-muted">
              {view.phase === 'uploading' ? 'Uploading…' : stageLabel}
            </span>
            <span className="font-mono text-sm text-text-muted tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          </div>
          <ProgressBar progress={view.phase === 'uploading' ? 5 : progress} />
        </div>
      )}

      {/* ── Success ── */}
      {view.phase === 'success' && (
        <div
          className="flex flex-col items-center gap-md p-3xl rounded-xl border border-status-complete/40 bg-glass glass-blur"
          style={{ minWidth: 420 }}
        >
          <div className="w-12 h-12 rounded-full bg-glass glass-blur border border-glass-border flex items-center justify-center">
            <svg
              className="w-6 h-6 text-status-complete"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-sans text-text font-semibold">Ready</p>
          <ProgressBar progress={100} />
        </div>
      )}

      {/* ── Error ── */}
      {view.phase === 'error' && (
        <div
          className="flex flex-col items-center gap-md p-3xl rounded-xl border border-status-failed/40 bg-glass glass-blur"
          style={{ minWidth: 420 }}
        >
          <div className="w-12 h-12 rounded-full bg-glass glass-blur border border-glass-border flex items-center justify-center">
            <svg
              className="w-6 h-6 text-status-failed"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
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
