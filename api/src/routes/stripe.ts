import { Hono } from 'hono';
import { requireAuth, requireStatus, requireRole } from '../middleware/auth';
import { createExpressAccount, createAccountLink } from '../lib/stripe';
import type { Env } from '../types';

const stripeRoutes = new Hono<{ Bindings: Env }>();

// POST /api/stripe/connect/onboard
// Creates a Stripe Express account for the seller (if not already created)
// and returns an account link URL to redirect them to Stripe's hosted onboarding.
stripeRoutes.post('/connect/onboard', requireAuth, requireStatus('approved'), requireRole('seller', 'both'), async (c) => {
  const session = c.get('user');

  const user = await c.env.DB.prepare(
    'SELECT id, email, stripe_account_id FROM users WHERE id = ?'
  ).bind(session.sub).first<{ id: string; email: string; stripe_account_id: string | null }>();

  if (!user) return c.json({ error: 'User not found' }, 404);

  let accountId = user.stripe_account_id;

  if (!accountId) {
    const account = await createExpressAccount(user.email, c.env.STRIPE_SECRET_KEY);
    accountId = account.id;
    await c.env.DB.prepare(
      'UPDATE users SET stripe_account_id = ? WHERE id = ?'
    ).bind(accountId, user.id).run();
  }

  const baseUrl = c.env.FRONTEND_URL;
  const link = await createAccountLink(
    accountId,
    `${baseUrl}/stripe/connect/refresh`,
    `${baseUrl}/stripe/connect/return`,
    c.env.STRIPE_SECRET_KEY
  );

  return c.json({ onboarding_url: link.url });
});

// GET /api/stripe/connect/status — check seller's payout capability
stripeRoutes.get('/connect/status', requireAuth, requireStatus('approved'), async (c) => {
  const session = c.get('user');

  const user = await c.env.DB.prepare(
    'SELECT stripe_account_id FROM users WHERE id = ?'
  ).bind(session.sub).first<{ stripe_account_id: string | null }>();

  if (!user?.stripe_account_id) {
    return c.json({ connected: false, charges_enabled: false, payouts_enabled: false });
  }

  const res = await fetch(`https://api.stripe.com/v1/accounts/${user.stripe_account_id}`, {
    headers: { Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}` },
  });

  const account = await res.json() as {
    charges_enabled: boolean;
    payouts_enabled: boolean;
    requirements?: { currently_due: string[] };
  };

  return c.json({
    connected: true,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    requirements: account.requirements?.currently_due ?? [],
  });
});

export default stripeRoutes;
