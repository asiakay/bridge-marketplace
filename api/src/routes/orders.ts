import { Hono } from 'hono';
import { requireAuth, requireStatus } from '../middleware/auth';
import { createPaymentIntent } from '../lib/stripe';
import { newId, nowSecs } from '../lib/uuid';
import type { Env } from '../types';

const orders = new Hono<{ Bindings: Env }>();

// POST /api/orders
// Initiates a purchase: validates address, creates order, returns Stripe PaymentIntent client_secret.
// Flow: buyer calls this after getting rates → uses client_secret on frontend to complete payment.
// Label is purchased in the Stripe webhook handler after payment succeeds.
orders.post('/', requireAuth, requireStatus('approved'), async (c) => {
  const session = c.get('user');
  const body = await c.req.json<{
    listing_id: string;
    address_id: string;
    shippo_rate_id: string;
    shipping_cost_cents: number;
    carrier: string;
    insured?: boolean;
    insurance_cost_cents?: number;
  }>();

  const {
    listing_id, address_id, shippo_rate_id, shipping_cost_cents,
    carrier, insured = false, insurance_cost_cents = 0,
  } = body;

  if (!listing_id || !address_id || !shippo_rate_id || !shipping_cost_cents || !carrier) {
    return c.json({ error: 'listing_id, address_id, shippo_rate_id, shipping_cost_cents, and carrier are required' }, 400);
  }

  const [listing, address] = await Promise.all([
    c.env.DB.prepare(
      `SELECT l.id, l.price_cents, l.status, l.fulfillment_type, l.seller_id,
              u.stripe_account_id AS seller_stripe_account
       FROM listings l JOIN users u ON u.id = l.seller_id
       WHERE l.id = ?`
    ).bind(listing_id).first<{
      id: string; price_cents: number; status: string;
      fulfillment_type: string; seller_id: string; seller_stripe_account: string | null;
    }>(),
    c.env.DB.prepare(
      'SELECT id, user_id FROM addresses WHERE id = ?'
    ).bind(address_id).first<{ id: string; user_id: string }>(),
  ]);

  if (!listing) return c.json({ error: 'Listing not found' }, 404);
  if (listing.status !== 'active') return c.json({ error: 'Listing is no longer available' }, 409);
  if (listing.seller_id === session.sub) return c.json({ error: 'Cannot purchase your own listing' }, 400);
  if (listing.fulfillment_type !== 'ship') {
    return c.json({ error: 'This listing is local pickup only' }, 400);
  }
  if (!listing.seller_stripe_account) {
    return c.json({ error: 'Seller has not completed payment setup' }, 422);
  }
  if (!address || address.user_id !== session.sub) {
    return c.json({ error: 'Address not found' }, 404);
  }

  // Total = item + shipping + insurance (opt-in)
  const totalCents = listing.price_cents + shipping_cost_cents + insurance_cost_cents;
  const platformFeePercent = Number(c.env.STRIPE_PLATFORM_FEE_PERCENT) || 5;

  const orderId = newId();

  const paymentIntent = await createPaymentIntent({
    amountCents: totalCents,
    currency: 'usd',
    connectedAccountId: listing.seller_stripe_account,
    platformFeePercent,
    metadata: {
      order_id: orderId,
      listing_id,
      buyer_id: session.sub,
      seller_id: listing.seller_id,
    },
    description: `Bridge Marketplace order ${orderId}`,
  }, c.env.STRIPE_SECRET_KEY);

  const now = nowSecs();

  await c.env.DB.prepare(
    `INSERT INTO orders
       (id, listing_id, buyer_id, seller_id, buyer_address_id, status,
        amount_cents, shipping_cost_cents, shipping_surcharge_cents,
        carrier, insured, insurance_cost_cents,
        stripe_payment_intent_id, shippo_rate_id, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending_payment', ?, ?, 0, ?, ?, ?, ?, ?, ?)`
  ).bind(
    orderId, listing_id, session.sub, listing.seller_id, address_id,
    listing.price_cents, shipping_cost_cents, carrier,
    insured ? 1 : 0, insurance_cost_cents,
    paymentIntent.id, shippo_rate_id, now
  ).run();

  // Mark listing as sold to prevent double-purchase (will revert if payment fails)
  await c.env.DB.prepare(
    "UPDATE listings SET status = 'sold' WHERE id = ?"
  ).bind(listing_id).run();

  return c.json({
    order_id: orderId,
    client_secret: paymentIntent.client_secret,
    amount_cents: totalCents,
    breakdown: {
      item: listing.price_cents,
      shipping: shipping_cost_cents,
      insurance: insurance_cost_cents,
      platform_fee_note: `${platformFeePercent}% platform fee included`,
    },
  }, 201);
});

// GET /api/orders — list orders for current user (buyer or seller view)
orders.get('/', requireAuth, requireStatus('approved'), async (c) => {
  const session = c.get('user');
  const { as } = c.req.query(); // 'buyer' | 'seller'

  let query: string;
  if (as === 'seller') {
    query = `
      SELECT o.*, l.title AS listing_title,
             u.email AS buyer_email
      FROM orders o
      JOIN listings l ON l.id = o.listing_id
      JOIN users u ON u.id = o.buyer_id
      WHERE o.seller_id = ?
      ORDER BY o.created_at DESC
    `;
  } else {
    query = `
      SELECT o.*, l.title AS listing_title,
             u.email AS seller_email
      FROM orders o
      JOIN listings l ON l.id = o.listing_id
      JOIN users u ON u.id = o.seller_id
      WHERE o.buyer_id = ?
      ORDER BY o.created_at DESC
    `;
  }

  const result = await c.env.DB.prepare(query).bind(session.sub).all();
  return c.json({ orders: result.results });
});

