import { Outlet } from 'react-router-dom';
import ClerkApiTokenProvider from './ClerkApiTokenProvider.js';
import AuthGate from './AuthGate.js';

const CLERK_CONFIGURED = !!(
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
);

/**
 * AuthenticatedLayout wraps the protected app shell.
 *
 * When Clerk is configured:
 *   - Mounts `<ClerkApiTokenProvider>` to wire JWTs into the API client.
 *   - Uses `<AuthGate>` to show loading / sign-in states.
 *
 * When Clerk is NOT configured (demo / local dev without Clerk):
 *   - Shows a clearly marked demo banner.
 *   - Does NOT gate the UI; the app is fully usable.
 *   - The dev token fallback (if explicitly enabled) can still authenticate
 *     API calls.
 */
export default function AuthenticatedLayout() {
  if (!CLERK_CONFIGURED) {
    return (
      <>
        <DemoModeBanner />
        <Outlet />
      </>
    );
  }

  return (
    <>
      <ClerkApiTokenProvider />
      <AuthGate>
        <Outlet />
      </AuthGate>
    </>
  );
}

function DemoModeBanner() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#2a3b42',
        color: '#c8d1d8',
        fontFamily: 'var(--font-ui, Hanken Grotesk, system-ui, sans-serif)',
        fontSize: 12,
        padding: '8px 16px',
        textAlign: 'center',
        borderBottom: '1px solid rgba(164,183,189,0.12)',
      }}
    >
      <strong style={{ color: '#a4b7bd' }}>Demo mode</strong>
      {' — Clerk is not configured. Set '}
      <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '1px 4px', borderRadius: 4 }}>
        VITE_CLERK_PUBLISHABLE_KEY
      </code>
      {' in your environment to enable real authentication.'}
    </div>
  );
}
