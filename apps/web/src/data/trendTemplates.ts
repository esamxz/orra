export interface TrendTemplate {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: string;
  tags: string[];
  projectType: 'post' | 'carousel';
  ratioHint?: string;
  platformHint?: string;
  assetHints: string[];
  previewVariant: string;
  isFeatured: boolean;
}

export const TREND_TEMPLATES: TrendTemplate[] = [
  // --- Featured (4) ---
  {
    id: 't1',
    title: 'Quiet self-improvement',
    description: 'Slow, reflective listicle carousel with calm typography and lots of breathing room.',
    prompt: 'Create a 5-card carousel about quiet self-improvement habits. Calm, premium, focused tone. Instagram 4:5. Minimal type, generous whitespace.',
    category: 'Wellness',
    tags: ['mindset', 'habits', 'calm', 'listicle'],
    projectType: 'carousel',
    ratioHint: '4:5',
    platformHint: 'Instagram',
    assetHints: [],
    previewVariant: 'cover',
    isFeatured: true,
  },
  {
    id: 't2',
    title: 'Editorial quote card',
    description: 'A single statement post — large serif quote over a soft duotone field.',
    prompt: 'Design a single editorial quote post. One short, striking line in large serif. Muted blue-gray duotone background. Square 1:1.',
    category: 'Quote',
    tags: ['quote', 'editorial', 'typography', 'minimal'],
    projectType: 'post',
    ratioHint: '1:1',
    platformHint: 'Instagram',
    assetHints: [],
    previewVariant: 'mist',
    isFeatured: true,
  },
  {
    id: 't3',
    title: 'Soft product launch',
    description: 'Three-card launch sequence: hook, feature, call to action. Understated and confident.',
    prompt: 'Create a 3-card product launch carousel. Card 1 hook, card 2 the key feature, card 3 a clear CTA. Premium, restrained. 4:5.',
    category: 'Product',
    tags: ['product', 'launch', 'carousel', 'cta'],
    projectType: 'carousel',
    ratioHint: '4:5',
    platformHint: 'Instagram',
    assetHints: ['Works best with a product photo', 'Optional brand logo'],
    previewVariant: 'steel',
    isFeatured: true,
  },
  {
    id: 't4',
    title: 'Step-by-step explainer',
    description: 'Numbered teaching carousel that walks through a process, one idea per card.',
    prompt: 'Create a numbered explainer carousel that teaches a 4-step process, one step per card. Clean, instructive, calm. 4:5.',
    category: 'Education',
    tags: ['how-to', 'tutorial', 'steps', 'teaching'],
    projectType: 'carousel',
    ratioHint: '4:5',
    platformHint: 'Instagram',
    assetHints: [],
    previewVariant: 'pale',
    isFeatured: true,
  },
  // --- Additional library templates (non-featured) ---
  {
    id: 't5',
    title: 'Minimalist brand story',
    description: 'One post that communicates your brand ethos in a single, unhurried frame.',
    prompt: 'Create a single-post brand story card. Calm, premium. Lead with one evocative sentence, then a brief brand statement. Dark background, light typography. 4:5.',
    category: 'Lifestyle',
    tags: ['brand', 'story', 'minimal', 'premium'],
    projectType: 'post',
    ratioHint: '4:5',
    platformHint: 'Instagram',
    assetHints: ['Optional brand logo'],
    previewVariant: 'cover',
    isFeatured: false,
  },
  {
    id: 't6',
    title: 'Day-in-the-life',
    description: 'Behind-the-scenes carousel showing your creative or professional process.',
    prompt: 'Create a 4-card day-in-the-life carousel. Candid, warm, and personal. Show a morning ritual, work session, a small win, and an end-of-day note. 4:5.',
    category: 'Lifestyle',
    tags: ['behind-the-scenes', 'personal', 'routine', 'authentic'],
    projectType: 'carousel',
    ratioHint: '4:5',
    platformHint: 'Instagram',
    assetHints: ['Upload 2–4 behind-the-scenes photos', 'Works well with a workspace photo'],
    previewVariant: 'mist',
    isFeatured: false,
  },
  {
    id: 't7',
    title: 'Before & after reveal',
    description: 'Two-card contrast post showing transformation — project, space, or mindset.',
    prompt: 'Create a 2-card before and after carousel. Card 1 shows the starting point, card 2 the result. Dramatic but restrained. Clear labeling. 4:5.',
    category: 'Product',
    tags: ['transformation', 'reveal', 'contrast', 'result'],
    projectType: 'carousel',
    ratioHint: '4:5',
    platformHint: 'Instagram',
    assetHints: ['Upload a before photo', 'Upload an after photo'],
    previewVariant: 'steel',
    isFeatured: false,
  },
  {
    id: 't8',
    title: 'Thought leadership post',
    description: 'A single opinionated take — clean, confident, no fluff.',
    prompt: 'Create a single-post thought leadership card. One strong opinion stated plainly. Supporting context in smaller type. Professional, direct, no buzzwords. LinkedIn 4:5.',
    category: 'Education',
    tags: ['opinion', 'linkedin', 'professional', 'insight'],
    projectType: 'post',
    ratioHint: '4:5',
    platformHint: 'LinkedIn',
    assetHints: [],
    previewVariant: 'cta',
    isFeatured: false,
  },
];

export function getFeaturedTemplates(): TrendTemplate[] {
  return TREND_TEMPLATES.filter((t) => t.isFeatured);
}

export function getTemplateById(id: string): TrendTemplate | undefined {
  return TREND_TEMPLATES.find((t) => t.id === id);
}

export function getAllCategories(): string[] {
  return [...new Set(TREND_TEMPLATES.map((t) => t.category))].sort();
}
