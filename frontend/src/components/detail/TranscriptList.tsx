import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Asset, TranscriptSegment } from '../../types/asset';
import { formatTimecode } from '../../lib/formatters';
import { cn } from '../../lib/cn';
import { useTranscriptSearch } from '../../hooks/useTranscriptSearch';
import { TranscriptSearch } from './TranscriptSearch';
import { escapeRegex } from '../../lib/escapeRegex';

interface TranscriptListProps {
  asset: Asset;
  videoRef: React.RefObject<HTMLVideoElement>;
  segments: TranscriptSegment[];
  loading: boolean;
}

function highlightText(
  text: string,
  searchQuery: string,
  segmentIndex: number,
  matchesArr: Array<{ segmentIndex: number; matchIndex: number }>,
  currentMatchIndex: number
): React.ReactNode {
  if (!searchQuery) return text;
  const escaped = escapeRegex(searchQuery);
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  let matchInSeg = 0;
  return parts.map((part, i) => {
    if (part.toLowerCase() === searchQuery.toLowerCase()) {
      const globalIdx = matchesArr.findIndex(
        m => m.segmentIndex === segmentIndex && m.matchIndex === matchInSeg
      );
      const isCurrent = globalIdx === currentMatchIndex;
      matchInSeg++;
      return (
        <mark
          key={i}
          className={cn(
            'rounded-sm px-0.5',
            isCurrent
              ? 'bg-cta/40 text-text'
              : 'bg-cta/20 text-text'
          )}
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}

export function TranscriptList({ asset, videoRef, segments, loading }: TranscriptListProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const segmentRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const userNavigatingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const { query, setQuery, matches, currentMatchIdx, goToNext, goToPrev, totalMatches } = useTranscriptSearch(segments);

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

  // Auto-scroll active segment into view (respects search navigation)
  useEffect(() => {
    if (activeIndex < 0 || userNavigatingRef.current) return;
    const el = segmentRefs.current.get(activeIndex);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  // Search match navigation scroll
  useEffect(() => {
    if (totalMatches === 0) return;
    const match = matches[currentMatchIdx];
    if (!match) return;
    const el = segmentRefs.current.get(match.segmentIndex);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    // Auto-seek video to matched segment and pause
    const video = videoRef.current;
    const seg = segments[match.segmentIndex];
    if (video && seg) {
      video.currentTime = seg.start;
      video.pause();
    }

    userNavigatingRef.current = true;
    clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userNavigatingRef.current = false;
    }, 3000);
  }, [currentMatchIdx, matches, totalMatches, segments, videoRef]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => clearTimeout(scrollTimeoutRef.current);
  }, []);

  // Click to seek
  const handleSeek = (start: number, index: number) => {
    setActiveIndex(index);
    if (videoRef.current) {
      videoRef.current.currentTime = start;
    }
  };

  // Status display when not ready
  if (asset.transcriptionStatus === 'pending') {
    return (
      <div className="flex items-center gap-[6px] text-xs text-text-muted px-md py-md">
        <span className="w-1.5 h-1.5 rounded-full bg-status-pending animate-pulse" />
        Transcription pending...
      </div>
    );
  }

  if (asset.transcriptionStatus === 'processing') {
    return (
      <div className="flex items-center gap-[6px] text-xs text-text-muted px-md py-md">
        <span className="w-1.5 h-1.5 rounded-full bg-status-processing animate-pulse" />
        Transcribing...
      </div>
    );
  }

  if (asset.transcriptionStatus === 'failed') {
    return (
      <div className="px-md py-md">
        <p className="text-xs text-status-failed">Transcription failed</p>
        {asset.transcriptionError && (
          <p className="text-[11px] text-text-muted mt-[2px]">{asset.transcriptionError}</p>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-md py-md space-y-sm">
        <div className="h-3 bg-panel rounded animate-pulse w-3/4" />
        <div className="h-3 bg-panel rounded animate-pulse w-1/2" />
        <div className="h-3 bg-panel rounded animate-pulse w-2/3" />
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="px-md py-md text-xs text-text-muted">
        No transcript available
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <TranscriptSearch
        query={query}
        onQueryChange={setQuery}
        currentMatch={currentMatchIdx}
        totalMatches={totalMatches}
        onNext={goToNext}
        onPrev={goToPrev}
      />
      <span className="absolute w-px h-px overflow-hidden" style={{ clip: 'rect(0,0,0,0)' }} aria-live="polite">
        {query && (totalMatches > 0 ? `${currentMatchIdx + 1} of ${totalMatches} matches` : 'No matches')}
      </span>
      <div className="overflow-y-auto flex-1 px-[8px] py-[4px] flex flex-col gap-[2px]">
        {segments.map((seg, i) => (
          <button
            key={i}
            ref={el => { if (el) segmentRefs.current.set(i, el); else segmentRefs.current.delete(i); }}
            onClick={() => handleSeek(seg.start, i)}
            className={cn(
              'w-full text-left cursor-pointer relative',
              'px-[10px] py-[7px]',
              i !== activeIndex && 'hover:bg-[rgba(255,255,255,0.03)]',
              i < activeIndex && i !== activeIndex && 'opacity-50',
              'transition-opacity duration-150'
            )}
          >
            {i === activeIndex && (
              <motion.div
                layoutId="transcript-active"
                className="absolute inset-0 rounded-lg"
                style={{
                  background: 'rgba(225,29,72,0.06)',
                  border: '1px solid rgba(225,29,72,0.15)',
                  boxShadow: '0 0 12px rgba(225,29,72,0.08)',
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
            <div className="flex items-baseline gap-sm relative z-[1]">
              <span className={cn(
                'font-mono text-[10px] shrink-0 tabular-nums leading-none transition-colors duration-150',
                i === activeIndex ? 'text-cta' : 'text-[#71717a]'
              )}>
                {formatTimecode(seg.start)}
              </span>
              <span className={cn(
                'text-xs leading-relaxed transition-colors duration-150',
                i === activeIndex ? 'text-[#e4e4e7]' : i < activeIndex ? 'text-[#71717a]' : 'text-[#94A3B8]'
              )}>
                {highlightText(seg.text, query, i, matches, currentMatchIdx)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
