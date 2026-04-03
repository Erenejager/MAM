import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { storageUrl } from '../../lib/api';
import { PreviewCard } from './PreviewCard';
import type { Asset, SearchResult } from '../../types/asset';

interface SearchTableRowProps {
  asset: Asset;
  index: number;
  isSelected: boolean;
  searchResult: SearchResult;
  onSelect: (id: string) => void;
  onTimecodeClick?: (assetId: string, timestamp: number) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

function formatDuration(secs: number | null): string {
  if (secs == null) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTimecode(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
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

function renderHighlight(text: string): React.ReactNode {
  const parts = text.split(/(<em>.*?<\/em>)/g);
  return parts.map((part, i) => {
    const match = part.match(/^<em>(.*)<\/em>$/);
    if (match) {
      return (
        <mark key={i} style={{
          background: 'rgba(225,29,72,0.25)',
          color: '#e4e4e7',
          padding: '0 2px',
          borderRadius: 2,
        }}>
          {match[1]}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function SearchTableRow({
  asset,
  index,
  isSelected,
  searchResult,
  onSelect,
  onTimecodeClick,
  onContextMenu,
}: SearchTableRowProps) {
  const [hovering, setHovering] = useState(false);
  const [thumbHovering, setThumbHovering] = useState(false);
  const [hoveredTimecodeText, setHoveredTimecodeText] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number; bottom: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(asset.id);
    }
  }, [asset.id, onSelect]);

  const tags = parseTagsSafe(asset.tags);
  const visibleTags = tags.slice(0, 2);
  const overflowCount = tags.length - 2;

  const altBg = index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
  const titleColor = (isSelected || hovering) ? '#e4e4e7' : '#a1a1aa';
  const metaColor = hovering ? '#a1a1aa' : '#52525b';

  const hasTitle = (searchResult.highlights.title?.length ?? 0) > 0;
  const hasDescription = (searchResult.highlights.description?.length ?? 0) > 0;
  const hasTranscript = !!searchResult.transcriptMatch;
  const transcriptMatches = searchResult.transcriptMatches ?? [];
  const visibleTimecodes = transcriptMatches.slice(0, 4);
  const moreTimecodes = transcriptMatches.length - 4;
  const excerptRaw = searchResult.highlights.transcript?.[0] ?? searchResult.transcriptMatch?.text ?? '';
  const firstTimestamp = transcriptMatches[0]?.timestamp ?? searchResult.transcriptMatch?.timestamp;

  const badgeStyle: React.CSSProperties = {
    fontSize: 9, padding: '1px 5px', lineHeight: '16px',
    background: 'rgba(225,29,72,0.12)', border: '1px solid rgba(225,29,72,0.18)',
    borderRadius: 3, color: '#E11D48', cursor: 'pointer',
    transition: 'background 150ms ease-out',
  };

  return (
    <>
      <div
        ref={rowRef}
        role="row"
        tabIndex={0}
        style={{
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
          cursor: 'pointer',
          position: 'relative',
          marginBottom: 2,
          outline: 'none',
          padding: '8px 0',
          transition: 'background 150ms ease-out, border-color 150ms ease-out',
        }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => { setHovering(false); setThumbHovering(false); }}
        onClick={() => onSelect(asset.id)}
        onContextMenu={(e) => onContextMenu(e, asset.id)}
        onKeyDown={handleKeyDown}
        aria-selected={isSelected}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {/* Thumbnail — stretches to row height */}
          <div
            ref={thumbRef}
            role="cell"
            style={{ width: 130, flexShrink: 0, padding: '0 8px', display: 'flex', alignItems: 'stretch' }}
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
            <img
              src={storageUrl(`${asset.id}/thumbnail.jpg`)}
              alt=""
              style={{ width: '100%', borderRadius: 4, objectFit: 'cover', display: 'block' }}
            />
          </div>

          {/* Title + search context stacked */}
          <div role="cell" style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
            {/* Title */}
            <div style={{
              fontSize: 13, fontWeight: 600, color: titleColor,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              marginBottom: 4,
            }}>
              {asset.title || asset.originalFilename}
            </div>

            {/* Search context: badges + excerpt + timecodes */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {hasTitle && (
                <motion.button
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.12 }}
                  style={badgeStyle}
                  onClick={(e) => { e.stopPropagation(); onSelect(asset.id); }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(225,29,72,0.22)'; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(225,29,72,0.12)'; }}
                >
                  Title
                </motion.button>
              )}
              {hasDescription && (
                <motion.button
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.12, delay: 0.04 }}
                  style={badgeStyle}
                  onClick={(e) => { e.stopPropagation(); onSelect(asset.id); }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(225,29,72,0.22)'; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(225,29,72,0.12)'; }}
                >
                  Description
                </motion.button>
              )}
              {hasTranscript && (
                <motion.button
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.12, delay: 0.08 }}
                  style={badgeStyle}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (firstTimestamp != null && onTimecodeClick) {
                      onTimecodeClick(asset.id, firstTimestamp);
                    } else {
                      onSelect(asset.id);
                    }
                  }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(225,29,72,0.22)'; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(225,29,72,0.12)'; }}
                >
                  Transcript ×{searchResult.transcriptMatch!.matchCount}
                </motion.button>
              )}

              {/* Excerpt — swaps to hovered timecode's text */}
              {(excerptRaw || hoveredTimecodeText) && (
                <>
                  <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                  <span style={{
                    fontSize: 11,
                    color: hoveredTimecodeText ? '#a1a1aa' : '#71717a',
                    fontStyle: 'italic',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    flex: 1, minWidth: 60,
                    transition: 'color 100ms ease-out',
                  }}>
                    &ldquo;{renderHighlight(hoveredTimecodeText ?? excerptRaw)}&rdquo;
                  </span>
                </>
              )}
            </div>

            {/* Timecodes row — right under the excerpt */}
            {visibleTimecodes.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                {visibleTimecodes.map((tc) => (
                  <button
                    key={tc.timestamp}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTimecodeClick?.(asset.id, tc.timestamp);
                    }}
                    aria-label={`Jump to ${formatTimecode(tc.timestamp)}`}
                    style={{
                      fontSize: 10, fontFamily: 'Fira Code, monospace', color: '#E11D48',
                      padding: '1px 6px', lineHeight: '18px',
                      background: 'rgba(225,29,72,0.08)', borderRadius: 3,
                      border: '1px solid rgba(225,29,72,0.15)', cursor: 'pointer',
                      transition: 'background 150ms ease-out',
                    }}
                    onMouseOver={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(225,29,72,0.18)';
                      setHoveredTimecodeText(tc.text);
                    }}
                    onMouseOut={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(225,29,72,0.08)';
                      setHoveredTimecodeText(null);
                    }}
                  >
                    {formatTimecode(tc.timestamp)}
                  </button>
                ))}
                {moreTimecodes > 0 && (
                  <span style={{ fontSize: 10, color: '#52525b' }}>
                    +{moreTimecodes} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Duration — 64px */}
          <div role="cell" style={{ width: 64, flexShrink: 0, paddingRight: 12, paddingTop: 2 }}>
            <div style={{ fontSize: 12, fontFamily: 'Fira Code, monospace', color: metaColor }}>
              {formatDuration(asset.durationSeconds)}
            </div>
          </div>

          {/* Imported — 80px */}
          <div role="cell" style={{ width: 80, flexShrink: 0, paddingRight: 12, paddingTop: 2 }}>
            <div style={{ fontSize: 12, color: metaColor }}>
              {formatRelativeDate(asset.createdAt)}
            </div>
          </div>

          {/* Tags — 120px */}
          <div role="cell" style={{ width: 120, flexShrink: 0, paddingRight: 12, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', paddingTop: 2 }}>
            {visibleTags.map((tag) => (
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
            {overflowCount > 0 && (
              <span style={{ fontSize: 10, color: '#52525b' }}>+{overflowCount}</span>
            )}
          </div>

          {/* Transcript dot — 24px */}
          <div role="cell" style={{ width: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 2 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: hasTranscript ? '#E11D48' : '#10B981',
            }} />
          </div>
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
