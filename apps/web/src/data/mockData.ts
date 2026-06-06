// ---------------------------------------------------------------------------
// Mock data for Orra frontend prototype
// ---------------------------------------------------------------------------

export interface MockArtifact {
  schemaVersion: number;
  artifactId: string;
  type: 'post' | 'carousel';
  ratio: { name: string; w: number; h: number };
  cards: MockCard[];
  version: number;
}

export interface MockCard {
  id: string;
  index: number;
  baseColor: string;
  layers: MockLayer[];
}

export interface MockLayer {
  id: string;
  type: string;
  z: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  [key: string]: unknown;
}

export interface MockProject {
  id: string;
  name: string;
  type: 'post' | 'carousel';
  ratio: { name: string; w: number; h: number };
  updatedAt: string;
  thumbnailColor: string;
  cardCount?: number;
}

export interface MockBrandSystem {
  id: string;
  name: string;
  description: string;
  palette: string[];
  fonts: string[];
  toneOfVoice: string;
  visualDirection: string;
  logoUrl?: string;
}

export interface MockTrendTemplate {
  id: string;
  title: string;
  description: string;
  prompt: string;
  thumbnailColor: string;
  tags: string[];
}

export interface MockChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  kind?: 'text' | 'approval_summary' | 'job_ref' | 'planning';
}

