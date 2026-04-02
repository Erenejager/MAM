import { useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from './components/layout/AppShell';
import { TopBar } from './components/layout/TopBar';
// CommandPalette removed — search now expands inline in TopBar
import { AssetGrid } from './components/assets/AssetGrid';
import { DetailPanel } from './components/detail/DetailPanel';
import { ImportView } from './components/ImportView';
import { SettingsPage } from './components/settings/SettingsPage';
import { DropOverlay } from './components/upload/DropOverlay';
import { Toaster } from './components/ui/sonner';
import { useSearch } from './hooks/useSearch';
import { useTagFilter } from './hooks/useTagFilter';
import { useAssets } from './hooks/useAssets';
import type { SearchResult } from './types/asset';

export default function App() {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [view, setView] = useState<'library' | 'settings' | 'import'>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingSeek, setPendingSeek] = useState<{
    tab: 'transcript';
    timestamp: number;
  } | null>(null);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('mam-view-mode');
    return saved === 'list' ? 'list' : 'grid';
  });

  const handleViewModeChange = useCallback((mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('mam-view-mode', mode);
  }, []);

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
      if (target === 'import') setCompletedSinceLastVisit(0);
      if (target === 'library') {
        setSearchQuery('');
        clearTags();
        setSelectedAssetId(null);
      } else {
        setSelectedAssetId(null);
      }
    },
    [clearTags]
  );

  const handleImportComplete = useCallback(() => {
    if (view !== 'import') {
      setCompletedSinceLastVisit(c => c + 1);
    }
  }, [view]);

  const handleViewAssetFromToast = useCallback((assetId: string) => {
    setSelectedAssetId(assetId);
    setView('library');
  }, []);

  const [isUploading, setIsUploading] = useState(false);
  const [completedSinceLastVisit, setCompletedSinceLastVisit] = useState(0);

  const { data: allAssets } = useAssets();
  const isIngesting = allAssets?.some(a => a.status === 'ingesting') ?? false;

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

  const topBar = (
    <TopBar
      onSearch={handleSearch}
      onClear={handleClearSearch}
      searchQuery={searchQuery}
      searchUnavailable={searchData?.error === 'search_unavailable'}
      selectedTags={selectedTags}
      onToggleTag={toggleTag}
      onClearTags={clearTags}
      onSelectAsset={(id) => { setSelectedAssetId(id); setView('library'); }}
      onNavigate={handleNavigate}
      activeView={view}
      isIngesting={isIngesting}
      completedSinceLastVisit={completedSinceLastVisit}
      viewMode={viewMode}
      onViewModeChange={handleViewModeChange}
    />
  );

  const viewKey = selectedAssetId && view === 'library' ? `detail-${selectedAssetId}` : view;

  return (
    <>
      <DropOverlay onFileDrop={handleGlobalDrop} disabled={dropDisabled} />
      <AppShell topBar={topBar}>
        <AnimatePresence mode="wait">
          {selectedAssetId && view === 'library' ? (
            <motion.div
              key={viewKey}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="h-full"
            >
              <DetailPanel
                assetId={selectedAssetId}
                onClose={() => setSelectedAssetId(null)}
                initialTab={pendingSeek?.tab}
                seekTimestamp={pendingSeek?.timestamp}
                onOpened={() => setPendingSeek(null)}
              />
            </motion.div>
          ) : (
            <motion.div
              key={viewKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="h-full"
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
                  viewMode={viewMode}
                />
              )}
              {view === 'settings' && <SettingsPage />}
              {view === 'import' && (
                <ImportView
                  onViewAsset={handleViewAssetFromToast}
                  onImportComplete={handleImportComplete}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </AppShell>
      <Toaster position="bottom-right" theme="dark" />
    </>
  );
}
