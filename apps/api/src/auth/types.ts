// ---------------------------------------------------------------------------
// AuthContext type — the stable shape carried across the API
// ---------------------------------------------------------------------------
// userId/workspaceId/role are optional because they require DB resolution.
// Clerk verification in Phase 7B resolves clerkUserId only.
// Workspace bootstrap (future phase) will populate userId/workspaceId/role.

export type AuthSource = 'clerk' | 'dev' | 'none';

export type UserRole = 'owner' | 'admin' | 'member';

export interface AuthContext {
  isAuthenticated: boolean;
  clerkUserId: string;
  userId?: string;
  workspaceId?: string;
  role?: UserRole;
  authSource: AuthSource;
}

// ---------------------------------------------------------------------------
// Dev auth fallback — only used when DEV_AUTH_ENABLED is true.
// ---------------------------------------------------------------------------

export const DEV_AUTH: Readonly<AuthContext> = Object.freeze({
  isAuthenticated: true,
  clerkUserId: 'usr_dev_stub',
  userId: '00000000-0000-0000-0000-000000000000',
  workspaceId: '00000000-0000-0000-0000-000000000000',
  role: 'owner',
  authSource: 'dev',
});

export const UNAUTHENTICATED_AUTH: Readonly<AuthContext> = Object.freeze({
  isAuthenticated: false,
  clerkUserId: '',
  authSource: 'none',
});
