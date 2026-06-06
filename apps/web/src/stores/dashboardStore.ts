import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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

export interface MockUsage {
  plan: string;
  monthlyTotal: number;
  monthlyUsed: number;
  topupCredits: number;
  resetDate: string;
  recentUsage: { action: string; credits: number; date: string }[];
}

// ---------------------------------------------------------------------------
// Mock data — single source of truth for usage
// ---------------------------------------------------------------------------
const mockUsage: MockUsage = {
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

const initialBrandSystems: MockBrandSystem[] = [
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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export type DashboardTab = 'recent' | 'projects' | 'trends' | 'brands';

interface DashboardState {
  activeTab: DashboardTab;
  brandSystems: MockBrandSystem[];
  usage: MockUsage;

  setActiveTab: (tab: DashboardTab) => void;
  addBrandSystem: (brand: MockBrandSystem) => void;
  removeBrandSystem: (id: string) => void;
  duplicateBrandSystem: (id: string) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  activeTab: 'recent',
  brandSystems: initialBrandSystems,
  usage: mockUsage,

  setActiveTab: (tab) => set({ activeTab: tab }),

  addBrandSystem: (brand) =>
    set((state) => ({
      brandSystems: [brand, ...state.brandSystems],
    })),

  removeBrandSystem: (id) =>
    set((state) => ({
      brandSystems: state.brandSystems.filter((b) => b.id !== id),
    })),

  duplicateBrandSystem: (id) => {
    const original = get().brandSystems.find((b) => b.id === id);
    if (!original) return;
    const dup: MockBrandSystem = {
      ...original,
      id: `brand-${Date.now()}`,
      name: `${original.name} (copy)`,
    };
    set((state) => ({
      brandSystems: [dup, ...state.brandSystems],
    }));
  },
}));
