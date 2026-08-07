import { Hono } from 'hono';
import { requireAuth, requireStatus } from '../middleware/auth';
import { validateAddress, getRates } from '../lib/shippo';
import { newId, nowSecs } from '../lib/uuid';
import type { Env } from '../types';

const shipping = new Hono<{ Bindings: Env }>();

// POST /api/shipping/validate-address
// Validates a buyer shipping address via Shippo before rate quote.
// On success, saves the validated address to D1 and returns the address_id.
shipping.post('/validate-address', requireAuth, requireStatus('approved'), async (c) => {
  const session = c.get('user');
  const body = await c.req.json<{
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zip: string;
    country?: string;
    phone?: string;
  }>();

  const { name, line1, line2, city, state, zip, country = 'US', phone } = body;
  if (!name || !line1 || !city || !state || !zip) {
    return c.json({ error: 'name, line1, city, state, zip are required' }, 400);
  }

  const shippoResult = await validateAddress(
    { name, street1: line1, street2: line2, city, state, zip, country, phone },
    c.env.SHIPPO_API_KEY
  );

  const isValid = shippoResult.validation_results?.is_valid ?? false;
  const messages = shippoResult.validation_results?.messages ?? [];

  // Save to addresses table regardless — let buyer decide to proceed
  const addressId = newId();
  await c.env.DB.prepare(
    `INSERT INTO addresses (id, user_id, type, name, line1, line2, city, state, zip, country, phone, validated, shippo_address_id, created_at)
     VALUES (?, ?, 'shipping', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    addressId, session.sub, name, line1, line2 ?? null, city, state, zip,
    country, phone ?? null, isValid ? 1 : 0, shippoResult.object_id, nowSecs()
  ).run();

  return c.json({
    address_id: addressId,
    valid: isValid,
    messages,
    shippo_address_id: shippoResult.object_id,
  });
});

// POST /api/shipping/rates
// Returns real-time carrier rate options for a listing + validated address.
// Buyer is shown the actual carrier rate — no estimate buffer (per SPEC.md).
// Insurance is opt-in (open decision 3): pass insured=true to include it.
shipping.post('/rates', requireAuth, requireStatus('approved'), async (c) => {
  const body = await c.req.json<{
    listing_id: string;
    address_id: string;
    insured?: boolean;
  }>();

  const { listing_id, address_id, insured = false } = body;
  if (!listing_id || !address_id) {
    return c.json({ error: 'listing_id and address_id are required' }, 400);
  }

  const [listingRow, addressRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT l.weight_oz, l.length_in, l.width_in, l.height_in, l.price_cents,
              l.fulfillment_type, l.title,
              u.email AS seller_email
       FROM listings l JOIN users u ON u.id = l.seller_id
       WHERE l.id = ? AND l.status = 'active'`
    ).bind(listing_id).first<{
      weight_oz: number; length_in: number; width_in: number; height_in: number;
      price_cents: number; fulfillment_type: string; title: string; seller_email: string;
    }>(),
    c.env.DB.prepare(
      'SELECT name, line1, line2, city, state, zip, country, phone FROM addresses WHERE id = ?'
    ).bind(address_id).first<{
      name: string; line1: string; line2: string | null; city: string;
      state: string; zip: string; country: string; phone: string | null;
    }>(),
  ]);

  if (!listingRow) return c.json({ error: 'Listing not found or not active' }, 404);
  if (!addressRow) return c.json({ error: 'Address not found' }, 404);

  if (listingRow.fulfillment_type !== 'ship') {
    return c.json({ error: 'This listing is local pickup only — no shipping rates available' }, 400);
  }

  const shipment = await getRates({
    addressFrom: {
      name: c.env.PLATFORM_RETURN_ADDRESS_NAME,
      street1: c.env.PLATFORM_RETURN_ADDRESS_STREET1,
      city: c.env.PLATFORM_RETURN_ADDRESS_CITY,
      state: c.env.PLATFORM_RETURN_ADDRESS_STATE,
      zip: c.env.PLATFORM_RETURN_ADDRESS_ZIP,
      country: c.env.PLATFORM_RETURN_ADDRESS_COUNTRY,
      phone: c.env.PLATFORM_RETURN_ADDRESS_PHONE,
      email: c.env.PLATFORM_RETURN_ADDRESS_EMAIL,
    },
    addressTo: {
      name: addressRow.name,
      street1: addressRow.line1,
      street2: addressRow.line2 ?? undefined,
      city: addressRow.city,
      state: addressRow.state,
      zip: addressRow.zip,
      country: addressRow.country,
      phone: addressRow.phone ?? undefined,
    },
    parcel: {
      weight: listingRow.weight_oz,
      length: listingRow.length_in,
      width: listingRow.width_in,
      height: listingRow.height_in,
    },
    insurance: insured,
    insuredValue: insured ? (listingRow.price_cents / 100).toFixed(2) : undefined,
  }, c.env.SHIPPO_API_KEY);

  const rates = shipment.rates.map(r => ({
    rate_id: r.object_id,
    provider: r.provider,
    service: r.servicelevel.name,
    service_token: r.servicelevel.token,
    amount_cents: Math.round(parseFloat(r.amount) * 100),
    currency: r.currency,
    estimated_days: r.estimated_days,
  }));

  return c.json({
    shipment_id: shipment.object_id,
    rates,
    insured,
    // Per open decision 2: buyer is charged actual carrier rate.
    // If carrier charges more post-label, a surcharge will be passed to buyer.
    surcharge_policy: 'Actual carrier charges apply. Any discrepancy will be billed separately.',
  });
});

export default shipping;
