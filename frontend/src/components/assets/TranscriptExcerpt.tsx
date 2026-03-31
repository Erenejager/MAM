import { formatTimecode } from '../../lib/formatters';
import type { SearchTranscriptMatchItem } from '../../types/asset';

interface TranscriptExcerptProps {
  text: string;
  timestamp: number;
  matchCount: number;
  matches?: SearchTranscriptMatchItem[];
  onTimecodeClick: (timestamp: number) => void;
}

function renderExcerpt(html: string) {
  const parts = html.split(/(<em>.*?<\/em>)/g);
  return parts.map((part, i) => {
    const match = part.match(/^<em>(.*)<\/em>$/);
    if (match) {
      return (
        <mark key={i} className="bg-amber-500/30 text-amber-200 rounded-sm px-[2px]">
          {match[1]}
        </mark>
      );
    }
    return part;
  });
}

export function TranscriptExcerpt({
  text,
  timestamp,
  matchCount,
  matches,
  onTimecodeClick,
}: TranscriptExcerptProps) {
  const allMatches = matches && matches.length > 0 ? matches : [{ text, timestamp }];

  return (
    <div className="bg-panel/80 backdrop-blur-sm rounded px-sm py-xs border border-border">
      <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">
        {renderExcerpt(allMatches[0].text)}
      </p>
      <div className="flex items-center gap-xs mt-xs flex-wrap">
        {allMatches.slice(0, 3).map((m, i) => (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTimecodeClick(m.timestamp);
            }}
            className="text-[10px] font-mono text-cta hover:text-cta-hover transition-colors"
          >
            {formatTimecode(m.timestamp)}
          </button>
        ))}
        {matchCount > 3 && (
          <span className="text-[10px] text-text-dim">
            +{matchCount - 3} more
          </span>
        )}
      </div>
    </div>
  );
}
