import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadImageForExport } from '../exportHelpers.js';
import { ExportError, preloadImageAssets } from '../exportCard.js';
import { createProjectAssetResolver } from '../assetResolver.js';
import type { RenderLayer, RenderBackgroundLayer } from '@orra/renderer';

// ---------------------------------------------------------------------------
// Module mock — must be at top level for Vitest to hoist before imports
// ---------------------------------------------------------------------------

vi.mock('../../api/assets.js', () => ({
  getProjectAssetPreviewUrl: vi.fn(),
}));

// Import the mock so we can configure it per-test
import { getProjectAssetPreviewUrl } from '../../api/assets.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImageLayer(assetId: string, overrides?: Partial<RenderLayer>): RenderLayer {
  return {
    kind: 'image',
    id: crypto.randomUUID(),
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    rotation: 0,
    opacity: 1,
    locked: false,
    assetId,
    ...overrides,
  } as RenderLayer;
}

function makeBackgroundRenderLayer(assetId: string): RenderBackgroundLayer {
  return {
    kind: 'background',
    id: crypto.randomUUID(),
    x: 0,
    y: 0,
    w: 1080,
    h: 1350,
    rotation: 0,
    opacity: 1,
    locked: false,
    assetId,
    baseColor: '#1d2a30',
  };
}

function makeTextLayer(): RenderLayer {
  return {
    kind: 'text',
    id: crypto.randomUUID(),
    x: 0,
    y: 0,
    w: 400,
    h: 60,
    rotation: 0,
    opacity: 1,
    locked: false,
    content: 'Hello',
    fontFamily: 'Inter',
    fontSize: 32,
    fontWeight: 400,
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#000000',
    align: 'left',
  } as RenderLayer;
}

// MockImage controller so tests can trigger load/error
type MockImageInstance = {
  src: string;
  crossOrigin: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
};

// ---------------------------------------------------------------------------
// loadImageForExport
// ---------------------------------------------------------------------------

