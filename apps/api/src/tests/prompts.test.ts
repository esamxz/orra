import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createFakeVerifier } from '../auth/verifier.js';
import promptsRoute, { createPromptsRoute } from '../routes/prompts.js';
import type { AIProvider } from '@orra/ai';
import { AIProviderError } from '@orra/ai';
import type { Repositories } from '../repositories/types.js';
import type { EnhancePromptResponse } from '@orra/shared';

const fakeVerifier = createFakeVerifier();

interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

// ---------------------------------------------------------------------------
// Minimal fake repositories — auth bootstrap only, prompts service uses no DB
// ---------------------------------------------------------------------------

function createMinimalFakeRepositories(): Repositories {
  return {
    user: {
      findByClerkId: async () => null,
      createFromClerkIdentity: async () => ({
        id: 'user-fake-1',
        clerk_id: 'usr_test_fake',
        email: 'test@orra.local',
        display_name: 'Test User',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      }),
    },
    workspace: {
      findPersonalWorkspaceForUser: async () => null,
      createPersonalWorkspace: async () => ({
        id: 'ws-fake-1',
        name: "Test User's Workspace",
        type: 'personal',
        owner_user_id: 'user-fake-1',
        plan: 'free',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      }),
      ensurePersonalWorkspaceForUser: async () => ({
        workspaceId: 'ws-fake-1',
        role: 'owner' as const,
        isNew: false,
      }),
    },
    project: {} as unknown as Repositories['project'],
    artifact: {} as unknown as Repositories['artifact'],
    chat: {} as unknown as Repositories['chat'],
    generationJob: {} as unknown as Repositories['generationJob'],
    credit: {} as unknown as Repositories['credit'],
    brandSystem: {} as unknown as Repositories['brandSystem'],
    asset: {} as unknown as Repositories['asset'],
    projectMemory: {} as unknown as Repositories['projectMemory'],
  } as unknown as Repositories;
}

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestIdMiddleware);
  app.use(createAuthMiddleware(fakeVerifier, { repositories: createMinimalFakeRepositories() }));
  app.route('/v1/prompts', promptsRoute);
  app.onError(errorHandler);
  return app;
}

const AUTH_HEADER = { Authorization: 'Bearer test_valid', 'Content-Type': 'application/json' };
const ENV = { ENVIRONMENT: 'production' } as unknown as Record<string, unknown>;

async function enhance(app: ReturnType<typeof buildApp>, body: unknown) {
  return app.request(
    '/v1/prompts/enhance',
    { method: 'POST', headers: AUTH_HEADER, body: JSON.stringify(body) },
    ENV,
  );
}

// ---------------------------------------------------------------------------
// POST /v1/prompts/enhance
// ---------------------------------------------------------------------------

