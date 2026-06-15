// Backward-compat shim — import from artifactDocumentBuilder instead.
export {
  generateArtifactDocument as generateMockArtifactDocument,
  generateSingleCard as generateMockSingleCard,
} from './artifactDocumentBuilder.js';
export type {
  GenerationInput as MockGenerationInput,
  SingleCardInput as MockSingleCardInput,
} from './artifactDocumentBuilder.js';
