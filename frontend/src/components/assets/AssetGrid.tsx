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
  viewMode?: 'grid' | 'list';
}

export function AssetGrid({
  selectedAssetId,
  onSelectAsset,
  searchResults,
  isSearchActive,
  onTimecodeClick,
  selectedTags,
  onToggleTag: _onToggleTag,
  onClearTags: _onClearTags,
  viewMode = 'grid',
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
      <div className="p-md">
        <div className="grid grid-cols-4 gap-sm">
          {Array.from({ length: 8 }).map((_, i) => (
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

  if (viewMode === 'list') {
    return (
      <div className="h-full flex flex-col">
        <div className="px-md pt-md pb-0 overflow-y-auto flex-1 flex flex-col">
          <div className="text-text-dim text-xs">Table view coming soon…</div>
        </div>
        {contextMenu && (
          <AssetContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            onDelete={handleDeleteFromMenu}
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
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-md overflow-y-auto flex-1">
        {/* Asset grid */}
        <div className="grid grid-cols-4 gap-sm">
          <AnimatePresence mode="popLayout">
            {displayAssets.map((asset, index) => (
              <motion.div
                key={asset.id}
                layout
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                style={{ animationDelay: `${index * 50}ms` }}
                className="animate-[listIn_0.5s_cubic-bezier(0.16,1,0.3,1)_backwards]"
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
    </div>
  );
}
