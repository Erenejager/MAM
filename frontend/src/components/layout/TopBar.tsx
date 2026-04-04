import { useState, useRef, useEffect } from 'react';
import { Search, X, Upload, Settings, Video, Library, LayoutGrid, List, LogOut, Loader2 } from 'lucide-react';
import { FilterBar } from './FilterBar';
import { MediaSphereLogo } from './MediaSphereLogo';
import { useSuggest } from '../../hooks/useSuggest';
import { ImportPopover } from '../import/ImportPopover';
import type { Asset } from '../../types/asset';

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
  activeView: 'library' | 'import' | 'settings';
  isIngesting?: boolean;
  completedSinceLastVisit?: number;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  inProgress: Asset[];
  recentCompleted: Asset[];
  onLogout: () => void;
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
  activeView,
  isIngesting,
  completedSinceLastVisit,
  viewMode,
  onViewModeChange,
  inProgress,
  recentCompleted,
  onLogout,
}: TopBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleImportMouseEnter = () => {
    if (popoverTimeout.current) clearTimeout(popoverTimeout.current);
    setPopoverOpen(true);
  };

  const handleImportMouseLeave = () => {
    popoverTimeout.current = setTimeout(() => setPopoverOpen(false), 150);
  };

  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopoverOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [popoverOpen]);
  const [inputValue, setInputValue] = useState(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  const { suggestions: apiSuggestions, isLoading: suggestLoading } = useSuggest(
    expanded ? inputValue : '',
  );
  const [highlightIndex, setHighlightIndex] = useState(-1);

  // Inline autocomplete: ghost text completes the last word being typed
  const ghostCompletion = (() => {
    const trimmed = inputValue.trim().toLowerCase();
    if (trimmed.length < 2 || !apiSuggestions.length) return '';
    // Get the last word being typed
    const words = trimmed.split(/\s+/);
    const lastWord = words[words.length - 1];
    if (lastWord.length < 2) return '';
    // Prefer word-type suggestions that complete the last word
    const wordMatch = apiSuggestions.find(
      (s) => s.type === 'word' && s.text.toLowerCase().startsWith(lastWord),
    );
    if (wordMatch) return wordMatch.text.slice(lastWord.length);
    return '';
  })();

  // Non-word suggestions for the dropdown (assets + tags)
  const dropdownSuggestions = apiSuggestions.filter((s) => s.type !== 'word');

  // Reset highlight when suggestions change
  useEffect(() => { setHighlightIndex(-1); }, [apiSuggestions]);

  const showDropdown = expanded;

  /** Bold the substring that matches the query */
  const highlightMatch = (text: string) => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="text-text font-semibold">{text.slice(idx, idx + q.length)}</span>
        {text.slice(idx + q.length)}
      </>
    );
  };

  const pillBase = 'flex items-center gap-[4px] px-[12px] py-[4px] rounded-[6px] text-[10px] font-semibold transition-colors duration-150 cursor-pointer';
  const pillActive = 'bg-cta/10 text-cta';
  const pillInactive = 'text-text-dim hover:text-text-muted hover:bg-glass-hover';

  return (
    <div className="shrink-0">
      {searchUnavailable && (
        <div className="px-md py-xs bg-cta/10 border-b border-cta/20 text-center text-xs text-cta">
          Search service unavailable — results limited to local database
        </div>
      )}
      <header className="h-[52px] bg-[rgba(15,15,30,0.5)] glass-blur-xl border-b border-glass-border flex items-center px-xl gap-sm">
        {/* Logo — click to go home */}
        <button onClick={() => onNavigate('library')} className="cursor-pointer shrink-0" aria-label="Go to library">
          <MediaSphereLogo />
        </button>

        {/* Spacer to center search */}
        <div className="flex-1" />

        {/* Search bar with inline expand */}
        <div ref={containerRef} className="max-w-[480px] w-full relative">
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
                <div className="flex items-center gap-sm py-[7px] px-sm bg-glass-strong border-0 rounded-t-[10px] rounded-b-none glass-blur">
                  <Search size={14} className="text-cta opacity-70 shrink-0" />
                  <div className="flex-1 relative overflow-hidden text-xs leading-4">
                    {/* Ghost completion overlay — exact same position as input text */}
                    {ghostCompletion && (
                      <div
                        aria-hidden
                        className="absolute top-0 left-0 right-0 h-full flex items-center pointer-events-none select-none overflow-hidden"
                      >
                        <span className="text-xs leading-4 invisible whitespace-pre">{inputValue}</span>
                        <span className="text-xs leading-4 whitespace-pre truncate text-text-dim/60">{ghostCompletion}</span>
                      </div>
                    )}
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Tab' && ghostCompletion) {
                          e.preventDefault();
                          setInputValue(inputValue + ghostCompletion);
                        } else if (e.key === 'Escape') {
                          setExpanded(false);
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setHighlightIndex((i) =>
                            i < dropdownSuggestions.length - 1 ? i + 1 : 0,
                          );
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlightIndex((i) =>
                            i > 0 ? i - 1 : dropdownSuggestions.length - 1,
                          );
                        } else if (e.key === 'Enter' && highlightIndex >= 0) {
                          e.preventDefault();
                          const picked = dropdownSuggestions[highlightIndex];
                          if (picked.id) {
                            handleSelectAsset(picked.id);
                          } else {
                            setInputValue(picked.text);
                            onSearch(picked.text);
                            setExpanded(false);
                          }
                        }
                      }}
                      placeholder="Search assets, tags, actions..."
                      className="relative w-full bg-transparent text-xs leading-4 text-text outline-none focus-visible:outline-none placeholder:text-text-dim"
                    />
                  </div>
                  {ghostCompletion && (
                    <span className="shrink-0 py-[1px] px-[5px] bg-glass-hover rounded text-[9px] font-mono text-text-dim/50 pointer-events-none">
                      Tab
                    </span>
                  )}
                  {inputValue && (
                    <button type="button" onClick={handleClear} className="text-text-dim hover:text-text transition-colors">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </form>

              {/* Inline dropdown */}
              {showDropdown && (
                <div className="absolute left-0 right-0 top-full bg-[rgba(15,15,30,0.95)] glass-blur-xl border-0 rounded-b-[10px] shadow-lg overflow-hidden z-50 max-h-[320px] overflow-y-auto">
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

                  {/* Suggestions */}
                  {inputValue.trim().length >= 2 && (
                    <div className="px-sm pb-sm border-t border-glass-border mt-xs pt-sm">
                      <div className="text-[9px] font-semibold text-text-dim uppercase tracking-wider mb-xs flex items-center gap-xs">
                        {suggestLoading ? (
                          <>
                            <Loader2 size={10} className="animate-spin" />
                            Searching...
                          </>
                        ) : dropdownSuggestions.length > 0 ? (
                          `${dropdownSuggestions.length} match${dropdownSuggestions.length === 1 ? '' : 'es'}`
                        ) : (
                          `No matches for "${inputValue.trim()}"`
                        )}
                      </div>
                      {dropdownSuggestions.map((s, i) => (
                        <button
                          key={s.type + (s.id ?? s.text)}
                          onClick={() => {
                            if (s.id) {
                              handleSelectAsset(s.id);
                            } else {
                              setInputValue(s.text);
                              onSearch(s.text);
                              setExpanded(false);
                            }
                          }}
                          className={`w-full flex items-center gap-sm px-sm py-xs text-xs text-text-muted hover:bg-glass-hover hover:text-text rounded-md transition-colors ${
                            i === highlightIndex ? 'bg-glass-hover text-text' : ''
                          }`}
                        >
                          <Video size={13} className="opacity-50 shrink-0" />
                          <span className="truncate">{highlightMatch(s.text)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* View toggle — grid vs list, next to search */}
        <div
          role="radiogroup"
          aria-label="View mode"
          className="flex items-center bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-[6px] overflow-hidden shrink-0 ml-sm"
        >
          <button
            role="radio"
            aria-checked={viewMode === 'grid'}
            onClick={() => onViewModeChange('grid')}
            style={{ padding: '5px 10px' }}
            className={`flex items-center justify-center transition-colors${viewMode === 'grid' ? ' bg-cta/10' : ''}`}
            aria-label="Grid view"
          >
            <LayoutGrid
              size={13}
              className={viewMode === 'grid' ? 'text-cta' : 'text-[#52525b] hover:text-[#71717a] transition-colors'}
            />
          </button>
          <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.07)' }} />
          <button
            role="radio"
            aria-checked={viewMode === 'list'}
            onClick={() => onViewModeChange('list')}
            style={{ padding: '5px 10px' }}
            className={`flex items-center justify-center transition-colors${viewMode === 'list' ? ' bg-cta/10' : ''}`}
            aria-label="List view"
          >
            <List
              size={13}
              className={viewMode === 'list' ? 'text-cta' : 'text-[#52525b] hover:text-[#71717a] transition-colors'}
            />
          </button>
        </div>

        {/* Spacer to push nav to right */}
        <div className="flex-1" />

        {/* Pill tabs */}
        <div className="flex items-center gap-[2px] bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-[8px] p-[3px] flex-shrink-0">
          <button
            onClick={() => onNavigate('library')}
            className={`${pillBase} ${activeView === 'library' ? pillActive : pillInactive}`}
          >
            <Library size={11} />
            Library
          </button>
          <div
            className="relative"
            onMouseEnter={handleImportMouseEnter}
            onMouseLeave={handleImportMouseLeave}
          >
            <button
              onClick={() => onNavigate('import')}
              className={`${pillBase} ${activeView === 'import' ? pillActive : pillInactive} ${
                isIngesting && activeView !== 'import'
                  ? '!border-cta/20 !bg-cta/8 !text-cta'
                  : ''
              }`}
            >
              <Upload size={11} />
              Import
              {isIngesting && (
                <span
                  className="w-[6px] h-[6px] rounded-full bg-cta ml-[2px]"
                  style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
                  aria-label="Import in progress"
                />
              )}
              {!isIngesting && (completedSinceLastVisit ?? 0) > 0 && (
                <span
                  style={{
                    padding: '1px 5px',
                    background: '#E11D48',
                    borderRadius: 99,
                    fontSize: 8,
                    color: 'white',
                    fontWeight: 600,
                    lineHeight: 1.4,
                  }}
                >
                  {completedSinceLastVisit}
                </span>
              )}
            </button>
            {popoverOpen && (
              <ImportPopover
                inProgress={inProgress}
                recentCompleted={recentCompleted}
                onNavigateToImport={() => {
                  setPopoverOpen(false);
                  onNavigate('import');
                }}
              />
            )}
          </div>
          <button
            onClick={() => onNavigate('settings')}
            className={`${pillBase} ${activeView === 'settings' ? pillActive : pillInactive}`}
          >
            <Settings size={11} />
            Settings
          </button>
        </div>

        {/* Disconnect */}
        <button
          onClick={onLogout}
          className="shrink-0 flex items-center justify-center w-[28px] h-[28px] rounded-[6px] bg-glass border border-glass-border text-text-dim hover:text-cta hover:border-cta/30 hover:bg-cta/10 transition-colors cursor-pointer"
          aria-label="Disconnect"
          title="Disconnect"
        >
          <LogOut size={13} />
        </button>
      </header>
      {selectedTags.length > 0 && (
        <FilterBar selectedTags={selectedTags} onToggleTag={onToggleTag} onClearTags={onClearTags} />
      )}
    </div>
  );
}
