import type { UserRepository } from './userRepository.js';
import type { WorkspaceRepository } from './workspaceRepository.js';
import type { ProjectRepository } from './projectRepository.js';
import type { ArtifactRepository } from './artifactRepository.js';

// ---------------------------------------------------------------------------
// Repository context
// ---------------------------------------------------------------------------
// Future services receive this shape so they do not depend on individual
// repository constructors. Tests can inject fakes for any subset.

export interface Repositories {
  user: UserRepository;
  workspace: WorkspaceRepository;
  project: ProjectRepository;
  artifact: ArtifactRepository;
}
