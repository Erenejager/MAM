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
    <div className="sticky top-0 z-10 bg-panel pb-2 px-4 pt-2">
      <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-4 py-2 focus-within:border-cta focus-within:shadow-[0_0_0_3px_rgba(225,29,72,0.15)] transition-colors">
        <Search className="w-4 h-4 text-text-muted shrink-0" />
        <input
          aria-label="Search transcript"
          placeholder="Search transcript..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="bg-transparent border-none outline-none text-sm text-text placeholder:text-text-muted flex-1 min-w-0 font-sans"
        />
        {query.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-text-muted font-mono">
              {totalMatches > 0 ? `${currentMatch + 1} of ${totalMatches}` : 'No matches'}
            </span>
            <button
              type="button"
              aria-label="Previous match"
              onClick={onPrev}
              disabled={totalMatches === 0}
              className="text-text-muted hover:text-text cursor-pointer disabled:opacity-40 disabled:cursor-default"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Next match"
              onClick={onNext}
              disabled={totalMatches === 0}
              className="text-text-muted hover:text-text cursor-pointer disabled:opacity-40 disabled:cursor-default"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onQueryChange('')}
              className="text-text-muted hover:text-text cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
