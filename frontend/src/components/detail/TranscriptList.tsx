import { useState, useEffect, useRef } from 'react';
import type { Asset, TranscriptSegment } from '../../types/asset';
import { formatTimecode } from '../../lib/formatters';
import { cn } from '../../lib/cn';

interface TranscriptListProps {
  asset: Asset;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export function TranscriptList({ asset, videoRef }: TranscriptListProps) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch transcript JSON when ready
  useEffect(() => {
    if (asset.transcriptionStatus !== 'ready') return;
    setLoading(true);
    fetch(`/storage/${asset.id}/transcript.json`)
      .then(res => res.json())
      .then(data => {
        // Groq returns {segments: [...]} or just [...]
        setSegments(Array.isArray(data) ? data : data.segments ?? []);
      })
      .catch(() => setSegments([]))
      .finally(() => setLoading(false));
  }, [asset.id, asset.transcriptionStatus]);

  // Sync active segment with video time
  useEffect(() => {
    const video = videoRef.current;
    if (!video || segments.length === 0) return;
    const handler = () => {
      const t = video.currentTime;
      const idx = segments.findIndex(
        (s, i) => t >= s.start && (i === segments.length - 1 || t < segments[i + 1].start)
      );
      setActiveIndex(idx);
    };
    video.addEventListener('timeupdate', handler);
    return () => video.removeEventListener('timeupdate', handler);
  }, [segments, videoRef]);

  // Auto-scroll active segment into view
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = listRef.current?.children[activeIndex] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  // Click to seek
  const handleSeek = (start: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = start;
    }
  };

  // Status display when not ready
  if (asset.transcriptionStatus === 'pending') {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted px-3 py-4">
        <span className="w-2 h-2 rounded-full bg-status-pending animate-pulse" />
        Transcription pending...
      </div>
    );
  }

  if (asset.transcriptionStatus === 'processing') {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted px-3 py-4">
        <span className="w-2 h-2 rounded-full bg-status-processing animate-pulse" />
        Transcribing...
      </div>
    );
  }

  if (asset.transcriptionStatus === 'failed') {
    return (
      <div className="px-3 py-4">
        <p className="text-sm text-status-failed">Transcription failed</p>
        {asset.transcriptionError && (
          <p className="text-xs text-text-muted mt-1">{asset.transcriptionError}</p>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-3 py-4 space-y-2">
        <div className="h-4 bg-background rounded animate-pulse w-3/4" />
        <div className="h-4 bg-background rounded animate-pulse w-1/2" />
        <div className="h-4 bg-background rounded animate-pulse w-2/3" />
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-text-muted">
        No transcript available
      </div>
    );
  }

  return (
    <div ref={listRef} className="overflow-y-auto max-h-[40vh]">
      {segments.map((seg, i) => (
        <button
          key={i}
          onClick={() => handleSeek(seg.start)}
          className={cn(
            'w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors',
            i === activeIndex
              ? 'bg-cta/20 text-text border-l-2 border-cta'
              : 'text-text-muted hover:bg-background/50'
          )}
        >
          <span className="font-mono text-xs text-text-muted mr-2">
            {formatTimecode(seg.start)}
          </span>
          {seg.text}
        </button>
      ))}
    </div>
  );
}
