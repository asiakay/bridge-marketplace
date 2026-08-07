import { Hono } from 'hono';
import { requireAuth, requireStatus } from '../middleware/auth';
import { newId, nowSecs } from '../lib/uuid';
import type { Env, SessionPayload } from '../types';

type Variables = { user: SessionPayload };

// Admin routes — requires approved status. In production, add a separate
// admin role or IP allowlist. For MVP, any approved user can reach /api/admin/*
// by design — tighten this before going public.
const admin = new Hono<{ Bindings: Env; Variables: Variables }>();

admin.use('*', requireAuth, requireStatus('approved'));

// ── Seller application management ─────────────────────────────────────────────

// GET /api/admin/users/pending
admin.get('/users/pending', async (c) => {
  const users = await c.env.DB.prepare(
    `SELECT id, email, phone, role, status, invited_by, created_at
     FROM users WHERE status = 'pending' ORDER BY created_at ASC`
  ).all();
  return c.json({ users: users.results });
});

// GET /api/admin/users
admin.get('/users', async (c) => {
  const { status, role } = c.req.query();
  let query = 'SELECT id, email, phone, role, status, invited_by, stripe_account_id, created_at FROM users WHERE 1=1';
  const params: string[] = [];

  if (status) { query += ' AND status = ?'; params.push(status); }
  if (role) { query += ' AND (role = ? OR role = \'both\')'; params.push(role); }
  query += ' ORDER BY created_at DESC LIMIT 100';

  const stmt = c.env.DB.prepare(query);
  const users = await (params.length ? stmt.bind(...params) : stmt).all();
  return c.json({ users: users.results });
});

// POST /api/admin/users/:id/approve
admin.post('/users/:id/approve', async (c) => {
  const { id } = c.req.param();
  const user = await c.env.DB.prepare(
    'SELECT id, status FROM users WHERE id = ?'
  ).bind(id).first<{ id: string; status: string }>();

  if (!user) return c.json({ error: 'User not found' }, 404);
  if (user.status !== 'pending') {
    return c.json({ error: `Cannot approve a user with status "${user.status}"` }, 400);
  }

  await c.env.DB.prepare(
    "UPDATE users SET status = 'approved' WHERE id = ?"
  ).bind(id).run();

  return c.json({ message: 'User approved' });
});

// POST /api/admin/users/:id/reject
admin.post('/users/:id/reject', async (c) => {
  const { id } = c.req.param();
  const { reason } = await c.req.json<{ reason?: string }>();

  const user = await c.env.DB.prepare(
    'SELECT id, status FROM users WHERE id = ?'
  ).bind(id).first<{ id: string; status: string }>();

  if (!user) return c.json({ error: 'User not found' }, 404);
  if (!['pending', 'approved'].includes(user.status)) {
    return c.json({ error: 'User is already rejected or suspended' }, 400);
  }

  await c.env.DB.prepare(
    "UPDATE users SET status = 'rejected' WHERE id = ?"
  ).bind(id).run();

  // TODO: send rejection email with reason if email service is configured
  console.log(`[ADMIN] User ${id} rejected. Reason: ${reason ?? 'not specified'}`);

  return c.json({ message: 'User rejected' });
});

// POST /api/admin/users/:id/suspend
// Manual-only suspension (per open decision 5: no automated criteria)
admin.post('/users/:id/suspend', async (c) => {
  const { id } = c.req.param();
  const { reason } = await c.req.json<{ reason: string }>();

  if (!reason) return c.json({ error: 'A reason is required for suspension' }, 400);

  const user = await c.env.DB.prepare(
    'SELECT id, status FROM users WHERE id = ?'
  ).bind(id).first<{ id: string; status: string }>();

  if (!user) return c.json({ error: 'User not found' }, 404);
  if (user.status === 'suspended') return c.json({ error: 'Already suspended' }, 400);

  await c.env.DB.prepare(
    "UPDATE users SET status = 'suspended' WHERE id = ?"
  ).bind(id).run();

  console.log(`[ADMIN] User ${id} suspended. Reason: ${reason}`);

  return c.json({ message: 'User suspended' });
});

// POST /api/admin/users/:id/reinstate
admin.post('/users/:id/reinstate', async (c) => {
  const { id } = c.req.param();

  const user = await c.env.DB.prepare(
    'SELECT id, status FROM users WHERE id = ?'
  ).bind(id).first<{ id: string; status: string }>();

  if (!user) return c.json({ error: 'User not found' }, 404);
  if (user.status !== 'suspended') return c.json({ error: 'User is not suspended' }, 400);

  await c.env.DB.prepare(
    "UPDATE users SET status = 'approved' WHERE id = ?"
  ).bind(id).run();

  return c.json({ message: 'User reinstated' });
});

// ── Image moderation ──────────────────────────────────────────────────────────

// GET /api/admin/images/pending
admin.get('/images/pending', async (c) => {
  const images = await c.env.DB.prepare(
    `SELECT li.id, li.listing_id, li.r2_key, li.sort_order, li.moderation_status,
            l.title AS listing_title, l.seller_id
     FROM listing_images li
     JOIN listings l ON l.id = li.listing_id
     WHERE li.moderation_status = 'pending'
     ORDER BY li.created_at ASC LIMIT 50`
  ).all();
  return c.json({ images: images.results });
});

// POST /api/admin/images/:id/approve
admin.post('/images/:id/approve', async (c) => {
  const { id } = c.req.param();
  await c.env.DB.prepare(
    "UPDATE listing_images SET moderation_status = 'approved' WHERE id = ?"
  ).bind(id).run();
  return c.json({ message: 'Image approved' });
});

// POST /api/admin/images/:id/flag
admin.post('/images/:id/flag', async (c) => {
  const { id } = c.req.param();
  const { reason } = await c.req.json<{ reason?: string }>();

  const img = await c.env.DB.prepare(
    'SELECT r2_key FROM listing_images WHERE id = ?'
  ).bind(id).first<{ r2_key: string }>();

  if (!img) return c.json({ error: 'Image not found' }, 404);

  await c.env.DB.prepare(
    "UPDATE listing_images SET moderation_status = 'flagged' WHERE id = ?"
  ).bind(id).run();

  console.log(`[ADMIN] Image ${id} flagged. Reason: ${reason ?? 'not specified'}`);

  return c.json({ message: 'Image flagged' });
});

// ── Invite code management ────────────────────────────────────────────────────

// POST /api/admin/invite-codes
admin.post('/invite-codes', async (c) => {
  const session = c.get('user');
  const code = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  const now = nowSecs();

  await c.env.DB.prepare(
    'INSERT INTO invite_codes (id, code, created_by, created_at) VALUES (?, ?, ?, ?)'
  ).bind(newId(), code, session.sub, now).run();

  return c.json({ code }, 201);
});

// GET /api/admin/invite-codes
admin.get('/invite-codes', async (c) => {
  const codes = await c.env.DB.prepare(
    `SELECT ic.id, ic.code, ic.created_at, ic.used_at,
            u.email AS used_by_email
     FROM invite_codes ic
     LEFT JOIN users u ON u.id = ic.used_by
     ORDER BY ic.created_at DESC`
  ).all();
  return c.json({ codes: codes.results });
});

export default admin;
