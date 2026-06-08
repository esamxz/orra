import type { ArtifactDocument } from '@orra/shared';

// ---------------------------------------------------------------------------
// Frontend API types
// ---------------------------------------------------------------------------
// These mirror backend DTOs but are owned by the frontend layer.
// They do not import server internals.

export interface Ratio {
  name: string;
  w: number;
  h: number;
}

export interface Project {
  id: string;
  name: string;
  type: 'post' | 'carousel' | 'from_assets';
  ratio: Ratio;
  brandSystemId: string | null;
  sourceTemplateId: string | null;
  currentArtifactId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  type: 'post' | 'carousel' | 'from_assets';
  ratio: Ratio;
  brandSystemId?: string;
}

export interface UpdateProjectInput {
  name?: string;
  ratio?: Ratio;
  brandSystemId?: string | null;
}

export interface ArtifactApiResponse {
  artifactId: string;
  projectId: string;
  currentVersionId: string;
  version: number;
  document: ArtifactDocument;
  createdAt: string;
  updatedAt: string;
}

export interface ApplyActionInput {
  baseVersion: number;
  action: unknown;
}

export interface ApplyActionApiResponse {
  artifactId: string;
  projectId: string;
  currentVersionId: string;
  version: number;
  document: ArtifactDocument;
  artifactVersionNumber: number;
}
