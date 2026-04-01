import { useState, useMemo } from 'react';
import { AssetTableRow } from './AssetTableRow';
import { SearchTableRow } from './SearchTableRow';
import type { Asset, SearchResult } from '../../types/asset';

type SortColumn = 'title' | 'duration' | 'imported';
type SortDir = 'asc' | 'desc';

interface AssetTableViewProps {
  assets: Asset[];
  displayAssets: Asset[];
  isSearchActive: boolean;
  searchResults?: Map<string, SearchResult>;
  selectedAssetId: string | null;
  onSelectAsset: (id: string | null) => void;
  onTimecodeClick?: (assetId: string, timestamp: number) => void;
  onContextMenu: (e: React.MouseEvent, assetId: string) => void;
}

const HEADERS: Array<{
  key: string;
  label: string;
  width?: number;
  flex?: number;
  sortable: boolean;
}> = [
  { key: 'thumbnail',   label: '',         width: 40,  sortable: false },
  { key: 'title',       label: 'Title',    flex: 1,    sortable: true  },
  { key: 'description', label: 'Desc',     width: 160, sortable: false },
  { key: 'duration',    label: 'Duration', width: 50,  sortable: true  },
  { key: 'imported',    label: 'Imported', width: 60,  sortable: true  },
  { key: 'tags',        label: 'Tags',     width: 80,  sortable: false },
  { key: 'transcript',  label: '',         width: 16,  sortable: false },
];

function cycleSortDir(
  col: SortColumn,
  current: SortColumn | null,
  dir: SortDir,
): [SortColumn | null, SortDir] {
  if (current !== col) return [col, 'asc'];
  if (dir === 'asc') return [col, 'desc'];
  return [null, 'asc'];
}

export function AssetTableView({
  displayAssets,
  isSearchActive,
  searchResults,
  selectedAssetId,
  onSelectAsset,
  onTimecodeClick,
  onContextMenu,
}: AssetTableViewProps) {
  const [sortCol, setSortCol] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleHeaderClick = (col: SortColumn) => {
    if (isSearchActive) return;
    const [newCol, newDir] = cycleSortDir(col, sortCol, sortDir);
    setSortCol(newCol);
    setSortDir(newDir);
  };

  const sortedAssets = useMemo(() => {
    if (!sortCol || isSearchActive) return displayAssets;
    return [...displayAssets].sort((a, b) => {
      let valA: string | number = 0;
      let valB: string | number = 0;
      if (sortCol === 'title') {
        valA = (a.title || a.originalFilename).toLowerCase();
        valB = (b.title || b.originalFilename).toLowerCase();
      } else if (sortCol === 'duration') {
        valA = a.durationSeconds ?? 0;
        valB = b.durationSeconds ?? 0;
      } else if (sortCol === 'imported') {
        valA = a.createdAt;
        valB = b.createdAt;
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [displayAssets, sortCol, sortDir, isSearchActive]);

  const headerRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    paddingBottom: 4,
    marginBottom: 4,
  };

  return (
    <div
      role="table"
      aria-label="Assets"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* Column headers */}
      <div role="row" style={headerRowStyle}>
        {HEADERS.map(({ key, label, width, flex, sortable }) => {
          const isActive = sortCol === key;
          const ariaSort = sortable
            ? (isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none')
            : undefined;
          return (
            <div
              key={key}
              role="columnheader"
              aria-sort={ariaSort}
              onClick={sortable ? () => handleHeaderClick(key as SortColumn) : undefined}
              style={{
                width,
                flex,
                flexShrink: width ? 0 : undefined,
                minWidth: 0,
                paddingRight: 8,
                paddingLeft: key === 'thumbnail' ? 6 : undefined,
                fontSize: 7,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.5px',
                color: isActive ? '#71717a' : '#52525b',
                cursor: sortable && !isSearchActive ? 'pointer' : 'default',
                userSelect: 'none' as const,
              }}
            >
              {label}{isActive ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
            </div>
          );
        })}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {sortedAssets.map((asset, index) =>
          isSearchActive && searchResults?.has(asset.id) ? (
            <SearchTableRow
              key={asset.id}
              asset={asset}
              index={index}
              isSelected={asset.id === selectedAssetId}
              searchResult={searchResults.get(asset.id)!}
              onSelect={onSelectAsset}
              onTimecodeClick={onTimecodeClick}
              onContextMenu={onContextMenu}
            />
          ) : (
            <AssetTableRow
              key={asset.id}
              asset={asset}
              index={index}
              isSelected={asset.id === selectedAssetId}
              onSelect={onSelectAsset}
              onContextMenu={onContextMenu}
            />
          )
        )}
      </div>
    </div>
  );
}
