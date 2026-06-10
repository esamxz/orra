import { describe, it, expect } from 'vitest';
import { buildArtifactSummary } from '../artifactSummary.js';
import type { ArtifactDocument } from '@orra/shared';

const BASE_LAYER = {
  z: 0,
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
};

function makeTextLayer(id: string, content: string, hidden = false) {
  return {
    ...BASE_LAYER,
    id,
    type: 'text' as const,
    content,
    fontFamily: 'Hanken Grotesk',
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 1.4,
    letterSpacing: 0,
    color: '#ffffff',
    align: 'left' as const,
    hidden,
  };
}

function makeImageLayer(id: string, hidden = false) {
  return {
    ...BASE_LAYER,
    id,
    type: 'image' as const,
    assetId: '00000000-0000-0000-0000-000000000001',
    fit: 'cover' as const,
    hidden,
  };
}

function makeShapeLayer(id: string, hidden = false) {
  return {
    ...BASE_LAYER,
    id,
    type: 'shape' as const,
    shapeKind: 'rect' as const,
    hidden,
  };
}

function makeDoc(cards: ArtifactDocument['cards']): ArtifactDocument {
  return {
    schemaVersion: 1,
    artifactId: '11111111-1111-1111-1111-111111111111',
    type: 'post',
    ratio: { name: '4:5', w: 1080, h: 1350 },
    cards,
    version: 1,
  };
}

function makeCard(id: string, index: number, layers: ArtifactDocument['cards'][0]['layers'] = []) {
  return {
    id,
    index,
    baseColor: '#1d2a30' as `#${string}`,
    layers,
  };
}

describe('buildArtifactSummary', () => {
  it('counts cards correctly for a single-card document', () => {
    const doc = makeDoc([makeCard('c1', 0)]);
    const summary = buildArtifactSummary(doc);
    expect(summary.cardCount).toBe(1);
  });

  it('counts cards correctly for a multi-card document', () => {
    const doc = makeDoc([makeCard('c1', 0), makeCard('c2', 1), makeCard('c3', 2)]);
    const summary = buildArtifactSummary(doc);
    expect(summary.cardCount).toBe(3);
  });

  it('includes ratio name when present', () => {
    const doc = makeDoc([makeCard('c1', 0)]);
    const summary = buildArtifactSummary(doc);
    expect(summary.ratioName).toBe('4:5');
  });

  it('counts text layers across all cards', () => {
    const doc = makeDoc([
      makeCard('c1', 0, [makeTextLayer('t1', 'Hello'), makeTextLayer('t2', 'World')]),
      makeCard('c2', 1, [makeTextLayer('t3', 'Slide 2')]),
    ]);
    const summary = buildArtifactSummary(doc);
    expect(summary.textLayerCount).toBe(3);
  });

  it('counts image layers across all cards', () => {
    const doc = makeDoc([
      makeCard('c1', 0, [makeImageLayer('i1'), makeImageLayer('i2')]),
      makeCard('c2', 1, [makeImageLayer('i3')]),
    ]);
    const summary = buildArtifactSummary(doc);
    expect(summary.imageLayerCount).toBe(3);
  });

  it('counts shape layers across all cards', () => {
    const doc = makeDoc([
      makeCard('c1', 0, [makeShapeLayer('s1')]),
      makeCard('c2', 1, [makeShapeLayer('s2'), makeShapeLayer('s3')]),
    ]);
    const summary = buildArtifactSummary(doc);
    expect(summary.shapeLayerCount).toBe(3);
  });

  it('includes hidden text layers in textLayerCount total', () => {
    const doc = makeDoc([
      makeCard('c1', 0, [
        makeTextLayer('t1', 'Visible'),
        makeTextLayer('t2', 'Hidden', true),
      ]),
    ]);
    const summary = buildArtifactSummary(doc);
    expect(summary.textLayerCount).toBe(2);
  });

  it('counts only visible layers in visibleLayerCount', () => {
    const doc = makeDoc([
      makeCard('c1', 0, [
        makeTextLayer('t1', 'Visible'),
        makeTextLayer('t2', 'Hidden', true),
        makeImageLayer('i1', true),
        makeShapeLayer('s1'),
      ]),
    ]);
    const summary = buildArtifactSummary(doc);
    expect(summary.visibleLayerCount).toBe(2);
  });

  it('textSnippets only includes non-hidden text layers', () => {
    const doc = makeDoc([
      makeCard('c1', 0, [
        makeTextLayer('t1', 'Visible text'),
        makeTextLayer('t2', 'This is hidden', true),
      ]),
    ]);
    const summary = buildArtifactSummary(doc);
    expect(summary.textSnippets).toHaveLength(1);
    expect(summary.textSnippets[0]).toBe('Visible text');
  });

  it('textSnippets capped at 5 entries', () => {
    const layers = Array.from({ length: 8 }, (_, i) =>
      makeTextLayer(`t${i}`, `Snippet ${i}`)
    );
    const doc = makeDoc([makeCard('c1', 0, layers)]);
    const summary = buildArtifactSummary(doc);
    expect(summary.textSnippets).toHaveLength(5);
  });

  it('each text snippet truncated to 100 chars', () => {
    const longContent = 'A'.repeat(150);
    const doc = makeDoc([
      makeCard('c1', 0, [makeTextLayer('t1', longContent)]),
    ]);
    const summary = buildArtifactSummary(doc);
    expect(summary.textSnippets[0]).toHaveLength(100);
  });

  it('does not include assetId in output', () => {
    const doc = makeDoc([makeCard('c1', 0, [makeImageLayer('i1')])]);
    const summary = buildArtifactSummary(doc);
    const json = JSON.stringify(summary);
    expect(json).not.toContain('00000000-0000-0000-0000-000000000001');
  });

  it('returns empty textSnippets when no visible text layers', () => {
    const doc = makeDoc([makeCard('c1', 0, [makeTextLayer('t1', 'Hidden', true)])]);
    const summary = buildArtifactSummary(doc);
    expect(summary.textSnippets).toHaveLength(0);
  });

  it('handles empty cards with no layers', () => {
    const doc = makeDoc([makeCard('c1', 0, [])]);
    const summary = buildArtifactSummary(doc);
    expect(summary.textLayerCount).toBe(0);
    expect(summary.imageLayerCount).toBe(0);
    expect(summary.shapeLayerCount).toBe(0);
    expect(summary.visibleLayerCount).toBe(0);
    expect(summary.textSnippets).toHaveLength(0);
  });

  it('collects text snippets across multiple cards', () => {
    const doc = makeDoc([
      makeCard('c1', 0, [makeTextLayer('t1', 'Card one headline')]),
      makeCard('c2', 1, [makeTextLayer('t2', 'Card two body')]),
    ]);
    const summary = buildArtifactSummary(doc);
    expect(summary.textSnippets).toContain('Card one headline');
    expect(summary.textSnippets).toContain('Card two body');
  });
});
