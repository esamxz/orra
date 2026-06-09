import { apiClient } from './client.js';
import type {
  AssetDto,
  UploadIntentInput,
  UploadIntentResponse,
  ConfirmAssetUploadInput,
} from './types.js';

// ---------------------------------------------------------------------------
// Asset upload API functions
// ---------------------------------------------------------------------------
// Thin wrappers over the API client. No business logic here.

export async function createProjectAssetUploadIntent(
  projectId: string,
  input: UploadIntentInput,
): Promise<UploadIntentResponse> {
  return apiClient.request<UploadIntentResponse>(`/projects/${projectId}/assets/upload-intent`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function confirmProjectAssetUpload(
  projectId: string,
  assetId: string,
  input?: ConfirmAssetUploadInput,
): Promise<AssetDto> {
  return apiClient.request<AssetDto>(`/projects/${projectId}/assets/${assetId}/confirm`, {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
  });
}

export async function createBrandAssetUploadIntent(
  brandSystemId: string,
  input: UploadIntentInput,
): Promise<UploadIntentResponse> {
  return apiClient.request<UploadIntentResponse>(`/brand-systems/${brandSystemId}/assets/upload-intent`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function confirmBrandAssetUpload(
  brandSystemId: string,
  assetId: string,
  input?: ConfirmAssetUploadInput,
): Promise<AssetDto> {
  return apiClient.request<AssetDto>(`/brand-systems/${brandSystemId}/assets/${assetId}/confirm`, {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
  });
}
