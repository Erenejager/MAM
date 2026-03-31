import { Upload, SlidersHorizontal, Settings } from 'lucide-react';
import { Logo } from './Logo';
import { SearchInput } from './SearchInput';
import { cn } from '../../lib/cn';

interface TopBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  searchQuery: string;
  searchUnavailable?: boolean;
  onNavigate: (target: 'library' | 'settings' | 'import') => void;
  activeView: 'library' | 'settings' | 'import';
}

export function TopBar({
  onSearch,
  onClear,
  searchQuery,
  searchUnavailable,
  onNavigate,
  activeView,
}: TopBarProps) {
  return (
    <header className="flex items-center gap-lg px-lg py-sm border-b border-border bg-panel/60 backdrop-blur-sm">
      {/* Logo - left */}
      <div
        className="shrink-0 cursor-pointer pb-sm"
        onClick={() => onNavigate('library')}
      >
        <Logo />
      </div>

      {/* Search - center, flex-1 */}
      <div className="flex-1 flex justify-center max-w-xl mx-auto">
        <SearchInput
          onSearch={onSearch}
          onClear={onClear}
          initialValue={searchQuery}
        />
      </div>

      {/* Icon actions - right */}
      <div className="shrink-0 flex items-center gap-sm">
        <button
          onClick={() => onNavigate('import')}
          className={cn(
            'p-sm rounded transition-colors',
            activeView === 'import'
              ? 'bg-cta text-white'
              : 'text-text-muted hover:text-text hover:bg-panel-light'
          )}
          aria-label="Upload"
          title="Upload"
        >
          <Upload size={18} />
        </button>
        <button
          className="p-sm rounded text-text-muted hover:text-text hover:bg-panel-light transition-colors"
          aria-label="Filters"
          title="Filters"
        >
          <SlidersHorizontal size={18} />
        </button>
        <button
          onClick={() => onNavigate('settings')}
          className={cn(
            'p-sm rounded transition-colors',
            activeView === 'settings'
              ? 'bg-cta text-white'
              : 'text-text-muted hover:text-text hover:bg-panel-light'
          )}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Search unavailable banner */}
      {searchUnavailable && (
        <div className="absolute top-full left-0 right-0 bg-amber-900/30 text-amber-200 text-xs text-center py-xs px-md border-b border-amber-800/30">
          Search unavailable — showing all assets
        </div>
      )}
    </header>
  );
}
