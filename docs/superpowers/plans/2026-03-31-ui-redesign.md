# MAM UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the MAM frontend from a sidebar-based indigo layout to a cinematic, topbar-only interface with obsidian gradient palette, thumbnail-overlay cards, full-screen detail view, inline tag filter chips, lens flare logo, and global drag-drop upload.

**Architecture:** Remove the 240px sidebar entirely. All navigation and filtering moves to a redesigned top bar + inline filter chip row. The asset grid becomes full-width with 3-column thumbnail-overlay cards. The detail panel becomes a full-screen takeover view instead of a 40vw slide-in panel. Upload becomes a global drag-anywhere overlay with top-bar progress indicator.

**Tech Stack:** React 18, Tailwind CSS 3 (locked), Framer Motion, Lucide React icons, TypeScript

---

## File Structure

### Files to Create
| File | Responsibility |
|------|---------------|
| `src/components/layout/Logo.tsx` | Animated MAM logo with lens flare hover effect |
| `src/components/layout/FilterBar.tsx` | Inline tag filter chips row below top bar |
| `src/components/layout/FilterDropdown.tsx` | Tag discovery dropdown with counts |
| `src/components/layout/DragOverlay.tsx` | Full-screen drag indicator when dragging files |
| `src/components/layout/UploadToast.tsx` | Upload progress toast notification |

### Files to Modify
| File | Changes |
|------|---------|
| `tailwind.config.cjs` | New obsidian color palette, gradient utilities |
| `src/index.css` | CSS custom properties, gradient background, keyframe animations |
| `src/App.tsx` | Remove sidebar, add full-screen detail view, global drag-drop |
| `src/components/layout/AppShell.tsx` | Single-column layout (topbar + content), no sidebar |
| `src/components/layout/TopBar.tsx` | Redesigned with Logo, search, upload/filter/settings icons |
| `src/components/layout/SearchInput.tsx` | Style updates for new palette |
| `src/components/assets/AssetCard.tsx` | Rewrite to thumbnail-overlay style |
| `src/components/assets/AssetGrid.tsx` | 3-column CSS grid, integrate FilterBar |
| `src/components/detail/DetailPanel.tsx` | Full-screen takeover layout |
| `src/components/ImportView.tsx` | Adapt to work as overlay/toast instead of full view |

### Files to Delete
| File | Reason |
|------|--------|
| `src/components/layout/Sidebar.tsx` | Replaced by TopBar icons + FilterBar |

---

## Task 1: Obsidian Color Palette & Gradient Background

**Files:**
- Modify: `frontend/tailwind.config.cjs`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Update Tailwind color tokens**

Replace the current indigo-based palette with the obsidian neutral dark palette. Keep the CTA and status colors unchanged.

```js
// frontend/tailwind.config.cjs
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    spacing: {
      0: '0px',
      px: '1px',
      xs: '4px',
      sm: '8px',
      md: '16px',
      lg: '24px',
      xl: '32px',
      '2xl': '48px',
      '3xl': '64px',
    },
    extend: {
      colors: {
        background: '#0c0c12',
        'background-deep': '#09090e',
        panel: '#141419',
        'panel-light': '#1a1a22',
        cta: '#E11D48',
        'cta-hover': '#BE123C',
        text: '#e4e4e7',
        'text-muted': '#a1a1aa',
        'text-dim': '#52525b',
        border: 'rgba(255, 255, 255, 0.06)',
        'border-hover': 'rgba(255, 255, 255, 0.12)',
        'status-pending': '#94A3B8',
        'status-processing': '#F59E0B',
        'status-complete': '#10B981',
        'status-failed': '#E11D48',
      },
      fontFamily: {
        sans: ['Fira Sans', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0,0,0,0.4)',
        md: '0 4px 12px rgba(0,0,0,0.5)',
        lg: '0 8px 24px rgba(0,0,0,0.6)',
        accent: '0 0 12px rgba(225,29,72,0.3)',
        'accent-lg': '0 0 24px rgba(225,29,72,0.2)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.4)',
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Update CSS custom properties and add gradient background**

```css
/* frontend/src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-background: #0c0c12;
  --color-background-deep: #09090e;
  --color-panel: #141419;
  --color-panel-light: #1a1a22;
  --color-cta: #E11D48;
  --color-text: #e4e4e7;
  --color-text-muted: #a1a1aa;
  --color-text-dim: #52525b;
  --color-border: rgba(255, 255, 255, 0.06);
}

body {
  background: linear-gradient(170deg, #0c0c12 0%, #09090e 40%, #0b0b11 70%, #08080c 100%);
  min-height: 100vh;
  color: var(--color-text);
}

*:focus-visible {
  outline: 2px solid #E11D48;
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

mark {
  background: transparent;
  color: inherit;
}

/* Card top-light gradient overlay */
.card-gradient {
  background: linear-gradient(
    160deg,
    rgba(255, 255, 255, 0.05) 0%,
    rgba(255, 255, 255, 0.02) 40%,
    transparent 100%
  );
}

/* Lens flare keyframes */
@keyframes flare-sweep-right {
  0% { left: -20%; opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { left: 120%; opacity: 0; }
}

@keyframes flare-sweep-left {
  0% { right: -20%; opacity: 0; }
  20% { opacity: 0.6; }
  80% { opacity: 0.6; }
  100% { right: 120%; opacity: 0; }
}

@keyframes anamorphic-stretch {
  0% { transform: scaleX(0); opacity: 0; }
  30% { transform: scaleX(1); opacity: 0.4; }
  70% { transform: scaleX(1.5); opacity: 0.2; }
  100% { transform: scaleX(0); opacity: 0; }
}

/* Selection shimmer */
@keyframes border-shimmer {
  0% { background-position: 0% 50%; }
  100% { background-position: 300% 50%; }
}

@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 12px rgba(225,29,72,0.15); }
  50% { box-shadow: 0 0 20px rgba(225,29,72,0.3); }
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: No errors. The colors will look different but the app should still compile.

