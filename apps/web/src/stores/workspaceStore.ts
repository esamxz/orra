import { create } from 'zustand';
import {
  mockInitialChat,
  mockVersions,
  mockUsage,
  mockBrandSystems,
  makeMockArtifact,
  makeApprovalCardSummary,
  type MockArtifact,
  type MockCard,
  type MockChatMessage,
  type MockVersion,
  type MockUsage,
  type MockBrandSystem,
} from '../data/mockData';

export interface WorkspaceProject {
  id: string;
  name: string;
  type: 'post' | 'carousel';
  ratio: { name: string; w: number; h: number };
  brandSystemId?: string;
}

interface WorkspaceState {
  project: WorkspaceProject | null;
  artifact: MockArtifact | null;
  activeCardId: string | null;
  selectedLayerId: string | null;
  chatMessages: MockChatMessage[];
  versions: MockVersion[];
  usage: MockUsage;
  brandSystems: MockBrandSystem[];
  activeBrandId: string | null;
  showApprovalCard: boolean;
  approvalPlan: { type: string; cardCount?: number; topic: string; style: string; ratio: string; brand?: string } | null;
  isPlanning: boolean;
  composerValue: string;
  panelWidth: number;
  showExportMenu: boolean;
  showVersionHistory: boolean;
  showUsagePopover: boolean;
  darkMode: boolean;

  // Actions
  initWorkspace: (project: WorkspaceProject) => void;
  setActiveCard: (cardId: string) => void;
  setSelectedLayer: (layerId: string | null) => void;
  sendMessage: (content: string) => void;
  approvePlan: () => void;
  rejectPlan: () => void;
  addCard: () => void;
  duplicateCard: (cardId: string) => void;
  removeCard: (cardId: string) => void;
  reorderCards: (order: string[]) => void;
  updateLayerProp: (cardId: string, layerId: string, key: string, value: unknown) => void;
  setComposerValue: (value: string) => void;
  setPanelWidth: (width: number) => void;
  toggleExportMenu: () => void;
  toggleVersionHistory: () => void;
  toggleUsagePopover: () => void;
  setActiveBrand: (id: string | null) => void;
  toggleDarkMode: () => void;
  restoreVersion: (versionId: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  project: null,
  artifact: null,
  activeCardId: null,
  selectedLayerId: null,
  chatMessages: [...mockInitialChat],
  versions: [...mockVersions],
  usage: mockUsage,
  brandSystems: [...mockBrandSystems],
  activeBrandId: null,
  showApprovalCard: false,
  approvalPlan: null,
  isPlanning: false,
  composerValue: '',
  panelWidth: 372,
  showExportMenu: false,
  showVersionHistory: false,
  showUsagePopover: false,
  darkMode: false,

  initWorkspace: (project) => {
    const artifact = project.type === 'carousel'
      ? makeMockArtifact(5, project.ratio)
      : makeMockArtifact(1, project.ratio);
    set({
      project,
      artifact,
      activeCardId: artifact.cards[0]?.id ?? null,
      selectedLayerId: null,
      chatMessages: [...mockInitialChat],
      versions: [...mockVersions],
      showApprovalCard: false,
      approvalPlan: null,
      isPlanning: false,
      composerValue: '',
    });
  },

  setActiveCard: (cardId) => set({ activeCardId: cardId, selectedLayerId: null }),

  setSelectedLayer: (layerId) => set({ selectedLayerId: layerId }),

  sendMessage: (content) => {
    const userMsg: MockChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content,
      kind: 'text',
    };

    set((state) => ({
      chatMessages: [...state.chatMessages, userMsg],
      composerValue: '',
      isPlanning: true,
    }));

    // Simulate planning delay then show approval card
    setTimeout(() => {
      const plan = {
        type: content.toLowerCase().includes('carousel') || content.toLowerCase().includes('cards') ? 'carousel' : 'post',
        cardCount: content.toLowerCase().includes('5') ? 5 : content.toLowerCase().includes('3') ? 3 : content.toLowerCase().includes('carousel') ? 5 : 1,
        topic: content.replace(/create a|make a|generate a|\d+ card|carousel|post/gi, '').trim() || 'your topic',
        style: 'calm, premium, focused',
        ratio: get().project?.ratio.name || '4:5',
        brand: get().brandSystems.find((b) => b.id === get().activeBrandId)?.name,
      };

      const approvalMsg = makeApprovalCardSummary(plan);

      set((state) => ({
        chatMessages: [...state.chatMessages, approvalMsg],
        isPlanning: false,
        showApprovalCard: true,
        approvalPlan: plan,
      }));
    }, 1200);
  },

