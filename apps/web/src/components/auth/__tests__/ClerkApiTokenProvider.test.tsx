// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useAuth } from '@clerk/clerk-react';
import ClerkApiTokenProvider from '../ClerkApiTokenProvider.js';
import { apiClient } from '../../../api/client.js';

// Mock Clerk's useAuth hook
vi.mock('@clerk/clerk-react', () => ({
  useAuth: vi.fn(),
}));

// Spy on the API client's setAuthTokenProvider
vi.mock('../../../api/client.js', async () => {
  const actual = await vi.importActual('../../../api/client.js');
  return {
    ...actual,
    apiClient: {
      ...(actual as { apiClient: typeof apiClient }).apiClient,
      setAuthTokenProvider: vi.fn(),
    },
  };
});

describe('ClerkApiTokenProvider', () => {
  const mockedUseAuth = vi.mocked(useAuth);
  const mockedSetProvider = vi.mocked(apiClient.setAuthTokenProvider);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sets the API token provider from Clerk getToken on mount', async () => {
    const getToken = vi.fn().mockResolvedValue('clerk-jwt-abc');
    mockedUseAuth.mockReturnValue({
      getToken,
      isLoaded: true,
      isSignedIn: true,
      userId: 'usr_123',
      sessionId: 'sess_123',
      signOut: vi.fn(),
      orgId: null,
      orgRole: null,
      orgSlug: null,
    } as unknown as ReturnType<typeof useAuth>);

    render(<ClerkApiTokenProvider />);

    // Wait for the useEffect to run
    await vi.waitFor(() => {
      expect(mockedSetProvider).toHaveBeenCalledTimes(1);
    });

    // The provider should be a function that returns the token
    const provider = mockedSetProvider.mock.calls[0][0];
    const token = await provider();
    expect(token).toBe('clerk-jwt-abc');
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('clears the token provider on unmount', async () => {
    const getToken = vi.fn().mockResolvedValue('clerk-jwt-abc');
    mockedUseAuth.mockReturnValue({
      getToken,
      isLoaded: true,
      isSignedIn: true,
      userId: 'usr_123',
      sessionId: 'sess_123',
      signOut: vi.fn(),
      orgId: null,
      orgRole: null,
      orgSlug: null,
    } as unknown as ReturnType<typeof useAuth>);

    const { unmount } = render(<ClerkApiTokenProvider />);

    await vi.waitFor(() => {
      expect(mockedSetProvider).toHaveBeenCalledTimes(1);
    });

    unmount();

    // The cleanup effect should reset the provider
    await vi.waitFor(() => {
      expect(mockedSetProvider).toHaveBeenCalledTimes(2);
    });

    const cleanupProvider = mockedSetProvider.mock.calls[1][0];
    const token = await cleanupProvider();
    expect(token).toBeNull();
  });

  it('returns null when getToken throws, preventing unauthenticated calls from crashing', async () => {
    const getToken = vi.fn().mockRejectedValue(new Error('Session expired'));
    mockedUseAuth.mockReturnValue({
      getToken,
      isLoaded: true,
      isSignedIn: true,
      userId: 'usr_123',
      sessionId: 'sess_123',
      signOut: vi.fn(),
      orgId: null,
      orgRole: null,
      orgSlug: null,
    } as unknown as ReturnType<typeof useAuth>);

    render(<ClerkApiTokenProvider />);

    await vi.waitFor(() => {
      expect(mockedSetProvider).toHaveBeenCalledTimes(1);
    });

    const provider = mockedSetProvider.mock.calls[0][0];
    const token = await provider();
    expect(token).toBeNull();
  });

  it('returns null when getToken returns null (user not signed in)', async () => {
    const getToken = vi.fn().mockResolvedValue(null);
    mockedUseAuth.mockReturnValue({
      getToken,
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      sessionId: null,
      signOut: vi.fn(),
      orgId: null,
      orgRole: null,
      orgSlug: null,
    } as unknown as ReturnType<typeof useAuth>);

    render(<ClerkApiTokenProvider />);

    await vi.waitFor(() => {
      expect(mockedSetProvider).toHaveBeenCalledTimes(1);
    });

    const provider = mockedSetProvider.mock.calls[0][0];
    const token = await provider();
    expect(token).toBeNull();
  });
});
