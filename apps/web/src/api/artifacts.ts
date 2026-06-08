import { ArtifactDocumentSchema } from '@orra/shared';
import { apiClient } from './client.js';
import { ApiClientError } from './errors.js';
import type { ArtifactApiResponse, ApplyActionInput, ApplyActionApiResponse } from './types.js';

// ---------------------------------------------------------------------------
// Artifact API functions
// ---------------------------------------------------------------------------

export async function getArtifact(artifactId: string): Promise<ArtifactApiResponse> {
  const raw = await apiClient.request<{
    artifactId: string;
    projectId: string;
    currentVersionId: string;
    version: number;
    document: unknown;
    createdAt: string;
    updatedAt: string;
  }>(`/artifacts/${artifactId}`);

  // Validate the document against the shared schema before returning.
  const parsed = ArtifactDocumentSchema.safeParse(raw.document);
  if (!parsed.success) {
    throw new ApiClientError(
      'VALIDATION',
      'The artifact document returned by the server is invalid. The editor cannot load it safely.',
    );
  }

  return {
    artifactId: raw.artifactId,
    projectId: raw.projectId,
    currentVersionId: raw.currentVersionId,
    version: raw.version,
    document: parsed.data,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/**
 * Apply a kernel action server-side.
 * Not wired into editor mutations in Phase 8D.1.
 * Exists for Phase 8D.2.
 */
export async function applyArtifactAction(
  artifactId: string,
  input: ApplyActionInput,
): Promise<ApplyActionApiResponse> {
  return apiClient.request<ApplyActionApiResponse>(`/artifacts/${artifactId}/actions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
