import posthog from 'posthog-js';

const observabilityEnabled = import.meta.env.VITE_OBSERVABILITY_ENABLED === 'true';
const posthogKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

export const analyticsEnabled = observabilityEnabled && !!posthogKey;

if (analyticsEnabled) {
  posthog.init(posthogKey!, {
    api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com',
    autocapture: false,
    capture_pageview: true,
    disable_session_recording: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
  });
}

export type SafeEventName =
  | 'dashboard_viewed'
  | 'prompt_enhance_clicked'
  | 'prompt_enhance_succeeded'
  | 'prompt_enhance_failed'
  | 'project_create_clicked'
  | 'project_created'
  | 'asset_upload_started'
  | 'asset_upload_succeeded'
  | 'asset_upload_failed'
  | 'generation_approved'
  | 'generation_succeeded'
  | 'generation_failed'
  | 'selected_card_generation_approved'
  | 'template_used';

export type SafeEventProps = Record<string, string | number | boolean>;

export function track(event: SafeEventName, props?: SafeEventProps): void {
  if (!analyticsEnabled) return;
  try {
    posthog.capture(event, props);
  } catch {
    // fail open
  }
}

export function identify(userId: string, traits?: { plan?: string; environment?: string }): void {
  if (!analyticsEnabled) return;
  try {
    posthog.identify(userId, traits);
  } catch {
    // fail open
  }
}

export function reset(): void {
  if (!analyticsEnabled) return;
  try {
    posthog.reset();
  } catch {
    // fail open
  }
}
