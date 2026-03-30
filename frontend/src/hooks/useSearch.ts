import { useQuery } from '@tanstack/react-query';
import { searchAssets } from '../lib/api';
import type { SearchResponse } from '../types/asset';

export function useSearch(query: string, tags?: string[]) {
  return useQuery<SearchResponse>({
    queryKey: ['search', query, tags],
    queryFn: () => searchAssets(query, tags),
    enabled: query.trim().length > 0,
    staleTime: 30_000,
  });
}
