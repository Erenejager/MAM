import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAssets, fetchAsset, fetchTags, deleteAsset, patchAssetTags,
  patchAsset, fetchCustomFields, createCustomField, deleteCustomField,
  fetchCustomValues, patchCustomValue,
} from '../lib/api';
import type { Asset, CustomField, CustomValue } from '../types/asset';

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

export function usePatchAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title?: string; description?: string } }) =>
      patchAsset(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['assets', id] });
      const previous = queryClient.getQueryData<Asset>(['assets', id]);
      queryClient.setQueryData<Asset>(['assets', id], (old) => old ? { ...old, ...data } : old);
      return { previous };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['assets', id], context.previous);
      }
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['assets', id] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

export function useCustomFields() {
  return useQuery<CustomField[]>({
    queryKey: ['custom-fields'],
    queryFn: fetchCustomFields,
  });
}

export function useCreateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createCustomField(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
    },
  });
}

export function useDeleteCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCustomField(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
    },
  });
}

export function useCustomValues(assetId: string) {
  return useQuery<CustomValue[]>({
    queryKey: ['custom-values', assetId],
    queryFn: () => fetchCustomValues(assetId),
    enabled: !!assetId,
  });
}

export function usePatchCustomValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, fieldId, value }: { assetId: string; fieldId: string; value: string }) =>
      patchCustomValue(assetId, fieldId, value),
    onSuccess: (_data, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: ['custom-values', assetId] });
    },
  });
}
