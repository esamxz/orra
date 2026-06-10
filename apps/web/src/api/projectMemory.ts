import { apiClient } from './client.js';
import type { ProjectContextMemoryDto } from './types.js';

export async function getProjectMemory(projectId: string): Promise<ProjectContextMemoryDto | null> {
  return apiClient.request<ProjectContextMemoryDto | null>(`/projects/${projectId}/memory`);
}
