import { Film } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatDuration, formatFileSize } from '../../lib/formatters';
import { StatusBadge } from './StatusBadge';
import { TranscriptExcerpt } from './TranscriptExcerpt';
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
  const tags: string[] = asset.tags ? JSON.parse(asset.tags) : [];
  const titleHighlight = searchResult?.highlights?.title?.[0];
  const displayTitle = titleHighlight
    ? renderHighlight(titleHighlight)
    : asset.title || asset.originalFilename;

  const meta: string[] = [];
  if (asset.durationSeconds) meta.push(formatDuration(asset.durationSeconds));
  if (asset.fileSize) meta.push(formatFileSize(asset.fileSize));
  if (asset.codec && asset.width && asset.height) {
    meta.push(`${asset.codec.toUpperCase()} ${asset.width}x${asset.height}`);
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onSelect(asset.id)}
      onContextMenu={(e) => onContextMenu(e, asset.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(asset.id);
        }
      }}
      className={cn(
        'group relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200',
        'aspect-video',
        isSelected
          ? 'ring-1 ring-cta/40'
          : 'hover:scale-[1.01] hover:shadow-card-hover'
      )}
      style={
        isSelected
          ? {
              background: 'linear-gradient(135deg, rgba(225,29,72,0.08), transparent, rgba(225,29,72,0.04))',
              backgroundSize: '300% 300%',
              animation: 'border-shimmer 3s linear infinite, glow-pulse 2s ease-in-out infinite',
            }
          : undefined
      }
      aria-selected={isSelected}
    >
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
          <Film size={32} className="text-text-dim" />
        </div>
      )}

      {/* Gradient overlay - bottom fade for readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Top-left: status badge */}
      <div className="absolute top-sm left-sm">
        <StatusBadge
          status={asset.status}
          transcriptionStatus={asset.transcriptionStatus}
        />
      </div>

      {/* Top-right: tags with frosted glass */}
      {tags.length > 0 && (
        <div className="absolute top-sm right-sm flex gap-xs flex-wrap justify-end max-w-[60%]">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-xs py-0 rounded bg-black/40 backdrop-blur-sm text-text-muted border border-border"
            >
              {tag}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="text-[10px] px-xs py-0 rounded bg-black/40 backdrop-blur-sm text-text-dim">
              +{tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Bottom overlay: title + metadata */}
      <div className="absolute bottom-0 left-0 right-0 p-sm">
        <h3 className="text-sm font-semibold text-white truncate leading-tight">
          {displayTitle}
        </h3>
        {meta.length > 0 && (
          <p className="text-[11px] text-text-muted mt-0 truncate">
            {meta.join(' \u00B7 ')}
          </p>
        )}
      </div>

      {/* Duration badge - bottom right */}
      {asset.durationSeconds && (
        <div className="absolute bottom-sm right-sm bg-black/70 rounded px-xs py-0 text-[10px] font-mono text-text-muted">
          {formatDuration(asset.durationSeconds)}
        </div>
      )}

      {/* Transcript excerpt (shown below card when searching) */}
      {searchResult?.transcriptMatch && onTimecodeClick && (
        <div className="absolute -bottom-0 left-0 right-0 translate-y-full pt-xs">
          <TranscriptExcerpt
            text={searchResult.transcriptMatch.text}
            timestamp={searchResult.transcriptMatch.timestamp}
            matchCount={searchResult.transcriptMatches?.length ?? 1}
            matches={searchResult.transcriptMatches}
            onTimecodeClick={(ts) => onTimecodeClick(asset.id, ts)}
          />
        </div>
      )}
    </article>
  );
}
