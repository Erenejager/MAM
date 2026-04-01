import { useState, useRef, useCallback } from 'react';
import { Film } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatDuration, formatTimecode } from '../../lib/formatters';
import { StatusBadge } from './StatusBadge';
import { ScrubPreview } from './ScrubPreview';
import { SearchContextOverlay } from './SearchContextOverlay';
import type { Asset, SearchResult } from '../../types/asset';

interface AssetCardProps {
  asset: Asset;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  searchResult?: SearchResult;
  onTimecodeClick?: (assetId: string, timestamp: number) => void;
}

function renderHighlight(html: string) {
  const parts = html.split(/(<em>.*?<\/em>)/g);
  return parts.map((part, i) => {
    const match = part.match(/^<em>(.*)<\/em>$/);
    if (match) {
      return (
        <mark key={i} className="bg-cta/25 text-text rounded-sm px-[2px]">
          {match[1]}
        </mark>
      );
    }
    return part;
  });
}

export function AssetCard({
  asset,
  isSelected,
  onSelect,
  onContextMenu,
  searchResult,
  onTimecodeClick,
}: AssetCardProps) {
  const titleHighlight = searchResult?.highlights?.title?.[0];
  const displayTitle = titleHighlight
    ? renderHighlight(titleHighlight)
    : asset.title || asset.originalFilename;

  const [spotlightPos, setSpotlightPos] = useState({ x: 50, y: 50 });
  const articleRef = useRef<HTMLElement>(null);
  const [searchFrameSrc, setSearchFrameSrc] = useState<string | null>(null);
  const isSearchMode = !!searchResult;

  function handleMouseMove(e: React.MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setSpotlightPos({ x, y });
  }

  const handleMouseEnter = useCallback(() => {
    if (isSearchMode && searchResult?.transcriptMatch?.timestamp != null) {
      const t = Math.round(searchResult.transcriptMatch.timestamp);
      setSearchFrameSrc(`/api/assets/${asset.id}/frame?t=${t}`);
    }
  }, [isSearchMode, searchResult, asset.id]);

  const handleMouseLeave = useCallback(() => {
    setSearchFrameSrc(null);
  }, []);

  return (
    <article
      ref={articleRef}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(asset.id)}
      onContextMenu={(e) => onContextMenu(e, asset.id)}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(asset.id);
        }
      }}
      className={cn(
        'group relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200',
        'aspect-video border',
        isSelected
          ? 'border-cta/40 shadow-[0_0_0_1px_rgba(225,29,72,0.2),0_0_20px_rgba(225,29,72,0.15),0_12px_40px_rgba(225,29,72,0.1)]'
          : 'border-glass-border bg-panel hover:border-[rgba(255,255,255,0.15)] hover:-translate-y-[3px] hover:scale-[1.01] hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)]'
      )}
      aria-selected={isSelected}
    >
      {/* Spotlight overlay */}
      <div
        className="absolute inset-0 z-[3] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(circle at ${spotlightPos.x}% ${spotlightPos.y}%, rgba(255,255,255,0.06) 0%, transparent 60%)`,
        }}
      />

      {/* Thumbnail or placeholder */}
      {asset.thumbnailPath ? (
        <img
          src={`/storage/${asset.id}/thumbnail.jpg`}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-panel flex items-center justify-center">
          <Film size={24} className="text-text-dim" />
        </div>
      )}

      {/* Search mode: frame at match timestamp */}
      {searchFrameSrc && (
        <img
          src={searchFrameSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover z-[1] opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        />
      )}

      {/* Search mode: timestamp badge */}
      {searchFrameSrc && searchResult?.transcriptMatch?.timestamp != null && (
        <div
          className="absolute top-xs left-xs z-[4] opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded px-[6px] py-[1px] font-mono text-[9px] text-white font-semibold"
          style={{ background: 'rgba(225,29,72,0.9)' }}
        >
          @ {formatTimecode(searchResult.transcriptMatch.timestamp)}
        </div>
      )}

      {/* Default bottom gradient — fades out on hover as metadata overlay takes over */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent group-hover:opacity-0 transition-opacity duration-200" />

      {/* Top-left: status badge (compact) */}
      <div className="absolute top-xs left-xs">
        <StatusBadge
          status={asset.status}
          transcriptionStatus={asset.transcriptionStatus}
        />
      </div>

      {/* Duration badge - top right */}
      {asset.durationSeconds && (
        <div className="absolute top-xs right-xs bg-black/70 glass-blur-sm border border-[rgba(255,255,255,0.08)] rounded px-xs py-0 text-[10px] font-mono text-text-muted leading-relaxed">
          {formatDuration(asset.durationSeconds)}
        </div>
      )}

      {/* Bottom: title — slides up into metadata overlay position on hover */}
      <div className="absolute left-0 right-0 px-sm z-[6] transition-all duration-200 bottom-[4px] group-hover:bottom-[38%]">
        <h3 className="text-xs font-semibold text-white truncate leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {displayTitle}
        </h3>
      </div>

      {/* Browse mode: scrub preview */}
      {!isSearchMode && (
        <ScrubPreview asset={asset} containerRef={articleRef} />
      )}

      {/* Search mode: context overlay */}
      {isSearchMode && searchResult && (
        <SearchContextOverlay
          searchResult={searchResult}
          assetId={asset.id}
          onTimecodeClick={onTimecodeClick}
        />
      )}
    </article>
  );
}
