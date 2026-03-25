import type { Asset, TagCount } from '../types/asset';

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
