import { Film } from 'lucide-react';
import { SearchInput } from './SearchInput';

interface TopBarProps {
  onSearch: (query: string) => void;
  onClearSearch: () => void;
  searchQuery: string;
  searchUnavailable?: boolean;
}

export function TopBar({ onSearch, onClearSearch, searchQuery, searchUnavailable }: TopBarProps) {
  return (
    <div>
      <header className="h-12 bg-panel border-b border-border flex items-center px-4 gap-4 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <Film className="w-5 h-5 text-cta" />
          <h1 className="font-mono font-semibold text-text text-lg">MAM</h1>
        </div>
        <SearchInput onSearch={onSearch} onClear={onClearSearch} initialValue={searchQuery} />
      </header>
      {searchUnavailable && (
        <div className="bg-amber-500/20 text-amber-200 text-xs text-center py-1">
          Search unavailable -- showing all videos
        </div>
      )}
    </div>
  );
}
