import type { ArtifactDocument, Ratio } from '@orra/shared';
import { ArtifactDocumentSchema } from '@orra/shared';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Artifact document factory
// ---------------------------------------------------------------------------
// Builds an empty but valid ArtifactDocument for a newly created project.
// The document passes packages/shared ArtifactDocumentSchema validation.
// No fake user-visible design content is included.

export interface BuildInitialDocumentInput {
  artifactId: string;
  projectType: 'post' | 'carousel' | 'from_assets';
  ratio: Ratio;
}

/**
 * Create a minimal valid ArtifactDocument for a new project.
 *
 * - One card with index 0 and empty layers.
 * - baseColor uses the app's dark slate anchor color.
 * - project type 'from_assets' maps to artifact type 'post'.
 * - version starts at 1 because this is the first persisted snapshot.
 */
export function buildInitialArtifactDocument(
  input: BuildInitialDocumentInput
): ArtifactDocument {
  const artifactType = input.projectType === 'carousel' ? 'carousel' : 'post';

  const document: ArtifactDocument = {
    schemaVersion: 1,
    artifactId: input.artifactId,
    type: artifactType,
    ratio: input.ratio,
    cards: [
      {
        id: randomUUID(),
        index: 0,
        baseColor: '#1d2a30',
        layers: [],
      },
    ],
    version: 1,
  };

  // Defensive: re-validate with shared schema so any drift is caught early.
  const parsed = ArtifactDocumentSchema.safeParse(document);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Built initial artifact document failed validation: ${issues}`);
  }

  return parsed.data;
}