describe('POST /v1/prompts/enhance', () => {
  describe('validation', () => {
    it('rejects empty prompt', async () => {
      const app = buildApp();
      const res = await enhance(app, { prompt: '' });
      expect(res.status).toBe(400);
      const json = (await res.json()) as ApiResponse;
      expect(json.ok).toBe(false);
      expect(json.error?.code).toBe('VALIDATION');
    });

    it('rejects whitespace-only prompt', async () => {
      const app = buildApp();
      const res = await enhance(app, { prompt: '   ' });
      expect(res.status).toBe(400);
      const json = (await res.json()) as ApiResponse;
      expect(json.ok).toBe(false);
      expect(json.error?.code).toBe('VALIDATION');
    });

    it('rejects prompt exceeding 2000 characters', async () => {
      const app = buildApp();
      const res = await enhance(app, { prompt: 'a'.repeat(2001) });
      expect(res.status).toBe(400);
      const json = (await res.json()) as ApiResponse;
      expect(json.ok).toBe(false);
      expect(json.error?.code).toBe('VALIDATION');
    });

    it('rejects unauthenticated request', async () => {
      const app = buildApp();
      const res = await app.request(
        '/v1/prompts/enhance',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'hello' }) },
        ENV,
      );
      expect(res.status).toBe(401);
      const json = (await res.json()) as ApiResponse;
      expect(json.error?.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('single post enhancement', () => {
    it('enhances a short single-post prompt', async () => {
      const app = buildApp();
      const res = await enhance(app, { prompt: 'Make a post about discipline' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
      expect(json.ok).toBe(true);
      const data = json.data!;
      expect(data.inferredType).toBe('single_post');
      expect(data.enhancedPrompt).toBeTruthy();
      expect(data.enhancedPrompt.length).toBeGreaterThan(data.originalPrompt.length);
      expect(data.enhancedPrompt.toLowerCase()).toContain('discipline');
      expect(data.originalPrompt).toBe('Make a post about discipline');
    });

    it('includes aspect ratio in enhanced post when provided', async () => {
      const app = buildApp();
      const res = await enhance(app, { prompt: 'Post about mindset', aspectRatio: '4:5' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
      expect(json.data!.enhancedPrompt).toContain('4:5');
    });

    it('preserves topic from original prompt', async () => {
      const app = buildApp();
      const res = await enhance(app, { prompt: 'Create a post about self-discipline for athletes' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
      const enhanced = json.data!.enhancedPrompt.toLowerCase();
      expect(enhanced).toContain('self-discipline');
    });
  });

  describe('carousel enhancement', () => {
    it('enhances a carousel prompt with card structure', async () => {
      const app = buildApp();
      const res = await enhance(app, { prompt: 'Create a 5-card carousel about mindset' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
      const data = json.data!;
      expect(data.inferredType).toBe('carousel');
      expect(data.cardCount).toBe(5);
      expect(data.enhancedPrompt).toContain('5-card carousel');
      expect(data.enhancedPrompt.toLowerCase()).toContain('mindset');
    });

    it('detects carousel from keyword in prompt', async () => {
      const app = buildApp();
      const res = await enhance(app, { prompt: 'A carousel about morning habits' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
      expect(json.data!.inferredType).toBe('carousel');
    });

    it('honours explicit selectedType carousel', async () => {
      const app = buildApp();
      const res = await enhance(app, { prompt: 'Tips for focus', selectedType: 'carousel' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
      expect(json.data!.inferredType).toBe('carousel');
    });

    it('defaults to 5 cards when no count mentioned', async () => {
      const app = buildApp();
      const res = await enhance(app, { prompt: 'A carousel about consistency', selectedType: 'carousel' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
      expect(json.data!.cardCount).toBe(5);
    });

    it('clamps card count to 10 maximum', async () => {
      const app = buildApp();
      const res = await enhance(app, { prompt: 'Create a 20-card carousel about growth' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
      expect(json.data!.cardCount).toBeLessThanOrEqual(10);
    });
  });

  describe('asset context', () => {
    it('mentions using attached assets when hasAssets is true', async () => {
      const app = buildApp();
      const res = await enhance(app, { prompt: 'Create a post', hasAssets: true, assetCount: 2 });
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
      const enhanced = json.data!.enhancedPrompt.toLowerCase();
      expect(enhanced).toContain('attached image');
    });

    it('does not mention assets when hasAssets is false', async () => {
      const app = buildApp();
      const res = await enhance(app, { prompt: 'Create a post about nature', hasAssets: false });
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
      expect(json.data!.enhancedPrompt).not.toContain('attached image');
    });
  });

  describe('detailed prompt light polish', () => {
    it('lightly polishes a detailed prompt without full rewrite', async () => {
      // > 80 words to trigger light polish mode
      const longPrompt = 'Create a social post about the importance of sleep for high performance. ' +
        'The visual should use dark blue and black tones with clean modern typography. ' +
        'Include a strong headline like "Sleep is your superpower", a clear subheading about REM cycles, ' +
        'and a simple CTA to follow for more daily health tips. Keep it minimal, avoid clutter, ' +
        'and use a 4:5 portrait format suitable for Instagram. The tone should be serious but motivating. ' +
        'Reference studies on sleep deprivation if possible without fabricating specific data points.';

      const app = buildApp();
      const res = await enhance(app, { prompt: longPrompt });
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
      const data = json.data!;
      expect(data.notes).toBeTruthy();
      // Light polish: should not be a complete rewrite
      expect(data.enhancedPrompt).toContain('sleep');
    });
  });

  describe('safety constraints', () => {
    it('returns non-empty enhancedPrompt in all valid cases', async () => {
      const app = buildApp();
      const cases = [
        { prompt: 'Post about coffee' },
        { prompt: 'Carousel about fitness', selectedType: 'carousel' as const },
        { prompt: 'Create something', hasAssets: true },
      ];
      for (const body of cases) {
        const res = await enhance(app, body);
        expect(res.status).toBe(200);
        const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
        expect(json.data!.enhancedPrompt.trim()).not.toBe('');
      }
    });

    it('does not invent fake statistics or specific claims', async () => {
      const app = buildApp();
      const res = await enhance(app, { prompt: 'Post about morning routines' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
      const enhanced = json.data!.enhancedPrompt;
      // Should not contain percentage-based statistics or named studies
      expect(enhanced).not.toMatch(/\d+%/);
      expect(enhanced).not.toMatch(/according to/i);
    });

    it('does not create a project on enhance', async () => {
      const repos = createMinimalFakeRepositories();
      let projectCreateCalled = false;
      repos.project = {
        ...repos.project,
        create: async () => { projectCreateCalled = true; throw new Error('should not be called'); },
      } as unknown as Repositories['project'];

      const app = new Hono<{ Bindings: Env }>();
      app.use(requestIdMiddleware);
      app.use(createAuthMiddleware(fakeVerifier, { repositories: repos }));
      app.route('/v1/prompts', promptsRoute);
      app.onError(errorHandler);

      await enhance(app, { prompt: 'Post about focus' });
      expect(projectCreateCalled).toBe(false);
    });

    it('does not reserve credits on enhance', async () => {
      const repos = createMinimalFakeRepositories();
      let creditReserveCalled = false;
      repos.credit = {
        reserve: async () => { creditReserveCalled = true; throw new Error('should not be called'); },
      } as unknown as Repositories['credit'];

      const app = new Hono<{ Bindings: Env }>();
      app.use(requestIdMiddleware);
      app.use(createAuthMiddleware(fakeVerifier, { repositories: repos }));
      app.route('/v1/prompts', promptsRoute);
      app.onError(errorHandler);

      await enhance(app, { prompt: 'Post about focus' });
      expect(creditReserveCalled).toBe(false);
    });

    it('does not create chat messages on enhance', async () => {
      const repos = createMinimalFakeRepositories();
      let chatAppendCalled = false;
      repos.chat = {
        appendMessage: async () => { chatAppendCalled = true; throw new Error('should not be called'); },
      } as unknown as Repositories['chat'];

      const app = new Hono<{ Bindings: Env }>();
      app.use(requestIdMiddleware);
      app.use(createAuthMiddleware(fakeVerifier, { repositories: repos }));
      app.route('/v1/prompts', promptsRoute);
      app.onError(errorHandler);

      await enhance(app, { prompt: 'Post about focus' });
      expect(chatAppendCalled).toBe(false);
    });

    it('does not create generation jobs on enhance', async () => {
      const repos = createMinimalFakeRepositories();
      let jobCreateCalled = false;
      repos.generationJob = {
        create: async () => { jobCreateCalled = true; throw new Error('should not be called'); },
      } as unknown as Repositories['generationJob'];

      const app = new Hono<{ Bindings: Env }>();
      app.use(requestIdMiddleware);
      app.use(createAuthMiddleware(fakeVerifier, { repositories: repos }));
      app.route('/v1/prompts', promptsRoute);
      app.onError(errorHandler);

      await enhance(app, { prompt: 'Post about focus' });
      expect(jobCreateCalled).toBe(false);
    });
  });

  describe('dev auth', () => {
    it('accepts request with dev auth in development environment', async () => {
      const app = buildApp();
      const res = await app.request(
        '/v1/prompts/enhance',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'A post about habits' }),
        },
        { ENVIRONMENT: 'development', DEV_AUTH_ENABLED: 'true' } as unknown as Record<string, unknown>,
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
      expect(json.ok).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// AI mode tests (P0.2)
// ---------------------------------------------------------------------------

const AI_ENV = {
  ENVIRONMENT: 'development',
  PROMPT_ENHANCER_MODE: 'ai',
  AI_PROVIDER: 'fake',
} as unknown as Record<string, unknown>;

function buildAiApp(testProvider?: AIProvider) {
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestIdMiddleware);
  app.use(createAuthMiddleware(fakeVerifier, { repositories: createMinimalFakeRepositories() }));
  app.route('/v1/prompts', createPromptsRoute({ testProvider }));
  app.onError(errorHandler);
  return app;
}

async function enhanceAi(app: ReturnType<typeof buildAiApp>, body: unknown) {
  return app.request(
    '/v1/prompts/enhance',
    { method: 'POST', headers: AUTH_HEADER, body: JSON.stringify(body) },
    AI_ENV,
  );
}

describe('POST /v1/prompts/enhance — AI mode', () => {
  it('routes through FakeAIProvider and returns a result', async () => {
    const app = buildAiApp();
    const res = await enhanceAi(app, { prompt: 'Post about discipline' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
    expect(json.ok).toBe(true);
    expect(json.data!.enhancedPrompt.trim()).not.toBe('');
    expect(json.data!.originalPrompt).toBe('Post about discipline');
  });

  it('preserves single_post inferredType for a post prompt', async () => {
    const app = buildAiApp();
    const res = await enhanceAi(app, { prompt: 'Create a post about discipline' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
    expect(json.data!.inferredType).toBe('single_post');
    expect(json.data!.cardCount).toBeUndefined();
  });

  it('preserves carousel inferredType with cardCount for carousel prompt', async () => {
    const app = buildAiApp();
    const res = await enhanceAi(app, { prompt: 'Make a 5 card carousel about focus' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse<EnhancePromptResponse>;
    expect(json.data!.inferredType).toBe('carousel');
    expect(json.data!.cardCount).toBe(5);
  });

  it('returns 502 with friendly message when AIProviderError is thrown', async () => {
    const failingProvider: AIProvider = {
      name: 'gemini' as const,
      async planText() { throw new Error('not used'); },
      async generateImageOrDocument() { throw new Error('not used'); },
      async chat() { throw new Error('not used'); },
      async enhancePrompt() {
        throw new AIProviderError({
          code: 'PROVIDER_HTTP_ERROR',
          provider: 'gemini',
          message: 'Gemini returned HTTP 429',
          retryable: true,
        });
      },
    };

    const app = buildAiApp(failingProvider);
    const res = await app.request(
      '/v1/prompts/enhance',
      { method: 'POST', headers: AUTH_HEADER, body: JSON.stringify({ prompt: 'Post about focus' }) },
      { ENVIRONMENT: 'development', PROMPT_ENHANCER_MODE: 'ai' } as unknown as Record<string, unknown>,
    );
    expect(res.status).toBe(502);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe('PROVIDER_FAILURE');
    expect(json.error?.message).toContain('temporarily unavailable');
  });

  it('does not leak API keys in the response', async () => {
    const app = buildAiApp();
    const res = await enhanceAi(app, { prompt: 'Post about focus' });
    const text = await res.text();
    expect(text).not.toContain('GEMINI_API_KEY');
    expect(text).not.toContain('geminiApiKey');
  });

  it('does not create projects or mutate DB in AI mode', async () => {
    const repos = createMinimalFakeRepositories();
    let createCalled = false;
    repos.project = {
      create: async () => { createCalled = true; throw new Error('should not be called'); },
    } as unknown as Repositories['project'];

    const aiApp = new Hono<{ Bindings: Env }>();
    aiApp.use(requestIdMiddleware);
    aiApp.use(createAuthMiddleware(fakeVerifier, { repositories: repos }));
    aiApp.route('/v1/prompts', createPromptsRoute());
    aiApp.onError(errorHandler);

    await enhanceAi(aiApp, { prompt: 'Post about focus' });
    expect(createCalled).toBe(false);
  });

  it('returns 502 PROVIDER_FAILURE when router creation throws PROVIDER_CONFIG_MISSING', async () => {
    // Simulate AI_PROVIDER=openai with no API key — createAIProviderRouter throws synchronously.
    const app = new Hono<{ Bindings: Env }>();
    app.use(requestIdMiddleware);
    app.use(createAuthMiddleware(fakeVerifier, { repositories: createMinimalFakeRepositories() }));
    app.route('/v1/prompts', createPromptsRoute());
    app.onError(errorHandler);

    const res = await app.request(
      '/v1/prompts/enhance',
      { method: 'POST', headers: AUTH_HEADER, body: JSON.stringify({ prompt: 'Post about focus' }) },
      // AI_PROVIDER=openai but no OPENAI_API_KEY — triggers PROVIDER_CONFIG_MISSING in createAIProviderRouter
      { ENVIRONMENT: 'development', PROMPT_ENHANCER_MODE: 'ai', AI_PROVIDER: 'openai' } as unknown as Record<string, unknown>,
    );

    expect(res.status).toBe(502);
    const json = (await res.json()) as ApiResponse;
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe('PROVIDER_FAILURE');
  });
});
