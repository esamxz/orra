import type { UserRepository } from '../repositories/userRepository.js';
import type { WorkspaceRepository } from '../repositories/workspaceRepository.js';
import type { UserRole } from '../auth/types.js';

// ---------------------------------------------------------------------------
// Auth bootstrap service
// ---------------------------------------------------------------------------
// After Clerk JWT verification succeeds, this service resolves the app-side
// user, personal workspace, and workspace membership.
//
// Rules:
//   - find or create the users row (upsert on clerk_id)
//   - find or create the personal workspace + owner membership
//   - return userId, workspaceId, role
//
// This is the bridge from Clerk authentication to Orra authorization.

export interface BootstrapResult {
  userId: string;
  workspaceId: string;
  role: UserRole;
}

export interface BootstrapIdentity {
  clerkUserId: string;
  email: string | null;
  displayName: string | null;
}

export class AuthBootstrapService {
  constructor(
    private userRepo: UserRepository,
    private workspaceRepo: WorkspaceRepository
  ) {}

  async bootstrap(identity: BootstrapIdentity): Promise<BootstrapResult> {
    const user = await this.resolveUser(identity);
    const workspace = await this.workspaceRepo.ensurePersonalWorkspaceForUser({
      userId: user.id,
      name: this.deriveWorkspaceName(identity.displayName),
    });

    return {
      userId: user.id,
      workspaceId: workspace.workspaceId,
      role: workspace.role,
    };
  }

  private async resolveUser(identity: BootstrapIdentity) {
    const existing = await this.userRepo.findByClerkId(identity.clerkUserId);
    if (existing) {
      return existing;
    }

    return this.userRepo.createFromClerkIdentity({
      clerkId: identity.clerkUserId,
      email: identity.email,
      displayName: identity.displayName,
    });
  }

  private deriveWorkspaceName(displayName: string | null): string {
    if (displayName && displayName.trim().length > 0) {
      return `${displayName}'s Workspace`;
    }
    return 'Personal Workspace';
  }
}