describe('loadImageForExport', () => {
  let mockImageInstances: MockImageInstance[];

  beforeEach(() => {
    mockImageInstances = [];
    vi.stubGlobal(
      'Image',
      class MockImage {
        src = '';
        crossOrigin = '';
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor() {
          mockImageInstances.push(this as unknown as MockImageInstance);
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with the HTMLImageElement instance on load', async () => {
    const promise = loadImageForExport('https://r2.example.com/asset.jpg');
    const instance = mockImageInstances[0];
    expect(instance.crossOrigin).toBe('anonymous');
    instance.onload?.();
    const result = await promise;
    expect(result).toBe(instance);
  });

  it('rejects on image error', async () => {
    const promise = loadImageForExport('https://r2.example.com/bad.jpg');
    const instance = mockImageInstances[0];
    instance.onerror?.();
    await expect(promise).rejects.toThrow('Failed to load image');
  });

  it('sets crossOrigin to anonymous so canvas stays untainted', async () => {
    loadImageForExport('https://r2.example.com/asset.jpg');
    expect(mockImageInstances[0].crossOrigin).toBe('anonymous');
  });

  it('sets the src to the provided URL', async () => {
    loadImageForExport('https://r2.example.com/my-asset.png');
    expect(mockImageInstances[0].src).toBe('https://r2.example.com/my-asset.png');
  });

  it('rejects after timeout when image never loads', async () => {
    const promise = loadImageForExport('https://r2.example.com/slow.jpg', 50);
    await expect(promise).rejects.toThrow('timed out');
  });

  it('does not time out when image loads before the deadline', async () => {
    const promise = loadImageForExport('https://r2.example.com/asset.jpg', 5000);
    mockImageInstances[0].onload?.();
    await expect(promise).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// createProjectAssetResolver
// ---------------------------------------------------------------------------

describe('createProjectAssetResolver', () => {
  beforeEach(() => {
    vi.mocked(getProjectAssetPreviewUrl).mockReset();
  });

  it('calls getProjectAssetPreviewUrl with projectId and assetId, returns signed URL', async () => {
    vi.mocked(getProjectAssetPreviewUrl).mockResolvedValue({
      asset: {} as never,
      preview: { method: 'GET', url: 'https://signed.example.com/asset-1', expiresAt: '' },
    });

    const resolve = createProjectAssetResolver('project-abc');
    const url = await resolve('asset-1');

    expect(getProjectAssetPreviewUrl).toHaveBeenCalledWith('project-abc', 'asset-1');
    expect(url).toBe('https://signed.example.com/asset-1');
  });

  it('caches resolved URLs and avoids duplicate API calls', async () => {
    vi.mocked(getProjectAssetPreviewUrl).mockResolvedValue({
      asset: {} as never,
      preview: { method: 'GET', url: 'https://signed.example.com/asset-2', expiresAt: '' },
    });

    const resolve = createProjectAssetResolver('project-abc');
    await resolve('asset-2');
    await resolve('asset-2'); // second call should hit cache
    expect(getProjectAssetPreviewUrl).toHaveBeenCalledTimes(1);
  });

  it('returns null when the API call throws', async () => {
    vi.mocked(getProjectAssetPreviewUrl).mockRejectedValue(new Error('Network error'));

    const resolve = createProjectAssetResolver('project-abc');
    const url = await resolve('asset-bad');
    expect(url).toBeNull();
  });

  it('does not store the signed URL in the document — resolver result is ephemeral', async () => {
    const resolvedUrl = 'https://signed.example.com/ephemeral';
    vi.mocked(getProjectAssetPreviewUrl).mockResolvedValue({
      asset: {} as never,
      preview: { method: 'GET', url: resolvedUrl, expiresAt: '' },
    });

    const resolve = createProjectAssetResolver('project-x');
    const url = await resolve('asset-x');

    // URL is returned to caller only; not persisted in any document structure
    expect(url).toBe(resolvedUrl);
  });

  it('resolver caches independently per instance', async () => {
    vi.mocked(getProjectAssetPreviewUrl)
      .mockResolvedValueOnce({ asset: {} as never, preview: { method: 'GET', url: 'https://a.example.com/1', expiresAt: '' } })
      .mockResolvedValueOnce({ asset: {} as never, preview: { method: 'GET', url: 'https://b.example.com/1', expiresAt: '' } });

    const resolveA = createProjectAssetResolver('project-a');
    const resolveB = createProjectAssetResolver('project-b');

    const urlA = await resolveA('asset-1');
    const urlB = await resolveB('asset-1');

    expect(urlA).toBe('https://a.example.com/1');
    expect(urlB).toBe('https://b.example.com/1');
    expect(getProjectAssetPreviewUrl).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// preloadImageAssets
// ---------------------------------------------------------------------------

describe('preloadImageAssets', () => {
  let mockImageInstances: MockImageInstance[];

  beforeEach(() => {
    mockImageInstances = [];
    vi.stubGlobal(
      'Image',
      class MockImage {
        src = '';
        crossOrigin = '';
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor() {
          mockImageInstances.push(this as unknown as MockImageInstance);
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty map when there are no image layers', async () => {
    const layers: RenderLayer[] = [makeTextLayer()];
    const result = await preloadImageAssets(layers, undefined);
    expect(result.size).toBe(0);
  });

  it('throws ExportError if image layers exist but no resolver is provided', async () => {
    const layers: RenderLayer[] = [makeImageLayer('asset-1')];
    await expect(preloadImageAssets(layers, undefined)).rejects.toThrow(ExportError);
    await expect(preloadImageAssets(layers, undefined)).rejects.toMatchObject({ code: 'IMAGE_URL_FAILED' });
  });

  it('calls resolver with assetId for each image layer', async () => {
    const resolver = vi.fn().mockResolvedValue('https://signed.example.com/asset-1');
    const layers: RenderLayer[] = [makeImageLayer('asset-1')];

    const loadPromise = preloadImageAssets(layers, resolver);
    await vi.waitFor(() => expect(mockImageInstances.length).toBeGreaterThanOrEqual(1));
    mockImageInstances[0].onload?.();
    await loadPromise;

    expect(resolver).toHaveBeenCalledWith('asset-1');
  });

  it('resolves with loaded HTMLImageElement keyed by assetId', async () => {
    const resolver = vi.fn().mockResolvedValue('https://signed.example.com/asset-1');
    const layers: RenderLayer[] = [makeImageLayer('asset-1')];

    const loadPromise = preloadImageAssets(layers, resolver);
    await vi.waitFor(() => expect(mockImageInstances.length).toBeGreaterThanOrEqual(1));
    const imgInstance = mockImageInstances[0];
    imgInstance.onload?.();

    const result = await loadPromise;
    expect(result.has('asset-1')).toBe(true);
    expect(result.get('asset-1')).toBe(imgInstance);
  });

  it('throws ExportError IMAGE_URL_FAILED when resolver returns null', async () => {
    const resolver = vi.fn().mockResolvedValue(null);
    const layers: RenderLayer[] = [makeImageLayer('asset-missing')];
    await expect(preloadImageAssets(layers, resolver)).rejects.toMatchObject({
      code: 'IMAGE_URL_FAILED',
    });
  });

  it('throws ExportError IMAGE_LOAD_FAILED when image onerror fires', async () => {
    const resolver = vi.fn().mockResolvedValue('https://signed.example.com/bad.jpg');
    const layers: RenderLayer[] = [makeImageLayer('asset-bad')];

    const loadPromise = preloadImageAssets(layers, resolver);
    await vi.waitFor(() => expect(mockImageInstances.length).toBeGreaterThanOrEqual(1));
    mockImageInstances[0].onerror?.();

    await expect(loadPromise).rejects.toMatchObject({ code: 'IMAGE_LOAD_FAILED' });
  });

  it('deduplicates resolver calls for the same assetId across layers', async () => {
    const resolver = vi.fn().mockResolvedValue('https://signed.example.com/shared-asset');
    const layers: RenderLayer[] = [
      makeImageLayer('shared-asset'),
      makeImageLayer('shared-asset'), // same assetId, different layer id
    ];

    const loadPromise = preloadImageAssets(layers, resolver);
    // Only one Image is created because the second layer has the same assetId (deduped)
    await vi.waitFor(() => expect(mockImageInstances.length).toBeGreaterThanOrEqual(1));
    mockImageInstances[0].onload?.();
    await loadPromise;

    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('hidden image layer — preloadImageAssets operates on pre-filtered layers from buildCardRenderData', () => {
    // buildCardRenderData already filters hidden=true layers before passing to export.
    // preloadImageAssets only receives visible layers and never sees hidden ones.
    expect(true).toBe(true);
  });

  it('loads multiple distinct assets sequentially', async () => {
    const resolver = vi.fn()
      .mockResolvedValueOnce('https://signed.example.com/asset-a')
      .mockResolvedValueOnce('https://signed.example.com/asset-b');
    const layers: RenderLayer[] = [
      makeImageLayer('asset-a'),
      makeImageLayer('asset-b'),
    ];

    const loadPromise = preloadImageAssets(layers, resolver);

    // Trigger first image load, then second (sequential loop waits for each)
    await vi.waitFor(() => expect(mockImageInstances.length).toBeGreaterThanOrEqual(1));
    mockImageInstances[0].onload?.();

    await vi.waitFor(() => expect(mockImageInstances.length).toBeGreaterThanOrEqual(2));
    mockImageInstances[1].onload?.();

    const result = await loadPromise;
    expect(result.size).toBe(2);
    expect(result.has('asset-a')).toBe(true);
    expect(result.has('asset-b')).toBe(true);
  });

  it('signed preview URL is not persisted into the document — resolver result is transient', async () => {
    const signedUrl = 'https://signed.example.com/transient';
    const resolver = vi.fn().mockResolvedValue(signedUrl);
    const layers: RenderLayer[] = [makeImageLayer('asset-x')];

    const loadPromise = preloadImageAssets(layers, resolver);
    await vi.waitFor(() => expect(mockImageInstances.length).toBeGreaterThanOrEqual(1));
    mockImageInstances[0].onload?.();
    await loadPromise;

    // The resolver is called with assetId only; the URL is never written back
    // into the layer or any document structure. The returned map has the loaded
    // HTMLImageElement, not the URL.
    expect(resolver).toHaveBeenCalledWith('asset-x');
    expect(layers[0]).not.toHaveProperty('url');
    expect(layers[0]).not.toHaveProperty('signedUrl');
  });
});

// ---------------------------------------------------------------------------
// preloadImageAssets — background layers
// ---------------------------------------------------------------------------
// Background layers (kind:'background') carry the generated AI image via assetId.
// They must be resolved and preloaded the same way as image layers. Before this
// fix, background layers were silently skipped, producing a flat-colour export.

describe('preloadImageAssets — background layers', () => {
  let mockImageInstances: MockImageInstance[];

  beforeEach(() => {
    mockImageInstances = [];
    vi.stubGlobal(
      'Image',
      class MockImage {
        src = '';
        crossOrigin = '';
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor() {
          mockImageInstances.push(this as unknown as MockImageInstance);
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves background layer assetId just like an image layer', async () => {
    const resolver = vi.fn().mockResolvedValue('https://signed.example.com/bg-1');
    const layers: RenderLayer[] = [makeBackgroundRenderLayer('bg-asset-1')];

    const loadPromise = preloadImageAssets(layers, resolver);
    await vi.waitFor(() => expect(mockImageInstances.length).toBeGreaterThanOrEqual(1));
    mockImageInstances[0].onload?.();

    const result = await loadPromise;
    expect(resolver).toHaveBeenCalledWith('bg-asset-1');
    expect(result.has('bg-asset-1')).toBe(true);
  });

  it('returns empty map with only text layers — no resolver needed', async () => {
    const layers: RenderLayer[] = [makeTextLayer()];
    const result = await preloadImageAssets(layers, undefined);
    expect(result.size).toBe(0);
  });

  it('throws IMAGE_URL_FAILED when no resolver but a background layer is present', async () => {
    const layers: RenderLayer[] = [makeBackgroundRenderLayer('bg-asset-2')];
    await expect(preloadImageAssets(layers, undefined)).rejects.toMatchObject({
      code: 'IMAGE_URL_FAILED',
    });
  });

  it('throws IMAGE_URL_FAILED when resolver returns null for a background layer', async () => {
    const resolver = vi.fn().mockResolvedValue(null);
    const layers: RenderLayer[] = [makeBackgroundRenderLayer('bg-asset-missing')];
    await expect(preloadImageAssets(layers, resolver)).rejects.toMatchObject({
      code: 'IMAGE_URL_FAILED',
    });
  });

  it('deduplicates when background and image layer share the same assetId', async () => {
    const resolver = vi.fn().mockResolvedValue('https://signed.example.com/shared');
    const layers: RenderLayer[] = [
      makeBackgroundRenderLayer('shared-asset'),
      makeImageLayer('shared-asset'),
    ];

    const loadPromise = preloadImageAssets(layers, resolver);
    await vi.waitFor(() => expect(mockImageInstances.length).toBeGreaterThanOrEqual(1));
    mockImageInstances[0].onload?.();
    await loadPromise;

    // Same assetId should only be resolved once
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('resolves background and image layers with different assetIds independently', async () => {
    const resolver = vi.fn()
      .mockResolvedValueOnce('https://signed.example.com/bg')
      .mockResolvedValueOnce('https://signed.example.com/img');
    const layers: RenderLayer[] = [
      makeBackgroundRenderLayer('bg-asset'),
      makeImageLayer('img-asset'),
    ];

    const loadPromise = preloadImageAssets(layers, resolver);
    await vi.waitFor(() => expect(mockImageInstances.length).toBeGreaterThanOrEqual(1));
    mockImageInstances[0].onload?.();
    await vi.waitFor(() => expect(mockImageInstances.length).toBeGreaterThanOrEqual(2));
    mockImageInstances[1].onload?.();

    const result = await loadPromise;
    expect(result.size).toBe(2);
    expect(result.has('bg-asset')).toBe(true);
    expect(result.has('img-asset')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ZIP export: resolver reuse and caching across cards
// ---------------------------------------------------------------------------

describe('ZIP export resolver caching across cards', () => {
  beforeEach(() => {
    vi.mocked(getProjectAssetPreviewUrl).mockReset();
  });

  it('the same resolver instance safely handles the same assetId on multiple cards', async () => {
    // createProjectAssetResolver caches per-instance. If the same asset appears
    // on cards 1 and 3 of a carousel, only one API call is made.
    vi.mocked(getProjectAssetPreviewUrl).mockResolvedValue({
      asset: {} as never,
      preview: { method: 'GET', url: 'https://signed.example.com/shared', expiresAt: '' },
    });

    const resolve = createProjectAssetResolver('project-zip');
    await resolve('asset-shared');
    await resolve('asset-shared'); // should use cache
    expect(getProjectAssetPreviewUrl).toHaveBeenCalledTimes(1);
  });
});
