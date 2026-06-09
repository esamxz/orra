import { apiClient } from './client.js';
import type { BrandSystemDto, CreateBrandSystemInput, UpdateBrandSystemInput, ListBrandSystemsParams } from './types.js';

// ---------------------------------------------------------------------------
// Brand system API functions
// ---------------------------------------------------------------------------
// Thin wrappers over the API client. No business logic here.

export async function listBrandSystems(params?: ListBrandSystemsParams): Promise<BrandSystemDto[]> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);
  const qs = query.toString();
  return apiClient.request<BrandSystemDto[]>(`/brand-systems${qs ? `?${qs}` : ''}`);
}

export async function createBrandSystem(input: CreateBrandSystemInput): Promise<BrandSystemDto> {
  return apiClient.request<BrandSystemDto>('/brand-systems', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getBrandSystem(id: string): Promise<BrandSystemDto> {
  return apiClient.request<BrandSystemDto>(`/brand-systems/${id}`);
}

export async function updateBrandSystem(id: string, input: UpdateBrandSystemInput): Promise<BrandSystemDto> {
  return apiClient.request<BrandSystemDto>(`/brand-systems/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteBrandSystem(id: string): Promise<{ deleted: boolean }> {
  return apiClient.request<{ deleted: boolean }>(`/brand-systems/${id}`, {
    method: 'DELETE',
  });
}
