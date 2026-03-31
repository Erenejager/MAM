import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Film, Search } from 'lucide-react';
import { useAssets } from '../../hooks/useAssets';
import { AssetCard } from './AssetCard';
import { AssetContextMenu } from './AssetContextMenu';
import { DeleteDialog } from '../shared/DeleteDialog';
import type { SearchResult } from '../../types/asset';

interface AssetGridProps {
  selectedTags: string[];
  selectedAssetId: string | null;
  onSelectAsset: (id: string | null) => void;
  searchQuery?: string;
  searchResults?: Map<string, SearchResult>;
  isSearchActive?: boolean;
  onTimecodeClick?: (assetId: string, timestamp: number) => void;
  onToggleTag?: (tag: string) => void;
  onClearTags?: () => void;
}

export function AssetGrid({ selectedTags, selectedAssetId, onSelectAsset, searchQuery, searchResults, isSearchActive: isSearchActiveProp, onTimecodeClick, onToggleTag: _onToggleTag, onClearTags: _onClearTags }: AssetGridProps) {
  const { data: assets, isLoading } = useAssets(
    selectedTags.length > 0 ? selectedTags : undefined
  );

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    assetId: string;
  } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const isSearchActive = isSearchActiveProp ?? !!(searchQuery && searchQuery.trim().length > 0);

  const displayAssets = useMemo(() => {
    if (!assets) return [];
    if (!isSearchActive || !searchResults) return assets;
    return assets
      .filter(a => searchResults.has(a.id))
      .sort((a, b) => {
        const scoreA = searchResults.get(a.id)?.score ?? 0;
        const scoreB = searchResults.get(b.id)?.score ?? 0;
        return scoreB - scoreA;
      });
  }, [assets, isSearchActive, searchResults]);

  const handleContextMenu = (e: React.MouseEvent, assetId: string) => {
    setContextMenu({ x: e.clientX, y: e.clientY, assetId });
  };

  const handleDeleteFromMenu = () => {
    if (!contextMenu || !assets) return;
    const asset = assets.find((a) => a.id === contextMenu.assetId);
    if (asset) {
      setDeleteTarget({
        id: asset.id,
        title: asset.title || asset.originalFilename,
      });
    }
    setContextMenu(null);
  };

  const handleDeleted = () => {
    if (deleteTarget && deleteTarget.id === selectedAssetId) {
      onSelectAsset(null);
    }
    setDeleteTarget(null);
  };

  if (isLoading) {
    return (
      <div className="p-4 flex flex-col gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-[140px] bg-panel rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  // Search active but still loading results
  if (isSearchActive && !searchResults) {
    return (
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-text-muted text-sm px-2 py-4">
          <Search className="w-4 h-4 animate-pulse" />
          Searching...
        </div>
      </div>
    );
  }

  // Search returned no results
  if (isSearchActive && searchResults && displayAssets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted gap-3">
        <Search className="w-12 h-12" />
        <p className="text-sm">No videos match &lsquo;{searchQuery}&rsquo;</p>
        <p className="text-xs">Try different search terms</p>
      </div>
    );
  }

  if (!assets || assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted gap-3">
        <Film className="w-12 h-12" />
        <p className="text-sm">No assets found</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 flex flex-col gap-3">
        <AnimatePresence>
          {displayAssets.map((asset) => (
            <motion.div
              key={asset.id}
              layout
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
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

      {contextMenu && (
        <AssetContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onDelete={handleDeleteFromMenu}
          onClose={() => setContextMenu(null)}
        />
      )}

      {deleteTarget && (
        <DeleteDialog
          assetId={deleteTarget.id}
          assetTitle={deleteTarget.title}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
