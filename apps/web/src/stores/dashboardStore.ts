import { create } from 'zustand';
import {
  mockProjects,
  mockRecentProjects,
  mockBrandSystems,
  mockTrendTemplates,
  mockUsage,
  type MockProject,
  type MockBrandSystem,
  type MockTrendTemplate,
  type MockUsage,
} from '../data/mockData';

export type DashboardTab = 'recent' | 'projects' | 'trends' | 'brands';

interface DashboardState {
  activeTab: DashboardTab;
  projects: MockProject[];
  recentProjects: MockProject[];
  brandSystems: MockBrandSystem[];
  trendTemplates: MockTrendTemplate[];
  usage: MockUsage;
  searchQuery: string;

  // Actions
  setActiveTab: (tab: DashboardTab) => void;
  setSearchQuery: (q: string) => void;
  addProject: (project: MockProject) => void;
  removeProject: (id: string) => void;
  duplicateProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  addBrandSystem: (brand: MockBrandSystem) => void;
  removeBrandSystem: (id: string) => void;
  duplicateBrandSystem: (id: string) => void;
  getFilteredProjects: () => MockProject[];
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  activeTab: 'recent',
  projects: mockProjects,
  recentProjects: mockRecentProjects,
  brandSystems: mockBrandSystems,
  trendTemplates: mockTrendTemplates,
  usage: mockUsage,
  searchQuery: '',

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  addProject: (project) =>
    set((state) => ({
      projects: [project, ...state.projects],
      recentProjects: [project, ...state.recentProjects.slice(0, 3)],
    })),

  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      recentProjects: state.recentProjects.filter((p) => p.id !== id),
    })),

  duplicateProject: (id) => {
    const original = get().projects.find((p) => p.id === id);
    if (!original) return;
    const dup: MockProject = {
      ...original,
      id: `proj-${Date.now()}`,
      name: `${original.name} (copy)`,
      updatedAt: new Date().toISOString(),
    };
    set((state) => ({
      projects: [dup, ...state.projects],
    }));
  },

  renameProject: (id, name) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, name } : p)),
    })),

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

  getFilteredProjects: () => {
    const { projects, searchQuery } = get();
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  },
}));
