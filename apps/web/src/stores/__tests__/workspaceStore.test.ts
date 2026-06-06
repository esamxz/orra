import { describe, it, expect } from 'vitest';
import { useWorkspaceStore, findSelectableLayer, isLayerSelectable } from '../workspaceStore';
import type { Card, Layer } from '@orra/shared';

const makeCard = (overrides?: Partial<Card>, layers?: Layer[]): Card => ({
  id: 'c1',
  index: 0,
  baseColor: '#1d2a30',
  layers: layers ?? [
    { id:'bg1',type:'background',locked:true,hidden:false,z:0,x:0,y:0,w:1080,h:1350,rotation:0,opacity:1,assetId:'bg',fit:'cover' },
    { id:'t1', type:'text',locked:false,hidden:false,z:1,x:100,y:200,w:400,h:100,rotation:0,opacity:1,content:'Hello',fontFamily:'Newsreader',fontSize:48,fontWeight:500,lineHeight:1.1,letterSpacing:0,color:'#1d2a30',align:'left' },
    { id:'img1', type:'image',locked:false,hidden:false,z:2,x:50,y:50,w:200,h:200,rotation:0,opacity:1,assetId:'img',fit:'cover' },
    { id:'hidden1', type:'shape',locked:false,hidden:true,z:3,x:0,y:0,w:100,h:100,rotation:0,opacity:1,shapeKind:'rect',fill:'#000' },
  ],
  ...overrides,
});

describe('workspace store', () => {
  it('defaults to card 0 and no selection', () => {
    const s = useWorkspaceStore.getState();
    expect(s.activeCardIndex).toBe(0);
    expect(s.selectedLayerId).toBeNull();
    expect(s.selectedLayerType).toBeNull();
  });

  it('selectLayer sets id and type', () => {
    useWorkspaceStore.getState().selectLayer('t1', 'text');
    const s = useWorkspaceStore.getState();
    expect(s.selectedLayerId).toBe('t1');
    expect(s.selectedLayerType).toBe('text');
  });

  it('clearSelection resets selection', () => {
    useWorkspaceStore.getState().selectLayer('t1', 'text');
    useWorkspaceStore.getState().clearSelection();
    const s = useWorkspaceStore.getState();
    expect(s.selectedLayerId).toBeNull();
    expect(s.selectedLayerType).toBeNull();
  });

  it('setActiveCard changes activeCardIndex', () => {
    const cardA = makeCard({ id:'cA', index:0 });
    const cardB = makeCard({ id:'cB', index:1, layers: [{ id:'bg2',type:'background',locked:true,hidden:false,z:0,x:0,y:0,w:1080,h:1350,rotation:0,opacity:1,assetId:'bg',fit:'cover' }] });
    useWorkspaceStore.getState().setActiveCard(1, [cardA, cardB]);
    expect(useWorkspaceStore.getState().activeCardIndex).toBe(1);
  });

  it('setActiveCard clears selection when selected layer not on new card', () => {
    const cardA = makeCard({ id:'cA', index:0 });
    const cardB = makeCard({ id:'cB', index:1, layers: [{ id:'bg2',type:'background',locked:true,hidden:false,z:0,x:0,y:0,w:1080,h:1350,rotation:0,opacity:1,assetId:'bg',fit:'cover' }] });
    useWorkspaceStore.getState().selectLayer('t1', 'text');
    useWorkspaceStore.getState().setActiveCard(1, [cardA, cardB]);
    const s = useWorkspaceStore.getState();
    expect(s.activeCardIndex).toBe(1);
    expect(s.selectedLayerId).toBeNull();
  });

  it('setActiveCard preserves selection when layer exists on new card', () => {
    const cardA = makeCard({ id:'cA', index:0 });
    const cardB = makeCard({ id:'cB', index:1, layers: [
      { id:'bg2',type:'background',locked:true,hidden:false,z:0,x:0,y:0,w:1080,h:1350,rotation:0,opacity:1,assetId:'bg',fit:'cover' },
      { id:'t1', type:'text',locked:false,hidden:false,z:1,x:100,y:200,w:400,h:100,rotation:0,opacity:1,content:'Hello',fontFamily:'Newsreader',fontSize:48,fontWeight:500,lineHeight:1.1,letterSpacing:0,color:'#1d2a30',align:'left' },
    ]});
    useWorkspaceStore.getState().selectLayer('t1', 'text');
    useWorkspaceStore.getState().setActiveCard(1, [cardA, cardB]);
    const s = useWorkspaceStore.getState();
    expect(s.activeCardIndex).toBe(1);
    expect(s.selectedLayerId).toBe('t1');
    expect(s.selectedLayerType).toBe('text');
  });
});

describe('findSelectableLayer', () => {
  it('returns the matching selectable layer', () => {
    const card = makeCard();
    const found = findSelectableLayer(card, 't1');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('t1');
  });

  it('returns null for missing id', () => {
    const card = makeCard();
    expect(findSelectableLayer(card, 'missing')).toBeNull();
  });

  it('returns null for hidden layer', () => {
    const card = makeCard();
    expect(findSelectableLayer(card, 'hidden1')).toBeNull();
  });

  it('returns null for background layer (not selectable by id query)', () => {
    const card = makeCard();
    expect(findSelectableLayer(card, 'bg1')).toBeNull();
  });
});

describe('isLayerSelectable', () => {
  it('text layer is selectable', () => {
    expect(isLayerSelectable({ id:'x', type:'text' } as Layer)).toBe(true);
  });

  it('image layer is selectable', () => {
    expect(isLayerSelectable({ id:'x', type:'image' } as Layer)).toBe(true);
  });

  it('shape layer is selectable', () => {
    expect(isLayerSelectable({ id:'x', type:'shape' } as Layer)).toBe(true);
  });

  it('object layer is selectable', () => {
    expect(isLayerSelectable({ id:'x', type:'object' } as Layer)).toBe(true);
  });

  it('logo layer is selectable', () => {
    expect(isLayerSelectable({ id:'x', type:'logo' } as Layer)).toBe(true);
  });

  it('background layer is not selectable', () => {
    expect(isLayerSelectable({ id:'x', type:'background' } as Layer)).toBe(false);
  });

  it('overlay layer is not selectable', () => {
    expect(isLayerSelectable({ id:'x', type:'overlay' } as Layer)).toBe(false);
  });

  it('hidden layer is not selectable', () => {
    expect(isLayerSelectable({ id:'x', type:'text', hidden: true } as Layer)).toBe(false);
  });
});