export interface MockVersion {
  id: string;
  version: number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface MockUsage {
  plan: string;
  monthlyTotal: number;
  monthlyUsed: number;
  topupCredits: number;
  resetDate: string;
  recentUsage: { action: string; credits: number; date: string }[];
}

export const mockProjects: MockProject[] = [
  { id: 'proj-1', name: 'Morning routine carousel', type: 'carousel', ratio: { name: '4:5', w: 1080, h: 1350 }, updatedAt: '2026-06-05T10:00:00Z', thumbnailColor: '#e8ddd5', cardCount: 5 },
  { id: 'proj-2', name: 'Product launch post', type: 'post', ratio: { name: '1:1', w: 1080, h: 1080 }, updatedAt: '2026-06-04T14:30:00Z', thumbnailColor: '#d5e0e8' },
  { id: 'proj-3', name: 'Self improvement tips', type: 'carousel', ratio: { name: '4:5', w: 1080, h: 1350 }, updatedAt: '2026-06-03T09:15:00Z', thumbnailColor: '#d8e8d5', cardCount: 5 },
  { id: 'proj-4', name: 'Brand announcement', type: 'post', ratio: { name: '9:16', w: 1080, h: 1920 }, updatedAt: '2026-06-02T16:45:00Z', thumbnailColor: '#e8d5d8' },
  { id: 'proj-5', name: 'Weekly recap', type: 'carousel', ratio: { name: '4:5', w: 1080, h: 1350 }, updatedAt: '2026-06-01T11:20:00Z', thumbnailColor: '#ddd5e8', cardCount: 3 },
  { id: 'proj-6', name: 'Holiday campaign', type: 'post', ratio: { name: '1:1', w: 1080, h: 1080 }, updatedAt: '2026-05-28T08:00:00Z', thumbnailColor: '#e8e0d5' },
];

export const mockRecentProjects = mockProjects.slice(0, 4);

export const mockBrandSystems: MockBrandSystem[] = [
  {
    id: 'brand-1',
    name: 'Serene Studio',
    description: 'Calm, premium wellness brand',
    palette: ['#1d2a30', '#5e7680', '#a4b7bd', '#c8d1d8', '#f5f7f8'],
    fonts: ['Newsreader', 'Hanken Grotesk'],
    toneOfVoice: 'Calm, reassuring, and quietly confident. Speak as a trusted guide.',
    visualDirection: 'Soft natural light, minimal compositions, muted earth tones with subtle blue-gray accents.',
  },
  {
    id: 'brand-2',
    name: 'Momentum Fitness',
    description: 'High energy fitness coaching',
    palette: ['#1a1a1a', '#ff4d4d', '#ffffff', '#333333', '#e0e0e0'],
    fonts: ['Inter', 'DM Sans'],
    toneOfVoice: 'Direct, motivating, no fluff. Action-oriented language.',
    visualDirection: 'Bold contrasts, dynamic angles, high contrast black and red.',
  },
  {
    id: 'brand-3',
    name: 'Artisan Kitchen',
    description: 'Handcrafted food photography',
    palette: ['#2c1810', '#d4a373', '#faedcd', '#e9edc9', '#fefae0'],
    fonts: ['Newsreader', 'DM Sans'],
    toneOfVoice: 'Warm, inviting, story-driven. Celebrate the craft.',
    visualDirection: 'Rich warm tones, natural textures, soft window light.',
  },
];

export const mockTrendTemplates: MockTrendTemplate[] = [
  { id: 'tt-1', title: 'Calm morning routine', description: 'A peaceful 5-card carousel about starting your day with intention.', prompt: 'Create a 5-card carousel about a calm morning routine with meditation, journaling, and healthy breakfast.', thumbnailColor: '#e8ddd5', tags: ['wellness', 'routine'] },
  { id: 'tt-2', title: 'Product showcase', description: 'Highlight your product with clean, minimal frames.', prompt: 'Create a 3-card carousel showcasing a premium product with focus on texture and detail.', thumbnailColor: '#d5e0e8', tags: ['product', 'minimal'] },
  { id: 'tt-3', title: 'Self improvement', description: 'Motivational tips for personal growth.', prompt: 'Create a 5-card carousel about self improvement tips covering discipline, habits, mindset, learning, and rest.', thumbnailColor: '#d8e8d5', tags: ['motivation', 'growth'] },
  { id: 'tt-4', title: 'Brand storytelling', description: 'Tell your brand origin story in a visual narrative.', prompt: 'Create a 4-card carousel telling a brand origin story with emotional visuals and authentic voice.', thumbnailColor: '#e8d5d8', tags: ['brand', 'story'] },
  { id: 'tt-5', title: 'Weekly recap', description: 'Summarize your week in bold visuals.', prompt: 'Create a 3-card weekly recap carousel with highlights, lessons, and intentions for next week.', thumbnailColor: '#ddd5e8', tags: ['recap', 'minimal'] },
  { id: 'tt-6', title: 'Holiday greeting', description: 'Warm seasonal wishes for your audience.', prompt: 'Create a single post with a warm holiday greeting and elegant seasonal visuals.', thumbnailColor: '#e8e0d5', tags: ['holiday', 'greeting'] },
];

export const mockUsage: MockUsage = {
  plan: 'Creator',
  monthlyTotal: 800,
  monthlyUsed: 620,
  topupCredits: 150,
  resetDate: '2026-07-01',
  recentUsage: [
    { action: 'Carousel generation', credits: 45, date: '2026-06-05' },
    { action: 'Background generation', credits: 12, date: '2026-06-04' },
    { action: 'Region edit', credits: 18, date: '2026-06-03' },
    { action: 'Object generation', credits: 15, date: '2026-06-02' },
    { action: 'Premium generation', credits: 30, date: '2026-06-01' },
  ],
};

export const mockVersions: MockVersion[] = [
  { id: 'v-1', version: 1, reason: 'generation', createdBy: 'ai', createdAt: '2026-06-05T10:00:00Z' },
  { id: 'v-2', version: 2, reason: 'manual_edit', createdBy: 'user', createdAt: '2026-06-05T10:15:00Z' },
  { id: 'v-3', version: 3, reason: 'region_edit', createdBy: 'ai', createdAt: '2026-06-05T10:30:00Z' },
  { id: 'v-4', version: 4, reason: 'manual_edit', createdBy: 'user', createdAt: '2026-06-05T11:00:00Z' },
];

export const mockInitialChat: MockChatMessage[] = [
  { id: 'msg-1', role: 'assistant', content: 'Welcome to Orra. Describe what you would like to create.' },
];

export function makeApprovalCardSummary(plan: { type: string; cardCount?: number; topic: string; style: string; ratio: string; brand?: string }): MockChatMessage {
  const summary = plan.type === 'carousel'
    ? `Ready to create a ${plan.cardCount}-card carousel about ${plan.topic}.`
    : `Ready to create a post about ${plan.topic}.`;

  const lines = [
    summary,
    `Style: ${plan.style}`,
    `Format: ${plan.ratio}`,
    `Brand: ${plan.brand || 'No brand'}`,
    'CTA: Not set',
  ];

  return {
    id: `msg-${Date.now()}`,
    role: 'assistant',
    content: lines.join('\n'),
    kind: 'approval_summary',
  };
}

export function makeMockArtifact(cardCount: number, ratio: { name: string; w: number; h: number }): MockArtifact {
  const type: 'post' | 'carousel' = cardCount > 1 ? 'carousel' : 'post';
  const cards = Array.from({ length: cardCount }, (_, i) => ({
    id: `card-${i}`,
    index: i,
    baseColor: '#f5f7f8',
    layers: [
      { id: `bg-${i}`, type: 'background', z: 0, x: 0, y: 0, w: ratio.w, h: ratio.h, rotation: 0, opacity: 1, locked: false, hidden: false, assetId: `asset-bg-${i}`, fit: 'cover' as const },
      { id: `text-${i}`, type: 'text', z: 1, x: 80, y: 80, w: ratio.w - 160, h: 120, rotation: 0, opacity: 1, locked: false, hidden: false, content: `Card ${i + 1}`, fontFamily: 'Inter', fontSize: 48, fontWeight: 600, lineHeight: 1.2, letterSpacing: 0, color: '#1d2a30', align: 'left' as const },
      { id: `sub-${i}`, type: 'text', z: 2, x: 80, y: ratio.h * 0.6, w: ratio.w - 160, h: 80, rotation: 0, opacity: 1, locked: false, hidden: false, content: 'Subtitle text here', fontFamily: 'Inter', fontSize: 24, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0.5, color: '#5e7680', align: 'left' as const },
    ],
  }));

  return {
    schemaVersion: 1,
    artifactId: `art-${Date.now()}`,
    type,
    ratio,
    cards,
    version: 1,
  };
}
