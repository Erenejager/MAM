import { useState, useEffect } from 'react';

interface ThumbnailPopupProps {
  assetId: string;
  durationSeconds: number | null;
  visible: boolean;
  thumbOffsetLeft: number;
  rowOffsetTop: number;
}

function formatDuration(secs: number | null): string {
  if (secs == null) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ThumbnailPopup({
  assetId,
  durationSeconds,
  visible,
  thumbOffsetLeft,
  rowOffsetTop,
}: ThumbnailPopupProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!show) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: thumbOffsetLeft + 8,
        top: rowOffsetTop - 90 - 4,
        width: 160,
        height: 90,
        zIndex: 20,
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <img
        src={`/storage/${assetId}/thumbnail.jpg`}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {durationSeconds != null && (
        <div
          style={{
            position: 'absolute',
            bottom: 4,
            right: 4,
            background: 'rgba(0,0,0,0.7)',
            borderRadius: 3,
            padding: '0 4px',
            fontFamily: 'Fira Code, monospace',
            fontSize: 8,
            color: '#a1a1aa',
            lineHeight: '16px',
          }}
        >
          {formatDuration(durationSeconds)}
        </div>
      )}
    </div>
  );
}
