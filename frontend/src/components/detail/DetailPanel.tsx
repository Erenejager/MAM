import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAsset } from '../../hooks/useAssets';
import { VideoPlayer } from './VideoPlayer';
import { MetadataSection } from './MetadataSection';
import { TranscriptList } from './TranscriptList';
import { CustomFieldsSection } from './CustomFieldsSection';
import type { TranscriptSegment } from '../../types/asset';

interface DetailPanelProps {
  assetId: string;
  onClose: () => void;
  initialTab?: 'info' | 'transcript';
  seekTimestamp?: number;
  onOpened?: () => void;
}

export function DetailPanel({
  assetId,
  onClose,
  initialTab,
  seekTimestamp,
  onOpened,
}: DetailPanelProps) {
  const { data: asset } = useAsset(assetId);
  const [activeTab, setActiveTab] = useState<'info' | 'transcript'>(
    initialTab ?? 'info'
  );
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch transcript segments
  useEffect(() => {
    if (!asset || (asset.transcriptionStatus !== 'ready' && asset.transcriptionStatus !== 'complete')) return;
    setSegmentsLoading(true);
    fetch(`/storage/${asset.id}/transcript.json`)
      .then((r) => r.json())
      .then((data) => {
        const segs = data.segments ?? data;
        setSegments(Array.isArray(segs) ? segs : []);
      })
      .catch(() => setSegments([]))
      .finally(() => setSegmentsLoading(false));
  }, [asset?.id, asset?.transcriptionStatus]);

  // Switch tab when initialTab changes (e.g., from timecode click)
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Auto-seek on open
  useEffect(() => {
    if (seekTimestamp == null) return;
    const timer = setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = seekTimestamp;
      }
      onOpened?.();
    }, 0);
    return () => clearTimeout(timer);
  }, [seekTimestamp, onOpened]);

  // Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!asset) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-[24px] h-[24px] border-2 border-cta border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tabs = ['info', 'transcript'] as const;

  return (
    <div className="h-full flex flex-col bg-[rgba(12,12,20,0.92)] glass-blur-xl">
      {/* Back button header */}
      <div className="shrink-0 flex items-center gap-sm px-md py-xs border-b border-glass-border bg-[rgba(12,12,20,0.92)] glass-blur-xl">
        <button
          onClick={onClose}
          className="flex items-center gap-xs text-text-muted hover:text-text bg-glass border border-glass-border px-xs py-xs -ml-xs rounded-lg hover:bg-glass-hover transition-all duration-150"
          aria-label="Back to library"
        >
          <ArrowLeft size={14} />
          <span className="text-xs font-medium">Back</span>
        </button>
        <div className="w-px h-md bg-border" />
        <h2 className="text-xs font-semibold text-text truncate">
          {asset.title || asset.originalFilename}
        </h2>
      </div>

      {/* Main content: video left, details right */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Video player */}
        <div className="w-[60%] shrink-0 flex items-center justify-center bg-black overflow-hidden">
          <VideoPlayer asset={asset} ref={videoRef} />
        </div>

        {/* Right: Tabbed metadata/transcript */}
        <div className="w-[40%] flex flex-col min-h-0 overflow-hidden border-l border-glass-border">
          {/* Tab bar */}
          <div className="shrink-0 flex border-b border-glass-border relative">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-xs text-xs font-medium capitalize transition-colors duration-200 relative z-10 ${
                  activeTab === tab
                    ? 'text-cta'
                    : 'text-text-dim hover:text-text hover:bg-glass-hover'
                }`}
                role="tab"
                aria-selected={activeTab === tab}
              >
                {tab}
              </button>
            ))}
            {/* Animated underline indicator */}
            <div
              className="absolute bottom-0 h-0.5 bg-cta transition-all duration-300 ease-out"
              style={{
                width: `${100 / tabs.length}%`,
                left: `${(tabs.indexOf(activeTab) * 100) / tabs.length}%`,
              }}
            />
          </div>

          {/* Tab content */}
          {activeTab === 'info' && (
            <div className="flex-1 overflow-y-auto p-sm">
              <div className="flex flex-col gap-sm">
                <MetadataSection asset={asset} />
                <CustomFieldsSection assetId={asset.id} />
              </div>
            </div>
          )}
          {activeTab === 'transcript' && (
            <div className="flex-1 flex flex-col min-h-0">
              <TranscriptList
                asset={asset}
                videoRef={videoRef}
                segments={segments}
                loading={segmentsLoading}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
