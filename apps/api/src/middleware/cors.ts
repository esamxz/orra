import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';
import type { Env } from '../env.js';

// ---------------------------------------------------------------------------
// CORS middleware
// ---------------------------------------------------------------------------
// - Reads allowed origins from env if available
// - Supports local dev origins
// - Does not use wildcard for credentialed routes
// - Handles OPTIONS preflight

const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];

function parseAllowedOrigins(env: Env): string[] {
  const fromEnv = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
  const isDev = !env.ENVIRONMENT || env.ENVIRONMENT === 'development';
  const devOrigins = isDev ? DEFAULT_DEV_ORIGINS : [];
  return [...new Set([...devOrigins, ...fromEnv])];
}

// Supports exact origins and single-segment wildcard patterns like https://*.example.com
function originIsAllowed(origin: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (!pattern.includes('*')) return origin === pattern;
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]+');
    return new RegExp(`^${escaped}$`).test(origin);
  });
}

export const corsMiddleware = createMiddleware(
  async (c: Context, next: Next): Promise<Response | void> => {
    const env = c.env as Env;
    const allowedOrigins = parseAllowedOrigins(env);
    const origin = c.req.header('origin') || '';

    // Reflect the origin if it is allowed; otherwise omit (browser blocks)
    const allowOrigin = originIsAllowed(origin, allowedOrigins) ? origin : '';

    if (c.req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-request-id',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    await next();

    if (allowOrigin) {
      c.header('Access-Control-Allow-Origin', allowOrigin);
      c.header('Access-Control-Allow-Credentials', 'true');
    }
  }
);
