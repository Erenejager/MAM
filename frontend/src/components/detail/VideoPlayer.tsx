import { forwardRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Eye, EyeOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { storageUrl } from '../../lib/api';
import type { Asset } from '../../types/asset';
import { VideoProgressBar } from './VideoProgressBar';

export interface TimelineMoment {
  timestamp: number;
  label: string;
  score: string | null;
  set_period: string | null;
  position: number;
  count: number;
}

function mergeMoments(
  raw: Array<{ timestamp: number; label: string; score: string | null; set_period: string | null }>,
  duration: number,
): TimelineMoment[] {
  if (!duration || duration <= 0) return [];
  const sorted = [...raw].sort((a, b) => a.timestamp - b.timestamp);
  const merged: TimelineMoment[] = [];
  const threshold = 0.01;

  for (const m of sorted) {
    const pos = m.timestamp / duration;
    if (pos < 0 || pos > 1) continue;
    const last = merged[merged.length - 1];
    if (last && pos - last.position < threshold) {
      last.count++;
    } else {
      merged.push({ ...m, position: pos, count: 1 });
    }
  }
  return merged;
}

interface VideoPlayerProps {
  asset: Asset;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer({ asset }, ref) {
    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
    const [momentsVisible, setMomentsVisible] = useState(true);

    const moments = useMemo<TimelineMoment[]>(() => {
      if (asset.ocrStatus !== 'complete' || !asset.ocrKeyMoments) return [];
      try {
        const parsed = JSON.parse(asset.ocrKeyMoments);
        if (!Array.isArray(parsed)) return [];
        return mergeMoments(parsed, duration);
      } catch {
        return [];
      }
    }, [asset.ocrStatus, asset.ocrKeyMoments, duration]);

    const hasMoments = moments.length > 0;

    const videoRefCb = useCallback(
      (el: HTMLVideoElement | null) => {
        setVideoEl(el);
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as React.MutableRefObject<HTMLVideoElement | null>).current = el;
      },
      [ref]
    );

    // Stable RefObject for VideoProgressBar
    const videoRefObj = { current: videoEl } as React.RefObject<HTMLVideoElement>;

    const posterUrl = asset.thumbnailPath
      ? storageUrl(`${asset.id}/thumbnail.jpg`)
      : undefined;

    // Sync play state and time
    useEffect(() => {
      if (!videoEl) return;
      const onPlay = () => setPlaying(true);
      const onPause = () => setPlaying(false);
      const onTimeUpdate = () => {
        setCurrentTime(videoEl.currentTime);
        if (videoEl.duration && isFinite(videoEl.duration)) setDuration(videoEl.duration);
      };
      const onLoadedMetadata = () => {
        if (videoEl.duration && isFinite(videoEl.duration)) setDuration(videoEl.duration);
      };

      videoEl.addEventListener('play', onPlay);
      videoEl.addEventListener('pause', onPause);
      videoEl.addEventListener('timeupdate', onTimeUpdate);
      videoEl.addEventListener('loadedmetadata', onLoadedMetadata);
      return () => {
        videoEl.removeEventListener('play', onPlay);
        videoEl.removeEventListener('pause', onPause);
        videoEl.removeEventListener('timeupdate', onTimeUpdate);
        videoEl.removeEventListener('loadedmetadata', onLoadedMetadata);
      };
    }, [videoEl]);

    const togglePlay = () => {
      if (!videoEl) return;
      if (videoEl.paused) videoEl.play();
      else videoEl.pause();
    };

    const toggleMute = () => {
      if (!videoEl) return;
      videoEl.muted = !videoEl.muted;
      setMuted(videoEl.muted);
    };

    const toggleFullscreen = () => {
      if (!videoEl) return;
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoEl.requestFullscreen();
      }
    };

    const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
      <div className="w-full h-full flex flex-col">
        {/* Video container with progress bar overlay */}
        <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center">
          <video
            ref={videoRefCb}
            src={storageUrl(asset.filepath)}
            poster={posterUrl}
            className="w-full h-full object-contain"
            onClick={togglePlay}
          />

          {/* Glass play overlay — only when paused */}
          <AnimatePresence>
            {!playing && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
                aria-label="Play video"
              >
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 52,
                    height: 52,
                    background: 'rgba(255,255,255,0.07)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 0 20px rgba(225,29,72,0.12)',
                  }}
                >
                  <Play size={22} className="text-white ml-[4px]" fill="white" />
                </div>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Progress bar on video bottom edge */}
          <VideoProgressBar
            videoRef={videoRefObj}
            moments={momentsVisible ? moments : []}
          />
        </div>

        {/* Compact controls bar */}
        <div
          className="shrink-0 flex items-center justify-between px-[14px]"
          style={{
            height: 36,
            background: 'rgba(15,15,30,0.85)',
            backdropFilter: 'blur(16px)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {/* Left group: play + timecode */}
          <div className="flex items-center gap-[8px]">
            <button
              onClick={togglePlay}
              className="text-[#71717a] hover:text-[#e4e4e7] transition-colors cursor-pointer"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause size={16} /> : <Play size={16} fill="#71717a" />}
            </button>
            <span className="font-mono text-xs tabular-nums select-none">
              <span className="text-[#e4e4e7]">{formatTime(currentTime)}</span>
              <span className="text-[#535370]"> / </span>
              <span className="text-[#71717a]">{formatTime(duration)}</span>
            </span>
          </div>

          {/* Right group: moments toggle + volume + fullscreen */}
          <div className="flex items-center gap-[8px]">
            {hasMoments && (
              <button
                onClick={() => setMomentsVisible((v) => !v)}
                className={`transition-colors cursor-pointer ${
                  momentsVisible ? 'text-cta' : 'text-[#52525b] hover:text-[#71717a]'
                }`}
                aria-label="Toggle moment markers"
                aria-pressed={momentsVisible}
              >
                {momentsVisible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            )}
            <button
              onClick={toggleMute}
              className="text-[#71717a] hover:text-[#e4e4e7] transition-colors cursor-pointer"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="text-[#71717a] hover:text-[#e4e4e7] transition-colors cursor-pointer"
              aria-label="Toggle fullscreen"
            >
              <Maximize size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }
);
