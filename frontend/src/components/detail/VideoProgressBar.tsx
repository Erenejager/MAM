// frontend/src/components/detail/VideoProgressBar.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import type { TimelineMoment } from './VideoPlayer';

interface VideoProgressBarProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  moments?: TimelineMoment[];
}

export function VideoProgressBar({ videoRef, moments = [] }: VideoProgressBarProps) {
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tooltipTime, setTooltipTime] = useState(0);
  const [tooltipX, setTooltipX] = useState(0);
  const [hoveredMomentIdx, setHoveredMomentIdx] = useState<number | null>(null);
  const [floatingCard, setFloatingCard] = useState<{ index: number; fadeOut: boolean } | null>(null);
  const floatingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Sync progress with video timeupdate
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.duration && isFinite(video.duration)) {
        setProgress(video.currentTime / video.duration);
        setDuration(video.duration);
      }
    };

    const onLoadedMetadata = () => {
      if (video.duration && isFinite(video.duration)) {
        setDuration(video.duration);
      }
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    if (video.duration && isFinite(video.duration)) {
      setDuration(video.duration);
      setProgress(video.currentTime / video.duration);
    }

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [videoRef]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getTimeFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const bar = barRef.current;
      if (!bar || !duration) return 0;
      const rect = bar.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      return (x / rect.width) * duration;
    },
    [duration]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      setTooltipX(x);
      setTooltipTime(getTimeFromEvent(e));
    },
    [getTimeFromEvent]
  );

  const handleSeek = useCallback(
    (e: React.MouseEvent) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = getTimeFromEvent(e);
    },
    [videoRef, getTimeFromEvent]
  );

  // Global mouse handlers for drag
  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const bar = barRef.current;
      const video = videoRef.current;
      if (!bar || !video || !duration) return;
      const rect = bar.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const time = (x / rect.width) * duration;
      video.currentTime = time;
      setTooltipX(x);
      setTooltipTime(time);
    };

    const onMouseUp = () => setDragging(false);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging, duration, videoRef]);

  // Keyboard seek for accessibility
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      const step = 5; // seconds
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        video.currentTime = Math.min(video.currentTime + step, duration);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        video.currentTime = Math.max(video.currentTime - step, 0);
      }
    },
    [videoRef, duration]
  );

  const showFloatingCard = useCallback((index: number) => {
    if (floatingTimerRef.current) clearTimeout(floatingTimerRef.current);
    setFloatingCard({ index, fadeOut: false });
    floatingTimerRef.current = setTimeout(() => {
      setFloatingCard((prev) => prev ? { ...prev, fadeOut: true } : null);
      floatingTimerRef.current = setTimeout(() => {
        setFloatingCard(null);
      }, 300);
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (floatingTimerRef.current) clearTimeout(floatingTimerRef.current);
    };
  }, []);

  // Respect prefers-reduced-motion
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const expanded = hovered || dragging;
  const barHeight = expanded ? 6 : 3;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-10"
      style={{ height: 20 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (!dragging) setHovered(false); }}
      onMouseMove={handleMouseMove}
    >
      {/* Time tooltip */}
      {expanded && hoveredMomentIdx === null && (
        <div
          className="absolute font-mono text-[10px] px-[6px] py-[2px] rounded-md pointer-events-none"
          style={{
            bottom: barHeight + 8,
            left: tooltipX,
            transform: 'translateX(-50%)',
            background: 'rgba(15,15,30,0.95)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#e4e4e7',
          }}
        >
          {formatTime(tooltipTime)}
        </div>
      )}

      {/* Moment tick marks */}
      {moments.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: 20 }}>
          {moments.map((m, i) => {
            const isHovered = hoveredMomentIdx === i;
            const isCluster = m.count > 1;
            return (
              <div
                key={`${m.timestamp}-${i}`}
                className="absolute pointer-events-auto cursor-pointer"
                style={{
                  left: `${m.position * 100}%`,
                  bottom: barHeight + 2,
                  transform: 'translateX(-50%)',
                  width: isHovered ? 2 : isCluster ? 3 : 2,
                  height: isHovered ? 12 : isCluster ? 9 : 8,
                  background: isHovered
                    ? '#E11D48'
                    : isCluster
                      ? 'rgba(225,29,72,0.55)'
                      : 'rgba(225,29,72,0.4)',
                  borderRadius: 1,
                  boxShadow: isHovered ? '0 0 6px rgba(225,29,72,0.4)' : 'none',
                  transition: 'height 100ms ease-out, background 100ms ease-out',
                }}
                onMouseEnter={() => setHoveredMomentIdx(i)}
                onMouseLeave={() => setHoveredMomentIdx(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  const video = videoRef.current;
                  if (video) video.currentTime = m.timestamp;
                  showFloatingCard(i);
                }}
                role="button"
                aria-label={`Moment at ${formatTime(m.timestamp)}: ${m.label}`}
              />
            );
          })}
        </div>
      )}

      {/* Moment hover tooltip */}
      {hoveredMomentIdx !== null && moments[hoveredMomentIdx] && !dragging && floatingCard?.index !== hoveredMomentIdx && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${moments[hoveredMomentIdx].position * 100}%`,
            bottom: barHeight + 16,
            transform: 'translateX(-50%)',
            background: 'rgba(15,15,30,0.95)',
            border: '1px solid rgba(225,29,72,0.2)',
            borderRadius: 8,
            padding: '6px 10px',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
            zIndex: 20,
          }}
        >
          <div className="flex items-center gap-[6px]">
            <span className="font-mono text-[11px] font-semibold text-cta">
              {formatTime(moments[hoveredMomentIdx].timestamp)}
            </span>
            <span className="text-[11px] font-semibold text-[#e4e4e7]">
              {moments[hoveredMomentIdx].label}
            </span>
          </div>
          {(moments[hoveredMomentIdx].score || moments[hoveredMomentIdx].set_period) && (
            <div className="text-[10px] text-[#a1a1aa] mt-[1px]">
              {[moments[hoveredMomentIdx].score, moments[hoveredMomentIdx].set_period]
                .filter(Boolean)
                .join(' | ')}
            </div>
          )}
        </div>
      )}

      {/* Floating card (post-click) */}
      {floatingCard !== null && moments[floatingCard.index] && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${moments[floatingCard.index].position * 100}%`,
            bottom: barHeight + 16,
            transform: 'translateX(-50%)',
            background: 'rgba(15,15,30,0.95)',
            border: '1px solid rgba(225,29,72,0.2)',
            borderRadius: 8,
            padding: '6px 10px',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
            zIndex: 20,
            opacity: floatingCard.fadeOut ? 0 : 1,
            transition: 'opacity 300ms ease-out',
          }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-[6px]">
            <span className="font-mono text-[11px] font-semibold text-cta">
              {formatTime(moments[floatingCard.index].timestamp)}
            </span>
            <span className="text-[11px] font-semibold text-[#e4e4e7]">
              {moments[floatingCard.index].label}
            </span>
          </div>
          {(moments[floatingCard.index].score || moments[floatingCard.index].set_period) && (
            <div className="text-[10px] text-[#a1a1aa] mt-[1px]">
              {[moments[floatingCard.index].score, moments[floatingCard.index].set_period]
                .filter(Boolean)
                .join(' | ')}
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div
        ref={barRef}
        className="absolute bottom-0 left-0 right-0 cursor-pointer"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{
          height: barHeight,
          transition: prefersReducedMotion ? 'none' : 'height 150ms ease-out',
          background: 'rgba(255,255,255,0.08)',
        }}
        onClick={handleSeek}
        onMouseDown={(e) => {
          handleSeek(e);
          setDragging(true);
        }}
        role="slider"
        aria-label="Video progress"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        aria-valuetext={formatTime(currentTime)}
      >
        {/* Fill */}
        <div
          className="h-full"
          style={{
            width: `${progress * 100}%`,
            background: '#E11D48',
            boxShadow: '0 0 6px rgba(225,29,72,0.3)',
          }}
        />

        {/* Scrubber dot */}
        {expanded && (
          <div
            className="absolute top-1/2 rounded-full pointer-events-none"
            style={{
              left: `${progress * 100}%`,
              transform: `translate(-50%, -50%)`,
              width: 16,
              height: 16,
              background: '#E11D48',
              border: '2px solid rgba(255,255,255,0.2)',
              boxShadow: '0 0 10px rgba(225,29,72,0.5)',
            }}
          />
        )}
      </div>
    </div>
  );
}
