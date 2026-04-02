import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Asset } from '../../types/asset';

interface PreviewCardProps {
  asset: Asset;
  visible: boolean;
  anchorRect: { top: number; left: number; bottom: number } | null;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function parseTagsSafe(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

const CARD_WIDTH = 320;
const THUMB_HEIGHT = 180;

export function PreviewCard({ asset, visible, anchorRect }: PreviewCardProps) {
  const [show, setShow] = useState(false);
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const [progressX, setProgressX] = useState(0);
  const [tooltipX, setTooltipX] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const duration = asset.durationSeconds ?? 0;
  const framesAvailable = asset.framesStatus === 'complete';
  const tags = parseTagsSafe(asset.tags);
  const hasDescription = !!asset.description;

  // 200ms hover delay
  useEffect(() => {
    if (!visible) {
      setShow(false);
      setFrameIndex(null);
      setProgressX(0);
      setScrubbing(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(timer);
  }, [visible]);

  // Scrub handler
  const handleScrubMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const ratio = x / rect.width;
      setProgressX(ratio);
      setTooltipX(x);
      setScrubbing(true);
      if (framesAvailable) {
        setFrameIndex(Math.min(Math.floor(ratio * 6), 5));
      }
    },
    [framesAvailable]
  );

  const handleScrubLeave = useCallback(() => {
    setFrameIndex(null);
    setProgressX(0);
    setScrubbing(false);
  }, []);

  if (!show || !anchorRect) return null;

  // Smart vertical positioning: center on row, flip if near edges
  const cardHeight = cardRef.current?.offsetHeight ?? 250;
  const rowCenterY = (anchorRect.top + anchorRect.bottom) / 2;
  let top = rowCenterY - cardHeight / 2;

  // Clamp to viewport
  if (top < 8) top = 8;
  if (top + cardHeight > window.innerHeight - 8) {
    top = window.innerHeight - cardHeight - 8;
  }

  const currentTime = progressX * duration;

  return createPortal(
    <div
      ref={cardRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: anchorRect.left,
        top,
        width: CARD_WIDTH,
        zIndex: 50,
        borderRadius: 8,
        border: '1px solid #2D2A5E',
        background: '#1E1B4B',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        pointerEvents: 'auto',
        opacity: 1,
        transition: 'opacity 150ms ease-out',
      }}
    >
      {/* Scrubbable thumbnail area */}
      <div
        style={{
          width: CARD_WIDTH,
          height: THUMB_HEIGHT,
          position: 'relative',
          cursor: framesAvailable ? 'col-resize' : 'default',
        }}
        onMouseMove={handleScrubMove}
        onMouseLeave={handleScrubLeave}
      >
        {/* Base thumbnail */}
        <img
          src={`/storage/${asset.id}/thumbnail.jpg`}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />

        {/* Scrub frame overlay */}
        {frameIndex !== null && framesAvailable && (
          <img
            src={`/storage/${asset.id}/frame_${frameIndex}.jpg`}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}

        {/* Timecode tooltip */}
        {scrubbing && duration > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: tooltipX,
              transform: 'translateX(-50%)',
              background: 'rgba(15,15,30,0.95)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              padding: '1px 6px',
              fontFamily: 'Fira Code, monospace',
              fontSize: 9,
              color: '#e4e4e7',
              pointerEvents: 'none',
            }}
          >
            {formatTime(currentTime)}
          </div>
        )}

        {/* Progress bar */}
        {scrubbing && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 3,
              background: 'rgba(255,255,255,0.08)',
            }}
          >
            <div
              style={{
                width: `${progressX * 100}%`,
                height: '100%',
                background: '#E11D48',
                boxShadow: '0 0 6px rgba(225,29,72,0.3)',
              }}
            />
          </div>
        )}
      </div>

      {/* Metadata area — only render if there's content */}
      {(tags.length > 0 || hasDescription) && (
        <div style={{ padding: '8px 10px 10px' }}>
          {/* Tags */}
          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: hasDescription ? 6 : 0 }}>
              {tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontFamily: 'Fira Code, monospace',
                    fontSize: 9,
                    color: '#a1a1aa',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 3,
                    padding: '1px 6px',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {hasDescription && (
            <div
              style={{
                fontSize: 11,
                fontStyle: 'italic',
                color: '#a1a1aa',
                lineHeight: 1.5,
              }}
            >
              {asset.description}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
