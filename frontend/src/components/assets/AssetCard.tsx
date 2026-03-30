import React from 'react';
import { Film } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { Asset, SearchResult } from '../../types/asset';
import { formatDuration, formatFileSize, formatDate } from '../../lib/formatters';
import { StatusBadge } from './StatusBadge';
import { TranscriptExcerpt } from './TranscriptExcerpt';

interface AssetCardProps {
  asset: Asset;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  searchResult?: SearchResult;
  onTimecodeClick?: (assetId: string, timestamp: number) => void;
}

function formatResolution(height: number | null): string {
  if (!height) return '';
  if (height >= 2160) return '4K';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  return `${height}p`;
}

function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderHighlight(text: string): React.ReactNode {
  const parts = text.split(/(<em>.*?<\/em>)/);
  return parts.map((part, i) => {
    const match = part.match(/^<em>(.*?)<\/em>$/);
    if (match) {
      return (
        <mark key={i} className="bg-amber-500/30 text-amber-200 rounded-sm px-0.5">
          {match[1]}
        </mark>
      );
    }
    return part;
  });
}

export function AssetCard({ asset, isSelected, onSelect, onContextMenu, searchResult, onTimecodeClick }: AssetCardProps) {
  const tags = parseTags(asset.tags);
  const title = asset.title || asset.originalFilename;

  const codecResolution = [
    asset.codec ?? '',
    formatResolution(asset.height),
  ]
    .filter(Boolean)
    .join(' ');

  const metaParts = [
    formatDuration(asset.durationSeconds),
    formatFileSize(asset.fileSize),
    codecResolution || null,
  ].filter(Boolean);

  const titleHighlight = searchResult?.highlights?.title?.[0];
  const descHighlight = searchResult?.highlights?.description?.[0];
  // Check if a tag is highlighted by looking for it in title/description highlights
  function isTagHighlighted(tag: string): boolean {
    const allHighlights = [
      ...(searchResult?.highlights?.title ?? []),
      ...(searchResult?.highlights?.description ?? []),
    ];
    const lowerTag = tag.toLowerCase();
    return allHighlights.some(h => {
      const plain = h.replace(/<\/?em>/g, '').toLowerCase();
      return plain.includes(lowerTag);
    });
  }

  return (
    <div
      className={cn(
        'flex bg-panel rounded-lg border cursor-pointer transition-colors duration-200',
        isSelected
          ? 'border-cta shadow-accent'
          : 'border-border hover:border-border-hover hover:shadow-md'
      )}
      onClick={() => onSelect(asset.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, asset.id);
      }}
    >
      {/* Thumbnail */}
      <div className="w-[260px] shrink-0 aspect-video bg-background rounded-l-lg overflow-hidden">
        {asset.thumbnailPath ? (
          <img
            src={`/storage/${asset.id}/thumbnail.jpg`}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-8 h-8 text-text-muted" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 p-3 flex flex-col gap-1 min-w-0">
        {/* Row 1: Title */}
        <h3 className="text-text font-semibold text-sm truncate">
          {titleHighlight ? renderHighlight(titleHighlight) : title}
        </h3>

        {/* Row 1b: Description highlight (only when searching) */}
        {descHighlight && (
          <p className="text-xs text-text-muted truncate">
            {renderHighlight(descHighlight)}
          </p>
        )}

        {/* Row 2: Metadata */}
        <p className="text-xs text-text-muted truncate">
          {metaParts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1">{'\u00B7'}</span>}
              {part}
            </span>
          ))}
        </p>

        {/* Row 3: Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className={cn(
                  'inline-flex text-xs px-2 py-0.5 rounded-full border',
                  isTagHighlighted(tag)
                    ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                    : 'bg-background/50 text-text-muted border-border'
                )}
              >
                {tag}
              </span>
            ))}
            {tags.length > 6 && (
              <span className="inline-flex text-xs px-2 py-0.5 rounded-full text-text-muted">
                +{tags.length - 6}
              </span>
            )}
          </div>
        )}

        {/* Row 4: Date + Status */}
        <div className="flex justify-between items-center mt-auto">
          <span className="text-xs text-text-muted">{formatDate(asset.createdAt)}</span>
          <StatusBadge
            status={asset.status}
            transcriptionStatus={asset.transcriptionStatus}
          />
        </div>

        {/* Transcript excerpt (search only) */}
        {searchResult?.transcriptMatch && (
          <TranscriptExcerpt
            text={searchResult.transcriptMatch.text}
            timestamp={searchResult.transcriptMatch.timestamp}
            matchCount={searchResult.transcriptMatch.matchCount}
            onTimecodeClick={(ts) => onTimecodeClick?.(asset.id, ts)}
          />
        )}
      </div>
    </div>
  );
}
