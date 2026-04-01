import { useState, useRef, useCallback } from 'react';
import { ThumbnailPopup } from './ThumbnailPopup';
import type { Asset } from '../../types/asset';

interface AssetTableRowProps {
  asset: Asset;
  index: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

function formatDuration(secs: number | null): string {
  if (secs == null) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatRelativeDate(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 24) return `${Math.max(1, Math.floor(diffH))}h ago`;
  const diffD = diffMs / (1000 * 60 * 60 * 24);
  if (diffD < 7) return `${Math.floor(diffD)}d ago`;
  if (diffD < 30) return `${Math.floor(diffD / 7)}w ago`;
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parseTagsSafe(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

export function AssetTableRow({
  asset,
  index,
  isSelected,
  onSelect,
  onContextMenu,
}: AssetTableRowProps) {
  const [hovering, setHovering] = useState(false);
  const [popupCoords, setPopupCoords] = useState({ left: 8, top: 0 });
  const rowRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(asset.id);
    }
  }, [asset.id, onSelect]);

  const isIngesting = asset.status === 'ingesting';
  const tags = parseTagsSafe(asset.tags);
  const visibleTags = tags.slice(0, 2);
  const overflowCount = tags.length - 2;

  const tsStatus = asset.transcriptionStatus;
  const dotColor =
    isIngesting ? '#F59E0B' :
    (tsStatus === 'complete' || tsStatus === 'ready') ? '#10B981' :
    tsStatus === 'processing' ? '#F59E0B' :
    '#94A3B8';
  const dotPulse = isIngesting || tsStatus === 'processing';

  const altBg = index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';

  const rowStyle: React.CSSProperties = {
    background: isSelected
      ? 'rgba(225,29,72,0.04)'
      : hovering
        ? 'rgba(255,255,255,0.03)'
        : altBg,
    border: isSelected
      ? '1px solid rgba(225,29,72,0.12)'
      : hovering
        ? '1px solid rgba(255,255,255,0.07)'
        : '1px solid transparent',
    borderRadius: 4,
    height: 34,
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    position: 'relative',
    marginBottom: 1,
    outline: 'none',
  };

  const titleColor = (isSelected || hovering) ? '#e4e4e7' : '#a1a1aa';
  const metaColor = hovering ? '#a1a1aa' : '#52525b';


  return (
    <>
      <div
        ref={rowRef}
        role="row"
        tabIndex={0}
        style={rowStyle}
        onMouseEnter={() => {
          setPopupCoords({
            left: thumbRef.current?.offsetLeft ?? 8,
            top: rowRef.current?.offsetTop ?? 0,
          });
          setHovering(true);
        }}
        onMouseLeave={() => setHovering(false)}
        onClick={() => onSelect(asset.id)}
        onContextMenu={(e) => onContextMenu(e, asset.id)}
        onKeyDown={handleKeyDown}
        aria-selected={isSelected}
      >
        {/* Thumbnail — 40px */}
        <div
          ref={thumbRef}
          role="cell"
          style={{ width: 40, flexShrink: 0, padding: '0 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {isIngesting ? (
            <div style={{
              width: 40, height: 24, borderRadius: 3,
              background: 'rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, color: '#52525b', letterSpacing: 2,
            }}>···</div>
          ) : (
            <img
              src={`/storage/${asset.id}/thumbnail.jpg`}
              alt=""
              style={{ width: 40, height: 24, borderRadius: 3, objectFit: 'cover', display: 'block' }}
            />
          )}
        </div>

        {/* Title — flex:1 */}
        <div role="cell" style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: titleColor,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {isIngesting ? '—' : (asset.title || asset.originalFilename)}
          </div>
        </div>

        {/* Description — 160px */}
        <div role="cell" style={{ width: 160, flexShrink: 0, paddingRight: 8 }}>
          <div style={{
            fontSize: 9, fontStyle: 'italic', color: '#52525b',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {isIngesting ? '—' : (asset.description || '—')}
          </div>
        </div>

        {/* Duration — 50px */}
        <div role="cell" style={{ width: 50, flexShrink: 0, paddingRight: 8 }}>
          <div style={{
            fontSize: 9, fontFamily: 'Fira Code, monospace', color: metaColor,
          }}>
            {isIngesting ? '—' : formatDuration(asset.durationSeconds)}
          </div>
        </div>

        {/* Imported — 60px */}
        <div role="cell" style={{ width: 60, flexShrink: 0, paddingRight: 8 }}>
          <div style={{ fontSize: 9, color: metaColor }}>
            {isIngesting ? '—' : formatRelativeDate(asset.createdAt)}
          </div>
        </div>

        {/* Tags — 80px */}
        <div role="cell" style={{ width: 80, flexShrink: 0, paddingRight: 8, display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden' }}>
          {!isIngesting && visibleTags.map((tag) => (
            <span key={tag} style={{
              fontSize: 7, color: '#71717a',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 3, padding: '1px 4px',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 36,
            }}>
              {tag}
            </span>
          ))}
          {!isIngesting && overflowCount > 0 && (
            <span style={{ fontSize: 7, color: '#52525b' }}>+{overflowCount}</span>
          )}
        </div>

        {/* Transcript dot — 16px */}
        <div role="cell" style={{ width: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', background: dotColor,
            animation: dotPulse ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }} />
        </div>
      </div>

      <ThumbnailPopup
        assetId={asset.id}
        durationSeconds={asset.durationSeconds}
        visible={hovering}
        thumbOffsetLeft={popupCoords.left}
        rowOffsetTop={popupCoords.top}
      />
    </>
  );
}
