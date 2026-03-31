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
    <div className="h-full flex flex-col bg-background">
      {/* Back button header */}
      <div className="shrink-0 flex items-center gap-2 px-6 py-3 border-b border-border">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-text-muted hover:text-text transition-colors"
          aria-label="Back to library"
        >
          <ArrowLeft size={18} />
          <span className="text-sm">Back</span>
        </button>
        <h2 className="text-sm font-semibold text-text truncate ml-4">
          {asset.title || asset.originalFilename}
        </h2>
      </div>

      {/* Main content: video left, details right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Video player */}
        <div className="w-[60%] shrink-0 flex flex-col bg-black">
          <div className="flex-1 flex items-center justify-center">
            <VideoPlayer asset={asset} ref={videoRef} />
          </div>
        </div>

        {/* Right: Tabbed metadata/transcript */}
        <div className="w-[40%] flex flex-col border-l border-border">
          {/* Tab bar */}
          <div className="shrink-0 flex border-b border-border">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? 'text-cta border-b-2 border-cta'
                    : 'text-text-muted hover:text-text'
                }`}
                role="tab"
                aria-selected={activeTab === tab}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'info' && (
              <>
                <MetadataSection asset={asset} />
                <CustomFieldsSection assetId={asset.id} />
              </>
            )}
            {activeTab === 'transcript' && (
              <TranscriptList
                asset={asset}
                videoRef={videoRef}
                segments={segments}
                loading={segmentsLoading}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
