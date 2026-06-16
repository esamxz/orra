import { Hono } from 'hono';
import type { Env } from '../env.js';
import projectRoutes from './projects.js';
import artifactRoutes from './artifacts.js';
import chatRoutes from './chat.js';
import generationRoutes from './generation.js';
import creditRoutes from './credits.js';
import brandRoutes from './brands.js';
import promptsRoute from './prompts.js';
import trendTemplateRoutes from './trendTemplates.js';

// ---------------------------------------------------------------------------
// V1 protected route mount point
// ---------------------------------------------------------------------------
// All v1 routes mount here. Auth middleware is applied at the app level
// to /v1/* before this router is reached.
//
// Future phases add:
//   - assetRoutes
//   - exportRoutes
//   - billingRoutes

const v1 = new Hono<{ Bindings: Env }>();

// Project CRUD (Phase 8A)
v1.route('/projects', projectRoutes);

// Chat persistence (Phase 9A)
// Mounted at /projects so full paths are /v1/projects/:id/messages
v1.route('/projects', chatRoutes);

// Artifact read-only (Phase 8B)
v1.route('/artifacts', artifactRoutes);

// Generation jobs (Phase 9F — stub, no queue/AI/credits yet)
v1.route('/', generationRoutes);

// Credits (Phase 10A — read-only balance + ledger)
v1.route('/credits', creditRoutes);

// Brand systems (Phase 11A)
v1.route('/brand-systems', brandRoutes);

// Prompt enhancement (P0 — deterministic, no DB, no AI)
v1.route('/prompts', promptsRoute);

// Trend template catalog (read-only, platform-owned)
v1.route('/trend-templates', trendTemplateRoutes);

// Future route modules (commented placeholders)
// v1.route('/assets', assetRoutes);
// v1.route('/export', exportRoutes);
// v1.route('/billing', billingRoutes);

export default v1;
