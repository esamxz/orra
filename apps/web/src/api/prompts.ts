import { apiClient } from './client.js';
import type { EnhancePromptRequest, EnhancePromptResponse } from '@orra/shared';

// ---------------------------------------------------------------------------
// Prompts API
// ---------------------------------------------------------------------------

export async function enhancePrompt(input: EnhancePromptRequest): Promise<EnhancePromptResponse> {
  return apiClient.request<EnhancePromptResponse>('/prompts/enhance', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
