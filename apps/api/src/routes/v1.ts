import { Hono } from 'hono';
import type { Env } from '../env.js';
import healthRoutes from './health.js';

// ---------------------------------------------------------------------------
// V1 route mount point
// ---------------------------------------------------------------------------
// All v1 routes mount here. Future phases add:
//   - projectRoutes
//   - artifactRoutes
//   - brandRoutes
//   - assetRoutes
//   - exportRoutes
//   - creditRoutes
//   - billingRoutes

const v1 = new Hono<{ Bindings: Env }>();

v1.route('/health', healthRoutes);

// Future route modules (commented placeholders)
// v1.route('/projects', projectRoutes);
// v1.route('/artifacts', artifactRoutes);
// v1.route('/brand-systems', brandRoutes);
// v1.route('/assets', assetRoutes);
// v1.route('/export', exportRoutes);
// v1.route('/credits', creditRoutes);
// v1.route('/billing', billingRoutes);

export default v1;
