import { describe, it, expect } from 'vitest';
import { buildInitialArtifactDocument } from '../artifact-document/factory.js';
import { ArtifactDocumentSchema } from '@orra/shared';

describe('buildInitialArtifactDocument', () => {
  it('creates a valid document for a post project', () => {
    const doc = buildInitialArtifactDocument({
      artifactId: '11111111-1111-1111-1111-111111111111',
      projectType: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 },
    });

    const parsed = ArtifactDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
    expect(doc.type).toBe('post');
    expect(doc.cards).toHaveLength(1);
    expect(doc.cards[0].index).toBe(0);
    expect(doc.version).toBe(1);
    expect(doc.schemaVersion).toBe(1);
  });

  it('creates a valid document for a carousel project', () => {
    const doc = buildInitialArtifactDocument({
      artifactId: '11111111-1111-1111-1111-111111111111',
      projectType: 'carousel',
      ratio: { name: '1:1', w: 1080, h: 1080 },
    });

    const parsed = ArtifactDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
    expect(doc.type).toBe('carousel');
    expect(doc.cards).toHaveLength(1);
  });

  it('maps from_assets project type to post artifact type', () => {
    const doc = buildInitialArtifactDocument({
      artifactId: '11111111-1111-1111-1111-111111111111',
      projectType: 'from_assets',
      ratio: { name: '9:16', w: 1080, h: 1920 },
    });

    expect(doc.type).toBe('post');
    const parsed = ArtifactDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
  });

  it('uses the provided ratio', () => {
    const doc = buildInitialArtifactDocument({
      artifactId: '11111111-1111-1111-1111-111111111111',
      projectType: 'post',
      ratio: { name: '16:9', w: 1920, h: 1080 },
    });

    expect(doc.ratio).toEqual({ name: '16:9', w: 1920, h: 1080 });
  });

  it('does not include invalid layer types', () => {
    const doc = buildInitialArtifactDocument({
      artifactId: '11111111-1111-1111-1111-111111111111',
      projectType: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 },
    });

    // All layers in the document must be valid per the discriminated union.
    expect(doc.cards[0].layers).toEqual([]);
    const parsed = ArtifactDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
  });

  it('uses the provided artifactId', () => {
    const doc = buildInitialArtifactDocument({
      artifactId: '22222222-2222-2222-2222-222222222222',
      projectType: 'post',
      ratio: { name: '4:5', w: 1080, h: 1350 },
    });

    expect(doc.artifactId).toBe('22222222-2222-2222-2222-222222222222');
  });
});
