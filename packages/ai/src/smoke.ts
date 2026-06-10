import type { TextPlanRequest } from './types.js';

export function buildSmokeRequest(): TextPlanRequest {
  return {
    projectId: 'smoke-test-project',
    prompt: 'Ready to create a post about the importance of good sleep habits.',
    projectType: 'post',
    ratio: { name: '1:1', w: 1080, h: 1080 },
    brandContext: null,
  };
}
