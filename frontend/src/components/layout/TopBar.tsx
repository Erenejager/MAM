import { useState, useRef, useEffect } from 'react';
import { Search, LayoutGrid, ArrowDownNarrowWide, X, Upload, Settings, Video } from 'lucide-react';
import { FilterBar } from './FilterBar';
import { useAssets } from '../../hooks/useAssets';

interface TopBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  searchQuery: string;
  searchUnavailable?: boolean;
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  onSelectAsset: (id: string) => void;
  onNavigate: (view: 'library' | 'import' | 'settings') => void;
  viewTitle: string;
}

export function TopBar({
  onSearch,
  onClear,
  searchQuery,
  searchUnavailable,
  selectedTags,
  onToggleTag,
  onClearTags,
  onSelectAsset,
  onNavigate,
  viewTitle,
}: TopBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: assets } = useAssets();

  // Sync external searchQuery into inputValue
  useEffect(() => { setInputValue(searchQuery); }, [searchQuery]);

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setExpanded(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Click outside to close
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [expanded]);

  const handleExpand = () => {
    setExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSearch(inputValue.trim());
    }
    setExpanded(false);
  };

  const handleClear = () => {
    setInputValue('');
    onClear();
    inputRef.current?.focus();
  };

  const handleSelectAsset = (id: string) => {
    setExpanded(false);
    onSelectAsset(id);
  };

  const handleAction = (action: () => void) => {
    setExpanded(false);
    action();
  };

  // Filter assets by input for suggestions
  const suggestions = expanded && assets
    ? assets.filter((a) => {
        if (!inputValue.trim()) return true; // show all when empty
        const q = inputValue.toLowerCase();
        return (a.title || a.originalFilename).toLowerCase().includes(q);
      }).slice(0, 6)
    : [];

  const showDropdown = expanded;

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

        {/* Search bar with inline expand */}
        <div ref={containerRef} className="flex-1 max-w-[480px] relative">
          {!expanded ? (
            /* Collapsed trigger */
            <button
              onClick={handleExpand}
              className="w-full py-[7px] px-sm bg-glass border border-glass-border rounded-[10px] text-xs text-text-dim flex items-center gap-sm cursor-pointer transition-all duration-200 hover:bg-glass-hover hover:border-border-hover glass-blur"
            >
              <Search size={14} className="opacity-50" />
              {searchQuery || 'Search assets...'}
              <span className="ml-auto py-[2px] px-[6px] bg-glass-hover rounded text-[10px] font-mono text-text-dim">
                Ctrl K
              </span>
            </button>
          ) : (
            /* Expanded input + dropdown */
            <div className="relative">
              <form onSubmit={handleSubmit}>
                <div className="flex items-center gap-sm py-[7px] px-sm bg-glass-strong border border-cta/30 rounded-t-[10px] rounded-b-none glass-blur shadow-[0_0_0_3px_rgba(225,29,72,0.08)]">
                  <Search size={14} className="text-cta opacity-70 shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setExpanded(false); }}
                    placeholder="Search assets, tags, actions..."
                    className="flex-1 bg-transparent text-xs text-text outline-none placeholder:text-text-dim"
                  />
                  {inputValue && (
                    <button type="button" onClick={handleClear} className="text-text-dim hover:text-text transition-colors">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </form>

              {/* Inline dropdown */}
              {showDropdown && (
                <div className="absolute left-0 right-0 top-full bg-[rgba(15,15,30,0.95)] glass-blur-xl border border-t-0 border-cta/20 rounded-b-[10px] shadow-lg overflow-hidden z-50 max-h-[320px] overflow-y-auto">
                  {/* Actions */}
                  <div className="px-sm pt-sm pb-xs">
                    <div className="text-[9px] font-semibold text-text-dim uppercase tracking-wider mb-xs">Actions</div>
                    <button
                      onClick={() => handleAction(() => onNavigate('import'))}
                      className="w-full flex items-center gap-sm px-sm py-xs text-xs text-text-muted hover:bg-glass-hover hover:text-text rounded-md transition-colors"
                    >
                      <Upload size={13} className="opacity-50" />
                      Import new video
                    </button>
                    {inputValue.trim() && (
                      <button
                        onClick={() => { onSearch(inputValue.trim()); setExpanded(false); }}
                        className="w-full flex items-center gap-sm px-sm py-xs text-xs text-cta hover:bg-cta/10 rounded-md transition-colors"
                      >
                        <Search size={13} className="opacity-50" />
                        Search for "{inputValue.trim()}"
                      </button>
                    )}
                    <button
                      onClick={() => handleAction(() => onNavigate('settings'))}
                      className="w-full flex items-center gap-sm px-sm py-xs text-xs text-text-muted hover:bg-glass-hover hover:text-text rounded-md transition-colors"
                    >
                      <Settings size={13} className="opacity-50" />
                      Settings
                    </button>
                  </div>

                  {/* Asset suggestions */}
                  {suggestions.length > 0 && (
                    <div className="px-sm pb-sm border-t border-glass-border mt-xs pt-sm">
                      <div className="text-[9px] font-semibold text-text-dim uppercase tracking-wider mb-xs">
                        {inputValue.trim() ? 'Matching assets' : 'Recent assets'}
                      </div>
                      {suggestions.map((asset) => (
                        <button
                          key={asset.id}
                          onClick={() => handleSelectAsset(asset.id)}
                          className="w-full flex items-center gap-sm px-sm py-xs text-xs text-text-muted hover:bg-glass-hover hover:text-text rounded-md transition-colors"
                        >
                          <Video size={13} className="opacity-50" />
                          <span className="truncate">{asset.title || asset.originalFilename}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

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
