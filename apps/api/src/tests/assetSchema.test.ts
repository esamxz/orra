import { describe, it, expect } from 'vitest';
import {
  ProjectUploadIntentBodySchema,
  BrandUploadIntentBodySchema,
  MAX_UPLOAD_SIZE_BYTES,
} from '../schemas/asset.js';

describe('ProjectUploadIntentBodySchema', () => {
  it('accepts a valid upload intent', () => {
    const result = ProjectUploadIntentBodySchema.safeParse({
      fileName: 'hero.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      kind: 'upload',
    });
    expect(result.success).toBe(true);
  });

  it('accepts image/jpeg', () => {
    const result = ProjectUploadIntentBodySchema.safeParse({
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
      kind: 'upload',
    });
    expect(result.success).toBe(true);
  });

  it('accepts image/webp', () => {
    const result = ProjectUploadIntentBodySchema.safeParse({
      fileName: 'graphic.webp',
      contentType: 'image/webp',
      sizeBytes: 1024,
      kind: 'reference',
    });
    expect(result.success).toBe(true);
  });

  it('rejects image/svg+xml', () => {
    const result = ProjectUploadIntentBodySchema.safeParse({
      fileName: 'icon.svg',
      contentType: 'image/svg+xml',
      sizeBytes: 1024,
      kind: 'upload',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Unsupported content type');
    }
  });

  it('rejects unsupported content type', () => {
    const result = ProjectUploadIntentBodySchema.safeParse({
      fileName: 'file.gif',
      contentType: 'image/gif',
      sizeBytes: 1024,
      kind: 'upload',
    });
    expect(result.success).toBe(false);
  });

  it('rejects oversized file', () => {
    const result = ProjectUploadIntentBodySchema.safeParse({
      fileName: 'huge.png',
      contentType: 'image/png',
      sizeBytes: MAX_UPLOAD_SIZE_BYTES + 1,
      kind: 'upload',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('10 MB');
    }
  });

  it('rejects invalid project kind', () => {
    const result = ProjectUploadIntentBodySchema.safeParse({
      fileName: 'hero.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      kind: 'logo',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("'upload' or 'reference'");
    }
  });

  it('rejects path traversal filename', () => {
    const result = ProjectUploadIntentBodySchema.safeParse({
      fileName: '../../../etc/passwd',
      contentType: 'image/png',
      sizeBytes: 1024,
      kind: 'upload',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('path traversal');
    }
  });

  it('rejects empty filename', () => {
    const result = ProjectUploadIntentBodySchema.safeParse({
      fileName: '',
      contentType: 'image/png',
      sizeBytes: 1024,
      kind: 'upload',
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero size', () => {
    const result = ProjectUploadIntentBodySchema.safeParse({
      fileName: 'hero.png',
      contentType: 'image/png',
      sizeBytes: 0,
      kind: 'upload',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative size', () => {
    const result = ProjectUploadIntentBodySchema.safeParse({
      fileName: 'hero.png',
      contentType: 'image/png',
      sizeBytes: -1,
      kind: 'upload',
    });
    expect(result.success).toBe(false);
  });
});

describe('BrandUploadIntentBodySchema', () => {
  it('accepts a valid logo upload intent', () => {
    const result = BrandUploadIntentBodySchema.safeParse({
      fileName: 'logo.png',
      contentType: 'image/png',
      sizeBytes: 2048,
      kind: 'logo',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid reference upload intent', () => {
    const result = BrandUploadIntentBodySchema.safeParse({
      fileName: 'ref.webp',
      contentType: 'image/webp',
      sizeBytes: 1024,
      kind: 'reference',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid brand kind', () => {
    const result = BrandUploadIntentBodySchema.safeParse({
      fileName: 'logo.png',
      contentType: 'image/png',
      sizeBytes: 2048,
      kind: 'upload',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("'logo' or 'reference'");
    }
  });

  it('rejects SVG content type', () => {
    const result = BrandUploadIntentBodySchema.safeParse({
      fileName: 'logo.svg',
      contentType: 'image/svg+xml',
      sizeBytes: 1024,
      kind: 'logo',
    });
    expect(result.success).toBe(false);
  });
});
