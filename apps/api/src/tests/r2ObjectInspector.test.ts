import { describe, it, expect } from 'vitest';
import {
  FakeR2ObjectInspector,
  createR2ObjectInspector,
} from '../r2/r2ObjectInspector.js';
import { ApiError } from '../errors.js';

describe('FakeR2ObjectInspector', () => {
  it('returns exists: false for unregistered key', async () => {
    const inspector = new FakeR2ObjectInspector();
    const meta = await inspector.headObject('some/key.png');
    expect(meta.exists).toBe(false);
    expect(meta.sizeBytes).toBeUndefined();
  });

  it('returns metadata for registered key', async () => {
    const inspector = new FakeR2ObjectInspector();
    inspector.register('workspace/ws-1/key.png', {
      sizeBytes: 1024,
      contentType: 'image/png',
      etag: '"abc123"',
      uploadedAt: '2026-01-01T00:00:00Z',
    });

    const meta = await inspector.headObject('workspace/ws-1/key.png');
    expect(meta.exists).toBe(true);
    expect(meta.sizeBytes).toBe(1024);
    expect(meta.contentType).toBe('image/png');
    expect(meta.etag).toBe('"abc123"');
    expect(meta.uploadedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('returns exists: false after unregister', async () => {
    const inspector = new FakeR2ObjectInspector();
    inspector.register('k', { sizeBytes: 1 });
    inspector.unregister('k');
    const meta = await inspector.headObject('k');
    expect(meta.exists).toBe(false);
  });

  it('clears all registrations', async () => {
    const inspector = new FakeR2ObjectInspector();
    inspector.register('a', { sizeBytes: 1 });
    inspector.register('b', { sizeBytes: 2 });
    inspector.clear();
    expect((await inspector.headObject('a')).exists).toBe(false);
    expect((await inspector.headObject('b')).exists).toBe(false);
  });
});

describe('createR2ObjectInspector', () => {
  it('returns FakeR2ObjectInspector in development', () => {
    const inspector = createR2ObjectInspector({ ENVIRONMENT: 'development' });
    expect(inspector).toBeInstanceOf(FakeR2ObjectInspector);
  });

  it('returns FakeR2ObjectInspector in test', () => {
    const inspector = createR2ObjectInspector({ ENVIRONMENT: 'test' });
    expect(inspector).toBeInstanceOf(FakeR2ObjectInspector);
  });

  it('throws INTERNAL in production when ORRA_ASSETS is missing', () => {
    expect(() => createR2ObjectInspector({ ENVIRONMENT: 'production' })).toThrow(ApiError);
    expect(() => createR2ObjectInspector({ ENVIRONMENT: 'production' })).toThrow(
      'ORRA_ASSETS is not available'
    );
  });

  it('throws INTERNAL in staging when ORRA_ASSETS is missing', () => {
    expect(() => createR2ObjectInspector({ ENVIRONMENT: 'staging' })).toThrow(ApiError);
  });

  it('does not expose secrets in error messages', () => {
    let caught = false;
    try {
      createR2ObjectInspector({ ENVIRONMENT: 'production' });
    } catch (err) {
      caught = true;
      const message = (err as ApiError).message;
      expect(message).not.toContain('secret');
    }
    expect(caught).toBe(true);
  });
});
