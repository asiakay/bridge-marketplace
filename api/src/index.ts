import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { transferToSeller } from './lib/stripe';
import { nowSecs } from './lib/uuid';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import listingsRoutes from './routes/listings';
import ordersRoutes from './routes/orders';
import shippingRoutes from './routes/shipping';
import stripeRoutes from './routes/stripe';
import webhooksRoutes from './routes/webhooks';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());

app.use('/api/*', async (c, next) => {
  return cors({
    origin: c.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })(c, next);
});

app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/listings', listingsRoutes);
app.route('/api/orders', ordersRoutes);
app.route('/api/shipping', shippingRoutes);
app.route('/api/stripe', stripeRoutes);
app.route('/api/webhooks', webhooksRoutes);

app.get('/api/health', (c) => c.json({ ok: true, env: c.env.ENVIRONMENT }));

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error('[Worker]', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// Cron handler: runs hourly to release payouts for delivered orders
// past the dispute window (DISPUTE_WINDOW_HOURS, default 48h)
async function releaseEligiblePayouts(env: Env): Promise<void> {
  const now = nowSecs();
  const windowSecs = Number(env.DISPUTE_WINDOW_HOURS || '48') * 3600;
  const cutoff = now - windowSecs;

  const eligible = await env.DB.prepare(
    `SELECT o.id, o.amount_cents, o.shipping_cost_cents, o.seller_id,
            u.stripe_account_id
     FROM orders o
     JOIN users u ON u.id = o.seller_id
     WHERE o.status = 'delivered'
       AND o.payout_released_at IS NULL
       AND o.delivered_at IS NOT NULL
       AND o.delivered_at <= ?
       AND u.stripe_account_id IS NOT NULL`
  ).bind(cutoff).all<{
    id: string; amount_cents: number; shipping_cost_cents: number;
    seller_id: string; stripe_account_id: string;
  }>();

  for (const order of eligible.results) {
    try {
      // Platform fee is deducted via application_fee_amount at PaymentIntent creation.
      // The transfer here releases the net seller amount.
      const sellerAmount = order.amount_cents; // already net of fee from Stripe Connect split
      const transfer = await transferToSeller({
        amountCents: sellerAmount,
        connectedAccountId: order.stripe_account_id,
        orderId: order.id,
      }, env.STRIPE_SECRET_KEY);

      await env.DB.prepare(
        "UPDATE orders SET payout_released_at = ?, stripe_transfer_id = ? WHERE id = ?"
      ).bind(now, transfer.id, order.id).run();

      console.log(`[Cron] Payout released for order ${order.id}: $${sellerAmount / 100} → ${order.stripe_account_id}`);
    } catch (err) {
      console.error(`[Cron] Payout failed for order ${order.id}:`, err);
    }
  }
}

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(releaseEligiblePayouts(env));
  },
};
