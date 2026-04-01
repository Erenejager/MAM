import { useState, useMemo, useCallback, useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { CommandPalette } from './components/layout/CommandPalette';
import { AssetGrid } from './components/assets/AssetGrid';
import { DetailPanel } from './components/detail/DetailPanel';
import { ImportView } from './components/ImportView';
import { SettingsPage } from './components/settings/SettingsPage';
import { DropOverlay } from './components/upload/DropOverlay';
import { Toaster } from './components/ui/sonner';
import { useSearch } from './hooks/useSearch';
import { useTagFilter } from './hooks/useTagFilter';
import type { SearchResult } from './types/asset';

export default function App() {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [view, setView] = useState<'library' | 'settings' | 'import'>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);
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

  // Cmd/Ctrl+K keyboard shortcut for command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [isUploading, setIsUploading] = useState(false);

  const handleGlobalDrop = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/assets', { method: 'POST', body: formData });
        if (res.status === 202) {
          setView('import');
        }
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  const dropDisabled = isUploading || view === 'import';

  const viewTitle = view === 'library' ? 'Library' : view === 'import' ? 'Import' : 'Settings';

  const sidebar = (
    <Sidebar activeView={view} onNavigate={handleNavigate} />
  );

  const topBar = (
    <TopBar
      onSearch={handleSearch}
      onClear={handleClearSearch}
      searchQuery={searchQuery}
      searchUnavailable={searchData?.error === 'search_unavailable'}
      selectedTags={selectedTags}
      onToggleTag={toggleTag}
      onClearTags={clearTags}
      onOpenCommandPalette={() => setCmdOpen(true)}
      viewTitle={viewTitle}
    />
  );

  // Full-screen detail view replaces library content
  if (selectedAssetId && view === 'library') {
    return (
      <>
        <DropOverlay onFileDrop={handleGlobalDrop} disabled={dropDisabled} />
        <AppShell sidebar={sidebar} topBar={topBar}>
          <DetailPanel
            assetId={selectedAssetId}
            onClose={() => setSelectedAssetId(null)}
            initialTab={pendingSeek?.tab}
            seekTimestamp={pendingSeek?.timestamp}
            onOpened={() => setPendingSeek(null)}
          />
        </AppShell>
        <CommandPalette
          open={cmdOpen}
          onOpenChange={setCmdOpen}
          onSelectAsset={(id) => { setSelectedAssetId(id); setView('library'); }}
          onNavigate={handleNavigate}
          onSearch={handleSearch}
        />
        <Toaster position="bottom-right" theme="dark" />
      </>
    );
  }

  return (
    <>
      <DropOverlay onFileDrop={handleGlobalDrop} disabled={dropDisabled} />
      <AppShell sidebar={sidebar} topBar={topBar}>
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
      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onSelectAsset={(id) => { setSelectedAssetId(id); setView('library'); }}
        onNavigate={handleNavigate}
        onSearch={handleSearch}
      />
      <Toaster position="bottom-right" theme="dark" />
    </>
  );
}
