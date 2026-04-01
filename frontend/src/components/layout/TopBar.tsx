import { Search, LayoutGrid, ArrowDownNarrowWide } from 'lucide-react';
import { FilterBar } from './FilterBar';

interface TopBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  searchQuery: string;
  searchUnavailable?: boolean;
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  onOpenCommandPalette: () => void;
  viewTitle: string;
}

export function TopBar({
  searchQuery,
  searchUnavailable,
  selectedTags,
  onToggleTag,
  onClearTags,
  onOpenCommandPalette,
  viewTitle,
}: TopBarProps) {
  return (
    <div className="shrink-0">
      {searchUnavailable && (
        <div className="px-md py-xs bg-cta/10 border-b border-cta/20 text-center text-xs text-cta">
          Search service unavailable — results limited to local database
        </div>
      )}
      <header className="h-[52px] bg-[rgba(15,15,30,0.5)] glass-blur-xl border-b border-glass-border flex items-center px-xl gap-sm">
        <span className="font-mono text-[13px] font-semibold text-text tracking-[0.5px]">
          {viewTitle}
        </span>
        <button
          onClick={onOpenCommandPalette}
          className="flex-1 max-w-[420px] py-[7px] px-sm bg-glass border border-glass-border rounded-[10px] text-xs text-text-dim flex items-center gap-sm cursor-pointer transition-all duration-200 hover:bg-glass-hover hover:border-border-hover glass-blur"
        >
          <Search size={14} className="opacity-50" />
          {searchQuery || 'Search assets...'}
          <span className="ml-auto py-[2px] px-[6px] bg-glass-hover rounded text-[10px] font-mono text-text-dim">
            ⌘K
          </span>
        </button>
        <div className="ml-auto flex gap-xs">
          <button className="w-[32px] h-[32px] rounded bg-glass border border-glass-border flex items-center justify-center text-text-muted hover:bg-glass-hover hover:text-text transition-all duration-200">
            <LayoutGrid size={15} />
          </button>
          <button className="w-[32px] h-[32px] rounded bg-glass border border-glass-border flex items-center justify-center text-text-muted hover:bg-glass-hover hover:text-text transition-all duration-200">
            <ArrowDownNarrowWide size={15} />
          </button>
        </div>
      </header>
      {selectedTags.length > 0 && (
        <FilterBar selectedTags={selectedTags} onToggleTag={onToggleTag} onClearTags={onClearTags} />
      )}
    </div>
  );
}
