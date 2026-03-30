import type { Asset, TagCount, CustomField, CustomValue, SearchResponse } from '../types/asset';

const API_BASE = '/api';

export async function fetchAssets(tags?: string[]): Promise<Asset[]> {
  const params = new URLSearchParams();
  if (tags && tags.length > 0) {
    tags.forEach(t => params.append('tags', t));
  }
  const url = `${API_BASE}/assets${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch assets: ${res.status}`);
  return res.json();
}

export async function fetchAsset(id: string): Promise<Asset> {
  const res = await fetch(`${API_BASE}/assets/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch asset: ${res.status}`);
  return res.json();
}

export async function fetchTags(): Promise<TagCount[]> {
  const res = await fetch(`${API_BASE}/tags`);
  if (!res.ok) throw new Error(`Failed to fetch tags: ${res.status}`);
  return res.json();
}

export async function deleteAsset(id: string, deleteFile: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/assets/${id}?deleteFile=${deleteFile}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete asset: ${res.status}`);
}

export async function patchAssetTags(id: string, tags: string[]): Promise<Asset> {
  const res = await fetch(`${API_BASE}/assets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) throw new Error(`Failed to update tags: ${res.status}`);
  return res.json();
}

export async function patchAsset(id: string, data: { title?: string; description?: string }): Promise<Asset> {
  const res = await fetch(`${API_BASE}/assets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update asset: ${res.status}`);
  return res.json();
}

export async function fetchCustomFields(): Promise<CustomField[]> {
  const res = await fetch(`${API_BASE}/custom-fields`);
  if (!res.ok) throw new Error(`Failed to fetch custom fields: ${res.status}`);
  return res.json();
}

export async function createCustomField(name: string): Promise<CustomField> {
  const res = await fetch(`${API_BASE}/custom-fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type: 'text' }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Failed to create custom field: ${res.status}`);
  }
  return res.json();
}

export async function deleteCustomField(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/custom-fields/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete custom field: ${res.status}`);
}

export async function fetchCustomValues(assetId: string): Promise<CustomValue[]> {
  const res = await fetch(`${API_BASE}/assets/${assetId}/custom-values`);
  if (!res.ok) throw new Error(`Failed to fetch custom values: ${res.status}`);
  return res.json();
}

export async function patchCustomValue(assetId: string, fieldId: string, value: string): Promise<CustomValue> {
  const res = await fetch(`${API_BASE}/assets/${assetId}/custom-values/${fieldId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`Failed to update custom value: ${res.status}`);
  return res.json();
}

export async function searchAssets(q: string, tags?: string[]): Promise<SearchResponse> {
  const params = new URLSearchParams();
  params.append('q', q);
  if (tags && tags.length > 0) {
    tags.forEach(t => params.append('tags', t));
  }
  const res = await fetch(`${API_BASE}/search?${params.toString()}`);
  if (res.status === 503) {
    return { results: [], error: 'search_unavailable' };
  }
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}
