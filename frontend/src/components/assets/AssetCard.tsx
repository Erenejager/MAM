import { Film } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { Asset } from '../../types/asset';
import { formatDuration, formatFileSize, formatDate } from '../../lib/formatters';
import { StatusBadge } from './StatusBadge';

interface AssetCardProps {
  asset: Asset;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
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

export function AssetCard({ asset, isSelected, onSelect, onContextMenu }: AssetCardProps) {
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

  return (
    <div
      className={cn(
        'flex bg-panel rounded-lg border cursor-pointer transition-colors duration-200',
        isSelected
          ? 'border-cta/50'
          : 'border-border hover:border-border-hover'
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
        <h3 className="text-text font-semibold text-sm truncate">{title}</h3>

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
          <div className="flex flex-wrap gap-1 max-h-[3.25rem] overflow-hidden">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex text-xs px-2 py-0.5 rounded-full bg-background/50 text-text-muted border border-border"
              >
                {tag}
              </span>
            ))}
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
      </div>
    </div>
  );
}
