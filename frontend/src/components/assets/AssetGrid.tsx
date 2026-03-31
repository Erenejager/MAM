import { useMemo, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AssetCard } from './AssetCard';
import { AssetContextMenu } from './AssetContextMenu';
import { DeleteDialog } from '../shared/DeleteDialog';
import { useAssets } from '../../hooks/useAssets';
import type { SearchResult } from '../../types/asset';

interface AssetGridProps {
  selectedAssetId: string | null;
  onSelectAsset: (id: string | null) => void;
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
}: AssetGridProps) {
  const { data: assets = [], isLoading } = useAssets(selectedTags.length > 0 ? selectedTags : undefined);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    assetId: string;
  } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

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

  const handleDeleteFromMenu = useCallback(() => {
    if (!contextMenu) return;
    const asset = assets.find((a) => a.id === contextMenu.assetId);
    if (asset) {
      setDeleteTarget({
        id: asset.id,
        title: asset.title || asset.originalFilename,
      });
    }
    setContextMenu(null);
  }, [contextMenu, assets]);

  const handleDeleted = useCallback(() => {
    if (deleteTarget && deleteTarget.id === selectedAssetId) {
      onSelectAsset(null);
    }
    setDeleteTarget(null);
  }, [deleteTarget, selectedAssetId, onSelectAsset]);

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
                onSelect={(id) => onSelectAsset(id)}
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
          onDelete={handleDeleteFromMenu}
        />
      )}

      {/* Delete dialog */}
      {deleteTarget && (
        <DeleteDialog
          assetId={deleteTarget.id}
          assetTitle={deleteTarget.title}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
