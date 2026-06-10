import { describe, it, expect } from 'vitest';
import {
  extractMemorySignals,
  buildSummary,
  rowToMemory,
  ProjectMemoryService,
} from '../services/projectMemoryService.js';
import type { ProjectMemoryRepository } from '../repositories/projectMemoryRepository.js';
import type { ProjectContextMemoryRow } from '@orra/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<ProjectContextMemoryRow> = {}): ProjectContextMemoryRow {
  return {
    id: 'mem-1',
    workspace_id: 'ws-1',
    project_id: 'proj-1',
    summary: '',
    topic: null,
    audience: null,
    tone: null,
    platform: null,
    format: null,
    carousel_goal: null,
    slide_count: null,
    visual_direction: null,
    approved_direction: null,
    rejected_ideas: [],
    user_preferences: [],
    constraints: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function fakeAuthCtx(workspaceId = 'ws-1') {
  return {
    env: {} as unknown as import('../env.js').Env,
    requestId: 'req-test',
    auth: {
      isAuthenticated: true as const,
      clerkUserId: 'clerk_test',
      userId: 'user-1',
      workspaceId,
      role: 'owner' as const,
      authSource: 'dev' as const,
    },
  };
}

function createFakeMemoryRepository(initial: ProjectContextMemoryRow | null = null): ProjectMemoryRepository & { stored: ProjectContextMemoryRow | null } {
  let stored = initial;

  return {
    get stored() { return stored; },

    async getByProjectIdForWorkspace(input) {
      if (stored && stored.workspace_id === input.workspaceId && stored.project_id === input.projectId) {
        return stored;
      }
      return null;
    },

    async upsertForProject(input) {
      const now = new Date().toISOString();
      const row: ProjectContextMemoryRow = {
        id: stored?.id ?? 'mem-new',
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        summary: input.summary ?? stored?.summary ?? '',
        topic: input.topic !== undefined ? input.topic ?? null : stored?.topic ?? null,
        audience: input.audience !== undefined ? input.audience ?? null : stored?.audience ?? null,
        tone: input.tone !== undefined ? input.tone ?? null : stored?.tone ?? null,
        platform: input.platform !== undefined ? input.platform ?? null : stored?.platform ?? null,
        format: input.format !== undefined ? input.format ?? null : stored?.format ?? null,
        carousel_goal: input.carouselGoal !== undefined ? input.carouselGoal ?? null : stored?.carousel_goal ?? null,
        slide_count: input.slideCount !== undefined ? input.slideCount ?? null : stored?.slide_count ?? null,
        visual_direction: input.visualDirection !== undefined ? input.visualDirection ?? null : stored?.visual_direction ?? null,
        approved_direction: input.approvedDirection !== undefined ? input.approvedDirection ?? null : stored?.approved_direction ?? null,
        rejected_ideas: input.rejectedIdeas ?? stored?.rejected_ideas ?? [],
        user_preferences: input.userPreferences ?? stored?.user_preferences ?? [],
        constraints: input.constraints ?? stored?.constraints ?? [],
        created_at: stored?.created_at ?? now,
        updated_at: now,
      };
      stored = row;
      return row;
    },

    async patchForProject() { throw new Error('not used in service tests'); },
    async ensureForProject() { throw new Error('not used in service tests'); },
  };
}

// ---------------------------------------------------------------------------
// extractMemorySignals — platform
// ---------------------------------------------------------------------------

describe('extractMemorySignals: platform', () => {
  it('extracts LinkedIn', () => {
    const s = extractMemorySignals('Create a post for LinkedIn');
    expect(s.platform).toBe('LinkedIn');
  });

  it('extracts Instagram', () => {
    const s = extractMemorySignals('Make 5 cards for Instagram');
    expect(s.platform).toBe('Instagram');
  });

  it('extracts Twitter', () => {
    const s = extractMemorySignals('post for Twitter');
    expect(s.platform).toBe('Twitter');
  });

  it('extracts TikTok', () => {
    const s = extractMemorySignals('for TikTok please');
    expect(s.platform).toBe('TikTok');
  });

  it('extracts Facebook', () => {
    const s = extractMemorySignals('for Facebook');
    expect(s.platform).toBe('Facebook');
  });

  it('does not set platform when no match', () => {
    const s = extractMemorySignals('Make a nice carousel');
    expect(s.platform).toBeUndefined();
  });

  it('preserves existing platform — does not overwrite', () => {
    const s = extractMemorySignals('Make a post for Instagram', { platform: 'LinkedIn' });
    expect(s.platform).toBeUndefined(); // already set — skip
  });
});

// ---------------------------------------------------------------------------
// extractMemorySignals — slide count
// ---------------------------------------------------------------------------

describe('extractMemorySignals: slide count', () => {
  it('extracts "5 slides"', () => {
    const s = extractMemorySignals('Create 5 slides for self improvement');
    expect(s.slideCount).toBe(5);
  });

  it('extracts "5 cards"', () => {
    const s = extractMemorySignals('I want 5 cards');
    expect(s.slideCount).toBe(5);
  });

  it('ignores count > 50', () => {
    const s = extractMemorySignals('Make 99 slides');
    expect(s.slideCount).toBeUndefined();
  });

  it('ignores count < 1', () => {
    const s = extractMemorySignals('Make 0 slides');
    expect(s.slideCount).toBeUndefined();
  });

  it('preserves existing slideCount', () => {
    const s = extractMemorySignals('Create 7 slides', { slideCount: 5 });
    expect(s.slideCount).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractMemorySignals — tone
// ---------------------------------------------------------------------------

describe('extractMemorySignals: tone', () => {
  it('extracts "make it professional"', () => {
    const s = extractMemorySignals('make it professional');
    expect(s.tone).toBe('professional');
  });

  it('extracts "make it calm"', () => {
    const s = extractMemorySignals('please make it calm');
    expect(s.tone).toBe('calm');
  });

  it('extracts "make it playful"', () => {
    const s = extractMemorySignals('make it playful and fun');
    expect(s.tone).toBe('playful');
  });

  it('does not set tone when no match', () => {
    const s = extractMemorySignals('Create a fitness post');
    expect(s.tone).toBeUndefined();
  });

  it('preserves existing tone', () => {
    const s = extractMemorySignals('make it bold', { tone: 'professional' });
    expect(s.tone).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractMemorySignals — visual direction
// ---------------------------------------------------------------------------

describe('extractMemorySignals: visual direction', () => {
  it('extracts "minimal"', () => {
    const s = extractMemorySignals('Keep it minimal and clean');
    expect(s.visualDirection).toBe('minimal');
  });

  it('extracts "dark"', () => {
    const s = extractMemorySignals('Use a dark theme');
    expect(s.visualDirection).toBe('dark');
  });
});

// ---------------------------------------------------------------------------
// extractMemorySignals — audience
// ---------------------------------------------------------------------------

describe('extractMemorySignals: audience', () => {
  it('extracts sentence form "audience is founders"', () => {
    const s = extractMemorySignals('audience is founders');
    expect(s.audience).toBe('founders');
  });

  it('extracts sentence form "audience are designers"', () => {
    const s = extractMemorySignals('the audience are designers');
    expect(s.audience).toBe('designers');
  });

  it('extracts keyword "for founders"', () => {
    const s = extractMemorySignals('Create content for founders');
    expect(s.audience).toBe('founders');
  });

  it('extracts keyword "for developers"', () => {
    const s = extractMemorySignals('tips for developers');
    expect(s.audience).toBe('developers');
  });

  it('preserves existing audience', () => {
    const s = extractMemorySignals('for founders', { audience: 'designers' });
    expect(s.audience).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractMemorySignals — constraints
// ---------------------------------------------------------------------------

describe('extractMemorySignals: constraints', () => {
  it('extracts "don\'t use stock photos"', () => {
    const s = extractMemorySignals("don't use stock photos");
    expect(s.constraints).toContain('stock photos');
  });

  it('extracts "avoid red"', () => {
    const s = extractMemorySignals('avoid red colors');
    expect(s.constraints).toContain('red colors');
  });

  it('extracts "no clipart"', () => {
    const s = extractMemorySignals('no clipart please');
    expect(s.constraints).toContain('clipart please');
  });

  it('merges with existing constraints (deduped)', () => {
    const s = extractMemorySignals("don't use red", { constraints: ['stock photos'] });
    expect(s.constraints).toContain('stock photos');
    expect(s.constraints).toContain('red');
  });

  it('does not duplicate existing items', () => {
    const s = extractMemorySignals("don't use stock photos", { constraints: ['stock photos'] });
    expect(s.constraints).toBeUndefined(); // no new items added
  });

  it('caps at 20 items', () => {
    const existing = Array.from({ length: 20 }, (_, i) => `item-${i}`);
    const s = extractMemorySignals("don't use extra", { constraints: existing });
    expect(s.constraints).toBeUndefined(); // already at cap
  });
});

// ---------------------------------------------------------------------------
// extractMemorySignals — rejected ideas
// ---------------------------------------------------------------------------

describe('extractMemorySignals: rejected ideas', () => {
  it('extracts "not like corporate vibes"', () => {
    const s = extractMemorySignals('not like corporate vibes');
    expect(s.rejectedIdeas?.some(r => r.includes('corporate vibes'))).toBe(true);
  });

  it('does not match when no rejection keywords', () => {
    const s = extractMemorySignals('Create a minimal post');
    expect(s.rejectedIdeas).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractMemorySignals — no-op on irrelevant text
// ---------------------------------------------------------------------------

describe('extractMemorySignals: no-op on irrelevant text', () => {
  it('returns empty object for generic greeting', () => {
    const s = extractMemorySignals('Hi there, how are you?');
    expect(Object.keys(s)).toHaveLength(0);
  });

  it('returns empty object for pure design chat', () => {
    const s = extractMemorySignals('I like the layout you showed');
    expect(Object.keys(s)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildSummary
// ---------------------------------------------------------------------------

describe('buildSummary', () => {
  it('builds a full sentence with all fields', () => {
    const s = buildSummary({
      topic: 'self improvement',
      platform: 'LinkedIn',
      audience: 'founders',
      tone: 'professional',
    });
    expect(s).toContain('self improvement');
    expect(s).toContain('LinkedIn');
    expect(s).toContain('founders');
    expect(s).toContain('professional');
    expect(s.endsWith('.')).toBe(true);
  });

  it('builds partial summary with only topic', () => {
    const s = buildSummary({ topic: 'fitness tips' });
    expect(s).toContain('fitness tips');
    expect(s.endsWith('.')).toBe(true);
  });

  it('returns empty string when no fields', () => {
    const s = buildSummary({});
    expect(s).toBe('');
  });
});

// ---------------------------------------------------------------------------
// rowToMemory
// ---------------------------------------------------------------------------

describe('rowToMemory', () => {
  it('maps all scalar fields', () => {
    const row = makeRow({
      topic: 'fitness',
      platform: 'Instagram',
      tone: 'bold',
      slide_count: 6,
      summary: 'Project about fitness.',
    });

    const mem = rowToMemory(row);

    expect(mem.topic).toBe('fitness');
    expect(mem.platform).toBe('Instagram');
    expect(mem.tone).toBe('bold');
    expect(mem.slideCount).toBe(6);
    expect(mem.summary).toBe('Project about fitness.');
    expect(mem.projectId).toBe('proj-1');
    expect(mem.workspaceId).toBe('ws-1');
  });

  it('converts null scalars to undefined', () => {
    const row = makeRow({ topic: null, tone: null });
    const mem = rowToMemory(row);
    expect(mem.topic).toBeUndefined();
    expect(mem.tone).toBeUndefined();
  });

  it('converts jsonb arrays', () => {
    const row = makeRow({
      rejected_ideas: ['too corporate'],
      constraints: ['no red'],
    });
    const mem = rowToMemory(row);
    expect(mem.rejectedIdeas).toEqual(['too corporate']);
    expect(mem.constraints).toEqual(['no red']);
  });

  it('defaults non-array jsonb to empty array', () => {
    const row = makeRow({ rejected_ideas: null as unknown as import('@orra/db').Json });
    const mem = rowToMemory(row);
    expect(mem.rejectedIdeas).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ProjectMemoryService.updateFromUserMessage
// ---------------------------------------------------------------------------

describe('ProjectMemoryService.updateFromUserMessage', () => {
  const intent = {
    mode: 'generation' as const,
    confidence: 'high' as const,
    reason: 'test',
    generationHint: {
      artifactType: 'carousel' as const,
      requestedCardCount: undefined,
      rawTopic: 'self improvement',
    },
  };

  it('stores extracted signals from message', async () => {
    const repo = createFakeMemoryRepository(null);
    const svc = new ProjectMemoryService(repo);

    await svc.updateFromUserMessage(
      fakeAuthCtx(),
      'proj-1',
      'Create 5 slides for LinkedIn about self improvement',
      intent
    );

    expect(repo.stored).not.toBeNull();
    expect(repo.stored!.platform).toBe('LinkedIn');
    expect(repo.stored!.slide_count).toBe(5);
    expect(repo.stored!.topic).toBe('self improvement');
  });

  it('picks up rawTopic from intent when no topic in message', async () => {
    const repo = createFakeMemoryRepository(null);
    const svc = new ProjectMemoryService(repo);

    await svc.updateFromUserMessage(
      fakeAuthCtx(),
      'proj-1',
      'Create a post for LinkedIn',
      intent
    );

    expect(repo.stored!.topic).toBe('self improvement');
  });

  it('does not overwrite existing topic with rawTopic', async () => {
    const existing = makeRow({ topic: 'fitness', platform: null });
    const repo = createFakeMemoryRepository(existing);
    const svc = new ProjectMemoryService(repo);

    await svc.updateFromUserMessage(fakeAuthCtx(), 'proj-1', 'Just a plain message', intent);

    // No signal to extract, topic still fitness
    expect(repo.stored?.topic ?? 'fitness').toBe('fitness');
  });

  it('does not write when no signals and no rawTopic', async () => {
    const repo = createFakeMemoryRepository(null);
    const svc = new ProjectMemoryService(repo);

    const noHintIntent = { ...intent, generationHint: undefined };
    await svc.updateFromUserMessage(
      fakeAuthCtx(),
      'proj-1',
      'Hello, how are you?',
      noHintIntent
    );

    expect(repo.stored).toBeNull();
  });

  it('builds and stores summary', async () => {
    const repo = createFakeMemoryRepository(null);
    const svc = new ProjectMemoryService(repo);

    await svc.updateFromUserMessage(
      fakeAuthCtx(),
      'proj-1',
      'Create a post for LinkedIn, make it professional',
      intent
    );

    expect(repo.stored!.summary).toContain('LinkedIn');
    expect(repo.stored!.summary).toContain('professional');
  });

  it('requires auth — throws without workspace', async () => {
    const repo = createFakeMemoryRepository(null);
    const svc = new ProjectMemoryService(repo);

    const noAuthCtx = {
      env: {} as unknown as import('../env.js').Env,
      requestId: 'req-test',
      auth: undefined,
    };

    await expect(
      svc.updateFromUserMessage(noAuthCtx, 'proj-1', 'test', intent)
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ProjectMemoryService.updateFromApprovalAction
// ---------------------------------------------------------------------------

describe('ProjectMemoryService.updateFromApprovalAction', () => {
  const approvalCard = {
    summaryLine: 'Ready to create a 5-card carousel about fitness.',
    style: 'calm, premium',
    format: '4:5',
    brand: 'none',
    cta: '',
    assumptions: [],
    actions: ['approve_and_create' as const, 'cancel' as const],
  };

  it('approve_and_create stores approvedDirection', async () => {
    const repo = createFakeMemoryRepository(null);
    const svc = new ProjectMemoryService(repo);

    await svc.updateFromApprovalAction(fakeAuthCtx(), 'proj-1', 'approve_and_create', approvalCard);

    expect(repo.stored!.approved_direction).toContain('5-card carousel about fitness');
  });

  it('cancel appends summaryLine to rejectedIdeas', async () => {
    const existing = makeRow({ rejected_ideas: [] });
    const repo = createFakeMemoryRepository(existing);
    const svc = new ProjectMemoryService(repo);

    await svc.updateFromApprovalAction(fakeAuthCtx(), 'proj-1', 'cancel', approvalCard);

    expect((repo.stored!.rejected_ideas as string[]).some(r => r.includes('5-card carousel'))).toBe(true);
  });

  it('edit_direction is a no-op', async () => {
    const repo = createFakeMemoryRepository(null);
    const svc = new ProjectMemoryService(repo);

    await svc.updateFromApprovalAction(fakeAuthCtx(), 'proj-1', 'edit_direction', approvalCard);

    expect(repo.stored).toBeNull();
  });

  it('add_cta is a no-op', async () => {
    const repo = createFakeMemoryRepository(null);
    const svc = new ProjectMemoryService(repo);

    await svc.updateFromApprovalAction(fakeAuthCtx(), 'proj-1', 'add_cta', approvalCard);

    expect(repo.stored).toBeNull();
  });

  it('no-op when approvalCard is undefined', async () => {
    const repo = createFakeMemoryRepository(null);
    const svc = new ProjectMemoryService(repo);

    await svc.updateFromApprovalAction(fakeAuthCtx(), 'proj-1', 'approve_and_create', undefined);

    expect(repo.stored).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ProjectMemoryService.getMemory
// ---------------------------------------------------------------------------

describe('ProjectMemoryService.getMemory', () => {
  it('returns null when no memory exists', async () => {
    const repo = createFakeMemoryRepository(null);
    const svc = new ProjectMemoryService(repo);

    const result = await svc.getMemory(fakeAuthCtx(), 'proj-1');

    expect(result).toBeNull();
  });

  it('returns mapped memory when row exists', async () => {
    const existing = makeRow({ topic: 'fitness', platform: 'Instagram' });
    const repo = createFakeMemoryRepository(existing);
    const svc = new ProjectMemoryService(repo);

    const result = await svc.getMemory(fakeAuthCtx(), 'proj-1');

    expect(result).not.toBeNull();
    expect(result!.topic).toBe('fitness');
    expect(result!.platform).toBe('Instagram');
  });

  it('requires auth', async () => {
    const repo = createFakeMemoryRepository(null);
    const svc = new ProjectMemoryService(repo);

    const noAuthCtx = {
      env: {} as unknown as import('../env.js').Env,
      requestId: 'req-test',
      auth: undefined,
    };

    await expect(svc.getMemory(noAuthCtx, 'proj-1')).rejects.toThrow();
  });
});
