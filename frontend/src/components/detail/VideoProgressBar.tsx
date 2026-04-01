// frontend/src/components/detail/VideoProgressBar.tsx
import { useEffect, useRef, useState, useCallback } from 'react';

interface VideoProgressBarProps {
  videoRef: React.RefObject<HTMLVideoElement>;
}

export function VideoProgressBar({ videoRef }: VideoProgressBarProps) {
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tooltipTime, setTooltipTime] = useState(0);
  const [tooltipX, setTooltipX] = useState(0);
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
      {expanded && (
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

      {/* Progress bar */}
      <div
        ref={barRef}
        className="absolute bottom-0 left-0 right-0 cursor-pointer"
        style={{
          height: barHeight,
          transition: 'height 150ms ease-out',
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
            className="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
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
