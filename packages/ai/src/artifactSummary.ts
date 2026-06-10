import type { ArtifactDocument } from '@orra/shared';
import type { CurrentArtifactSummary } from './types.js';

const MAX_SNIPPETS = 5;
const MAX_SNIPPET_CHARS = 100;

/**
 * Build a compact summary of an ArtifactDocument for use in AI planning prompts.
 * Never includes assetIds, R2 keys, or any URL fields — only human-readable counts
 * and short text excerpts.
 */
export function buildArtifactSummary(doc: ArtifactDocument): CurrentArtifactSummary {
  let textLayerCount = 0;
  let imageLayerCount = 0;
  let shapeLayerCount = 0;
  let visibleLayerCount = 0;
  const textSnippets: string[] = [];

  for (const card of doc.cards) {
    for (const layer of card.layers) {
      const isVisible = layer.hidden !== true;
      if (isVisible) {
        visibleLayerCount++;
      }

      if (layer.type === 'text') {
        textLayerCount++;
        if (isVisible && textSnippets.length < MAX_SNIPPETS) {
          const snippet = layer.content.slice(0, MAX_SNIPPET_CHARS);
          if (snippet.length > 0) {
            textSnippets.push(snippet);
          }
        }
      } else if (layer.type === 'image') {
        imageLayerCount++;
      } else if (layer.type === 'shape') {
        shapeLayerCount++;
      }
    }
  }

  return {
    cardCount: doc.cards.length,
    ratioName: doc.ratio.name,
    textLayerCount,
    imageLayerCount,
    shapeLayerCount,
    visibleLayerCount,
    textSnippets,
  };
}
