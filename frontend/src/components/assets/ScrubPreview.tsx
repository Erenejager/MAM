import { useState, useCallback } from 'react';
import type { Asset } from '../../types/asset';
import { formatDuration, formatFileSize, formatDate } from '../../lib/formatters';

interface ScrubPreviewProps {
  asset: Asset;
  containerRef: React.RefObject<HTMLElement>;
}

function formatRelativeDate(isoDate: string | null): string {
  if (!isoDate) return '';
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Imported today';
  if (days === 1) return 'Imported yesterday';
  if (days < 30) return `Imported ${days} days ago`;
  return `Imported ${formatDate(isoDate)}`;
}

export function ScrubPreview({ asset, containerRef }: ScrubPreviewProps) {
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const [progressX, setProgressX] = useState(0);
  const [tooltipX, setTooltipX] = useState(0);

  const duration = asset.durationSeconds ?? 0;
  const framesAvailable = asset.framesStatus === 'complete';
  const tags: string[] = asset.tags ? JSON.parse(asset.tags) : [];

  const [hovering, setHovering] = useState(false);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const ratio = x / rect.width;
      setProgressX(ratio);
      setTooltipX(x);
      setHovering(true);
      if (framesAvailable) {
        setFrameIndex(Math.min(Math.floor(ratio * 6), 5));
      }
    },
    [containerRef, framesAvailable]
  );

  const handleMouseLeave = useCallback(() => {
    setFrameIndex(null);
    setProgressX(0);
    setHovering(false);
  }, []);

  const currentTime = progressX * duration;
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const metaParts: string[] = [];
  if (duration) metaParts.push(formatDuration(duration));
  if (asset.width && asset.height) metaParts.push(`${asset.height}p`);
  if (asset.codec) metaParts.push(asset.codec.toUpperCase());
  if (asset.fileSize) metaParts.push(formatFileSize(asset.fileSize));
  const metaLine = metaParts.join(' \u00B7 ');

  return (
    <div
      className="absolute inset-0 z-[2]"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Scrub frame image */}
      {frameIndex !== null && framesAvailable && (
        <img
          src={`/storage/${asset.id}/frame_${frameIndex}.jpg`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Timecode tooltip */}
      {hovering && duration > 0 && (
        <div
          className="absolute pointer-events-none font-mono text-[9px] px-[6px] py-[1px] z-[4]"
          style={{
            bottom: 'calc(30% + 12px)',
            left: tooltipX,
            transform: 'translateX(-50%)',
            background: 'rgba(15,15,30,0.95)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            color: '#e4e4e7',
          }}
        >
          {formatTime(currentTime)}
        </div>
      )}

      {/* Scrub progress bar */}
      {hovering && (
        <div
          className="absolute left-0 right-0 z-[5]"
          style={{ bottom: '30%', height: 3, background: 'rgba(255,255,255,0.08)' }}
        >
          <div
            className="h-full"
            style={{
              width: `${progressX * 100}%`,
              background: '#E11D48',
              boxShadow: '0 0 6px rgba(225,29,72,0.3)',
            }}
          />
        </div>
      )}

      {/* Metadata gradient overlay */}
      <div
        className="absolute bottom-0 left-0 right-0 z-[3] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col gap-[3px]"
        style={{
          background: 'linear-gradient(transparent 0%, rgba(10,10,20,0.7) 25%, rgba(10,10,20,0.93) 100%)',
          padding: '28px 10px 14px',
        }}
      >
        <div className="text-xs font-semibold text-white truncate">
          {asset.title || asset.originalFilename}
        </div>
        <div className="font-mono text-[10px] text-[#71717a]">{metaLine}</div>
        <div className="text-[10px] text-[#52525b]">{formatRelativeDate(asset.createdAt)}</div>
        {tags.length > 0 && (
          <div className="flex gap-[4px] flex-wrap mt-[1px]">
            {tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="text-[8px] px-[6px] py-[1px] rounded bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] text-[#a1a1aa]"
              >
                {tag}
              </span>
            ))}
            {tags.length > 4 && <span className="text-[8px] text-[#52525b]">+{tags.length - 4}</span>}
          </div>
        )}
        {asset.description && (
          <div className="text-[10px] text-[#71717a] italic truncate">{asset.description}</div>
        )}
      </div>
    </div>
  );
}
