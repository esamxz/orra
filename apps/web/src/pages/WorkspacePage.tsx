import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { usePersistedActionDispatch } from '../hooks/usePersistedActionDispatch';
import { useArtifactLoader } from '../hooks/useArtifactLoader';
import { useProjectMessages } from '../hooks/useProjectMessages';
import { useGenerationJobPolling } from '../hooks/useGenerationJobPolling';
import { useCreditStatus } from '../hooks/useCreditStatus';
import { useBrandSystems } from '../hooks/useBrandSystems';
import { useAssetUpload } from '../hooks/useAssetUpload';
import { useProjectAssets } from '../hooks/useProjectAssets';
import { useAssetPreviewUrls } from '../hooks/useAssetPreviewUrls';
import { useProjectMemory } from '../hooks/useProjectMemory';
import { appendProjectMessage, prepareProjectMessage, submitApprovalAction } from '../api/chat';
import { createGenerationJob } from '../api/generation';
import { updateProject } from '../api/projects';
import { ApiClientError } from '../api/errors';
import type { ChatMessageDto, DirectorIntentResult, ApprovalCardDto, ApprovalAction } from '../api/types';
import type { ApprovalState } from '@orra/shared';
import '../styles/workspace.css';
import { Icon } from '../data/icons';
import { BRANDS as DEMO_BRANDS } from '../data/cards';
import { brandSystemDtoToDisplayBrand, type DisplayBrand } from '../components/brand/brandDisplayUtils';
import {
  makeArtifactSinglePost,
  makeArtifactCarousel,
  makeTextLayer,
  makeBackgroundLayer,
  normalizeZ,
  makeCard,
} from '../data/mockArtifacts';
import type { Action, TextLayer } from '@orra/shared';
import KonvaStage from '../components/workspace/KonvaStage';
import ApprovalCard from '../components/workspace/ApprovalCard';
import CarouselRail from '../components/workspace/CarouselRail';
import Inspector from '../components/workspace/Inspector';
import ExportMenu from '../components/workspace/ExportMenu';
import VersionHistoryPopover from '../components/workspace/VersionHistoryPopover';
import UsageStatus from '../components/workspace/UsageStatus';
import ProjectMemoryPanel from '../components/workspace/ProjectMemoryPanel';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { buildUpdateLayerPropsAction, buildSetTextContentAction, buildInsertImageLayerAction } from '../components/workspace/inspectorActions';
import { shouldEnterEditMode } from '../components/workspace/textEditHelpers';
import TextEditOverlay from '../components/workspace/TextEditOverlay';
import { exportCardAsPng, exportCarouselAsZip, waitForFonts, createProjectAssetResolver } from '../export/exportCard';

const RATIO_DIM: Record<string, [number, number]> = { '1:1':[1,1], '4:5':[4,5], '9:16':[9,16], '16:9':[16,9] };

function frameSize(ratio: string, maxH=540, maxW=620) {
  const [a,b] = RATIO_DIM[ratio] || [4,5];
  let h = maxH, w = h*a/b;
  if (w > maxW) { w = maxW; h = w*b/a; }
  return { w: Math.round(w), h: Math.round(h) };
}

const CREATE_RE = /\b(create|make|design|build|generate|carousel|posts?|cards?|draft|launch|write)\b/i;

function topicFromPrompt(p: string) {
  if (!p) return 'self-improvement';
  let t = p.toLowerCase()
    .replace(/.*\b(about|on|for|around)\b/, '')
    .replace(/[.!?].*$/, '')
    .replace(/\b(a|an|the|please|carousel|post|cards?|some)\b/g, '')
    .trim();
  return t.length > 2 && t.length < 60 ? t : 'self-improvement';
}


// Mock ID generator for chat messages — not persisted, replaced by server IDs later.
let _mid = 0;
const mid = () => 'm' + (++_mid);

interface LocationState {
  mode?: string;
  ratio?: string;
  brand?: DisplayBrand;
  projectName?: string;
  prefill?: string;
  currentArtifactId?: string;
  projectBrandSystemId?: string | null;
}

interface UiMessage {
  id: string;
  role: 'user' | 'ai';
  type: string;
  text?: string;
  topic?: string;
  approvalCard?: ApprovalCardDto;
  approvalState?: ApprovalState;
}

function mapApiMessageToUi(m: ChatMessageDto): UiMessage {
  const meta =
    m.metadata && typeof m.metadata === 'object'
      ? (m.metadata as Record<string, unknown>)
      : undefined;
  const card =
    m.kind === 'approval_summary' && meta
      ? (meta.approvalCard as ApprovalCardDto | undefined)
      : undefined;
  const state =
    m.kind === 'approval_summary' && meta
      ? (meta.approvalState as ApprovalState | undefined)
      : undefined;

  return {
    id: m.id,
    role: m.role === 'user' ? 'user' : 'ai',
    type: m.kind === 'approval_summary' ? 'approval' : m.kind === 'job_ref' ? 'done' : 'text',
    text: m.content ?? '',
    approvalCard: card,
    approvalState: state,
  };
}

