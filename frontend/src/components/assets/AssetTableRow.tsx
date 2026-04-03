import { useState, useRef, useCallback } from 'react';
import { storageUrl } from '../../lib/api';
import { PreviewCard } from './PreviewCard';
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
  const [thumbHovering, setThumbHovering] = useState(false);
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number; bottom: number } | null>(null);
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
    borderRadius: 6,
    height: 56,
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    position: 'relative',
    marginBottom: 1,
    outline: 'none',
    transition: 'background 150ms ease-out, border-color 150ms ease-out',
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
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => { setHovering(false); setThumbHovering(false); }}
        onClick={() => onSelect(asset.id)}
        onContextMenu={(e) => onContextMenu(e, asset.id)}
        onKeyDown={handleKeyDown}
        aria-selected={isSelected}
      >
        {/* Thumbnail — 72px */}
        <div
          ref={thumbRef}
          role="cell"
          style={{ width: 72, flexShrink: 0, padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseEnter={() => {
            const thumbRect = thumbRef.current?.getBoundingClientRect();
            const rowRect = rowRef.current?.getBoundingClientRect();
            if (thumbRect && rowRect) {
              setAnchorRect({ top: rowRect.top, left: thumbRect.left, bottom: rowRect.bottom });
            }
            setThumbHovering(true);
          }}
          onMouseLeave={() => setThumbHovering(false)}
        >
          {isIngesting ? (
            <div style={{
              width: 64, height: 38, borderRadius: 4,
              background: 'rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: '#52525b', letterSpacing: 2,
            }}>···</div>
          ) : (
            <img
              src={storageUrl(`${asset.id}/thumbnail.jpg`)}
              alt=""
              style={{ width: 64, height: 38, borderRadius: 4, objectFit: 'cover', display: 'block' }}
            />
          )}
        </div>

        {/* Title — flex:1 */}
        <div role="cell" style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: titleColor,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {isIngesting ? '—' : (asset.title || asset.originalFilename)}
          </div>
        </div>

        {/* Description — 220px */}
        <div role="cell" style={{ width: 220, flexShrink: 0, paddingRight: 12 }}>
          <div style={{
            fontSize: 12, fontStyle: 'italic', color: '#52525b',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {isIngesting ? '—' : (asset.description || '—')}
          </div>
        </div>

        {/* Duration — 64px */}
        <div role="cell" style={{ width: 64, flexShrink: 0, paddingRight: 12 }}>
          <div style={{
            fontSize: 12, fontFamily: 'Fira Code, monospace', color: metaColor,
          }}>
            {isIngesting ? '—' : formatDuration(asset.durationSeconds)}
          </div>
        </div>

        {/* Imported — 80px */}
        <div role="cell" style={{ width: 80, flexShrink: 0, paddingRight: 12 }}>
          <div style={{ fontSize: 12, color: metaColor }}>
            {isIngesting ? '—' : formatRelativeDate(asset.createdAt)}
          </div>
        </div>

        {/* Tags — 120px */}
        <div role="cell" style={{ width: 120, flexShrink: 0, paddingRight: 12, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
          {!isIngesting && visibleTags.map((tag) => (
            <span key={tag} style={{
              fontSize: 10, color: '#71717a',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 3, padding: '2px 6px',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 52,
            }}>
              {tag}
            </span>
          ))}
          {!isIngesting && overflowCount > 0 && (
            <span style={{ fontSize: 10, color: '#52525b' }}>+{overflowCount}</span>
          )}
        </div>

        {/* Transcript dot — 24px */}
        <div role="cell" style={{ width: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: dotColor,
            animation: dotPulse ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }} />
        </div>
      </div>

      <PreviewCard
        asset={asset}
        visible={thumbHovering}
        anchorRect={anchorRect}
        onMouseEnter={() => setThumbHovering(true)}
        onMouseLeave={() => setThumbHovering(false)}
      />
    </>
  );
}