  approvePlan: () => {
    const { approvalPlan, project } = get();
    if (!approvalPlan || !project) return;

    const cardCount = approvalPlan.cardCount || 1;
    const newArtifact = makeMockArtifact(cardCount, project.ratio);

    const jobMsg: MockChatMessage = {
      id: `msg-${Date.now()}-job`,
      role: 'assistant',
      content: `Creating your ${approvalPlan.type}...`,
      kind: 'job_ref',
    };

    set((state) => ({
      chatMessages: [...state.chatMessages, jobMsg],
      showApprovalCard: false,
      approvalPlan: null,
    }));

    // Simulate generation delay
    setTimeout(() => {
      const doneMsg: MockChatMessage = {
        id: `msg-${Date.now()}-done`,
        role: 'assistant',
        content: 'Done. Your design is ready. You can edit text, adjust layers, or export.',
        kind: 'text',
      };

      set((state) => ({
        artifact: newArtifact,
        activeCardId: newArtifact.cards[0]?.id ?? null,
        selectedLayerId: null,
        chatMessages: [...state.chatMessages, doneMsg],
        versions: [
          { id: `v-${Date.now()}`, version: state.versions.length + 1, reason: 'generation', createdBy: 'ai', createdAt: new Date().toISOString() },
          ...state.versions,
        ],
      }));
    }, 1500);
  },

  rejectPlan: () => {
    set({
      showApprovalCard: false,
      approvalPlan: null,
      chatMessages: get().chatMessages.filter((m) => m.kind !== 'approval_summary'),
    });
  },

  addCard: () => {
    set((state) => {
      if (!state.artifact) return state;
      const newIndex = state.artifact.cards.length;
      const newCard: MockCard = {
        id: `card-${Date.now()}`,
        index: newIndex,
        baseColor: '#f5f7f8',
        layers: [
          { id: `bg-${Date.now()}`, type: 'background', z: 0, x: 0, y: 0, w: state.artifact.ratio.w, h: state.artifact.ratio.h, rotation: 0, opacity: 1, locked: false, hidden: false, assetId: `asset-bg-${Date.now()}`, fit: 'cover' },
          { id: `text-${Date.now()}`, type: 'text', z: 1, x: 80, y: 80, w: state.artifact.ratio.w - 160, h: 120, rotation: 0, opacity: 1, locked: false, hidden: false, content: `Card ${newIndex + 1}`, fontFamily: 'Inter', fontSize: 48, fontWeight: 600, lineHeight: 1.2, letterSpacing: 0, color: '#1d2a30', align: 'left' },
        ],
      };
      return {
        artifact: {
          ...state.artifact,
          cards: [...state.artifact.cards, newCard],
          version: state.artifact.version + 1,
        },
        activeCardId: newCard.id,
      };
    });
  },

  duplicateCard: (cardId) => {
    set((state) => {
      if (!state.artifact) return state;
      const card = state.artifact.cards.find((c) => c.id === cardId);
      if (!card) return state;
      const newCard: MockCard = {
        ...card,
        id: `card-${Date.now()}`,
        index: state.artifact.cards.length,
        layers: card.layers.map((l) => ({
          ...l,
          id: `layer-${Date.now()}-${l.z}`,
        })),
      };
      return {
        artifact: {
          ...state.artifact,
          cards: [...state.artifact.cards, newCard],
          version: state.artifact.version + 1,
        },
        activeCardId: newCard.id,
      };
    });
  },

  removeCard: (cardId) => {
    set((state) => {
      if (!state.artifact || state.artifact.cards.length <= 1) return state;
      const filtered = state.artifact.cards.filter((c) => c.id !== cardId);
      const reindexed = filtered.map((c, i) => ({ ...c, index: i }));
      return {
        artifact: {
          ...state.artifact,
          cards: reindexed,
          version: state.artifact.version + 1,
        },
        activeCardId: reindexed[0]?.id ?? null,
      };
    });
  },

  reorderCards: (order) => {
    set((state) => {
      if (!state.artifact) return state;
      const newCards = order.map((id) => state.artifact!.cards.find((c) => c.id === id)).filter(Boolean) as MockCard[];
      const reindexed = newCards.map((c, i) => ({ ...c, index: i }));
      return {
        artifact: {
          ...state.artifact,
          cards: reindexed,
          version: state.artifact.version + 1,
        },
      };
    });
  },

  updateLayerProp: (cardId, layerId, key, value) => {
    set((state) => {
      if (!state.artifact) return state;
      const cardIndex = state.artifact.cards.findIndex((c) => c.id === cardId);
      if (cardIndex === -1) return state;
      const card = state.artifact.cards[cardIndex];
      const layerIndex = card.layers.findIndex((l) => l.id === layerId);
      if (layerIndex === -1) return state;
      const layer = card.layers[layerIndex];
      if (layer.locked) return state;

      const newLayers = [...card.layers];
      newLayers[layerIndex] = { ...layer, [key]: value };
      const newCards = [...state.artifact.cards];
      newCards[cardIndex] = { ...card, layers: newLayers };

      return {
        artifact: {
          ...state.artifact,
          cards: newCards,
          version: state.artifact.version + 1,
        },
      };
    });
  },

  setComposerValue: (value) => set({ composerValue: value }),
  setPanelWidth: (width) => set({ panelWidth: Math.max(280, Math.min(560, width)) }),
  toggleExportMenu: () => set((s) => ({ showExportMenu: !s.showExportMenu })),
  toggleVersionHistory: () => set((s) => ({ showVersionHistory: !s.showVersionHistory })),
  toggleUsagePopover: () => set((s) => ({ showUsagePopover: !s.showUsagePopover })),
  setActiveBrand: (id) => set({ activeBrandId: id }),
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

  restoreVersion: (versionId) => {
    set((state) => ({
      versions: state.versions.map((v) =>
        v.id === versionId ? { ...v, reason: 'restore' } : v,
      ),
    }));
  },
}));