export default function WorkspacePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();
  const config = (location.state as LocationState | null) || {};

  const isCarousel = config.mode === 'carousel' || config.mode === 'assets';

  const [ratio, setRatio] = useState(config.ratio || '4:5');
  const [phase, setPhase] = useState('empty');
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState(config.prefill || '');
  const [pending, setPending] = useState<{ topic: string } | null>(null);
  const [ctaSet, setCtaSet] = useState(false);

  const [sendState, setSendState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [sendError, setSendError] = useState<string | null>(null);
  const [realMessages, setRealMessages] = useState<UiMessage[]>([]);
  const [actingMessageId, setActingMessageId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | undefined>(undefined);
  const [approvedMessageId, setApprovedMessageId] = useState<string | null>(null);
  const lastIntentRef = useRef<DirectorIntentResult | null>(null);

  const projectAssetUpload = useAssetUpload();
  const projectAssetInputRef = useRef<HTMLInputElement>(null);

  const projectAssets = useProjectAssets(projectId ?? undefined);

  // Reload asset list after a successful upload
  useEffect(() => {
    if (projectAssetUpload.asset) {
      projectAssets.reload();
    }
  }, [projectAssetUpload.asset]);

  const { theme, toggle: toggleTheme } = useTheme();
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((txt: string) => {
    setToast(txt);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(()=>setToast(null), 2200);
  }, []);

  const [serverArtifactId, setServerArtifactId] = useState<string | null>(
    (config.currentArtifactId as string | undefined) || null,
  );

  // ---------------------------------------------------------------------------
  // Brand systems from API
  // ---------------------------------------------------------------------------
  const { brands: apiBrands } = useBrandSystems();

  const allDisplayBrands = useMemo(() => {
    const noBrand: DisplayBrand = {
      id: '__no-brand__',
      name: 'No brand',
      initial: '—',
      logoBg: 'var(--inset)',
      logoFg: 'var(--muted)',
      colors: ['#c8d1d8', '#eef1f1'],
      fonts: ['—'],
      tone: [],
    };
    const real = apiBrands.map(brandSystemDtoToDisplayBrand);
    const fallback = real.length === 0 ? DEMO_BRANDS : [];
    return [noBrand, ...real, ...fallback];
  }, [apiBrands]);

  // Resolve the current brand from project state or navigation state.
  const projectBrandId = config.projectBrandSystemId ?? null;
  const curBrand = useMemo(() => {
    if (projectBrandId) {
      const found = allDisplayBrands.find((b) => b.id === projectBrandId);
      if (found) return found;
    }
    if (config.brand) return config.brand;
    return allDisplayBrands[0]; // "No brand"
  }, [allDisplayBrands, projectBrandId, config.brand]);

  const [brandOpen, setBrandOpen] = useState(false);
  const [workspaceBrand, setWorkspaceBrand] = useState(curBrand);

  // Sync workspaceBrand when the computed curBrand changes (e.g. on project load).
  useEffect(() => {
    setWorkspaceBrand(curBrand);
  }, [curBrand.id]);

  const brandHandle = '@' + workspaceBrand.name.toLowerCase().replace(/[^a-z]+/g,'.').replace(/^\.|\.$/g,'');

  // Switch or clear brand on a real project.
  const handleSwitchBrand = useCallback(async (brandId: string | null) => {
    const selected = allDisplayBrands.find((b) => b.id === brandId) ?? allDisplayBrands[0];
    setWorkspaceBrand(selected);
    setBrandOpen(false);
    if (projectId) {
      try {
        await updateProject(projectId, {
          brandSystemId: brandId === '__no-brand__' ? null : brandId,
        });
        flash(brandId && brandId !== '__no-brand__' ? 'Brand applied' : 'Brand cleared');
      } catch (err) {
        const msg = err instanceof ApiClientError ? err.message : 'Failed to update brand';
        flash(msg);
      }
    } else {
      flash(brandId && brandId !== '__no-brand__' ? 'Brand applied' : 'Brand cleared');
    }
  }, [allDisplayBrands, projectId, flash]);

  const {
    artifact,
    dispatch,
    undo,
    redo,
    reset: resetArtifact,
    canUndo,
    canRedo,
    saveStatus,
  } = usePersistedActionDispatch(null, {
    artifactId: serverArtifactId,
    onError: flash,
    onConflict: flash,
  });

  // ---------------------------------------------------------------------------
  // Artifact loading from API (Phase 8D.1)
  // ---------------------------------------------------------------------------
  const artifactLoader = useArtifactLoader();

  const {
    messages: apiMessages,
    state: messagesState,
    error: messagesError,
    reload: reloadMessages,
  } = useProjectMessages(projectId ?? undefined);

  const {
    memory: projectMemory,
    loading: memoryLoading,
    error: memoryError,
    reload: reloadMemory,
  } = useProjectMemory(projectId ?? undefined);

  const {
    job: polledJob,
    artifact: polledArtifact,
    artifactError: pollArtifactError,
    // state: pollingState, // reserved for future UI states
  } = useGenerationJobPolling(activeJobId, serverArtifactId ?? undefined);

  // Phase 10D: credit status for workspace usage bar
  const {
    data: creditData,
    loading: creditLoading,
    error: creditError,
    reload: reloadCreditStatus,
  } = useCreditStatus(!!projectId);

  // Selection state from workspace store
  const activeCardIndex = useWorkspaceStore((s) => s.activeCardIndex);
  const selectedLayerId = useWorkspaceStore((s) => s.selectedLayerId);
  const isCardByCardMode = useWorkspaceStore((s) => s.isCardByCardMode);
  const setActiveCard = useWorkspaceStore((s) => s.setActiveCard);
  const selectLayer = useWorkspaceStore((s) => s.selectLayer);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);
  const syncSelectionWithCard = useWorkspaceStore((s) => s.syncSelectionWithCard);
  const setCardByCardMode = useWorkspaceStore((s) => s.setCardByCardMode);

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [preparingSetup, setPreparingSetup] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const editContextRef = useRef<{ cardId: string; layerId: string; originalContent: string } | null>(null);

  // W8: per-card generation confirmation state
  const [cardGenConfirm, setCardGenConfirm] = useState<{ cardId: string } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [versOpen, setVersOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(372);
  const resizing = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(372);

  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  /* ----- kernel action dispatch ----- */
  const handleInspectorAction = useCallback((action: Action) => {
    dispatch(action);
  }, [dispatch]);

  const card = artifact ? artifact.cards[activeCardIndex] : null;

  // Preview URLs for image layers on the active card
  const activeImageAssetIds = useMemo(() => {
    if (!card) return [];
    return card.layers
      .filter((l) => l.type === 'image' && !l.hidden)
      .map((l) => (l as { assetId: string }).assetId);
  }, [card]);

  const canvasPreviewUrls = useAssetPreviewUrls(projectId ?? undefined, activeImageAssetIds);

  const fr = frameSize(ratio, isCarousel?500:548);

  // Sync real messages from API when projectId or apiMessages change
  useEffect(() => {
    if (projectId) {
      setRealMessages(apiMessages.map(mapApiMessageToUi));
    }
  }, [apiMessages, projectId]);

  // Update generating message when polled job status changes
  useEffect(() => {
    if (!activeJobId || !polledJob) return;

    setRealMessages((prev) => {
      const generatingIdx = prev.findIndex((m) => m.type === 'generating' && m.id === `job-${activeJobId}`);
      if (generatingIdx === -1) return prev;

      const updated = [...prev];
      const status = polledJob.status;

      if (status === 'running') {
        updated[generatingIdx] = {
          ...updated[generatingIdx],
          text: `Generation running (${activeJobId.slice(0, 8)}…)`,
        };
      } else if (status === 'succeeded') {
        updated[generatingIdx] = {
          ...updated[generatingIdx],
          type: 'done',
          text: 'Generation completed. The updated design is loading.',
        };
        flash('Generation completed');
      } else if (status === 'failed') {
        updated[generatingIdx] = {
          ...updated[generatingIdx],
          type: 'done',
          text: `Generation failed: ${polledJob.error ? JSON.stringify(polledJob.error) : 'Unknown error'}`,
        };
        flash('Generation failed');
      }

      return updated;
    });
  }, [polledJob, activeJobId, flash]);

  // Phase 9H: when polling hook loads a new artifact after job success,
  // hydrate the editor with the updated document.
  useEffect(() => {
    if (!polledArtifact) return;
    resetArtifact(polledArtifact.document);
    setActiveCard(0);
    clearSelection();
    setPhase('generated');
    flash('Updated design loaded');
  }, [polledArtifact, resetArtifact, setActiveCard, clearSelection, flash]);

  // Phase 9H: surface calm error when artifact reload fails after success.
  useEffect(() => {
    if (!pollArtifactError) return;
    flash(pollArtifactError);
  }, [pollArtifactError, flash]);

  // Phase 10D: refresh credit status when a generation job finishes
  useEffect(() => {
    if (!polledJob) return;
    if (polledJob.status === 'succeeded' || polledJob.status === 'failed') {
      reloadCreditStatus();
    }
  }, [polledJob, reloadCreditStatus]);

  const displayMessages = useMemo(() => {
    return projectId ? realMessages : messages;
  }, [projectId, realMessages, messages]);

  // True when the project has user message(s) but no AI/assistant response yet.
  const firstPromptPending = useMemo(() => {
    if (!projectId || realMessages.length === 0) return false;
    return !realMessages.some((m) => m.role === 'ai');
  }, [projectId, realMessages]);

  // True when the project has uploaded assets but no chat messages yet.
  const hasAssetsButNoMessages = useMemo(() => {
    return !!(projectId && realMessages.length === 0 && projectAssets.assets.length > 0);
  }, [projectId, realMessages, projectAssets.assets]);

  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [displayMessages]);

  // Sync selection when active card changes
  useEffect(() => {
    if (card) {
      syncSelectionWithCard(card);
    }
  }, [card, syncSelectionWithCard]);

  // Keyboard undo/redo — blocked inside text inputs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const editable = (e.target as HTMLElement).isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
      else if (ctrl && e.shiftKey && e.key === 'z') { e.preventDefault(); redo(); }
      else if (ctrl && e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  // Guard activeCardIndex when undo removes a card
  useEffect(() => {
    if (artifact && activeCardIndex >= artifact.cards.length) {
      setActiveCard(Math.max(0, artifact.cards.length - 1));
    }
  }, [artifact, activeCardIndex, setActiveCard]);

  // ---------------------------------------------------------------------------
  // Load artifact from API when workspace opens with a projectId
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!projectId) {
      artifactLoader.clear();
      return;
    }
    const artifactId = config.currentArtifactId as string | undefined;
    if (artifactId) {
      artifactLoader.load(artifactId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Hydrate editor when API artifact finishes loading
  useEffect(() => {
    if (artifactLoader.state === 'idle' && artifactLoader.document) {
      if (artifactLoader.artifactId) {
        setServerArtifactId(artifactLoader.artifactId);
      }
      resetArtifact(artifactLoader.document);
      setActiveCard(0);
      clearSelection();
      setPhase('generated');
    }
  }, [
    artifactLoader.state,
    artifactLoader.document,
    artifactLoader.artifactId,
    resetArtifact,
    setActiveCard,
    clearSelection,
  ]);

  /* ----- chat send ----- */
  const send = async () => {
    const text = input.trim();
    if (!text) return;

    if (projectId) {
      // Real project mode: persist to backend
      setSendState('sending');
      setSendError(null);
      const tempId = `temp-${Date.now()}`;
      setRealMessages((prev) => [...prev, { id: tempId, role: 'user', type: 'text', text }]);
      setInput('');
      if (taRef.current) taRef.current.style.height = 'auto';

      try {
        const saved = await appendProjectMessage(projectId, {
          content: text,
          selectedCardIndex: activeCardIndex,
        });
        // If the response includes an edit result, apply it to the in-memory document.
        if (saved.editResult) {
          resetArtifact(saved.editResult.document);
        }
        setRealMessages((prev) => {
          const replaced = prev.map((m) =>
            m.id === tempId ? mapApiMessageToUi(saved.message) : m,
          );
          if (saved.approvalMessage) {
            return [...replaced, mapApiMessageToUi(saved.approvalMessage)];
          }
          return replaced;
        });
        lastIntentRef.current = saved.intent;
        setSendState('idle');
        reloadMemory();
      } catch (err) {
        setRealMessages((prev) => prev.filter((m) => m.id !== tempId));
        setSendState('error');
        const msg = err instanceof ApiClientError ? err.message : 'Failed to send message. Please try again.';
        setSendError(msg);
        setInput(text);
        if (taRef.current) {
          taRef.current.style.height = 'auto';
          taRef.current.style.height = Math.min(taRef.current.scrollHeight, 120) + 'px';
        }
      }
      return;
    }

    // Demo/local mode: existing mock behavior
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';
    setMessages(m => [...m, { id:mid(), role:'user', type:'text', text }]);

    const wantsCreate = CREATE_RE.test(text) || !!config.prefill;
    if (wantsCreate) {
      const topic = topicFromPrompt(text);
      setMessages(m => [...m, { id:mid(), role:'ai', type:'thinking', text:'Planning the direction…' }]);
      setTimeout(()=>{
        setMessages(m => {
          const copy = m.filter(x => x.type!=='thinking');
          return [...copy, { id:mid(), role:'ai', type:'approval', topic, text: '' }];
        });
        setPending({ topic });
      }, 1500);
    } else {
      setMessages(m => [...m, { id:mid(), role:'ai', type:'thinking', text:'' }]);
      setTimeout(()=>{
        setMessages(m => {
          const copy = m.filter(x => x.type!=='thinking');
          return [...copy, { id:mid(), role:'ai', type:'text', text:'Got it — tell me what you’d like to create and I’ll draft a plan. You can say something like "make a 5-card carousel about morning routines."' }];
        });
      }, 900);
    }
  };

  /* ----- approval action handler (real project mode) ----- */
  const handleApprovalAction = async (messageId: string, action: ApprovalAction, value?: string) => {
    if (!projectId) return;
    setActingMessageId(messageId);
    try {
      const updatedMessage = await submitApprovalAction(projectId, messageId, { action, value });
      setRealMessages((prev) =>
        prev.map((m) => (m.id === messageId ? mapApiMessageToUi(updatedMessage) : m)),
      );
      flash(
        action === 'approve_and_create'
          ? 'Plan approved'
          : action === 'cancel'
            ? 'Plan cancelled'
            : action === 'create_card_by_card'
              ? 'Card-by-card mode activated'
              : 'Plan updated',
      );
      reloadMemory();

      // Phase 9G: create generation job and start polling after approval
      // Phase 10B: credit reservation before enqueue
      if (action === 'approve_and_create') {
        setApprovedMessageId(messageId);
        try {
          const job = await createGenerationJob({ projectId, approvalMessageId: messageId });
          setActiveJobId(job.id);
          setRealMessages((prev) => [
            ...prev,
            {
              id: `job-${job.id}`,
              role: 'ai',
              type: 'generating',
              text: `Generation queued (${job.id.slice(0, 8)}…)`,
            },
          ]);
          flash('Generation queued');
        } catch (err) {
          if (err instanceof ApiClientError && err.code === 'INSUFFICIENT_CREDITS') {
            flash('Not enough credits for this generation.');
          } else {
            const msg = err instanceof ApiClientError ? err.message : 'Failed to queue generation.';
            flash(msg);
          }
        }
      }

      if (action === 'create_card_by_card') {
        setApprovedMessageId(messageId);
        setCardByCardMode(true);
      }
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Action failed. Please try again.';
      flash(msg);
    } finally {
      setActingMessageId(null);
    }
  };

  /* ----- W4: prepare existing first message ----- */
  const handlePrepareSetup = useCallback(async () => {
    if (!projectId || preparingSetup) return;
    const firstUserMsg = realMessages.find((m) => m.role === 'user');
    if (!firstUserMsg) return;
    setPreparingSetup(true);
    setPrepareError(null);
    try {
      const result = await prepareProjectMessage(projectId, firstUserMsg.id);
      if (result.approvalMessage) {
        setRealMessages((prev) => [...prev, mapApiMessageToUi(result.approvalMessage!)]);
      }
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Could not process this project. Please try again.';
      setPrepareError(msg);
    } finally {
      setPreparingSetup(false);
    }
  }, [projectId, preparingSetup, realMessages]);

  /* ----- per-card generation (card-by-card mode) ----- */
  // W8: open confirmation dialog instead of firing immediately
  const handleGenerateCard = (cardId: string) => {
    if (!projectId || !approvedMessageId) return;
    setCardGenConfirm({ cardId });
  };

  const confirmGenerateCard = async () => {
    if (!cardGenConfirm || !projectId || !approvedMessageId) return;
    setIsConfirming(true);
    try {
      const job = await createGenerationJob({
        projectId,
        approvalMessageId: approvedMessageId,
        generationScope: 'selected_card',
        targetCardId: cardGenConfirm.cardId,
      });
      setActiveJobId(job.id);
      setRealMessages((prev) => [
        ...prev,
        {
          id: `job-${job.id}`,
          role: 'ai',
          type: 'generating',
          text: `Generating card (${job.id.slice(0, 8)}…)`,
        },
      ]);
      flash('Generating card…');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'INSUFFICIENT_CREDITS') {
        flash('Not enough credits for this card.');
      } else {
        flash(err instanceof ApiClientError ? err.message : 'Failed to queue card generation.');
      }
    } finally {
      setIsConfirming(false);
      setCardGenConfirm(null);
    }
  };

  /* ----- approve & generate ----- */
  const approve = (_topic: string) => {
    setMessages(m => m.map(x => x.type==='approval' ? { ...x, type:'approvalDone' } : x));
    setPending(null);
    setMessages(m => [...m, { id:mid(), role:'ai', type:'thinking', text:'Designing the layers…' }]);
    setTimeout(()=>{
      const made = isCarousel ? makeArtifactCarousel(brandHandle) : makeArtifactSinglePost(brandHandle);
      setServerArtifactId(null); // mock artifacts are local-only
      resetArtifact(made);
      setActiveCard(0); clearSelection(); setPhase('generated');
      setMessages(m => {
        const copy = m.filter(x => x.type!=='thinking');
        return [...copy, { id:mid(), role:'ai', type:'done', text:`Created a ${isCarousel?made.cards.length+'-card carousel':'single post'}. Click any text to edit, or tell me what to change.` }];
      });
      flash(isCarousel ? 'Carousel generated' : 'Post generated');
    }, 1700);
  };

  const specs = pending ? {
    lead: isCarousel
      ? `Ready to create a ${artifact?.cards.length ?? 5}-card carousel about ${pending.topic}.`
      : `Ready to create a single post about ${pending.topic}.`,
    style: 'Calm · premium · focused',
    format: `Instagram ${ratio}`,
    brand: workspaceBrand.name,
    cta: 'Visit the link in bio',
  } : null;

  /* ----- rail card ops ----- */
  const addCard = () => {
    if (!artifact) return;
    const variants = ['#1d2a30','#5e7680','#eef1f1','#c8d1d8','#1d2a30'];
    const labels = ['cover','steel','pale','mist','cta'];
    const idx = artifact.cards.length % variants.length;
    const baseColor = variants[idx];
    const label = labels[idx];
    const textColor = label === 'pale' ? '#1d2a30' : '#f1f4f4';
    const subColor = label === 'pale' ? '#5e7680' : '#c8d1d8';
    const rw = artifact.ratio.w;
    const rh = artifact.ratio.h;

    const newCard = makeCard({
      index: artifact.cards.length,
      baseColor,
      layers: normalizeZ([
        makeBackgroundLayer({ z: 0, w: rw, h: rh }),
        makeTextLayer({
          z: 1,
          content: 'New card',
          x: Math.round(0.10 * rw),
          y: Math.round(0.38 * rh),
          w: Math.round(0.80 * rw),
          fontFamily: 'Newsreader',
          fontSize: Math.round(8.5 * (rw / 100)),
          fontWeight: 500,
          color: textColor,
          align: 'left',
          lineHeight: 1.06,
        }),
        makeTextLayer({
          z: 2,
          content: 'Add your copy here',
          x: Math.round(0.10 * rw),
          y: Math.round(0.62 * rh),
          w: Math.round(0.74 * rw),
          fontFamily: 'Hanken Grotesk',
          fontSize: Math.round(3.6 * (rw / 100)),
          fontWeight: 500,
          color: subColor,
          align: 'left',
          lineHeight: 1.2,
          opacity: 0.95,
        }),
      ]),
    });

    if (dispatch({ type: 'addCard', card: newCard })) {
      setActiveCard(artifact.cards.length);
      clearSelection();
      flash('Card added');
    }
  };

  const dupCard = (i: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!artifact) return;
    if (dispatch({ type: 'duplicateCard', cardId: artifact.cards[i].id })) {
      flash('Card duplicated');
    }
  };

  const delCard = (i: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!artifact || artifact.cards.length <= 1) {
      flash('A carousel needs at least one card');
      return;
    }
    if (dispatch({ type: 'removeCard', cardId: artifact.cards[i].id })) {
      const nextIndex = Math.max(0, activeCardIndex >= i ? activeCardIndex - 1 : activeCardIndex);
      setActiveCard(nextIndex);
      clearSelection();
    }
  };

  const handleDragEnd = useCallback((layerId: string, x: number, y: number) => {
    if (!card) return;
    dispatch(buildUpdateLayerPropsAction(card.id, layerId, { x, y }));
  }, [card, dispatch]);

  const handleResizeEnd = useCallback((layerId: string, x: number, y: number, w: number, h: number) => {
    if (!card) return;
    dispatch(buildUpdateLayerPropsAction(card.id, layerId, { x, y, w, h }));
  }, [card, dispatch]);

  const handleDblClick = useCallback((layerId: string) => {
    if (!card) return;
    const layer = card.layers.find((l) => l.id === layerId);
    if (!layer || !shouldEnterEditMode(layer)) return;
    editContextRef.current = {
      cardId: card.id,
      layerId,
      originalContent: (layer as TextLayer).content,
    };
    setEditingLayerId(layerId);
  }, [card]);

  const handleEditCommit = useCallback((text: string) => {
    const ctx = editContextRef.current;
    editContextRef.current = null;
    setEditingLayerId(null);
    if (!ctx) return;
    if (text !== ctx.originalContent) {
      dispatch(buildSetTextContentAction(ctx.cardId, ctx.layerId, text));
    }
  }, [dispatch]);

  const handleEditCancel = useCallback(() => {
    editContextRef.current = null;
    setEditingLayerId(null);
  }, []);

  const handleProjectAssetSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file || !projectId) return;
    const uploaded = await projectAssetUpload.upload(file, {
      type: 'project',
      projectId,
      kind: 'upload',
    });
    if (uploaded) {
      flash(`Asset uploaded: ${uploaded.fileName}`);
    } else {
      flash(projectAssetUpload.error ?? 'Asset upload failed');
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  }, [projectId, projectAssetUpload, flash]);

  const handleInsertAsset = useCallback((assetId: string) => {
    if (!artifact || !card) {
      flash('Open a card before inserting');
      return;
    }
    const action = buildInsertImageLayerAction(card.id, assetId, artifact.ratio.w, artifact.ratio.h);
    if (dispatch(action)) {
      flash('Image inserted');
      // Attempt to select the new layer after a tick
      if (action.type === 'addLayer') {
        setTimeout(() => selectLayer(action.layer.id, 'image'), 0);
      }
    } else {
      flash('Could not insert image');
    }
  }, [artifact, card, dispatch, flash, selectLayer]);

  // Cancel edit on card switch; TextEditOverlay cleanup commits pending text first
  useEffect(() => {
    setEditingLayerId(null);
  }, [activeCardIndex]);

  // Inspector receives the real selected Layer
  const selectedLayer = card ? card.layers.find(l => l.id === selectedLayerId) ?? null : null;

  /* ----- resizable divider ----- */
  const onResizeStart = (e: React.MouseEvent) => {
    resizing.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = chatWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const delta = e.clientX - startXRef.current;
      const next = Math.min(Math.max(startWidthRef.current + delta, 260), 520);
      setChatWidth(next);
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  return (
    <div className="work">
      {/* TOP BAR */}
      <div className="work-top">
        <button className="home" onClick={()=>navigate('/')} title="Back to dashboard">
          <div className="wordmark"><div className="glyph" style={{width:26,height:26,borderRadius:8}}><img src="/orra_logo.svg" alt="Orra" style={{width:22,height:22}} /></div></div>
          {<Icon.arrowLeft s={16} style={{color:'var(--muted)'}} />}
        </button>
        <div className="proj-name">
          {config.projectName || (isCarousel ? 'Untitled carousel' : 'Untitled post')}
          <span className="dot" />
          <span className="mode-pill">{isCarousel?'Carousel':'Single post'}</span>
        </div>

        <div className="top-divider" />
        <div style={{position:'relative'}}>
          <button className="top-sel" onClick={()=>setBrandOpen(v=>!v)}>
            <span className="sw" style={{background:`conic-gradient(${workspaceBrand.colors.join(',')})`}} />
            {workspaceBrand.name}<span className="caret">{<Icon.caret s={14} />}</span>
          </button>
          {brandOpen && <>
            <div className="backdrop" onClick={()=>setBrandOpen(false)} />
            <div className="menu-pop" style={{top:46,right:'auto',left:0,width:230,zIndex:26}}>
              <div className="mh">Brand system</div>
              {allDisplayBrands.map((b) => (
                <button
                  key={b.id}
                  className="menu-item"
                  onClick={() => handleSwitchBrand(b.id === '__no-brand__' ? null : b.id)}
                >
                  <span className="ic" style={{background:b.logoBg,color:b.logoFg,fontFamily:'var(--font-display)'}}>{b.initial}</span>
                  <span className="tx"><b>{b.name}</b><span>{b.tone.join(' · ') || 'No brand selected'}</span></span>
                  {b.id === workspaceBrand.id && <span style={{marginLeft:'auto',color:'var(--primary)'}}>{<Icon.check s={16} />}</span>}
                </button>
              ))}
            </div>
          </>}
        </div>

        <div className="top-sel" style={{cursor:'default'}}>
          <select
            value={artifact?.ratio.name ?? ratio}
            onChange={e=> {
              const name = e.target.value;
              const dim = RATIO_DIM[name];
              if (!dim || !artifact) return;
              const [a, b] = dim;
              const base = 270;
              const newRatio = { name: name as '1:1' | '4:5' | '9:16' | '16:9', w: a * base, h: b * base };
              if (dispatch({ type: 'setRatio', ratio: newRatio })) {
                setRatio(name);
              }
            }}
            style={{border:'none',background:'none',outline:'none',fontWeight:600,fontSize:13,cursor:'pointer'}}
          >
            {Object.keys(RATIO_DIM).map(r=><option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="top-right">
          <button className="btn-icon" disabled={!canUndo} style={{opacity:canUndo?1:0.4}} onClick={undo} title="Undo">{<Icon.undo s={18} />}</button>
          <button className="btn-icon" disabled={!canRedo} style={{opacity:canRedo?1:0.4}} onClick={redo} title="Redo">{<Icon.redo s={18} />}</button>
          <div style={{position:'relative'}}>
            <button className="btn-icon" onClick={()=>{setVersOpen(v=>!v);setExportOpen(false);}} title="Version history">{<Icon.history s={18} />}</button>
            {versOpen && <>
              <div className="backdrop" onClick={()=>setVersOpen(false)} />
              <VersionHistoryPopover onRestore={(d)=>flash('Restored '+d.toLowerCase())} />
            </>}
          </div>
          <button className="btn-icon" onClick={toggleTheme} title="Toggle theme">{theme==='dark'? <Icon.sun s={18} /> : <Icon.moon s={18} />}</button>
          <div className="autosave">
            <span
              className="live"
              style={{
                background:
                  saveStatus === 'error'
                    ? '#c44'
                    : saveStatus === 'saving'
                      ? '#a4b7bd'
                      : '#5b9279',
                boxShadow:
                  saveStatus === 'error'
                    ? '0 0 0 3px rgba(204,68,68,0.16)'
                    : saveStatus === 'saving'
                      ? '0 0 0 3px rgba(164,183,189,0.16)'
                      : '0 0 0 3px rgba(91,146,121,0.16)',
              }}
            />
            {saveStatus === 'saving'
              ? 'Saving'
              : saveStatus === 'saved'
                ? 'Saved'
                : saveStatus === 'error'
                  ? 'Save failed'
                  : saveStatus === 'conflict'
                    ? 'Reloaded latest'
                    : 'Saved'}
          </div>
          <ProjectMemoryPanel
            memory={projectMemory}
            loading={memoryLoading}
            error={memoryError}
          />
          <UsageStatus
            compact
            status={creditData}
            loading={creditLoading}
            error={creditError}
          />
          <div style={{position:'relative'}}>
            <button className="btn btn-primary btn-sm" style={{height:36}} onClick={()=>{setExportOpen(v=>!v);setVersOpen(false);}}>{<Icon.download s={16} />} Export</button>
            {exportOpen && <>
              <div className="backdrop" onClick={()=>setExportOpen(false)} />
              <ExportMenu
                isCarousel={isCarousel}
                cardCount={artifact?.cards.length ?? 0}
                ratio={ratio}
                onClose={()=>setExportOpen(false)}
                onFlash={flash}
                onExportPng={artifact ? async () => {
                  await waitForFonts();
                  const assetUrlResolver = projectId
                    ? createProjectAssetResolver(projectId)
                    : undefined;
                  await exportCardAsPng(artifact, activeCardIndex, {
                    projectName: config.projectName,
                    assetUrlResolver,
                  });
                } : undefined}
                onExportZip={artifact && artifact.cards.length > 1 ? async () => {
                  await waitForFonts();
                  const assetUrlResolver = projectId
                    ? createProjectAssetResolver(projectId)
                    : undefined;
                  await exportCarouselAsZip(artifact, {
                    projectName: config.projectName,
                    assetUrlResolver,
                    onProgress: (current, total) => flash(`Exporting ${current} of ${total}…`),
                  });
                } : undefined}
              />
            </>}
          </div>
        </div>
      </div>

      <input
        ref={projectAssetInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={handleProjectAssetSelect}
      />

      {/* BODY */}
      <div className="work-body">
        {/* CHAT */}
        <section className="chat" style={{ width: chatWidth, flex: 'none' }}>
          <div className="chat-head">
            <div>
              <div className="ttl">Director</div>
              <div className="sub">Chat to create & refine</div>
            </div>
            <span className="ai-badge">{<Icon.sparkFill s={13} />} Orra AI</span>
          </div>

          <div className="chat-scroll" ref={scrollRef}>
            {/* Loading state for real project */}
            {projectId && messagesState === 'loading' && displayMessages.length === 0 && (
              <div style={{textAlign:'center',color:'var(--muted)',padding:'28px 10px'}}>
                <div style={{width:46,height:46,borderRadius:14,background:'var(--primary-06)',color:'var(--primary)',display:'grid',placeItems:'center',margin:'0 auto 14px'}}>
                  <span className="thinking"><span className="dots"><i/><i/><i/></span></span>
                </div>
                <p style={{fontSize:14,lineHeight:1.55,margin:0}}>Loading conversation…</p>
              </div>
            )}

            {/* Error state for real project */}
            {projectId && messagesState === 'error' && (
              <div style={{textAlign:'center',color:'var(--danger,#c44)',padding:'28px 10px'}}>
                <p style={{fontSize:13.5,lineHeight:1.55,margin:'0 0 10px'}}>{messagesError ?? 'Failed to load messages'}</p>
                <button className="btn btn-ghost btn-sm" onClick={reloadMessages}>Try again</button>
              </div>
            )}

            {/* Empty state */}
            {displayMessages.length === 0 && !(projectId && messagesState === 'loading') && (
              <div style={{textAlign:'center',color:'var(--muted)',padding:'28px 10px'}}>
                <div style={{width:46,height:46,borderRadius:14,background:'var(--primary-06)',color:'var(--primary)',display:'grid',placeItems:'center',margin:'0 auto 14px'}}>{<Icon.message s={22} />}</div>
                {hasAssetsButNoMessages
                  ? <p style={{fontSize:14,lineHeight:1.55,margin:0}}>Your images are ready.<br/>Tell Orra what to make with them.</p>
                  : <p style={{fontSize:14,lineHeight:1.55,margin:0}}>Describe the post or carousel you want.<br/>Orra plans first, then builds the layers.</p>
                }
              </div>
            )}
            {/* W4: setup card — shown when first prompt exists but no AI response yet */}
            {firstPromptPending && (
              <div className="msg ai" style={{display:'block'}}>
                {preparingSetup ? (
                  <div className="bubble">
                    <span className="thinking"><span className="dots"><i/><i/><i/></span></span> Planning…
                  </div>
                ) : (
                  <div style={{background:'var(--inset)',border:'1px solid var(--line-soft)',borderRadius:10,padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
                    <p style={{fontSize:13.5,color:'var(--ink)',margin:0,fontWeight:500}}>
                      Ready to prepare this project?
                    </p>
                    <button className="btn btn-primary btn-sm" onClick={handlePrepareSetup}>
                      <Icon.spark s={14} /> Create setup plan
                    </button>
                  </div>
                )}
                {prepareError && (
                  <div style={{padding:'6px 12px',fontSize:12.5,color:'var(--danger,#c44)',marginTop:4}}>
                    {prepareError}
                  </div>
                )}
              </div>
            )}
            {displayMessages.map(m => {
              if (m.type==='thinking') return (
                <div key={m.id} className="msg ai">
                  <div className="av">{<Icon.sparkFill s={12} />}</div>
                  <div className="bubble"><span className="thinking"><span className="dots"><i/><i/><i/></span>{m.text}</span></div>
                </div>
              );
              if (m.type==='generating') return (
                <div key={m.id} className="msg ai">
                  <div className="av">{<Icon.sparkFill s={12} />}</div>
                  <div className="bubble"><span className="thinking"><span className="dots"><i/><i/><i/></span>{m.text}</span></div>
                </div>
              );
              if (m.type==='approval') {
                const status = m.approvalState?.status;
                if (status === 'approved') {
                  return (
                    <div key={m.id} className="msg ai"><div className="av">{<Icon.sparkFill s={12} />}</div>
                      <div className="bubble" style={{color:'var(--muted)',fontSize:13.5}}>Plan approved ✓</div></div>
                  );
                }
                if (status === 'cancelled') {
                  return (
                    <div key={m.id} className="msg ai"><div className="av">{<Icon.sparkFill s={12} />}</div>
                      <div className="bubble" style={{color:'var(--muted)',fontSize:13.5}}>Plan cancelled</div></div>
                  );
                }
                const approvalSpecs = m.approvalCard ? {
                  lead: m.approvalCard.summaryLine,
                  style: m.approvalCard.style,
                  format: m.approvalCard.format,
                  brand: m.approvalCard.brand,
                  cta: m.approvalCard.cta,
                  cardCount: m.approvalCard.cardCount,
                  visualDirection: m.approvalCard.visualDirection,
                  styleNotes: m.approvalCard.styleNotes,
                  memorySummary: m.approvalCard.memorySummary,
                  estimatedCredits: m.approvalCard.estimatedCredits,
                } : specs;
                const isReal = !!m.approvalCard;
                const isActing = actingMessageId === m.id;
                const ec = m.approvalCard?.estimatedCredits;
                const canAfford = (ec != null && creditData != null)
                  ? creditData.balance.totalRemaining >= ec
                  : undefined;
                return (
                  <div key={m.id} className="msg ai" style={{display:'block'}}>
                    <ApprovalCard
                      specs={approvalSpecs}
                      ctaSet={isReal ? !!m.approvalCard?.cta : ctaSet}
                      disabled={isActing}
                      canAfford={isReal ? canAfford : undefined}
                      onApprove={() => isReal ? handleApprovalAction(m.id, 'approve_and_create') : approve(m.topic || '')}
                      onAddCta={() => isReal ? handleApprovalAction(m.id, 'add_cta', 'Visit the link in bio') : (setCtaSet(true),flash('CTA added to plan'))}
                      onEdit={() => isReal ? handleApprovalAction(m.id, 'edit_direction', 'Adjust direction') : (taRef.current&&taRef.current.focus(), flash('Edit your direction below'))}
                      onCreateCardByCard={isReal ? () => handleApprovalAction(m.id, 'create_card_by_card') : undefined}
                    />
                  </div>
                );
              }
              if (m.type==='approvalDone') return (
                <div key={m.id} className="msg ai"><div className="av">{<Icon.sparkFill s={12} />}</div>
                  <div className="bubble" style={{color:'var(--muted)',fontSize:13.5}}>Plan approved ✓</div></div>
              );
              if (m.type==='done') return (
                <div key={m.id} className="msg ai" style={{display:'block'}}>
                  <div className="done-card"><span className="ic">{<Icon.check s={14} />}</span>{m.text}</div>
                </div>
              );
              return (
                <div key={m.id} className={'msg '+m.role}>
                  <div className="av">{m.role==='ai'? <Icon.sparkFill s={12} /> : 'Y'}</div>
                  <div className="bubble">{m.text}</div>
                </div>
              );
            })}
          </div>

          {/* Project assets strip — minimal preview list */}
          {projectId && projectAssets.assets.length > 0 && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--line-soft)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Project assets
              </div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                {projectAssets.assets.map((asset) => (
                  <div key={asset.id} style={{ flex: 'none', width: 72, textAlign: 'center' }}>
                    {projectAssets.previewUrls[asset.id] ? (
                      <img
                        src={projectAssets.previewUrls[asset.id]}
                        alt={asset.fileName}
                        style={{ width: 72, height: 56, borderRadius: 6, objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <button
                        className="btn-icon"
                        style={{
                          width: 72,
                          height: 56,
                          borderRadius: 6,
                          background: 'var(--inset)',
                          color: 'var(--muted)',
                          fontSize: 10,
                          cursor: asset.status === 'uploaded' ? 'pointer' : 'default',
                        }}
                        onClick={() => {
                          if (asset.status === 'uploaded') {
                            projectAssets.getPreviewUrl(asset.id);
                          }
                        }}
                        title={asset.status === 'uploaded' ? 'Load preview' : 'Upload pending'}
                      >
                        {asset.status === 'uploaded' ? 'IMG' : '…'}
                      </button>
                    )}
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 72 }}>
                      {asset.fileName}
                    </div>
                    {asset.status === 'uploaded' && (
                      <button
                        className="btn btn-ghost btn-xs"
                        style={{ marginTop: 4, fontSize: 10, height: 22, padding: '0 6px' }}
                        onClick={() => handleInsertAsset(asset.id)}
                        title="Insert into canvas"
                      >
                        Insert
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="composer">
            {displayMessages.length===0 && (
              <div className="suggest-row">
                {['5-card carousel on slow mornings','A quote post about focus','Carousel: 3 quiet productivity tips'].map(s=>(
                  <button key={s} className="suggest" onClick={()=>setInput(s)}>{s}</button>
                ))}
              </div>
            )}
            {sendError && (
              <div style={{padding:'6px 12px',fontSize:12.5,color:'var(--danger,#c44)',background:'rgba(204,68,68,0.06)',borderRadius:8,marginBottom:6}}>
                {sendError}
              </div>
            )}
            <div className="composer-box">
              <textarea ref={taRef} rows={1} placeholder="Direct Orra — describe or refine…"
                value={input}
                disabled={sendState === 'sending'}
                onChange={e=>{ setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,120)+'px'; }}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); } }} />
              <div className="composer-bar">
                <button className="attach" onClick={()=> projectAssetInputRef.current?.click()}>{<Icon.attach s={15} />} Add assets</button>
                <span className="grow" />
                <span style={{fontSize:11.5,color:'var(--muted)',marginRight:4}}>{workspaceBrand.name}</span>
                <button className="send-btn" aria-label="Send" disabled={!input.trim() || sendState === 'sending'} onClick={send}>
                  {sendState === 'sending' ? <span className="thinking"><span className="dots"><i/><i/><i/></span></span> : <Icon.send s={17} />}
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="resizer" onMouseDown={onResizeStart} title="Resize panel"><div className="resizer-grip" /></div>

        {/* STAGE */}
        <section className="stage">
          <div className="stage-grid" />
          <div className="stage-main">
            {/* Artifact loading state */}
            {artifactLoader.state === 'loading' && (
              <div className="empty">
                <div className="orb"><img src="/orra_logo.svg" alt="Orra" style={{width:44,height:44}} /></div>
                <h2>Loading project…</h2>
                <p style={{color:'var(--muted)'}}>Fetching the latest artifact from the server.</p>
              </div>
            )}

            {/* Artifact error state */}
            {(artifactLoader.state === 'error' || artifactLoader.state === 'not_found') && (
              <div className="empty">
                <div className="orb" style={{opacity:0.5}}><img src="/orra_logo.svg" alt="Orra" style={{width:44,height:44}} /></div>
                <h2>Unable to load project</h2>
                <p style={{color:'var(--danger, #c44)', fontSize:13.5}}>{artifactLoader.error || 'The artifact could not be loaded.'}</p>
                <div className="opts">
                  <button className="btn btn-ghost" onClick={()=> navigate('/')}>
                    {<Icon.arrowLeft s={16} />} Back to dashboard
                  </button>
                </div>
              </div>
            )}

            {phase!=='generated' && artifactLoader.state !== 'loading' && artifactLoader.state !== 'error' && artifactLoader.state !== 'not_found' ? (
              <div className="empty">
                <div className="orb"><img src="/orra_logo.svg" alt="Orra" style={{width:44,height:44}} /></div>
                <h2>A quiet canvas, ready</h2>
                <p>Start with a prompt, upload assets, or choose a trend template. Orra will plan the direction, then lay out editable text over your visuals.</p>
                <div className="opts">
                  <button className="btn btn-ghost" onClick={()=>{ taRef.current&&taRef.current.focus(); }}>{<Icon.message s={16} />} Write a prompt</button>
                  <button className="btn btn-soft" onClick={()=> projectAssetInputRef.current?.click()}>{<Icon.assets s={16} />} Upload assets</button>
                </div>
              </div>
            ) : (
              <div className="canvas-wrap">
                <div className="canvas-frame" style={{width:fr.w, height:fr.h, position:'relative'}}>
                  {artifact && (
                    <KonvaStage
                      document={artifact}
                      activeCardIndex={activeCardIndex}
                      selectedLayerId={selectedLayerId}
                      onSelectLayer={(id, type) => selectLayer(id, type)}
                      onBgClick={() => { handleEditCancel(); clearSelection(); }}
                      onDragEnd={handleDragEnd}
                      onDblClick={handleDblClick}
                      editingLayerId={editingLayerId}
                      onResizeEnd={handleResizeEnd}
                      previewUrls={canvasPreviewUrls.urls}
                    />
                  )}
                  {editingLayerId && artifact && card && (() => {
                    const editLayer = card.layers.find((l) => l.id === editingLayerId);
                    if (!editLayer || editLayer.type !== 'text') return null;
                    return (
                      <TextEditOverlay
                        key={editingLayerId}
                        layer={editLayer as TextLayer}
                        frameW={fr.w}
                        frameH={fr.h}
                        docW={artifact.ratio.w}
                        docH={artifact.ratio.h}
                        onCommit={handleEditCommit}
                        onCancel={handleEditCancel}
                      />
                    );
                  })()}
                </div>
                <div className="canvas-caption">
                  {isCarousel ? <>Card {activeCardIndex+1} of {artifact?.cards.length ?? 0} · {ratio} · {workspaceBrand.name}</> : <>Single post · {ratio} · {workspaceBrand.name}</>}
                </div>
              </div>
            )}

            {selectedLayer && card && artifact && (
              <Inspector
                layer={selectedLayer}
                cardId={card.id}
                cardW={artifact.ratio.w}
                cardH={artifact.ratio.h}
                cardLayers={card.layers}
                onAction={handleInspectorAction}
                onClose={()=>clearSelection()}
                brandColors={workspaceBrand.colors}
                brandFonts={workspaceBrand.fonts}
              />
            )}
          </div>

          {/* CAROUSEL RAIL */}
          {isCarousel && artifact && (
            <CarouselRail
              artifact={artifact}
              activeCardIndex={activeCardIndex}
              ratio={ratio}
              isCardByCardMode={isCardByCardMode}
              activeJobId={activeJobId}
              onSelectCard={(i) => setActiveCard(i, artifact.cards)}
              onAddCard={addCard}
              onDuplicateCard={dupCard}
              onDeleteCard={delCard}
              onGenerateCard={isCardByCardMode ? handleGenerateCard : undefined}
            />
          )}

          {/* W8: per-card generation confirmation dialog */}
          {cardGenConfirm && (
            <div className="card-gen-confirm" style={{
              position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
              background: 'var(--surface-2, #1d2a30)', border: '1px solid var(--line-soft)',
              borderRadius: 10, padding: '14px 18px', display: 'flex', flexDirection: 'column',
              gap: 10, zIndex: 100, minWidth: 240, boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}>
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-main)' }}>
                Generate this card for 10 credits?
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={isConfirming}
                  onClick={() => setCardGenConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  data-testid="confirm-generate-card-btn"
                  disabled={isConfirming}
                  onClick={confirmGenerateCard}
                >
                  {isConfirming ? 'Generating…' : 'Generate card'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {toast && <div className="toast">{<Icon.check s={16} />}{toast}</div>}
    </div>
  );
}
