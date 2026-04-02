import { useState } from 'react';
import { FileText, Type, AlignLeft } from 'lucide-react';
import { formatTimecode } from '../../lib/formatters';
import type { SearchResult } from '../../types/asset';

interface SearchContextOverlayProps {
  searchResult: SearchResult;
  assetId: string;
  title: string;
  onSelect?: (id: string) => void;
  onTimecodeClick?: (assetId: string, timestamp: number) => void;
}

function renderHighlightedExcerpt(html: string) {
  const parts = html.split(/(<em>.*?<\/em>)/g);
  return parts.map((part, i) => {
    const match = part.match(/^<em>(.*)<\/em>$/);
    if (match) {
      return (
        <span
          key={i}
          style={{
            background: 'rgba(225,29,72,0.25)',
            color: '#fff',
            padding: '0 2px',
            borderRadius: 2,
          }}
        >
          {match[1]}
        </span>
      );
    }
    return part;
  });
}

export function SearchContextOverlay({
  searchResult,
  assetId,
  title,
  onSelect,
  onTimecodeClick,
}: SearchContextOverlayProps) {
  const [hoveredTimecodeText, setHoveredTimecodeText] = useState<string | null>(null);

  const sr = searchResult;
  const hasTitle = sr.highlights?.title?.length;
  const hasDescription = sr.highlights?.description?.length;
  const hasTranscript = sr.highlights?.transcript?.length || sr.transcriptMatch;

  const transcriptExcerpt = sr.highlights?.transcript?.[0] ?? sr.transcriptMatch?.text;
  const displayExcerpt = hoveredTimecodeText ?? transcriptExcerpt;

  const timecodes: Array<{ timestamp: number; text: string }> = [];
  if (sr.transcriptMatch) {
    timecodes.push({ timestamp: sr.transcriptMatch.timestamp, text: sr.transcriptMatch.text });
  }
  if (sr.transcriptMatches) {
    for (const m of sr.transcriptMatches) {
      if (!timecodes.some(t => t.timestamp === m.timestamp)) {
        timecodes.push({ timestamp: m.timestamp, text: m.text });
      }
    }
  }

  const transcriptCount = sr.transcriptMatch?.matchCount ?? timecodes.length;
  const firstTimestamp = timecodes[0]?.timestamp;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-[5] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end"
      style={{
        background: 'linear-gradient(transparent 0%, rgba(10,10,20,0.8) 20%, rgba(10,10,20,0.95) 100%)',
        padding: '20px 10px 8px',
      }}
    >
      {/* Title */}
      <h3 className="text-xs font-semibold text-white truncate leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] mb-[4px]">
        {title}
      </h3>

      {/* Match source badges */}
      <div className="flex items-center gap-[4px] mb-[3px]">
        {hasTitle && (
          <button
            onClick={(e) => { e.stopPropagation(); onSelect?.(assetId); }}
            className="inline-flex items-center gap-[3px] text-[8px] px-[5px] py-[1px] rounded bg-cta/15 border border-cta/20 text-cta cursor-pointer hover:bg-cta/25 transition-colors"
          >
            <Type size={8} />Title
          </button>
        )}
        {hasDescription && (
          <button
            onClick={(e) => { e.stopPropagation(); onSelect?.(assetId); }}
            className="inline-flex items-center gap-[3px] text-[8px] px-[5px] py-[1px] rounded bg-cta/15 border border-cta/20 text-cta cursor-pointer hover:bg-cta/25 transition-colors"
          >
            <AlignLeft size={8} />Description
          </button>
        )}
        {hasTranscript && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (firstTimestamp != null && onTimecodeClick) {
                onTimecodeClick(assetId, firstTimestamp);
              } else {
                onSelect?.(assetId);
              }
            }}
            className="inline-flex items-center gap-[3px] text-[8px] px-[5px] py-[1px] rounded bg-cta/15 border border-cta/20 text-cta cursor-pointer hover:bg-cta/25 transition-colors"
          >
            <FileText size={8} />Transcript{transcriptCount > 1 ? ` ×${transcriptCount}` : ''}
          </button>
        )}
      </div>

      {/* Transcript excerpt — swaps on timecode hover */}
      {displayExcerpt && (
        <div
          className="text-[10px] leading-[1.4] overflow-hidden mb-[3px] transition-colors duration-100"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            color: hoveredTimecodeText ? '#c4c4c8' : '#a1a1aa',
            fontStyle: 'italic',
          }}
        >
          &ldquo;{renderHighlightedExcerpt(displayExcerpt)}&rdquo;
        </div>
      )}

      {/* Clickable timecodes */}
      {timecodes.length > 0 && onTimecodeClick && (
        <div className="flex items-center gap-[4px] flex-wrap">
          {timecodes.slice(0, 4).map((tc) => (
            <button
              key={tc.timestamp}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTimecodeClick(assetId, tc.timestamp);
              }}
              onMouseOver={() => setHoveredTimecodeText(tc.text)}
              onMouseOut={() => setHoveredTimecodeText(null)}
              className="font-mono text-[9px] text-cta px-[4px] py-[1px] bg-cta/10 border border-cta/15 rounded cursor-pointer hover:bg-cta/25 transition-colors"
              aria-label={`Jump to ${formatTimecode(tc.timestamp)}`}
            >
              {formatTimecode(tc.timestamp)}
            </button>
          ))}
          {timecodes.length > 4 && (
            <span className="text-[8px] text-[#52525b]">+{timecodes.length - 4} more</span>
          )}
        </div>
      )}
    </div>
  );
}
