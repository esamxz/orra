import type { UserRepository } from './userRepository.js';
import type { WorkspaceRepository } from './workspaceRepository.js';
import type { ProjectRepository } from './projectRepository.js';
import type { ArtifactRepository } from './artifactRepository.js';
import type { ChatRepository } from './chatRepository.js';
import type { GenerationJobRepository } from './generationJobRepository.js';

import type { CreditRepository } from './creditRepository.js';
import type { BrandSystemRepository } from './brandSystemRepository.js';

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
  chat: ChatRepository;
  generationJob: GenerationJobRepository;
  credit: CreditRepository;
  brandSystem: BrandSystemRepository;
}
