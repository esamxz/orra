import type { DbClient } from '../db/client.js';

// ---------------------------------------------------------------------------
// Project repository
// ---------------------------------------------------------------------------
// Placeholder interface only. Project CRUD is out of scope for Phase 7C.
// This file exists so the Repositories context can reference a stable type.

export interface ProjectRepository {
  // Intentionally empty in Phase 7C.
  // Future phases add: create, list, get, update, delete.
}

/**
 * Stub implementation with no methods. Exists so service context can
 * construct a Repositories object without undefined entries.
 */
export class StubProjectRepository implements ProjectRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_db: DbClient) {}
}
