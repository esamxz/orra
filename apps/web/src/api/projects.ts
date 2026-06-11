import { apiClient } from './client.js';
import type { Project, CreateProjectInput, UpdateProjectInput, ChatMessageDto } from './types.js';

// ---------------------------------------------------------------------------
// Project API functions
// ---------------------------------------------------------------------------
// Thin wrappers over the API client. No business logic here.

export async function listProjects(tab?: 'recent' | 'all', limit?: number): Promise<Project[]> {
  const params = new URLSearchParams();
  if (tab) params.set('tab', tab);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return apiClient.request<Project[]>(`/projects${qs ? `?${qs}` : ''}`);
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  return apiClient.request<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getProject(id: string): Promise<Project> {
  return apiClient.request<Project>(`/projects/${id}`);
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  return apiClient.request<Project>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteProject(id: string): Promise<{ deleted: boolean }> {
  return apiClient.request<{ deleted: boolean }>(`/projects/${id}`, {
    method: 'DELETE',
  });
}

export interface CreateNewProjectInput extends CreateProjectInput {
  prompt: string;
}

export interface CreateNewProjectResponse {
  project: Project;
  firstMessage: ChatMessageDto;
}

export async function createNewProject(input: CreateNewProjectInput): Promise<CreateNewProjectResponse> {
  return apiClient.request<CreateNewProjectResponse>('/projects/new', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
