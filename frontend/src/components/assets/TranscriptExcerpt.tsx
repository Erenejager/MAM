import React from 'react';
import { formatTimecode } from '../../lib/formatters';

interface TranscriptExcerptProps {
  text: string;           // highlight fragment with <em> tags from OpenSearch
  timestamp: number;      // seconds
  matchCount: number;     // total matches for badge
  onTimecodeClick: (timestamp: number) => void;
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

export function TranscriptExcerpt({ text, timestamp, matchCount, onTimecodeClick }: TranscriptExcerptProps) {
  return (
    <div className="mt-2 pt-2 border-t border-border">
      <p className="text-xs text-text-muted italic">
        &ldquo;...{renderHighlight(text)}...&rdquo;
      </p>
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTimecodeClick(timestamp);
          }}
          className="text-xs text-cta hover:text-cta/80 font-mono cursor-pointer"
        >
          {formatTimecode(timestamp)}
        </button>
        {matchCount > 1 && (
          <span className="text-xs text-text-muted">
            {matchCount} matches
          </span>
        )}
      </div>
    </div>
  );
}
