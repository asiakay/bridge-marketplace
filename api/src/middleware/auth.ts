import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { verifySession } from '../lib/auth';
import type { Env, SessionPayload, UserRole, UserStatus } from '../types';

type Variables = { user: SessionPayload };

export const requireAuth = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const token = getCookie(c, 'session');
    if (!token) return c.json({ error: 'Unauthorized' }, 401);

    try {
      const payload = await verifySession(token, c.env.JWT_SECRET);
      c.set('user', payload);
      await next();
    } catch {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }
  }
);

export const requireStatus = (...statuses: UserStatus[]) =>
  createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
    const user = c.get('user');
    if (!statuses.includes(user.status)) {
      return c.json({ error: 'Account not eligible for this action', status: user.status }, 403);
    }
    await next();
  });

export const requireRole = (...roles: UserRole[]) =>
  createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
    const user = c.get('user');
    const hasRole = roles.some(r => user.role === r || user.role === 'both');
    if (!hasRole) return c.json({ error: 'Forbidden' }, 403);
    await next();
  });