- [ ] **Step 4: Commit**

```bash
git add frontend/tailwind.config.cjs frontend/src/index.css
git commit -m "style: switch to obsidian gradient palette"
```

---

## Task 2: Simplified Layout Shell (Remove Sidebar)

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/App.tsx`
- Delete: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Rewrite AppShell to single-column**

The new layout is just topbar on top, content below. No sidebar column.

```tsx
// frontend/src/components/layout/AppShell.tsx
import { type ReactNode } from 'react';

interface AppShellProps {
  topBar: ReactNode;
  children: ReactNode;
}

export function AppShell({ topBar, children }: AppShellProps) {
  return (
    <div className="grid grid-rows-[auto_1fr] min-h-screen">
      {topBar}
      <main className="overflow-hidden">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Update App.tsx to remove Sidebar references**

Remove Sidebar import, remove sidebar-related props from AppShell usage, and move tag filter state management to work with the new FilterBar (created in Task 5). For now, keep tag filtering functional but remove the sidebar rendering.

```tsx
// frontend/src/App.tsx
import { useState, useMemo, useCallback } from 'react';
import { AppShell } from './components/layout/AppShell';
import { TopBar } from './components/layout/TopBar';
import { AssetGrid } from './components/assets/AssetGrid';
import { DetailPanel } from './components/detail/DetailPanel';
import { ImportView } from './components/ImportView';
import { SettingsPage } from './components/settings/SettingsPage';
import { useSearch } from './hooks/useSearch';
import { useTagFilter } from './hooks/useTagFilter';
import type { SearchResult } from './types/asset';

export default function App() {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [view, setView] = useState<'library' | 'settings' | 'import'>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingSeek, setPendingSeek] = useState<{
    tab: 'transcript';
    timestamp: number;
  } | null>(null);

  const { selectedTags, toggleTag, clearTags } = useTagFilter();
  const { data: searchData } = useSearch(searchQuery, selectedTags);

  const searchResults = useMemo(() => {
    if (!searchData?.results) return undefined;
    return new Map<string, SearchResult>(
      searchData.results.map((r) => [r.id, r])
    );
  }, [searchData]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setSelectedAssetId(null);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const handleTimecodeClick = useCallback(
    (assetId: string, timestamp: number) => {
      setSelectedAssetId(assetId);
      setPendingSeek({ tab: 'transcript', timestamp });
    },
    []
  );

  const handleNavigate = useCallback(
    (target: 'library' | 'settings' | 'import') => {
      setView(target);
      if (target !== 'library') setSelectedAssetId(null);
    },
    []
  );

  // Full-screen detail view replaces library content
  if (selectedAssetId && view === 'library') {
    return (
      <AppShell
        topBar={
          <TopBar
            onSearch={handleSearch}
            onClear={handleClearSearch}
            searchQuery={searchQuery}
            searchUnavailable={searchData?.error === 'search_unavailable'}
            onNavigate={handleNavigate}
            activeView={view}
          />
        }
      >
        <DetailPanel
          assetId={selectedAssetId}
          onClose={() => setSelectedAssetId(null)}
          initialTab={pendingSeek?.tab}
          seekTimestamp={pendingSeek?.timestamp}
          onOpened={() => setPendingSeek(null)}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      topBar={
        <TopBar
          onSearch={handleSearch}
          onClear={handleClearSearch}
          searchQuery={searchQuery}
          searchUnavailable={searchData?.error === 'search_unavailable'}
          onNavigate={handleNavigate}
          activeView={view}
        />
      }
    >
      {view === 'library' && (
        <AssetGrid
          selectedAssetId={selectedAssetId}
          onSelectAsset={setSelectedAssetId}
          searchResults={searchResults}
          isSearchActive={searchQuery.trim().length > 0}
          onTimecodeClick={handleTimecodeClick}
          selectedTags={selectedTags}
          onToggleTag={toggleTag}
          onClearTags={clearTags}
        />
      )}
      {view === 'settings' && <SettingsPage />}
      {view === 'import' && <ImportView />}
    </AppShell>
  );
}
```

- [ ] **Step 3: Delete Sidebar.tsx**

```bash
rm frontend/src/components/layout/Sidebar.tsx
```

- [ ] **Step 4: Verify build compiles**

Run: `cd frontend && npm run build`
Expected: Compile success (Sidebar import removed, AppShell simplified).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AppShell.tsx frontend/src/App.tsx
git rm frontend/src/components/layout/Sidebar.tsx
git commit -m "refactor: remove sidebar, switch to single-column layout"
```

---

## Task 3: Redesigned TopBar with Icon Actions

**Files:**
- Create: `frontend/src/components/layout/Logo.tsx`
- Modify: `frontend/src/components/layout/TopBar.tsx`
- Modify: `frontend/src/components/layout/SearchInput.tsx`

- [ ] **Step 1: Create the Logo component with lens flare animation**

```tsx
// frontend/src/components/layout/Logo.tsx
import { useState } from 'react';

export function Logo() {
  const [hovering, setHovering] = useState(false);

  return (
    <div
      className="relative cursor-default select-none"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Main logo text */}
      <span
        className="font-mono text-[18px] font-semibold tracking-[5px] text-text relative inline-block"
        style={{ letterSpacing: '5px' }}
      >
        MAM
        {/* Red flare dot - sweeps right */}
        {hovering && (
          <span
            className="absolute top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, #E11D48, transparent)',
              boxShadow: '0 0 8px 4px rgba(225,29,72,0.6)',
              animation: 'flare-sweep-right 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            }}
          />
        )}
        {/* White flare dot - sweeps left */}
        {hovering && (
          <span
            className="absolute top-1/2 -translate-y-1/2 w-[4px] h-[4px] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(255,255,255,0.8), transparent)',
              boxShadow: '0 0 6px 3px rgba(255,255,255,0.4)',
              animation: 'flare-sweep-left 0.9s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            }}
          />
        )}
        {/* Anamorphic streak */}
        {hovering && (
          <span
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[1px] pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(225,29,72,0.4), transparent)',
              animation: 'anamorphic-stretch 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            }}
          />
        )}
      </span>
      {/* Subtitle reveal on hover */}
      <div
        className="absolute top-full left-0 mt-[2px] whitespace-nowrap font-sans text-[9px] tracking-[4px] uppercase transition-all duration-300"
        style={{
          color: hovering ? 'var(--color-text-dim)' : 'transparent',
          opacity: hovering ? 1 : 0,
          transform: hovering ? 'translateY(0)' : 'translateY(-2px)',
        }}
      >
        Media Asset Manager
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite TopBar with logo, centered search, icon actions**

```tsx
// frontend/src/components/layout/TopBar.tsx
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
```

- [ ] **Step 3: Update SearchInput styling for new palette**

```tsx
// frontend/src/components/layout/SearchInput.tsx
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  initialValue?: string;
}

export function SearchInput({ onSearch, onClear, initialValue = '' }: SearchInputProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      onSearch(trimmed);
    } else {
      onClear();
    }
  }

  function handleClear() {
    setValue('');
    onClear();
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <Search
        size={14}
        className="absolute left-sm top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search assets..."
        className="w-full bg-background/60 border border-border rounded py-xs pl-xl pr-xl text-sm text-text placeholder:text-text-dim focus:border-cta focus:outline-none transition-colors"
        aria-label="Search assets"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-sm top-1/2 -translate-y-1/2 text-text-dim hover:text-text transition-colors"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Verify build compiles**

Run: `cd frontend && npm run build`
Expected: Compile success. TopBar now renders with logo, search, and icon buttons.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/Logo.tsx frontend/src/components/layout/TopBar.tsx frontend/src/components/layout/SearchInput.tsx
git commit -m "feat: redesign topbar with lens flare logo and icon actions"
```

---

## Task 4: Thumbnail-Overlay Asset Cards

**Files:**
- Modify: `frontend/src/components/assets/AssetCard.tsx`
- Modify: `frontend/src/components/assets/AssetGrid.tsx`
- Modify: `frontend/src/components/assets/TranscriptExcerpt.tsx`

- [ ] **Step 1: Rewrite AssetCard as thumbnail-overlay card**

The card fills entirely with the thumbnail. Title, duration, tags, and metadata overlay on top with gradient fade. Selected cards get the breathing shimmer border effect.

```tsx
// frontend/src/components/assets/AssetCard.tsx
import { Film } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatDuration, formatFileSize } from '../../lib/formatters';
import { StatusBadge } from './StatusBadge';
import { TranscriptExcerpt } from './TranscriptExcerpt';
import type { Asset, SearchResult } from '../../types/asset';

interface AssetCardProps {
  asset: Asset;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  searchResult?: SearchResult;
  onTimecodeClick?: (assetId: string, timestamp: number) => void;
}

function renderHighlight(html: string) {
  const parts = html.split(/(<em>.*?<\/em>)/g);
  return parts.map((part, i) => {
    const match = part.match(/^<em>(.*)<\/em>$/);
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

export function AssetCard({
  asset,
  isSelected,
  onSelect,
  onContextMenu,
  searchResult,
  onTimecodeClick,
}: AssetCardProps) {
  const tags: string[] = asset.tags ? JSON.parse(asset.tags) : [];
  const titleHighlight = searchResult?.highlights?.title?.[0];
  const displayTitle = titleHighlight
    ? renderHighlight(titleHighlight)
    : asset.title || asset.originalFilename;

  const meta: string[] = [];
  if (asset.durationSeconds) meta.push(formatDuration(asset.durationSeconds));
  if (asset.fileSize) meta.push(formatFileSize(asset.fileSize));
  if (asset.codec && asset.width && asset.height) {
    meta.push(`${asset.codec.toUpperCase()} ${asset.width}x${asset.height}`);
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onSelect(asset.id)}
      onContextMenu={(e) => onContextMenu(e, asset.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(asset.id);
        }
      }}
      className={cn(
        'group relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200',
        'aspect-video',
        isSelected
          ? 'ring-1 ring-cta/40'
          : 'hover:scale-[1.01] hover:shadow-card-hover'
      )}
      style={
        isSelected
          ? {
              background: 'linear-gradient(135deg, rgba(225,29,72,0.08), transparent, rgba(225,29,72,0.04))',
              backgroundSize: '300% 300%',
              animation: 'border-shimmer 3s linear infinite, glow-pulse 2s ease-in-out infinite',
            }
          : undefined
      }
      aria-selected={isSelected}
    >
      {/* Thumbnail or placeholder */}
      {asset.thumbnailPath ? (
        <img
          src={`/storage/${asset.id}/thumbnail.jpg`}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-panel flex items-center justify-center">
          <Film size={32} className="text-text-dim" />
        </div>
      )}

      {/* Gradient overlay - bottom fade for readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Top-left: status badge */}
      <div className="absolute top-sm left-sm">
        <StatusBadge
          status={asset.status}
          transcriptionStatus={asset.transcriptionStatus}
        />
      </div>

      {/* Top-left: tags with frosted glass */}
      {tags.length > 0 && (
        <div className="absolute top-sm right-sm flex gap-xs flex-wrap justify-end max-w-[60%]">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-xs py-0 rounded bg-black/40 backdrop-blur-sm text-text-muted border border-border"
            >
              {tag}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="text-[10px] px-xs py-0 rounded bg-black/40 backdrop-blur-sm text-text-dim">
              +{tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Bottom overlay: title + metadata */}
      <div className="absolute bottom-0 left-0 right-0 p-sm">
        <h3 className="text-sm font-semibold text-white truncate leading-tight">
          {displayTitle}
        </h3>
        {meta.length > 0 && (
          <p className="text-[11px] text-text-muted mt-0 truncate">
            {meta.join(' \u00B7 ')}
          </p>
        )}
      </div>

      {/* Duration badge - bottom right */}
      {asset.durationSeconds && (
        <div className="absolute bottom-sm right-sm bg-black/70 rounded px-xs py-0 text-[10px] font-mono text-text-muted">
          {formatDuration(asset.durationSeconds)}
        </div>
      )}

      {/* Transcript excerpt (shown below card when searching) */}
      {searchResult?.transcriptMatch && onTimecodeClick && (
        <div className="absolute -bottom-0 left-0 right-0 translate-y-full pt-xs">
          <TranscriptExcerpt
            text={searchResult.transcriptMatch.text}
            timestamp={searchResult.transcriptMatch.timestamp}
            matchCount={searchResult.transcriptMatches?.length ?? 1}
            matches={searchResult.transcriptMatches}
            onTimecodeClick={(ts) => onTimecodeClick(asset.id, ts)}
          />
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Update AssetGrid to 3-column CSS grid**

Update the grid layout to use a 3-column CSS grid. Pass tag filter props through (FilterBar integration comes in Task 5).

```tsx
// frontend/src/components/assets/AssetGrid.tsx
import { useMemo, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AssetCard } from './AssetCard';
import { AssetContextMenu } from './AssetContextMenu';
import { DeleteDialog } from '../shared/DeleteDialog';
import { useAssets, useDeleteAsset } from '../../hooks/useAssets';
import type { SearchResult } from '../../types/asset';

interface AssetGridProps {
  selectedAssetId: string | null;
  onSelectAsset: (id: string) => void;
  searchResults?: Map<string, SearchResult>;
  isSearchActive: boolean;
  onTimecodeClick?: (assetId: string, timestamp: number) => void;
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
}

export function AssetGrid({
  selectedAssetId,
  onSelectAsset,
  searchResults,
  isSearchActive,
  onTimecodeClick,
  selectedTags,
  onToggleTag,
  onClearTags,
}: AssetGridProps) {
  const { data: assets = [], isLoading } = useAssets(selectedTags);
  const deleteAsset = useDeleteAsset();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    assetId: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const displayAssets = useMemo(() => {
    if (!isSearchActive || !searchResults) return assets;
    return assets
      .filter((a) => searchResults.has(a.id))
      .sort((a, b) => {
        const scoreA = searchResults.get(a.id)?.score ?? 0;
        const scoreB = searchResults.get(b.id)?.score ?? 0;
        return scoreB - scoreA;
      });
  }, [assets, isSearchActive, searchResults]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, assetId: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, assetId });
    },
    []
  );

  const handleDelete = useCallback(
    (deleteFile: boolean) => {
      if (!deleteTarget) return;
      deleteAsset.mutate(
        { id: deleteTarget, deleteFile },
        {
          onSuccess: () => {
            setDeleteTarget(null);
            if (selectedAssetId === deleteTarget) {
              onSelectAsset('');
            }
          },
        }
      );
    },
    [deleteTarget, deleteAsset, selectedAssetId, onSelectAsset]
  );

  if (isLoading) {
    return (
      <div className="p-lg">
        <div className="grid grid-cols-3 gap-md">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-video rounded-lg bg-panel animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-dim">
        <p>No assets yet. Upload a video to get started.</p>
      </div>
    );
  }

  if (isSearchActive && displayAssets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-dim">
        <p>No results found.</p>
      </div>
    );
  }

  return (
    <div className="p-lg overflow-y-auto h-full">
      {/* Asset grid */}
      <div className="grid grid-cols-3 gap-md">
        <AnimatePresence mode="popLayout">
          {displayAssets.map((asset) => (
            <motion.div
              key={asset.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              <AssetCard
                asset={asset}
                isSelected={asset.id === selectedAssetId}
                onSelect={onSelectAsset}
                onContextMenu={handleContextMenu}
                searchResult={searchResults?.get(asset.id)}
                onTimecodeClick={onTimecodeClick}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <AssetContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDelete={() => {
            setDeleteTarget(contextMenu.assetId);
            setContextMenu(null);
          }}
        />
      )}

      {/* Delete dialog */}
      {deleteTarget && (
        <DeleteDialog
          assetId={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update TranscriptExcerpt for compact styling**

```tsx
// frontend/src/components/assets/TranscriptExcerpt.tsx
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
        <mark key={i} className="bg-amber-500/30 text-amber-200 rounded-sm px-0.5">
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
```

- [ ] **Step 4: Verify build compiles**

Run: `cd frontend && npm run build`
Expected: Compile success. Cards now render as thumbnail-overlay style in a 3-column grid.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/assets/AssetCard.tsx frontend/src/components/assets/AssetGrid.tsx frontend/src/components/assets/TranscriptExcerpt.tsx
git commit -m "feat: thumbnail-overlay cards with 3-column grid layout"
```

---

## Task 5: Inline Tag Filter Chips + Dropdown

**Files:**
- Create: `frontend/src/components/layout/FilterBar.tsx`
- Create: `frontend/src/components/layout/FilterDropdown.tsx`
- Modify: `frontend/src/components/assets/AssetGrid.tsx`
- Modify: `frontend/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Create FilterDropdown component**

Dropdown that shows all tags with asset counts, filterable by text input.

```tsx
// frontend/src/components/layout/FilterDropdown.tsx
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTags } from '../../hooks/useAssets';
import { cn } from '../../lib/cn';

interface FilterDropdownProps {
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClose: () => void;
}

export function FilterDropdown({
  selectedTags,
  onToggleTag,
  onClose,
}: FilterDropdownProps) {
  const { data: tags = [] } = useTags();
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const filtered = tags.filter((t) =>
    t.tag.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-xs w-[220px] bg-panel border border-border rounded-lg shadow-lg overflow-hidden z-50"
    >
      <div className="p-sm border-b border-border">
        <input
          ref={inputRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter tags..."
          className="w-full bg-background/60 border border-border rounded px-sm py-xs text-xs text-text placeholder:text-text-dim focus:border-cta focus:outline-none"
        />
      </div>
      <div className="max-h-[240px] overflow-y-auto p-sm">
        {filtered.length === 0 && (
          <p className="text-xs text-text-dim text-center py-sm">No tags found</p>
        )}
        <div className="flex flex-wrap gap-xs">
          {filtered.map((t) => {
            const isActive = selectedTags.includes(t.tag);
            return (
              <button
                key={t.tag}
                onClick={() => onToggleTag(t.tag)}
                className={cn(
                  'text-[11px] px-sm py-0 rounded-lg border transition-colors',
                  isActive
                    ? 'bg-cta/20 border-cta/40 text-text'
                    : 'bg-background/40 border-border text-text-dim hover:border-border-hover hover:text-text-muted'
                )}
              >
                {t.tag}
                <span className="ml-xs text-text-dim">({t.count})</span>
                {isActive && <X size={10} className="ml-xs inline" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create FilterBar component**

Horizontal row of active filter chips, shown only when filters are active.

```tsx
// frontend/src/components/layout/FilterBar.tsx
import { X } from 'lucide-react';

interface FilterBarProps {
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
}

export function FilterBar({
  selectedTags,
  onToggleTag,
  onClearTags,
}: FilterBarProps) {
  if (selectedTags.length === 0) return null;

  return (
    <div className="flex items-center gap-sm px-lg py-xs bg-panel-light/30 border-b border-border">
      <span className="text-[10px] uppercase tracking-wider text-text-dim shrink-0">
        Filtered by
      </span>
      <div className="flex items-center gap-xs flex-wrap">
        {selectedTags.map((tag) => (
          <button
            key={tag}
            onClick={() => onToggleTag(tag)}
            className="flex items-center gap-xs text-[11px] px-sm py-0 rounded-lg bg-cta/15 border border-cta/30 text-text hover:bg-cta/25 transition-colors"
          >
            {tag}
            <X size={10} className="text-text-muted" />
          </button>
        ))}
      </div>
      <button
        onClick={onClearTags}
        className="text-[10px] text-text-dim hover:text-text-muted transition-colors ml-auto shrink-0"
      >
        Clear all
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Integrate FilterDropdown into TopBar**

Update TopBar so the filter icon toggles the dropdown. Pass tag state props.

Add to `TopBar.tsx` — update the props and the filter button:

```tsx
// frontend/src/components/layout/TopBar.tsx
import { useState } from 'react';
import { Upload, SlidersHorizontal, Settings } from 'lucide-react';
import { Logo } from './Logo';
import { SearchInput } from './SearchInput';
import { FilterDropdown } from './FilterDropdown';
import { cn } from '../../lib/cn';

interface TopBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  searchQuery: string;
  searchUnavailable?: boolean;
  onNavigate: (target: 'library' | 'settings' | 'import') => void;
  activeView: 'library' | 'settings' | 'import';
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
}

export function TopBar({
  onSearch,
  onClear,
  searchQuery,
  searchUnavailable,
  onNavigate,
  activeView,
  selectedTags,
  onToggleTag,
}: TopBarProps) {
  const [filterOpen, setFilterOpen] = useState(false);

  return (
    <header className="relative flex items-center gap-lg px-lg py-sm border-b border-border bg-panel/60 backdrop-blur-sm">
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

        {/* Filter button + dropdown */}
        <div className="relative">
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className={cn(
              'p-sm rounded transition-colors relative',
              filterOpen || selectedTags.length > 0
                ? 'text-cta'
                : 'text-text-muted hover:text-text hover:bg-panel-light'
            )}
            aria-label="Filters"
            title="Filters"
          >
            <SlidersHorizontal size={18} />
            {selectedTags.length > 0 && (
              <span className="absolute -top-0 -right-0 w-[14px] h-[14px] bg-cta text-white text-[9px] font-semibold rounded-full flex items-center justify-center">
                {selectedTags.length}
              </span>
            )}
          </button>
          {filterOpen && (
            <FilterDropdown
              selectedTags={selectedTags}
              onToggleTag={onToggleTag}
              onClose={() => setFilterOpen(false)}
            />
          )}
        </div>

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
        <div className="absolute top-full left-0 right-0 bg-amber-900/30 text-amber-200 text-xs text-center py-xs px-md border-b border-amber-800/30 z-40">
          Search unavailable — showing all assets
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 4: Add FilterBar to AssetGrid and wire tag props through App.tsx**

Insert the FilterBar at the top of the grid area. Update App.tsx to pass `selectedTags` and `onToggleTag` to TopBar.

In `AssetGrid.tsx`, add FilterBar import and render it above the grid:

```tsx
// Add at top of AssetGrid.tsx
import { FilterBar } from '../layout/FilterBar';

// In the return, wrap grid content:
return (
  <div className="h-full flex flex-col">
    <FilterBar
      selectedTags={selectedTags}
      onToggleTag={onToggleTag}
      onClearTags={onClearTags}
    />
    <div className="p-lg overflow-y-auto flex-1">
      {/* ... existing grid content ... */}
    </div>
  </div>
);
```

In `App.tsx`, pass tag props to TopBar:

```tsx
<TopBar
  onSearch={handleSearch}
  onClear={handleClearSearch}
  searchQuery={searchQuery}
  searchUnavailable={searchData?.error === 'search_unavailable'}
  onNavigate={handleNavigate}
  activeView={view}
  selectedTags={selectedTags}
  onToggleTag={toggleTag}
/>
```

- [ ] **Step 5: Verify build compiles**

Run: `cd frontend && npm run build`
Expected: Compile success. Filter dropdown toggles from TopBar, chips appear below topbar.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/FilterBar.tsx frontend/src/components/layout/FilterDropdown.tsx frontend/src/components/layout/TopBar.tsx frontend/src/components/assets/AssetGrid.tsx frontend/src/App.tsx
git commit -m "feat: inline tag filter chips and discovery dropdown"
```

---

## Task 6: Full-Screen Detail View

**Files:**
- Modify: `frontend/src/components/detail/DetailPanel.tsx`
- Modify: `frontend/src/components/detail/VideoPlayer.tsx`

- [ ] **Step 1: Rewrite DetailPanel as full-screen layout**

Replace the 40vw slide-in panel with a full-screen view. Video on the left (60%), metadata/transcript on the right (40%). Back button at the top.

```tsx
// frontend/src/components/detail/DetailPanel.tsx
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAsset } from '../../hooks/useAssets';
import { VideoPlayer } from './VideoPlayer';
import { MetadataSection } from './MetadataSection';
import { TranscriptList } from './TranscriptList';
import { CustomFieldsSection } from './CustomFieldsSection';
import type { TranscriptSegment } from '../../types/asset';

interface DetailPanelProps {
  assetId: string;
  onClose: () => void;
  initialTab?: 'info' | 'transcript';
  seekTimestamp?: number;
  onOpened?: () => void;
}

export function DetailPanel({
  assetId,
  onClose,
  initialTab,
  seekTimestamp,
  onOpened,
}: DetailPanelProps) {
  const { data: asset } = useAsset(assetId);
  const [activeTab, setActiveTab] = useState<'info' | 'transcript'>(
    initialTab ?? 'info'
  );
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch transcript segments
  useEffect(() => {
    if (!asset || asset.transcriptionStatus !== 'ready') return;
    setSegmentsLoading(true);
    fetch(`/storage/${asset.id}/transcript.json`)
      .then((r) => r.json())
      .then((data) => {
        const segs = data.segments ?? data;
        setSegments(Array.isArray(segs) ? segs : []);
      })
      .catch(() => setSegments([]))
      .finally(() => setSegmentsLoading(false));
  }, [asset?.id, asset?.transcriptionStatus]);

  // Auto-seek on open
  useEffect(() => {
    if (seekTimestamp != null && videoRef.current) {
      videoRef.current.currentTime = seekTimestamp;
      onOpened?.();
    }
  }, [seekTimestamp, onOpened]);

  // Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!asset) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-[24px] h-[24px] border-2 border-cta border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tabs = ['info', 'transcript'] as const;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Back button header */}
      <div className="shrink-0 flex items-center gap-sm px-lg py-sm border-b border-border">
        <button
          onClick={onClose}
          className="flex items-center gap-xs text-text-muted hover:text-text transition-colors"
          aria-label="Back to library"
        >
          <ArrowLeft size={18} />
          <span className="text-sm">Back</span>
        </button>
        <h2 className="text-sm font-semibold text-text truncate ml-md">
          {asset.title || asset.originalFilename}
        </h2>
      </div>

      {/* Main content: video left, details right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Video player */}
        <div className="w-[60%] shrink-0 flex flex-col bg-black">
          <div className="flex-1 flex items-center justify-center">
            <VideoPlayer asset={asset} ref={videoRef} />
          </div>
        </div>

        {/* Right: Tabbed metadata/transcript */}
        <div className="w-[40%] flex flex-col border-l border-border">
          {/* Tab bar */}
          <div className="shrink-0 flex border-b border-border">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-sm text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? 'text-cta border-b-2 border-cta'
                    : 'text-text-muted hover:text-text'
                }`}
                role="tab"
                aria-selected={activeTab === tab}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-md">
            {activeTab === 'info' && (
              <>
                <MetadataSection asset={asset} />
                <CustomFieldsSection assetId={asset.id} />
              </>
            )}
            {activeTab === 'transcript' && (
              <TranscriptList
                asset={asset}
                videoRef={videoRef}
                segments={segments}
                loading={segmentsLoading}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update VideoPlayer to use forwardRef and fill container**

```tsx
// frontend/src/components/detail/VideoPlayer.tsx
import { forwardRef } from 'react';
import type { Asset } from '../../types/asset';

interface VideoPlayerProps {
  asset: Asset;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer({ asset }, ref) {
    const posterUrl = asset.thumbnailPath
      ? `/storage/${asset.id}/thumbnail.jpg`
      : undefined;

    return (
      <video
        ref={ref}
        src={`/storage/${asset.filepath}`}
        poster={posterUrl}
        controls
        className="max-w-full max-h-full"
      />
    );
  }
);
```

- [ ] **Step 3: Verify build compiles**

Run: `cd frontend && npm run build`
Expected: Compile success. Detail view now renders full-screen with video left, details right.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/detail/DetailPanel.tsx frontend/src/components/detail/VideoPlayer.tsx
git commit -m "feat: full-screen detail view with video left, details right"
```

---

## Task 7: Global Drag-Drop Upload Overlay

**Files:**
- Create: `frontend/src/components/layout/DragOverlay.tsx`
- Create: `frontend/src/components/layout/UploadToast.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create DragOverlay component**

Full-screen overlay that appears when dragging files over the app window.

```tsx
// frontend/src/components/layout/DragOverlay.tsx
import { Upload } from 'lucide-react';

interface DragOverlayProps {
  visible: boolean;
}

export function DragOverlay({ visible }: DragOverlayProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
      <div className="border-2 border-dashed border-cta/40 rounded-xl p-3xl flex flex-col items-center gap-md">
        <div className="w-[64px] h-[64px] rounded-full bg-cta/10 flex items-center justify-center">
          <Upload size={28} className="text-cta" />
        </div>
        <p className="text-lg font-semibold text-text">Drop files to upload</p>
        <p className="text-sm text-text-dim">Video files will be ingested automatically</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create UploadToast component**

Toast notification showing upload progress, appears in bottom-right corner.

```tsx
// frontend/src/components/layout/UploadToast.tsx
import { X, CheckCircle, AlertCircle, Loader } from 'lucide-react';

export interface UploadState {
  fileName: string;
  progress: number;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
  assetId?: string;
}

interface UploadToastProps {
  upload: UploadState;
  onDismiss: () => void;
  onViewAsset?: (id: string) => void;
}

export function UploadToast({ upload, onDismiss, onViewAsset }: UploadToastProps) {
  return (
    <div className="fixed bottom-lg right-lg z-40 w-[320px] bg-panel border border-border rounded-lg shadow-lg overflow-hidden">
      {/* Progress bar */}
      {upload.status === 'uploading' && (
        <div className="h-[2px] bg-background">
          <div
            className="h-full bg-cta transition-all duration-300"
            style={{ width: `${upload.progress}%` }}
          />
        </div>
      )}

      <div className="p-sm flex items-center gap-sm">
        {/* Status icon */}
        {upload.status === 'uploading' && (
          <Loader size={16} className="text-cta animate-spin shrink-0" />
        )}
        {upload.status === 'processing' && (
          <Loader size={16} className="text-status-processing animate-spin shrink-0" />
        )}
        {upload.status === 'complete' && (
          <CheckCircle size={16} className="text-status-complete shrink-0" />
        )}
        {upload.status === 'error' && (
          <AlertCircle size={16} className="text-status-failed shrink-0" />
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text truncate">
            {upload.fileName}
          </p>
          <p className="text-[10px] text-text-dim">
            {upload.status === 'uploading' && `Uploading... ${upload.progress}%`}
            {upload.status === 'processing' && 'Processing...'}
            {upload.status === 'complete' && 'Ready'}
            {upload.status === 'error' && (upload.error || 'Upload failed')}
          </p>
        </div>

        {/* Actions */}
        {upload.status === 'complete' && upload.assetId && onViewAsset && (
          <button
            onClick={() => onViewAsset(upload.assetId!)}
            className="text-[10px] text-cta hover:text-cta-hover transition-colors shrink-0"
          >
            View
          </button>
        )}
        <button
          onClick={onDismiss}
          className="text-text-dim hover:text-text transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add global drag-drop handling to App.tsx**

Wire up drag events on the root element. When files are dropped, upload them via the existing `/api/assets` endpoint. Show the DragOverlay during dragover and the UploadToast during/after upload.

Add these imports and state to `App.tsx`:

```tsx
// Add imports at top of App.tsx
import { DragOverlay } from './components/layout/DragOverlay';
import { UploadToast, type UploadState } from './components/layout/UploadToast';
```

Add state and handlers inside the `App` function:

```tsx
const [isDragging, setIsDragging] = useState(false);
const [activeUpload, setActiveUpload] = useState<UploadState | null>(null);
const dragCounter = useRef(0);

const handleDragEnter = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  dragCounter.current++;
  if (e.dataTransfer.types.includes('Files')) {
    setIsDragging(true);
  }
}, []);

const handleDragLeave = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  dragCounter.current--;
  if (dragCounter.current === 0) {
    setIsDragging(false);
  }
}, []);

const handleDragOver = useCallback((e: React.DragEvent) => {
  e.preventDefault();
}, []);

const handleDrop = useCallback(async (e: React.DragEvent) => {
  e.preventDefault();
  dragCounter.current = 0;
  setIsDragging(false);

  const file = e.dataTransfer.files[0];
  if (!file) return;

  setActiveUpload({
    fileName: file.name,
    progress: 0,
    status: 'uploading',
  });

  try {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        setActiveUpload((prev) =>
          prev ? { ...prev, progress: pct } : prev
        );
      }
    });

    const response = await new Promise<{ id: string }>((resolve, reject) => {
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(xhr.responseText || 'Upload failed'));
        }
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.open('POST', '/api/assets');
      xhr.send(formData);
    });

    setActiveUpload({
      fileName: file.name,
      progress: 100,
      status: 'complete',
      assetId: response.id,
    });
  } catch (err) {
    setActiveUpload({
      fileName: file.name,
      progress: 0,
      status: 'error',
      error: err instanceof Error ? err.message : 'Upload failed',
    });
  }
}, []);
```

Wrap the root `AppShell` in a div with drag handlers, and add the overlay/toast:

```tsx
return (
  <div
    onDragEnter={handleDragEnter}
    onDragLeave={handleDragLeave}
    onDragOver={handleDragOver}
    onDrop={handleDrop}
  >
    <AppShell topBar={/* ... existing ... */}>
      {/* ... existing content ... */}
    </AppShell>

    <DragOverlay visible={isDragging} />

    {activeUpload && (
      <UploadToast
        upload={activeUpload}
        onDismiss={() => setActiveUpload(null)}
        onViewAsset={(id) => {
          setSelectedAssetId(id);
          setView('library');
          setActiveUpload(null);
        }}
      />
    )}
  </div>
);
```

Also add `useRef` to the import from React.

- [ ] **Step 4: Verify build compiles**

Run: `cd frontend && npm run build`
Expected: Compile success. Drag-drop anywhere shows overlay, upload shows toast.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/DragOverlay.tsx frontend/src/components/layout/UploadToast.tsx frontend/src/App.tsx
git commit -m "feat: global drag-drop upload with overlay and progress toast"
```

---

## Task 8: Polish & Style Consistency Pass

**Files:**
- Modify: `frontend/src/components/shared/DeleteDialog.tsx`
- Modify: `frontend/src/components/assets/StatusBadge.tsx`
- Modify: `frontend/src/components/assets/AssetContextMenu.tsx`
- Modify: `frontend/src/components/ImportView.tsx`
- Modify: `frontend/src/components/settings/SettingsPage.tsx`

- [ ] **Step 1: Update DeleteDialog colors**

Replace any `bg-panel` references with the new palette tokens. The dialog should use `bg-panel` (which is now `#141419`) and borders should use `border-border` (now `rgba(255,255,255,0.06)`).

In `DeleteDialog.tsx`, make these replacements:
- `bg-black/60` backdrop stays as-is (it's fine)
- Replace any hardcoded `#1E1B4B` or indigo-related colors with `bg-panel`
- Ensure the dialog card uses `bg-panel border border-border rounded-lg shadow-lg`

- [ ] **Step 2: Update StatusBadge if needed**

StatusBadge uses semantic status colors which haven't changed — verify it compiles. No changes expected.

- [ ] **Step 3: Update AssetContextMenu colors**

Replace panel/border colors to match new palette. The context menu should use `bg-panel border border-border`.

- [ ] **Step 4: Update ImportView to work as a page view**

ImportView currently renders as a full page. Since the sidebar is gone, it now renders inside the main content area. Verify it still works. The main change: ensure background colors match the new palette.

Replace any `bg-background` with the new background color (same token name, new value). No structural changes needed.

- [ ] **Step 5: Update SettingsPage colors**

Same as above — ensure color tokens match. Replace any hardcoded indigo/purple values.

- [ ] **Step 6: Verify full build and visual check**

Run: `cd frontend && npm run build`
Expected: Clean compile. All components use the new obsidian palette consistently.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/shared/DeleteDialog.tsx frontend/src/components/assets/StatusBadge.tsx frontend/src/components/assets/AssetContextMenu.tsx frontend/src/components/ImportView.tsx frontend/src/components/settings/SettingsPage.tsx
git commit -m "style: update all components to obsidian palette"
```

---

## Task 9: Final Integration & Cleanup

**Files:**
- Modify: `frontend/src/App.tsx` (final wiring)
- Modify: `frontend/src/components/detail/MetadataSection.tsx`
- Modify: `frontend/src/components/detail/TagEditor.tsx`
- Modify: `frontend/src/components/detail/InlineEditText.tsx`
- Modify: `frontend/src/components/detail/InlineEditTextarea.tsx`
- Modify: `frontend/src/components/detail/TranscriptList.tsx`
- Modify: `frontend/src/components/detail/TranscriptSearch.tsx`

- [ ] **Step 1: Update detail sub-components for new palette**

The detail panel sub-components (MetadataSection, TagEditor, InlineEditText, InlineEditTextarea, TranscriptList, TranscriptSearch) use the design system color tokens. Since we changed the values behind the tokens, most should work automatically. However, any hardcoded colors or classes that referenced the old indigo palette need updating.

Scan each file for:
- Any hardcoded hex colors (like `#1E1B4B`, `#2D2A5E`, `#0F0F23`)
- Any `bg-indigo-*` or `bg-purple-*` Tailwind classes
- Any `border-indigo-*` or `border-purple-*` classes

Replace all with the corresponding design token classes (`bg-panel`, `bg-background`, `border-border`, etc.).

- [ ] **Step 2: Verify TranscriptList active segment styling**

The active segment in TranscriptList should use the new border/accent colors. Ensure the current segment highlight uses `border-cta/30` or similar instead of any old indigo border.

- [ ] **Step 3: Run final build check**

Run: `cd frontend && npm run build`
Expected: Clean compile, zero warnings.

- [ ] **Step 4: Visual smoke test**

Run: `cd frontend && npm run dev`

Check these flows manually:
1. Library grid loads with 3-column overlay cards
2. Hover over MAM logo shows lens flare animation
3. Click a card opens full-screen detail view
4. Back button returns to grid
5. Click filter icon opens tag dropdown
6. Select a tag — chip appears below topbar
7. Clear filters removes chips
8. Search works, highlights appear on cards
9. Drag a file over the app — overlay appears
10. Drop a file — upload toast shows progress
11. Context menu + delete dialog work

- [ ] **Step 5: Commit**

```bash
git add -u frontend/src/
git commit -m "feat: complete UI redesign — obsidian palette, overlay cards, full-screen detail"
```
