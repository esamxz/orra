import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { apiClient } from '../../api/client.js';

/**
 * React bridge that wires Clerk's `getToken()` into the framework-agnostic
 * API client. Mount this once inside `<ClerkProvider>` and near the root of
 * the app so that every API call carries a fresh Clerk JWT.
 *
 * Requirements:
 * - Must be rendered inside `<ClerkProvider>`.
 * - Must not be imported into non-React files (the API client stays pure).
 * - Clears the provider on unmount so stray tokens do not leak across sessions.
 */
export default function ClerkApiTokenProvider() {
  const { getToken } = useAuth();

  useEffect(() => {
    apiClient.setAuthTokenProvider(async () => {
      try {
        const token = await getToken();
        return token ?? null;
      } catch {
        // If Clerk cannot produce a token (network, session expiry, etc.),
        // return null so the API client sends no Authorization header.
        // Protected routes will respond with UNAUTHENTICATED and the UI can
        // surface that gracefully.
        return null;
      }
    });

    return () => {
      // On unmount (sign-out, provider removal), reset to the default
      // provider so stale tokens are not reused.
      apiClient.setAuthTokenProvider(async () => null);
    };
  }, [getToken]);

  return null;
}
