import { FileText, Type, AlignLeft } from 'lucide-react';
import { formatTimecode } from '../../lib/formatters';
import type { SearchResult } from '../../types/asset';

interface SearchContextOverlayProps {
  searchResult: SearchResult;
  assetId: string;
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
  onTimecodeClick,
}: SearchContextOverlayProps) {
  const sr = searchResult;
  const hasTitle = sr.highlights?.title?.length;
  const hasDescription = sr.highlights?.description?.length;
  const hasTranscript = sr.highlights?.transcript?.length || sr.transcriptMatch;

  const transcriptExcerpt = sr.highlights?.transcript?.[0] ?? sr.transcriptMatch?.text;

  const timecodes: Array<{ timestamp: number }> = [];
  if (sr.transcriptMatch) {
    timecodes.push({ timestamp: sr.transcriptMatch.timestamp });
  }
  if (sr.transcriptMatches) {
    for (const m of sr.transcriptMatches) {
      if (!timecodes.some(t => t.timestamp === m.timestamp)) {
        timecodes.push({ timestamp: m.timestamp });
      }
    }
  }

  const transcriptCount = sr.transcriptMatch?.matchCount ?? timecodes.length;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-[3] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col gap-[4px]"
      style={{
        background: 'linear-gradient(transparent 0%, rgba(10,10,20,0.7) 25%, rgba(10,10,20,0.92) 100%)',
        padding: '28px 10px 10px',
      }}
    >
      {/* Match source badges */}
      <div className="flex items-center gap-[4px]">
        <span className="text-[8px] text-[#52525b] uppercase tracking-[0.5px]">Match in</span>
        {hasTitle && (
          <span className="inline-flex items-center gap-[3px] text-[8px] px-[5px] py-[1px] rounded bg-cta/15 border border-cta/20 text-cta">
            <Type size={8} />Title
          </span>
        )}
        {hasDescription && (
          <span className="inline-flex items-center gap-[3px] text-[8px] px-[5px] py-[1px] rounded bg-cta/15 border border-cta/20 text-cta">
            <AlignLeft size={8} />Description
          </span>
        )}
        {hasTranscript && (
          <span className="inline-flex items-center gap-[3px] text-[8px] px-[5px] py-[1px] rounded bg-cta/15 border border-cta/20 text-cta">
            <FileText size={8} />Transcript{transcriptCount > 1 ? ` \u00D7${transcriptCount}` : ''}
          </span>
        )}
      </div>

      {/* Transcript excerpt */}
      {transcriptExcerpt && (
        <div
          className="text-[10px] text-[#e4e4e7] leading-[1.4] overflow-hidden"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
        >
          &ldquo;{renderHighlightedExcerpt(transcriptExcerpt)}&rdquo;
        </div>
      )}

      {/* Clickable timecodes */}
      {timecodes.length > 0 && onTimecodeClick && (
        <div className="flex items-center gap-[4px] flex-wrap">
          {timecodes.slice(0, 4).map((tc, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTimecodeClick(assetId, tc.timestamp);
              }}
              className="font-mono text-[9px] text-cta px-[4px] py-[1px] bg-cta/10 rounded cursor-pointer hover:bg-cta/20 transition-colors"
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
