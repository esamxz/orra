import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
} from '../projects.js';
import * as clientModule from '../client.js';

describe('projects API', () => {
  beforeEach(() => {
    vi.spyOn(clientModule.apiClient, 'request').mockImplementation(async () => ({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listProjects calls correct endpoint without query params', async () => {
    await listProjects();
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/projects');
  });

  it('listProjects passes tab and limit query params', async () => {
    await listProjects('recent', 10);
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/projects?tab=recent&limit=10');
  });

  it('createProject sends correct body', async () => {
    const input = {
      name: 'Test Carousel',
      type: 'carousel' as const,
      ratio: { name: '4:5', w: 4, h: 5 },
      brandSystemId: 'brand-1',
    };
    await createProject(input);
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  });

  it('getProject calls correct endpoint', async () => {
    await getProject('proj-123');
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/projects/proj-123');
  });

  it('updateProject sends PATCH with correct body', async () => {
    const input = { name: 'Updated' };
    await updateProject('proj-123', input);
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/projects/proj-123', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  });

  it('deleteProject sends DELETE', async () => {
    await deleteProject('proj-123');
    expect(clientModule.apiClient.request).toHaveBeenCalledWith('/projects/proj-123', {
      method: 'DELETE',
    });
  });
});
