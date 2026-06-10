/**
 * Provider observability types for safe, structured event emission.
 *
 * Privacy rules enforced by type design:
 * - No prompt text, raw response text, or API key fields exist on this interface.
 * - Char counts (promptChars, responseChars) are numbers only — never the strings themselves.
 * - No full project memory, chat content, or artifact JSON fields exist.
 */

export interface AIProviderObservation {
  provider: string;
  operation: 'planText';
  status: 'started' | 'succeeded' | 'failed';
  durationMs?: number;           // present on succeeded and failed
  retryable?: boolean;           // present on failed
  errorCode?: string;            // present on failed
  model?: string;                // present on started, succeeded
  promptChars?: number;          // character count only — never the prompt string
  responseChars?: number;        // character count only — never the response string
  normalizedCardCount?: number;  // present on succeeded
  layoutDirection?: string;      // present on succeeded when AI returned one
  visualDirection?: string;      // present on succeeded when AI returned one
}

export interface AIProviderObserver {
  observe(event: AIProviderObservation): void;
}

export class NoopAIProviderObserver implements AIProviderObserver {
  observe(_event: AIProviderObservation): void {
    // intentionally empty — used as default when no observer is configured
  }
}
