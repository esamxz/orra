import type { UserRepository } from '../repositories/userRepository.js';
import type { WorkspaceRepository } from '../repositories/workspaceRepository.js';
import type { CreditRepository } from '../repositories/creditRepository.js';
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
//   - if initialCreditGrant > 0 and workspace is newly created, grant credits
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
    private workspaceRepo: WorkspaceRepository,
    private creditRepo?: CreditRepository,
    private initialCreditGrant: number = 0,
  ) {}

  async bootstrap(identity: BootstrapIdentity): Promise<BootstrapResult> {
    const user = await this.resolveUser(identity);
    const workspace = await this.workspaceRepo.ensurePersonalWorkspaceForUser({
      userId: user.id,
      name: this.deriveWorkspaceName(identity.displayName),
    });

    if (workspace.isNew && this.initialCreditGrant > 0 && this.creditRepo) {
      try {
        await this.creditRepo.grantCredits({
          workspaceId: workspace.workspaceId,
          bucket: 'subscription',
          amount: this.initialCreditGrant,
          metadata: { reason: 'initial_grant', source: 'bootstrap' },
        });
      } catch (err) {
        // Non-fatal: a grant failure must not block user login.
        console.warn(
          `Initial credit grant failed for workspace ${workspace.workspaceId}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

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
