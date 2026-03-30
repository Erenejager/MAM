import { useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { AppShell } from './components/layout/AppShell';
import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { AssetGrid } from './components/assets/AssetGrid';
import { DetailPanel } from './components/detail/DetailPanel';
import { SettingsPage } from './components/settings/SettingsPage';
import { useTagFilter } from './hooks/useTagFilter';
import { useTags } from './hooks/useAssets';
import { useSearch } from './hooks/useSearch';
import { cn } from './lib/cn';
import type { SearchResult } from './types/asset';

function App() {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [view, setView] = useState<'library' | 'settings'>('library');
  const { selectedTags, toggleTag } = useTagFilter();
  const { data: tags, isLoading: tagsLoading } = useTags();

  const [searchQuery, setSearchQuery] = useState('');
  const { data: searchData } = useSearch(searchQuery, selectedTags);
  const searchUnavailable = searchData?.error === 'search_unavailable';

  const searchResultMap = useMemo(() => {
    if (!searchQuery || !searchData?.results) return undefined;
    const map = new Map<string, SearchResult>();
    for (const r of searchData.results) {
      map.set(r.id, r);
    }
    return map;
  }, [searchQuery, searchData]);

  const [pendingSeek, setPendingSeek] = useState<{ tab: 'transcript'; timestamp: number } | null>(null);

  const handleSearch = useCallback((q: string) => setSearchQuery(q), []);
  const handleClearSearch = useCallback(() => setSearchQuery(''), []);

  const handleTimecodeClick = useCallback((assetId: string, timestamp: number) => {
    setSelectedAssetId(assetId);
    setPendingSeek({ tab: 'transcript' as const, timestamp });
  }, []);

  return (
    <MotionConfig reducedMotion="user">
    <AppShell
      topBar={
        <TopBar
          onSearch={handleSearch}
          onClearSearch={handleClearSearch}
          searchQuery={searchQuery}
          searchUnavailable={searchUnavailable}
        />
      }
      sidebar={
        <Sidebar
          tags={tags ?? []}
          selectedTags={selectedTags}
          onToggleTag={toggleTag}
          isLoading={tagsLoading}
          onNavigate={setView}
          activeView={view}
        />
      }
    >
      <div className="relative flex h-full overflow-hidden">
        {view === 'settings' ? (
          <SettingsPage />
        ) : (
          <>
            <div className={cn(
              'flex-1 overflow-y-auto transition-all duration-300',
              selectedAssetId ? 'mr-[40vw]' : ''
            )}>
              <AssetGrid
                selectedTags={selectedTags}
                selectedAssetId={selectedAssetId}
                onSelectAsset={setSelectedAssetId}
                searchQuery={searchQuery}
                searchResults={searchResultMap}
                onTimecodeClick={handleTimecodeClick}
              />
            </div>
            <AnimatePresence>
              {selectedAssetId && (
                <motion.div
                  key="detail-panel"
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'tween', duration: 0.3 }}
                  className="fixed top-12 right-0 h-[calc(100vh-48px)] w-[40vw] border-l border-border z-40"
                >
                  <DetailPanel
                    assetId={selectedAssetId}
                    onClose={() => setSelectedAssetId(null)}
                    initialTab={pendingSeek?.tab}
                    seekTimestamp={pendingSeek?.timestamp}
                    onOpened={() => setPendingSeek(null)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </AppShell>
    </MotionConfig>
  );
}

export default App;
