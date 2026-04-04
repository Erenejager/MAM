import { useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAssets } from '../lib/api';
import type { Asset } from '../types/asset';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function useIngestingAssets(onImportComplete?: () => void) {
  const { data: allAssets, ...rest } = useQuery({
    queryKey: ['assets'],
    queryFn: () => fetchAssets(),
    refetchInterval: (query) => {
      const assets = query.state.data as Asset[] | undefined;
      if (!assets) return false;
      const hasIngesting = assets.some((a) => a.status === 'ingesting');
      return hasIngesting ? 2500 : false;
    },
  });

  // Track which asset IDs were ingesting on the previous render
  const prevIngestingIds = useRef<Set<string>>(new Set());

  const inProgress = useMemo(
    () =>
      (allAssets ?? [])
        .filter((a) => a.status === 'ingesting')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [allAssets],
  );

  // Detect when an asset transitions from ingesting to ready/error
  useEffect(() => {
    const currentIds = new Set(inProgress.map((a) => a.id));
    for (const prevId of prevIngestingIds.current) {
      if (!currentIds.has(prevId)) {
        // This asset was ingesting before and no longer is — it completed
        onImportComplete?.();
      }
    }
    prevIngestingIds.current = currentIds;
  }, [inProgress, onImportComplete]);

  const recentCompleted = useMemo(() => {
    const cutoff = Date.now() - THREE_DAYS_MS;
    return (allAssets ?? [])
      .filter(
        (a) =>
          (a.status === 'ready' || a.status === 'error') &&
          new Date(a.createdAt).getTime() >= cutoff,
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allAssets]);

  return { inProgress, recentCompleted, allAssets, ...rest };
}
