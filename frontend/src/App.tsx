import { useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Sidebar } from './components/layout/Sidebar';
import { AssetGrid } from './components/assets/AssetGrid';
import { useTagFilter } from './hooks/useTagFilter';
import { useTags } from './hooks/useAssets';

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
      <AssetGrid
        selectedTags={selectedTags}
        selectedAssetId={selectedAssetId}
        onSelectAsset={setSelectedAssetId}
      />
    </AppShell>
  );
}

export default App;
