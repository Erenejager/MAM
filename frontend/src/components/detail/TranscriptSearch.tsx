import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

interface TranscriptSearchProps {
  query: string;
  onQueryChange: (q: string) => void;
  currentMatch: number;
  totalMatches: number;
  onNext: () => void;
  onPrev: () => void;
}

export function TranscriptSearch({
  query,
  onQueryChange,
  currentMatch,
  totalMatches,
  onNext,
  onPrev,
}: TranscriptSearchProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
    }
  };

  return (
    <div className="shrink-0 px-sm py-xs border-b border-glass-border bg-glass">
      <div className="flex items-center gap-[6px] bg-glass border border-glass-border rounded-lg px-sm py-[5px] focus-within:border-cta/40 focus-within:shadow-[0_0_0_3px_rgba(225,29,72,0.1)] transition-colors">
        <Search className="w-3.5 h-3.5 text-text-dim shrink-0" />
        <input
          aria-label="Search transcript"
          placeholder="Search transcript..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="bg-transparent border-none outline-none text-xs text-text placeholder:text-text-dim flex-1 min-w-0 font-sans"
        />
        {query.length > 0 && (
          <div className="flex items-center gap-[4px] shrink-0">
            <span className="text-[10px] text-text-muted font-mono">
              {totalMatches > 0 ? `${currentMatch + 1}/${totalMatches}` : '0/0'}
            </span>
            <button
              type="button"
              aria-label="Previous match"
              onClick={onPrev}
              disabled={totalMatches === 0}
              className="text-text-muted hover:text-text cursor-pointer disabled:opacity-30 disabled:cursor-default p-[1px] rounded-lg bg-glass border border-glass-border hover:bg-glass-hover transition-colors"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Next match"
              onClick={onNext}
              disabled={totalMatches === 0}
              className="text-text-muted hover:text-text cursor-pointer disabled:opacity-30 disabled:cursor-default p-[1px] rounded-lg bg-glass border border-glass-border hover:bg-glass-hover transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onQueryChange('')}
              className="text-text-muted hover:text-text cursor-pointer p-[1px] rounded-lg bg-glass border border-glass-border hover:bg-glass-hover transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
