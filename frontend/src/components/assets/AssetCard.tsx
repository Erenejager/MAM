import { useState, useRef } from 'react';
import { Film } from 'lucide-react';
import { storageUrl } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDuration } from '../../lib/formatters';
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
  const isSearchMode = !!searchResult;

  function handleMouseMove(e: React.MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setSpotlightPos({ x, y });
  }

  return (
    <article
      ref={articleRef}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(asset.id)}
      onContextMenu={(e) => onContextMenu(e, asset.id)}
      onMouseMove={handleMouseMove}
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
          src={storageUrl(`${asset.id}/thumbnail.jpg`)}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-panel flex items-center justify-center">
          <Film size={24} className="text-text-dim" />
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

      {/* Static title at bottom — visible at rest, fades out as overlay takes over */}
      <div className="absolute left-0 right-0 bottom-[6px] px-[10px] z-[4] group-hover:opacity-0 transition-opacity duration-200">
        <h3 className="text-xs font-semibold text-white truncate leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {displayTitle}
        </h3>
      </div>

      {/* Scrub preview — available in both browse and search modes, includes title in overlay */}
      <ScrubPreview
        asset={asset}
        containerRef={articleRef}
        title={!isSearchMode ? displayTitle : undefined}
      />

      {/* Search mode: context overlay */}
      {isSearchMode && searchResult && (
        <SearchContextOverlay
          searchResult={searchResult}
          assetId={asset.id}
          title={asset.title || asset.originalFilename}
          onSelect={onSelect}
          onTimecodeClick={onTimecodeClick}
        />
      )}
    </article>
  );
}
