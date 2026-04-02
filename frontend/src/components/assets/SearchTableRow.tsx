import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
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

function renderHighlight(text: string): React.ReactNode {
  const parts = text.split(/(<em>.*?<\/em>)/g);
  return parts.map((part, i) => {
    const match = part.match(/^<em>(.*)<\/em>$/);
    if (match) {
      return (
        <mark key={i} style={{
          background: 'rgba(225,29,72,0.2)',
          color: '#e4e4e7',
          padding: 0,
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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(asset.id);
    }
  }, [asset.id, onSelect]);

  const altStyle: React.CSSProperties = index % 2 === 0
    ? { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }
    : { background: 'transparent', border: '1px solid transparent' };

  const rowStyle: React.CSSProperties = {
    ...altStyle,
    ...(isSelected ? { background: 'rgba(225,29,72,0.04)', border: '1px solid rgba(225,29,72,0.12)' } : {}),
    ...(hovering && !isSelected ? { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' } : {}),
    borderRadius: 6,
    padding: '10px 12px',
    marginBottom: 4,
    cursor: 'pointer',
    outline: 'none',
    transition: 'background 150ms ease-out, border-color 150ms ease-out',
  };

  const titleColor = (isSelected || hovering) ? '#e4e4e7' : '#a1a1aa';

  const hasTitle = (searchResult.highlights.title?.length ?? 0) > 0;
  const hasDescription = (searchResult.highlights.description?.length ?? 0) > 0;
  const hasTranscript = !!searchResult.transcriptMatch;
  const transcriptMatches = searchResult.transcriptMatches ?? [];
  const visibleTimecodes = transcriptMatches.slice(0, 3);
  const moreTimecodes = transcriptMatches.length - 3;
  const titleOnlyMatch = hasTitle && !hasDescription && !hasTranscript;
  const excerptRaw = searchResult.highlights.transcript?.[0] ?? searchResult.transcriptMatch?.text ?? '';

  return (
    <div
      role="row"
      tabIndex={0}
      style={rowStyle}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={() => onSelect(asset.id)}
      onContextMenu={(e) => onContextMenu(e, asset.id)}
      onKeyDown={handleKeyDown}
      aria-selected={isSelected}
    >
      {/* Top line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 64, flexShrink: 0 }}>
          <img
            src={`/storage/${asset.id}/thumbnail.jpg`}
            alt=""
            style={{ width: 64, height: 38, borderRadius: 4, objectFit: 'cover', display: 'block' }}
          />
        </div>
        <div style={{
          flex: 1, minWidth: 0,
          fontSize: 13, fontWeight: 600, color: titleColor,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {asset.title || asset.originalFilename}
        </div>
        <div style={{
          fontSize: 12, fontFamily: 'Fira Code, monospace', color: '#71717a', flexShrink: 0,
        }}>
          {formatDuration(asset.durationSeconds)}
        </div>
      </div>

      {/* Bottom line */}
      <div style={{
        marginTop: 6,
        paddingLeft: 74,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}>
        {hasTitle && (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.12, delay: 0 }}
            style={{
              fontSize: 9, padding: '1px 5px', lineHeight: '16px',
              background: 'rgba(225,29,72,0.12)', border: '1px solid rgba(225,29,72,0.18)',
              borderRadius: 3, color: '#E11D48',
            }}
          >
            Title
          </motion.span>
        )}
        {hasDescription && (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.12, delay: 0.04 }}
            style={{
              fontSize: 9, padding: '1px 5px', lineHeight: '16px',
              background: 'rgba(225,29,72,0.12)', border: '1px solid rgba(225,29,72,0.18)',
              borderRadius: 3, color: '#E11D48',
            }}
          >
            Description
          </motion.span>
        )}
        {hasTranscript && (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.12, delay: 0.08 }}
            style={{
              fontSize: 9, padding: '1px 5px', lineHeight: '16px',
              background: 'rgba(225,29,72,0.12)', border: '1px solid rgba(225,29,72,0.18)',
              borderRadius: 3, color: '#E11D48',
            }}
          >
            Transcript ×{searchResult.transcriptMatch!.matchCount}
          </motion.span>
        )}
        {!titleOnlyMatch && excerptRaw && (
          <span style={{
            fontSize: 11, color: '#71717a',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 320,
          }}>
            {renderHighlight(excerptRaw)}
          </span>
        )}
        {titleOnlyMatch && (
          <span style={{ fontSize: 11, color: '#52525b', fontStyle: 'italic' }}>
            title match
          </span>
        )}
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
            onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(225,29,72,0.18)'; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(225,29,72,0.08)'; }}
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
    </div>
  );
}
