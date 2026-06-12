import { apiClient } from './client.js';
import type { GenerationJobDto, CreateGenerationJobInput, GenerationEstimateInput, GenerationEstimateResponse } from './types.js';

// ---------------------------------------------------------------------------
// Generation API functions
// ---------------------------------------------------------------------------
// Thin wrappers over the API client. No business logic here.

export async function createGenerationJob(
  input: CreateGenerationJobInput,
): Promise<GenerationJobDto> {
  return apiClient.request<GenerationJobDto>('/generate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getGenerationJob(jobId: string): Promise<GenerationJobDto> {
  return apiClient.request<GenerationJobDto>(`/jobs/${jobId}`);
}

export async function getGenerationEstimate(
  projectId: string,
  input: GenerationEstimateInput,
): Promise<GenerationEstimateResponse> {
  return apiClient.request<GenerationEstimateResponse>(
    `/projects/${projectId}/generation-estimate`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}
