import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { Asset } from '../../types/asset';

interface PreviewCardProps {
  asset: Asset;
  visible: boolean;
  anchorRect: { top: number; left: number; bottom: number } | null;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
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

export function PreviewCard({ asset, visible, anchorRect, onMouseEnter, onMouseLeave }: PreviewCardProps) {
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

  // Compute position even when not showing (needed for exit animation)
  const cardHeight = cardRef.current?.offsetHeight ?? 250;
  const rowCenterY = anchorRect ? (anchorRect.top + anchorRect.bottom) / 2 : 0;
  let top = rowCenterY - cardHeight / 2;
  if (top < 8) top = 8;
  if (anchorRect && top + cardHeight > window.innerHeight - 8) {
    top = window.innerHeight - cardHeight - 8;
  }

  const currentTime = progressX * duration;

  return createPortal(
    <AnimatePresence>
      {show && anchorRect && (
        <motion.div
          ref={cardRef}
          aria-hidden="true"
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          initial={{ opacity: 0, scale: 0.95, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 4 }}
          transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
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
            transformOrigin: 'left center',
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

            {/* Scrub frame overlay with crossfade */}
            <AnimatePresence mode="popLayout">
              {frameIndex !== null && framesAvailable && (
                <motion.img
                  key={frameIndex}
                  src={`/storage/${asset.id}/frame_${frameIndex}.jpg`}
                  alt=""
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              )}
            </AnimatePresence>

            {/* Timecode tooltip */}
            <AnimatePresence>
              {scrubbing && duration > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.1 }}
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
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress bar */}
            <AnimatePresence>
              {scrubbing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 3,
                    background: 'rgba(255,255,255,0.08)',
                  }}
                >
                  <motion.div
                    animate={{ width: `${progressX * 100}%` }}
                    transition={{ duration: 0.06, ease: 'linear' }}
                    style={{
                      height: '100%',
                      background: '#E11D48',
                      boxShadow: '0 0 6px rgba(225,29,72,0.3)',
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Metadata area — only render if there's content */}
          {(tags.length > 0 || hasDescription) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: 0.08 }}
              style={{ padding: '8px 10px 10px' }}
            >
              {/* Tags */}
              {tags.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: hasDescription ? 6 : 0 }}>
                  {tags.map((tag, i) => (
                    <motion.span
                      key={tag}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.12, delay: 0.1 + i * 0.03 }}
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
                    </motion.span>
                  ))}
                </div>
              )}

              {/* Description */}
              {hasDescription && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15, delay: 0.14 }}
                  style={{
                    fontSize: 11,
                    fontStyle: 'italic',
                    color: '#a1a1aa',
                    lineHeight: 1.5,
                  }}
                >
                  {asset.description}
                </motion.div>
              )}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