// GET /api/orders/:id — order detail
orders.get('/:id', requireAuth, requireStatus('approved'), async (c) => {
  const session = c.get('user');
  const { id } = c.req.param();

  const order = await c.env.DB.prepare(
    `SELECT o.*,
            l.title AS listing_title, l.description AS listing_description,
            a.name AS ship_to_name, a.line1, a.line2, a.city, a.state, a.zip
     FROM orders o
     JOIN listings l ON l.id = o.listing_id
     JOIN addresses a ON a.id = o.buyer_address_id
     WHERE o.id = ? AND (o.buyer_id = ? OR o.seller_id = ?)`
  ).bind(id, session.sub, session.sub).first();

  if (!order) return c.json({ error: 'Order not found' }, 404);
  return c.json({ order });
});

// POST /api/orders/:id/cancel
// Pre-shipment cancel: voids Shippo label (within carrier refund window) + refunds buyer.
// Once status is 'in_transit', cancellation is not allowed here — goes to dispute flow.
orders.post('/:id/cancel', requireAuth, requireStatus('approved'), async (c) => {
  const session = c.get('user');
  const { id } = c.req.param();

  const order = await c.env.DB.prepare(
    `SELECT id, buyer_id, seller_id, status, stripe_payment_intent_id,
            shippo_transaction_id, amount_cents, shipping_cost_cents, insurance_cost_cents
     FROM orders WHERE id = ?`
  ).bind(id).first<{
    id: string; buyer_id: string; seller_id: string; status: string;
    stripe_payment_intent_id: string | null; shippo_transaction_id: string | null;
    amount_cents: number; shipping_cost_cents: number; insurance_cost_cents: number;
  }>();

  if (!order) return c.json({ error: 'Order not found' }, 404);

  const isBuyer = order.buyer_id === session.sub;
  const isSeller = order.seller_id === session.sub;
  if (!isBuyer && !isSeller) return c.json({ error: 'Forbidden' }, 403);

  if (!['pending_payment', 'paid', 'label_purchased'].includes(order.status)) {
    return c.json({
      error: `Cannot cancel an order with status "${order.status}". Use the dispute flow for in-transit orders.`,
    }, 400);
  }

  const now = nowSecs();
  const results: string[] = [];

  // Void Shippo label if one was purchased
  if (order.shippo_transaction_id && order.status === 'label_purchased') {
    try {
      const { refundLabel } = await import('../lib/shippo');
      await refundLabel(order.shippo_transaction_id, c.env.SHIPPO_API_KEY);
      results.push('Shipping label voided');
    } catch (e) {
      // Label refund can fail if outside carrier window — log but continue
      console.error('Label refund failed:', e);
      results.push('Label refund failed — may need manual processing with carrier');
    }
  }

  // Refund Stripe payment if it was captured
  if (order.stripe_payment_intent_id && ['paid', 'label_purchased'].includes(order.status)) {
    try {
      const { refundPaymentIntent } = await import('../lib/stripe');
      await refundPaymentIntent(order.stripe_payment_intent_id, undefined, c.env.STRIPE_SECRET_KEY);
      results.push('Payment refunded');
    } catch (e) {
      console.error('Stripe refund failed:', e);
      results.push('Refund failed — requires manual processing');
    }
  }

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ?").bind(now, id),
    c.env.DB.prepare("UPDATE listings SET status = 'active' WHERE id = (SELECT listing_id FROM orders WHERE id = ?)").bind(id),
  ]);

  return c.json({ message: 'Order cancelled', details: results });
});

// POST /api/orders/:id/dispute
// Flags an order for dispute (minimal MVP: flag + manual resolution)
orders.post('/:id/dispute', requireAuth, requireStatus('approved'), async (c) => {
  const session = c.get('user');
  const { id } = c.req.param();
  const { reason } = await c.req.json<{ reason: string }>();

  if (!reason) return c.json({ error: 'reason is required' }, 400);

  const order = await c.env.DB.prepare(
    'SELECT buyer_id, seller_id, status FROM orders WHERE id = ?'
  ).bind(id).first<{ buyer_id: string; seller_id: string; status: string }>();

  if (!order) return c.json({ error: 'Order not found' }, 404);
  if (order.buyer_id !== session.sub) return c.json({ error: 'Only the buyer can open a dispute' }, 403);

  if (!['paid', 'label_purchased', 'in_transit', 'delivered'].includes(order.status)) {
    return c.json({ error: `Cannot dispute an order with status "${order.status}"` }, 400);
  }

  await c.env.DB.prepare(
    "UPDATE orders SET status = 'disputed' WHERE id = ?"
  ).bind(id).run();

  console.log(`[DISPUTE] Order ${id} disputed by buyer ${session.sub}. Reason: ${reason}`);

  return c.json({ message: 'Dispute opened. Our team will reach out within 2 business days.' });
});

export default orders;
