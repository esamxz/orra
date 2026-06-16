import { apiClient } from './client.js';
import type { TrendTemplateDto } from './types.js';

export async function listTrendTemplates(): Promise<TrendTemplateDto[]> {
  return apiClient.request<TrendTemplateDto[]>('/trend-templates');
}
