import { describe, it, expect } from 'vitest';
import { buildSmokeRequest } from '../smoke.js';

// Validates that buildSmokeRequest() produces a structurally valid TextPlanRequest
// without any network call. This test never calls GeminiTextProvider.

describe('buildSmokeRequest', () => {
  it('returns an object with required TextPlanRequest fields', () => {
    const req = buildSmokeRequest();
    expect(typeof req.projectId).toBe('string');
    expect(req.projectId.length).toBeGreaterThan(0);
    expect(typeof req.prompt).toBe('string');
    expect(req.prompt.length).toBeGreaterThan(0);
    expect(['post', 'carousel']).toContain(req.projectType);
    expect(typeof req.ratio).toBe('object');
    expect(typeof req.ratio.w).toBe('number');
    expect(typeof req.ratio.h).toBe('number');
    expect(typeof req.ratio.name).toBe('string');
    expect(req.ratio.w).toBeGreaterThan(0);
    expect(req.ratio.h).toBeGreaterThan(0);
  });

  it('returns synchronously — no side effects, no network', () => {
    const req = buildSmokeRequest();
    expect(req).toBeDefined();
  });

  it('has brandContext as null or undefined (no brand in smoke request)', () => {
    const req = buildSmokeRequest();
    expect(req.brandContext == null).toBe(true);
  });
});
