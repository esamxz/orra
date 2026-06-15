import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface BrandTypography {
  preset: 'editorial-calm' | 'modern-saas' | 'bold-poster' | 'custom';
  titleFont: string;
  titleWeight: number;
  bodyFont: string;
  bodyWeight: number;
  accentFont: string;
  accentWeight: number;
  captionFont: string;
  captionWeight: number;
  notes: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export type DashboardTab = 'recent' | 'projects' | 'trends' | 'brands';

export interface DashboardState {
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  activeTab: 'recent',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
