import { Hono } from 'hono';
import { verifyWebhookSignature as verifyStripe } from '../lib/stripe';
import { verifyWebhookSignature as verifyShippo, purchaseLabel } from '../lib/shippo';
import { nowSecs } from '../lib/uuid';
import type { Env } from '../types';

const webhooks = new Hono<{ Bindings: Env }>();

// ── Stripe webhook ─────────────────────────────────────────────────────────────
// POST /api/webhooks/stripe
// Handles: payment_intent.succeeded → purchase Shippo label
//          payment_intent.payment_failed → revert listing to active
//          account.updated → log Stripe Connect account state changes
webhooks.post('/stripe', async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header('stripe-signature') ?? '';

  const valid = await verifyStripe(rawBody, sig, c.env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return c.json({ error: 'Invalid signature' }, 400);

  const event = JSON.parse(rawBody) as { type: string; data: { object: Record<string, unknown> } };

  if (event.type === 'payment_intent.succeeded') {
    await handlePaymentSuccess(event.data.object, c.env);
  } else if (event.type === 'payment_intent.payment_failed') {
    await handlePaymentFailed(event.data.object, c.env);
  }
  // account.updated is logged by Stripe — no action needed for MVP

  return c.json({ received: true });
});

async function handlePaymentSuccess(pi: Record<string, unknown>, env: Env): Promise<void> {
  const paymentIntentId = pi.id as string;
  const metadata = pi.metadata as Record<string, string> | undefined;
  const orderId = metadata?.order_id;

  if (!orderId) {
    console.error('[Stripe] payment_intent.succeeded missing order_id metadata', paymentIntentId);
    return;
  }

  const order = await env.DB.prepare(
    `SELECT id, listing_id, seller_id, shipping_cost_cents, insured,
            shippo_rate_id, buyer_address_id, amount_cents
     FROM orders WHERE id = ? AND status = 'pending_payment'`
  ).bind(orderId).first<{
    id: string; listing_id: string; seller_id: string;
    shipping_cost_cents: number; insured: number;
    shippo_rate_id: string | null; buyer_address_id: string;
    amount_cents: number;
  }>();

  if (!order) {
    console.log(`[Stripe] Order ${orderId} not found or not in pending_payment — skipping label purchase`);
    return;
  }

  // Mark paid first so any retry doesn't double-purchase
  await env.DB.prepare(
    "UPDATE orders SET status = 'paid' WHERE id = ?"
  ).bind(orderId).run();

  if (!order.shippo_rate_id) {
    console.error(`[Stripe] Order ${orderId} has no shippo_rate_id — cannot purchase label`);
    return;
  }

  try {
    const transaction = await purchaseLabel(order.shippo_rate_id, false, env.SHIPPO_API_KEY);

    if (transaction.status === 'SUCCESS') {
      await env.DB.prepare(
        `UPDATE orders SET
           status = 'label_purchased',
           shippo_transaction_id = ?,
           tracking_number = ?,
           label_url = ?
         WHERE id = ?`
      ).bind(
        transaction.object_id,
        transaction.tracking_number,
        transaction.label_url,
        orderId
      ).run();

      console.log(`[Stripe] Label purchased for order ${orderId}, tracking: ${transaction.tracking_number}`);
    } else {
      // Label purchase failed — order stays 'paid', admin must intervene
      console.error(`[Stripe] Label purchase failed for order ${orderId}:`, transaction.messages);
      await env.DB.prepare(
        "UPDATE orders SET status = 'paid' WHERE id = ?"
      ).bind(orderId).run();
    }
  } catch (err) {
    console.error(`[Stripe] Label purchase exception for order ${orderId}:`, err);
  }
}

async function handlePaymentFailed(pi: Record<string, unknown>, env: Env): Promise<void> {
  const metadata = pi.metadata as Record<string, string> | undefined;
  const orderId = metadata?.order_id;
  if (!orderId) return;

  // Revert listing back to active so buyer can retry or another buyer can purchase
  const order = await env.DB.prepare(
    'SELECT listing_id FROM orders WHERE id = ?'
  ).bind(orderId).first<{ listing_id: string }>();

  if (!order) return;

  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").bind(orderId),
    env.DB.prepare("UPDATE listings SET status = 'active' WHERE id = ?").bind(order.listing_id),
  ]);

  console.log(`[Stripe] Payment failed for order ${orderId} — listing restored to active`);
}

// ── Shippo tracking webhook ────────────────────────────────────────────────────
// POST /api/webhooks/shippo
// Handles tracking updates: TRANSIT → in_transit, DELIVERED → delivered (triggers payout window)
webhooks.post('/shippo', async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header('x-shippo-signature') ?? '';

  // Shippo sends HMAC-SHA256 hex in x-shippo-signature
  const valid = await verifyShippo(rawBody, sig, c.env.SHIPPO_WEBHOOK_SECRET);
  if (!valid) return c.json({ error: 'Invalid signature' }, 400);

  const event = JSON.parse(rawBody) as {
    event: string;
    data: {
      tracking_number?: string;
      tracking_status?: { status: string };
      transaction?: string;
    };
  };

  const trackingNumber = event.data.tracking_number;
  const shippoStatus = event.data.tracking_status?.status;

  if (!trackingNumber || !shippoStatus) {
    return c.json({ received: true });
  }

  const order = await c.env.DB.prepare(
    'SELECT id, status FROM orders WHERE tracking_number = ?'
  ).bind(trackingNumber).first<{ id: string; status: string }>();

  if (!order) {
    console.log(`[Shippo] No order found for tracking ${trackingNumber}`);
    return c.json({ received: true });
  }

  const now = nowSecs();

  if (shippoStatus === 'TRANSIT' && order.status === 'label_purchased') {
    await c.env.DB.prepare(
      "UPDATE orders SET status = 'in_transit' WHERE id = ?"
    ).bind(order.id).run();
    console.log(`[Shippo] Order ${order.id} → in_transit`);

  } else if (shippoStatus === 'DELIVERED' && order.status === 'in_transit') {
    await c.env.DB.prepare(
      "UPDATE orders SET status = 'delivered', delivered_at = ? WHERE id = ?"
    ).bind(now, order.id).run();
    console.log(`[Shippo] Order ${order.id} → delivered. Dispute window starts now. Payout at ${now + Number(c.env.DISPUTE_WINDOW_HOURS) * 3600}`);

  } else if (shippoStatus === 'RETURNED') {
    console.log(`[Shippo] Order ${order.id} returned to sender — review needed`);
  }

  return c.json({ received: true });
});

export default webhooks;
