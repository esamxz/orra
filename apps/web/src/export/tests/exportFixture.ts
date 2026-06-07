import type { ArtifactDocument } from '@orra/shared';

// ---------------------------------------------------------------------------
// Export fidelity fixture — all seven layer types in one card.
// Used by tests to verify buildCardRenderData behavior and for manual
// developer export inspection. Not imported from production code.
// ---------------------------------------------------------------------------

export function makeExportFixtureDoc(): ArtifactDocument {
  return {
    schemaVersion: 1,
    artifactId: '00000000-0000-0000-0000-000000000001',
    type: 'post',
    ratio: { name: '4:5', w: 1080, h: 1350 },
    cards: [
      {
        id: '00000000-0000-0000-0000-000000000002',
        index: 0,
        baseColor: '#1d2a30',
        layers: [
          // z=0 background
          {
            id: '00000000-0000-0000-0000-000000000010',
            type: 'background',
            z: 0, x: 0, y: 0, w: 1080, h: 1350,
            rotation: 0, opacity: 1,
            locked: false, hidden: false,
            assetId: '00000000-0000-0000-0000-000000000020',
            fit: 'cover',
          },
          // z=1 text layer (Newsreader 700)
          {
            id: '00000000-0000-0000-0000-000000000011',
            type: 'text',
            z: 1, x: 80, y: 120, w: 920, h: 160,
            rotation: 0, opacity: 1,
            locked: false, hidden: false,
            content: 'Export Fidelity Test',
            fontFamily: 'Newsreader',
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: -1,
            color: '#ffffff',
            align: 'left',
          },
          // z=2 text layer (Hanken Grotesk 400)
          {
            id: '00000000-0000-0000-0000-000000000012',
            type: 'text',
            z: 2, x: 80, y: 300, w: 720, h: 80,
            rotation: 0, opacity: 1,
            locked: false, hidden: false,
            content: 'Body text in Hanken Grotesk',
            fontFamily: 'Hanken Grotesk',
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.5,
            letterSpacing: 0,
            color: '#c8d1d8',
            align: 'left',
          },
          // z=3 shape rect
          {
            id: '00000000-0000-0000-0000-000000000013',
            type: 'shape',
            z: 3, x: 80, y: 420, w: 200, h: 4,
            rotation: 0, opacity: 0.6,
            locked: false, hidden: false,
            shapeKind: 'rect',
            fill: '#5e7680',
          },
          // z=4 shape ellipse
          {
            id: '00000000-0000-0000-0000-000000000014',
            type: 'shape',
            z: 4, x: 900, y: 1200, w: 120, h: 120,
            rotation: 0, opacity: 1,
            locked: false, hidden: false,
            shapeKind: 'ellipse',
            fill: '#354e53',
            stroke: { color: '#a4b7bd', width: 2 },
          },
          // z=5 overlay solid
          {
            id: '00000000-0000-0000-0000-000000000015',
            type: 'overlay',
            z: 5, x: 0, y: 1000, w: 1080, h: 350,
            rotation: 0, opacity: 0.7,
            locked: false, hidden: false,
            overlayKind: 'solid',
            params: { color: '#000000' },
          },
          // z=6 overlay linearGradient
          {
            id: '00000000-0000-0000-0000-000000000016',
            type: 'overlay',
            z: 6, x: 0, y: 0, w: 1080, h: 400,
            rotation: 0, opacity: 0.5,
            locked: false, hidden: false,
            overlayKind: 'linearGradient',
            params: {
              stops: [
                { offset: 0, color: '#000000' },
                { offset: 1, color: '#1d2a30' },
              ],
              angle: 180,
            },
          },
          // z=7 image layer (placeholder — no real asset)
          {
            id: '00000000-0000-0000-0000-000000000017',
            type: 'image',
            z: 7, x: 80, y: 500, w: 400, h: 400,
            rotation: 0, opacity: 1,
            locked: false, hidden: false,
            assetId: '00000000-0000-0000-0000-000000000021',
            fit: 'cover',
          },
          // z=8 object layer (placeholder)
          {
            id: '00000000-0000-0000-0000-000000000018',
            type: 'object',
            z: 8, x: 540, y: 500, w: 460, h: 400,
            rotation: 0, opacity: 1,
            locked: false, hidden: false,
            assetId: '00000000-0000-0000-0000-000000000022',
            fit: 'contain',
            aiManaged: true,
          },
          // z=9 logo layer (placeholder)
          {
            id: '00000000-0000-0000-0000-000000000019',
            type: 'logo',
            z: 9, x: 40, y: 40, w: 160, h: 60,
            rotation: 0, opacity: 1,
            locked: false, hidden: false,
            assetId: '00000000-0000-0000-0000-000000000023',
            fit: 'contain',
            aiManaged: false,
          },
          // z=10 hidden text layer — MUST be excluded from render output
          {
            id: '00000000-0000-0000-0000-000000000030',
            type: 'text',
            z: 10, x: 80, y: 900, w: 920, h: 60,
            rotation: 0, opacity: 1,
            locked: false, hidden: true,
            content: 'HIDDEN_LAYER_SENTINEL',
            fontFamily: 'Hanken Grotesk',
            fontSize: 24,
            fontWeight: 400,
            lineHeight: 1.4,
            letterSpacing: 0,
            color: '#ffffff',
            align: 'left',
          },
          // z=11 locked visible text layer — MUST be included in render output
          {
            id: '00000000-0000-0000-0000-000000000031',
            type: 'text',
            z: 11, x: 80, y: 960, w: 920, h: 60,
            rotation: 0, opacity: 1,
            locked: true, hidden: false,
            content: 'LOCKED_VISIBLE_SENTINEL',
            fontFamily: 'Hanken Grotesk',
            fontSize: 24,
            fontWeight: 400,
            lineHeight: 1.4,
            letterSpacing: 0,
            color: '#a4b7bd',
            align: 'left',
          },
        ],
      },
    ],
    version: 0,
  };
}

// IDs exported for test assertions
export const FIXTURE_HIDDEN_LAYER_ID = '00000000-0000-0000-0000-000000000030';
export const FIXTURE_LOCKED_LAYER_ID = '00000000-0000-0000-0000-000000000031';
export const FIXTURE_HIDDEN_LAYER_SENTINEL = 'HIDDEN_LAYER_SENTINEL';
export const FIXTURE_LOCKED_LAYER_SENTINEL = 'LOCKED_VISIBLE_SENTINEL';
