import { useRef, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAsset } from '../../hooks/useAssets';
import { VideoPlayer } from './VideoPlayer';
import { MetadataSection } from './MetadataSection';
import { CustomFieldsSection } from './CustomFieldsSection';
import { TranscriptList } from './TranscriptList';
import { cn } from '../../lib/cn';
import type { TranscriptSegment } from '../../types/asset';

interface DetailPanelProps {
  assetId: string;
  onClose: () => void;
  initialTab?: 'info' | 'transcript';
  seekTimestamp?: number;
  onOpened?: () => void;
}

export function DetailPanel({ assetId, onClose, initialTab, seekTimestamp, onOpened }: DetailPanelProps) {
  const { data: asset, isLoading, error } = useAsset(assetId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'transcript'>('info');

  // Transcript fetching (lifted from TranscriptList)
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  useEffect(() => {
    if (!asset || asset.transcriptionStatus !== 'ready') return;
    setTranscriptLoading(true);
    fetch(`/storage/${asset.id}/transcript.json`)
      .then(res => res.json())
      .then(data => {
        setSegments(Array.isArray(data) ? data : data.segments ?? []);
      })
      .catch(() => setSegments([]))
      .finally(() => setTranscriptLoading(false));
  }, [asset?.id, asset?.transcriptionStatus]);

  // Switch tab when initialTab changes (e.g., from timecode click)
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Seek video when seekTimestamp is provided
  useEffect(() => {
    if (seekTimestamp == null) return;
    // Use setTimeout to ensure tab switch and video mount have completed
    const timer = setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = seekTimestamp;
      }
      onOpened?.();
    }, 0);
    return () => clearTimeout(timer);
  }, [seekTimestamp, onOpened]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Tab keyboard navigation
  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    const tabs: Array<'info' | 'transcript'> = ['info', 'transcript'];
    const currentIdx = tabs.indexOf(activeTab);
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        setActiveTab(tabs[(currentIdx + 1) % tabs.length]);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setActiveTab(tabs[(currentIdx - 1 + tabs.length) % tabs.length]);
        break;
      case 'Home':
        e.preventDefault();
        setActiveTab(tabs[0]);
        break;
      case 'End':
        e.preventDefault();
        setActiveTab(tabs[tabs.length - 1]);
        break;
    }
  };

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
      {/* Header with close button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="font-semibold text-text text-sm truncate pr-4">
          {asset.title || asset.originalFilename}
        </h2>
        <button onClick={onClose} aria-label="Close detail panel" className="text-text-muted hover:text-cta cursor-pointer shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable content with video pinned at top */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Video player — always visible, shrink-0 */}
        <div className="p-4 shrink-0">
          <VideoPlayer asset={asset} videoRef={videoRef} />
        </div>

        {/* Tab bar */}
        <div role="tablist" className="flex border-b border-border px-4 shrink-0" onKeyDown={handleTabKeyDown}>
          <button
            role="tab"
            id="tab-info"
            aria-selected={activeTab === 'info'}
            aria-controls="tabpanel-info"
            tabIndex={activeTab === 'info' ? 0 : -1}
            onClick={() => setActiveTab('info')}
            className={cn(
              'px-4 py-2 text-sm cursor-pointer transition-colors border-b-2 -mb-px',
              activeTab === 'info'
                ? 'text-text font-semibold border-cta'
                : 'text-text-muted border-transparent hover:text-text'
            )}
          >
            Info
          </button>
          <button
            role="tab"
            id="tab-transcript"
            aria-selected={activeTab === 'transcript'}
            aria-controls="tabpanel-transcript"
            tabIndex={activeTab === 'transcript' ? 0 : -1}
            onClick={() => setActiveTab('transcript')}
            className={cn(
              'px-4 py-2 text-sm cursor-pointer transition-colors border-b-2 -mb-px',
              activeTab === 'transcript'
                ? 'text-text font-semibold border-cta'
                : 'text-text-muted border-transparent hover:text-text'
            )}
          >
            Transcript
          </button>
        </div>

        {/* Tab panels */}
        {activeTab === 'info' ? (
          <div role="tabpanel" id="tabpanel-info" aria-labelledby="tab-info" className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
            <MetadataSection asset={asset} />
            <CustomFieldsSection assetId={assetId} />
          </div>
        ) : (
          <div role="tabpanel" id="tabpanel-transcript" aria-labelledby="tab-transcript" className="flex-1 flex flex-col min-h-0">
            <TranscriptList
              asset={asset}
              videoRef={videoRef}
              segments={segments}
              loading={transcriptLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
}
