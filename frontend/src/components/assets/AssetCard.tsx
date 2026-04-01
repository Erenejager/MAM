import { useState, useRef } from 'react';
import { Film, FileText, Type, AlignLeft } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatDuration, formatFileSize, formatTimecode } from '../../lib/formatters';
import { StatusBadge } from './StatusBadge';
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

/** Derive which fields the search matched on */
function getMatchSources(sr?: SearchResult) {
  if (!sr) return [];
  const sources: { label: string; icon: typeof Type }[] = [];
  if (sr.highlights?.title?.length) sources.push({ label: 'Title', icon: Type });
  if (sr.highlights?.description?.length) sources.push({ label: 'Description', icon: AlignLeft });
  if (sr.highlights?.transcript?.length || sr.transcriptMatch)
    sources.push({ label: 'Transcript', icon: FileText });
  return sources;
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

  const matchSources = getMatchSources(searchResult);
  const transcriptMatches = searchResult?.transcriptMatches;
  const hasTimecodes =
    (transcriptMatches && transcriptMatches.length > 0) || searchResult?.transcriptMatch;

  const [spotlightPos, setSpotlightPos] = useState({ x: 50, y: 50 });
  const articleRef = useRef<HTMLElement>(null);

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

      {/* Default bottom gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

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

      {/* Bottom: title only (compact) */}
      <div className="absolute bottom-0 left-0 right-0 px-sm pb-xs">
        <h3 className="text-xs font-semibold text-white truncate leading-tight">
          {displayTitle}
        </h3>
      </div>

      {/* ── Hover overlay: metadata preview ── */}
      <div className="absolute inset-0 z-[2] bg-[rgba(15,15,30,0.85)] glass-blur opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-sm">
        {/* Top section: title + meta */}
        <div className="space-y-[4px]">
          <h3 className="text-xs font-semibold text-text truncate leading-tight">
            {displayTitle}
          </h3>
          <div className="flex flex-wrap gap-x-sm gap-y-0 text-[10px] text-text-muted">
            {asset.codec && (
              <span>{asset.codec.toUpperCase()}</span>
            )}
            {asset.width && asset.height && (
              <span>{asset.width}x{asset.height}</span>
            )}
            {asset.fileSize && (
              <span>{formatFileSize(asset.fileSize)}</span>
            )}
            {asset.durationSeconds && (
              <span>{formatDuration(asset.durationSeconds)}</span>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex gap-xs flex-wrap pt-[2px]">
              {tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="text-[9px] px-xs py-0 rounded bg-panel/80 text-text-muted border border-[rgba(255,255,255,0.08)] glass-blur-sm leading-relaxed"
                >
                  {tag}
                </span>
              ))}
              {tags.length > 4 && (
                <span className="text-[9px] text-text-dim">+{tags.length - 4}</span>
              )}
            </div>
          )}
        </div>

        {/* Bottom section: search match info */}
        <div className="space-y-[4px]">
          {/* Match source badges */}
          {matchSources.length > 0 && (
            <div className="flex items-center gap-xs flex-wrap">
              <span className="text-[9px] text-text-dim uppercase tracking-wider">Match in</span>
              {matchSources.map((src) => (
                <span
                  key={src.label}
                  className="inline-flex items-center gap-[3px] text-[9px] px-xs py-0 rounded bg-cta/15 text-cta border border-cta/20 leading-relaxed"
                >
                  <src.icon size={9} />
                  {src.label}
                </span>
              ))}
            </div>
          )}

          {/* Transcript timecodes on hover */}
          {hasTimecodes && onTimecodeClick && (
            <div className="flex items-center gap-xs flex-wrap">
              {(transcriptMatches ?? [{ text: searchResult!.transcriptMatch!.text, timestamp: searchResult!.transcriptMatch!.timestamp }])
                .slice(0, 4)
                .map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTimecodeClick(asset.id, m.timestamp);
                    }}
                    className="text-[10px] font-mono text-cta hover:text-cta-hover hover:bg-cta/10 px-xs py-0 rounded transition-colors leading-relaxed"
                  >
                    {formatTimecode(m.timestamp)}
                  </button>
                ))}
              {(searchResult?.transcriptMatch?.matchCount ?? 0) > 4 && (
                <span className="text-[9px] text-text-dim">
                  +{(searchResult?.transcriptMatch?.matchCount ?? 0) - 4} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
