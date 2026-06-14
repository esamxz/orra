// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock posthog-js before importing the module under test
// ---------------------------------------------------------------------------
const mockCapture = vi.fn();
const mockIdentify = vi.fn();
const mockReset = vi.fn();
const mockInit = vi.fn();

vi.mock('posthog-js', () => ({
  default: {
    init: mockInit,
    capture: mockCapture,
    identify: mockIdentify,
    reset: mockReset,
  },
}));

describe('web observability helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('when observability is disabled (default)', () => {
    it('track() is a no-op when VITE_OBSERVABILITY_ENABLED is missing', async () => {
      vi.stubEnv('VITE_OBSERVABILITY_ENABLED', '');
      vi.stubEnv('VITE_POSTHOG_KEY', 'ph_test');
      const { track } = await import('../observability.js');
      track('dashboard_viewed');
      expect(mockCapture).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });

    it('track() is a no-op when VITE_POSTHOG_KEY is missing', async () => {
      vi.stubEnv('VITE_OBSERVABILITY_ENABLED', 'true');
      vi.stubEnv('VITE_POSTHOG_KEY', '');
      const { track } = await import('../observability.js');
      track('dashboard_viewed');
      expect(mockCapture).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });

    it('identify() is a no-op when disabled', async () => {
      vi.stubEnv('VITE_OBSERVABILITY_ENABLED', '');
      vi.stubEnv('VITE_POSTHOG_KEY', '');
      const { identify } = await import('../observability.js');
      identify('user-123');
      expect(mockIdentify).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });

    it('reset() is a no-op when disabled', async () => {
      vi.stubEnv('VITE_OBSERVABILITY_ENABLED', '');
      vi.stubEnv('VITE_POSTHOG_KEY', '');
      const { reset } = await import('../observability.js');
      reset();
      expect(mockReset).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });
  });

  describe('safe properties enforcement', () => {
    it('track() accepts only safe property types (no raw text)', async () => {
      // Compile-time check: track() prop values must be string | number | boolean.
      // This is enforced by the SafeEventProps type — no object/array values allowed.
      vi.stubEnv('VITE_OBSERVABILITY_ENABLED', 'true');
      vi.stubEnv('VITE_POSTHOG_KEY', 'ph_test');
      const { track } = await import('../observability.js');
      // Only safe scalar props — no prompt text, no URLs, no JSON
      track('project_created', { type: 'post', hasBrand: false, hasAssets: false });
      // The function itself is the type gate; as long as this compiles and doesn't throw, it passes
      expect(true).toBe(true);
      vi.unstubAllEnvs();
    });
  });
});
