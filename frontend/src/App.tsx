import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from './components/layout/AppShell';
import { Sidebar } from './components/layout/Sidebar';
import { AssetGrid } from './components/assets/AssetGrid';
import { DetailPanel } from './components/detail/DetailPanel';
import { useTagFilter } from './hooks/useTagFilter';
import { useTags } from './hooks/useAssets';
import { cn } from './lib/cn';

function App() {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const { selectedTags, toggleTag } = useTagFilter();
  const { data: tags, isLoading: tagsLoading } = useTags();

  return (
    <AppShell
      sidebar={
        <Sidebar
          tags={tags ?? []}
          selectedTags={selectedTags}
          onToggleTag={toggleTag}
          isLoading={tagsLoading}
        />
      }
    >
      <div className="relative flex h-full overflow-hidden">
        <div className={cn(
          'flex-1 overflow-y-auto transition-all duration-300',
          selectedAssetId ? 'mr-[40vw]' : ''
        )}>
          <AssetGrid
            selectedTags={selectedTags}
            selectedAssetId={selectedAssetId}
            onSelectAsset={setSelectedAssetId}
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
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

export default App;
