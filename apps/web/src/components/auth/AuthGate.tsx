import { useAuth } from '@clerk/clerk-react';
import { useClerk } from '@clerk/clerk-react';

/**
 * AuthGate guards protected routes with Clerk authentication.
 *
 * - While Clerk loads: shows a calm loading state.
 * - If the user is not signed in: shows a minimal sign-in prompt aligned
 *   with Orra's quiet-creative-studio aesthetic, using Clerk's hosted UI.
 * - If authenticated: renders children.
 *
 * This component must be used inside `<ClerkProvider>`.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();

  if (!isLoaded) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          background: 'var(--bg, #0f1416)',
          color: 'var(--text, #f1f4f4)',
          fontFamily: 'var(--font-ui, Hanken Grotesk, system-ui, sans-serif)',
          fontSize: 14,
        }}
      >
        <style>{`
          @keyframes orra-pulse {
            0%, 100% { opacity: 0.4; transform: scale(0.9); }
            50% { opacity: 1; transform: scale(1); }
          }
        `}</style>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'var(--primary-06, rgba(164,183,189,0.06))',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'var(--primary, #a4b7bd)',
                animation: 'orra-pulse 1.4s ease-in-out infinite',
              }}
            />
          </div>
          <p style={{ margin: 0, opacity: 0.72 }}>Loading authentication…</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          background: 'var(--bg, #0f1416)',
          color: 'var(--text, #f1f4f4)',
          fontFamily: 'var(--font-ui, Hanken Grotesk, system-ui, sans-serif)',
          fontSize: 14,
        }}
      >
        <div
          style={{
            textAlign: 'center',
            maxWidth: 360,
            padding: '0 24px',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'var(--primary-06, rgba(164,183,189,0.06))',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 20px',
            }}
          >
            <img src="/orra_logo.svg" alt="Orra" style={{ width: 28, height: 28 }} />
          </div>
          <h1
            style={{
              margin: '0 0 8px',
              fontFamily: 'var(--font-display, Newsreader, Georgia, serif)',
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: '-0.01em',
            }}
          >
            Sign in to Orra
          </h1>
          <p style={{ margin: '0 0 28px', color: 'var(--muted, #5e7680)', lineHeight: 1.5 }}>
            Authentication is required to create and edit projects.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              style={{ height: 44, fontSize: 14, padding: '0 24px' }}
              onClick={() => clerk.openSignIn()}
            >
              Sign in
            </button>
            <button
              className="btn btn-ghost"
              style={{ height: 44, fontSize: 14, padding: '0 24px' }}
              onClick={() => clerk.openSignUp()}
            >
              Create account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
