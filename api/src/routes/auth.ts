import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { generatePIN, hashPIN, verifyPIN, signSession } from '../lib/auth';
import { sendSMSPIN } from '../lib/twilio';
import { newId, nowSecs } from '../lib/uuid';
import { requireAuth } from '../middleware/auth';
import type { Env, User } from '../types';

const PIN_TTL_SECS = 10 * 60; // 10 minutes
const COOKIE_TTL_SECS = 7 * 24 * 60 * 60; // 7 days

const auth = new Hono<{ Bindings: Env }>();

// POST /api/auth/register
// Body: { email, phone, role, invite_code? }
// - If invite_code provided and valid: user.status = 'approved'
// - Otherwise: user.status = 'pending' (manual admin approval required)
auth.post('/register', async (c) => {
  const body = await c.req.json<{
    email: string;
    phone: string;
    role: string;
    invite_code?: string;
  }>();

  const { email, phone, role, invite_code } = body;

  if (!email || !phone || !role) {
    return c.json({ error: 'email, phone, and role are required' }, 400);
  }
  if (!['buyer', 'seller', 'both'].includes(role)) {
    return c.json({ error: 'role must be buyer, seller, or both' }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first<{ id: string }>();
  if (existing) {
    return c.json({ error: 'An account with that email already exists' }, 409);
  }

  let status: 'pending' | 'approved' = 'pending';
  let invitedBy: string | null = null;

  if (invite_code) {
    const code = await c.env.DB.prepare(
      'SELECT id, created_by, used_by FROM invite_codes WHERE code = ?'
    ).bind(invite_code).first<{ id: string; created_by: string; used_by: string | null }>();

    if (!code) {
      return c.json({ error: 'Invalid invite code' }, 400);
    }
    if (code.used_by) {
      return c.json({ error: 'Invite code has already been used' }, 400);
    }

    status = 'approved';
    invitedBy = code.created_by;
  }

  const userId = newId();
  const now = nowSecs();

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, phone, phone_verified, role, status, invited_by, created_at)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?)`
  ).bind(userId, email, phone, role, status, invitedBy, now).run();

  if (invite_code && invitedBy) {
    await c.env.DB.prepare(
      'UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code = ?'
    ).bind(userId, now, invite_code).run();
  }

  // Send PIN to verify phone
  const pin = generatePIN();
  const pinHash = await hashPIN(pin);
  const pinId = newId();

  await c.env.DB.prepare(
    `INSERT INTO auth_pins (id, user_id, pin_hash, expires_at, used, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`
  ).bind(pinId, userId, pinHash, now + PIN_TTL_SECS, now).run();

  if (c.env.ENVIRONMENT !== 'development') {
    await sendSMSPIN(phone, pin, c.env.TWILIO_ACCOUNT_SID, c.env.TWILIO_AUTH_TOKEN, c.env.TWILIO_PHONE_NUMBER);
  } else {
    console.log(`[DEV] PIN for ${email}: ${pin}`);
  }

  return c.json({
    user_id: userId,
    status,
    message: status === 'approved'
      ? 'Account created. Verify your phone to log in.'
      : 'Application submitted. Verify your phone — account will be active after admin approval.',
  }, 201);
});

// POST /api/auth/login
// Body: { email }
// Sends PIN to registered phone
auth.post('/login', async (c) => {
  const { email } = await c.req.json<{ email: string }>();
  if (!email) return c.json({ error: 'email is required' }, 400);

  const user = await c.env.DB.prepare(
    'SELECT id, phone, status FROM users WHERE email = ?'
  ).bind(email).first<{ id: string; phone: string; status: string }>();

  if (!user) {
    // Don't reveal whether the email exists
    return c.json({ message: 'If that email is registered, a PIN has been sent.' });
  }

  if (user.status === 'rejected') {
    return c.json({ error: 'This account has been rejected.' }, 403);
  }
  if (user.status === 'suspended') {
    return c.json({ error: 'This account is suspended. Contact support.' }, 403);
  }

  const now = nowSecs();
  const pin = generatePIN();
  const pinHash = await hashPIN(pin);

  // Invalidate any unused pins for this user
  await c.env.DB.prepare(
    'UPDATE auth_pins SET used = 1 WHERE user_id = ? AND used = 0'
  ).bind(user.id).run();

  await c.env.DB.prepare(
    `INSERT INTO auth_pins (id, user_id, pin_hash, expires_at, used, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`
  ).bind(newId(), user.id, pinHash, now + PIN_TTL_SECS, now).run();

  if (c.env.ENVIRONMENT !== 'development') {
    await sendSMSPIN(user.phone, pin, c.env.TWILIO_ACCOUNT_SID, c.env.TWILIO_AUTH_TOKEN, c.env.TWILIO_PHONE_NUMBER);
  } else {
    console.log(`[DEV] PIN for ${email}: ${pin}`);
  }

  return c.json({ message: 'If that email is registered, a PIN has been sent.', user_id: user.id });
});

// POST /api/auth/verify
// Body: { user_id, pin }
// Works for both registration phone verification and login
auth.post('/verify', async (c) => {
  const { user_id, pin } = await c.req.json<{ user_id: string; pin: string }>();
  if (!user_id || !pin) return c.json({ error: 'user_id and pin are required' }, 400);

  const now = nowSecs();

  const pinRow = await c.env.DB.prepare(
    `SELECT id, pin_hash FROM auth_pins
     WHERE user_id = ? AND used = 0 AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`
  ).bind(user_id, now).first<{ id: string; pin_hash: string }>();

  if (!pinRow) {
    return c.json({ error: 'PIN expired or not found. Request a new one.' }, 401);
  }

  const valid = await verifyPIN(pin, pinRow.pin_hash);
  if (!valid) {
    return c.json({ error: 'Incorrect PIN' }, 401);
  }

  // Mark pin used and phone verified
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE auth_pins SET used = 1 WHERE id = ?').bind(pinRow.id),
    c.env.DB.prepare('UPDATE users SET phone_verified = 1 WHERE id = ?').bind(user_id),
  ]);

  const user = await c.env.DB.prepare(
    'SELECT id, email, role, status FROM users WHERE id = ?'
  ).bind(user_id).first<{ id: string; email: string; role: string; status: string }>();

  if (!user) return c.json({ error: 'User not found' }, 404);

  if (user.status === 'rejected') {
    return c.json({ error: 'Account rejected' }, 403);
  }
  if (user.status === 'suspended') {
    return c.json({ error: 'Account suspended' }, 403);
  }

  const token = await signSession(
    { sub: user.id, email: user.email, role: user.role as User['role'], status: user.status as User['status'] },
    c.env.JWT_SECRET
  );

  setCookie(c, 'session', token, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT !== 'development',
    sameSite: 'Lax',
    maxAge: COOKIE_TTL_SECS,
    path: '/',
  });

  return c.json({ user: { id: user.id, email: user.email, role: user.role, status: user.status } });
});

// GET /api/auth/me
auth.get('/me', requireAuth, async (c) => {
  const session = c.get('user');
  const user = await c.env.DB.prepare(
    'SELECT id, email, role, status, created_at, stripe_account_id FROM users WHERE id = ?'
  ).bind(session.sub).first();
  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json({ user });
});

// POST /api/auth/logout
auth.post('/logout', (c) => {
  deleteCookie(c, 'session', { path: '/' });
  return c.json({ message: 'Logged out' });
});

// POST /api/auth/resend-pin
// Body: { user_id }
auth.post('/resend-pin', async (c) => {
  const { user_id } = await c.req.json<{ user_id: string }>();
  if (!user_id) return c.json({ error: 'user_id is required' }, 400);

  const user = await c.env.DB.prepare(
    'SELECT id, phone, status FROM users WHERE id = ?'
  ).bind(user_id).first<{ id: string; phone: string; status: string }>();

  if (!user) return c.json({ message: 'If that account exists, a PIN has been sent.' });

  const now = nowSecs();
  const pin = generatePIN();
  const pinHash = await hashPIN(pin);

  await c.env.DB.prepare('UPDATE auth_pins SET used = 1 WHERE user_id = ? AND used = 0').bind(user_id).run();
  await c.env.DB.prepare(
    `INSERT INTO auth_pins (id, user_id, pin_hash, expires_at, used, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`
  ).bind(newId(), user_id, pinHash, now + PIN_TTL_SECS, now).run();

  if (c.env.ENVIRONMENT !== 'development') {
    await sendSMSPIN(user.phone, pin, c.env.TWILIO_ACCOUNT_SID, c.env.TWILIO_AUTH_TOKEN, c.env.TWILIO_PHONE_NUMBER);
  } else {
    console.log(`[DEV] Resent PIN: ${pin}`);
  }

  return c.json({ message: 'If that account exists, a PIN has been sent.' });
});

export default auth;
