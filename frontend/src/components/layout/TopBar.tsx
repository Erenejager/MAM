import { Film } from 'lucide-react';
import { SearchInput } from './SearchInput';

interface TopBarProps {
  onSearch: (query: string) => void;
  onClear: (query?: string) => void;
  searchQuery: string;
  searchUnavailable?: boolean;
  onNavigate?: (view: 'library' | 'settings' | 'import') => void;
  activeView?: 'library' | 'settings' | 'import';
}

export function TopBar({ onSearch, onClear, searchQuery, searchUnavailable, onNavigate: _onNavigate, activeView: _activeView }: TopBarProps) {
  return (
    <div>
      <header className="h-12 bg-panel border-b border-border flex items-center px-4 gap-4 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <Film className="w-5 h-5 text-cta" />
          <h1 className="font-mono font-semibold text-text text-lg">MAM</h1>
        </div>
        <SearchInput onSearch={onSearch} onClear={onClear} initialValue={searchQuery} />
      </header>
      {searchUnavailable && (
        <div className="bg-amber-500/20 text-amber-200 text-xs text-center py-1">
          Search unavailable -- showing all videos
        </div>
      )}
    </div>
  );
}
