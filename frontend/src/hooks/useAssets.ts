import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAssets, fetchAsset, fetchTags, deleteAsset, patchAssetTags } from '../lib/api';

export function useAssets(tags?: string[]) {
  return useQuery({
    queryKey: ['assets', { tags }],
    queryFn: () => fetchAssets(tags),
  });
}

export function useAsset(id: string | null) {
  return useQuery({
    queryKey: ['assets', id],
    queryFn: () => fetchAsset(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.status === 'ingesting' ? 4000 : false;
    },
  });
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: fetchTags,
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deleteFile }: { id: string; deleteFile: boolean }) =>
      deleteAsset(id, deleteFile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function usePatchTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tags }: { id: string; tags: string[] }) =>
      patchAssetTags(id, tags),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['assets', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}
