// ---------------------------------------------------------------------------
// DEPRECATED: dev auth stub has been replaced by the auth middleware in
// src/middleware/auth.ts. This file exists for backward compatibility only.
// ---------------------------------------------------------------------------

export { getAuth } from './auth.js';
export type { AuthContext, AuthSource, UserRole } from '../auth/types.js';
export { DEV_AUTH, UNAUTHENTICATED_AUTH } from '../auth/types.js';
