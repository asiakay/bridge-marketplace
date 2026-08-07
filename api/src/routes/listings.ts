import { Hono } from 'hono';
import { requireAuth, requireStatus, requireRole } from '../middleware/auth';
import { checkShippability, ALL_CATEGORIES } from '../lib/shippability';
import { newId, nowSecs } from '../lib/uuid';
import type { Env, ListingCondition, FulfillmentType } from '../types';

const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGES_PER_LISTING = 8;

const listings = new Hono<{ Bindings: Env }>();

// ── Public routes ─────────────────────────────────────────────────────────────

// GET /api/listings — browse active listings
listings.get('/', async (c) => {
  const { q, condition, category, fulfillment_type, min_price, max_price, limit, offset } =
    c.req.query();

  let query = `
    SELECT l.id, l.title, l.description, l.price_cents, l.condition, l.category,
           l.fulfillment_type, l.weight_oz, l.length_in, l.width_in, l.height_in,
           l.created_at, l.seller_id,
           (SELECT r2_key FROM listing_images
            WHERE listing_id = l.id AND moderation_status = 'approved'
            ORDER BY sort_order ASC LIMIT 1) AS cover_image_key
    FROM listings l
    WHERE l.status = 'active'
  `;
  const params: (string | number)[] = [];

  if (q) {
    query += ' AND (l.title LIKE ? OR l.description LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (condition) { query += ' AND l.condition = ?'; params.push(condition); }
  if (category) { query += ' AND l.category = ?'; params.push(category); }
  if (fulfillment_type) { query += ' AND l.fulfillment_type = ?'; params.push(fulfillment_type); }
  if (min_price) { query += ' AND l.price_cents >= ?'; params.push(Number(min_price)); }
  if (max_price) { query += ' AND l.price_cents <= ?'; params.push(Number(max_price)); }

  query += ' ORDER BY l.created_at DESC';
  query += ` LIMIT ${Math.min(Number(limit) || 20, 50)} OFFSET ${Number(offset) || 0}`;

  const stmt = c.env.DB.prepare(query);
  const result = await (params.length ? stmt.bind(...params) : stmt).all();
  return c.json({ listings: result.results });
});

// GET /api/listings/:id — single listing with images
listings.get('/:id', async (c) => {
  const { id } = c.req.param();

  const listing = await c.env.DB.prepare(
    `SELECT l.*, u.email AS seller_email
     FROM listings l JOIN users u ON u.id = l.seller_id
     WHERE l.id = ? AND l.status != 'removed'`
  ).bind(id).first();

  if (!listing) return c.json({ error: 'Listing not found' }, 404);

  const images = await c.env.DB.prepare(
    `SELECT id, r2_key, sort_order, moderation_status
     FROM listing_images WHERE listing_id = ? ORDER BY sort_order ASC`
  ).bind(id).all();

  return c.json({ listing, images: images.results });
});

// GET /api/images/:key — serve image from R2
listings.get('/images/:key{.+}', async (c) => {
  const key = c.req.param('key');
  const obj = await c.env.IMAGES.get(key);
  if (!obj) return c.json({ error: 'Image not found' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType ?? 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers });
});

// ── Seller routes ─────────────────────────────────────────────────────────────

// POST /api/listings — create listing
listings.post('/', requireAuth, requireStatus('approved'), requireRole('seller', 'both'), async (c) => {
  const session = c.get('user');
  const body = await c.req.json<{
    title: string;
    description: string;
    price_cents: number;
    condition: ListingCondition;
    category: string;
    weight_oz: number;
    length_in: number;
    width_in: number;
    height_in: number;
  }>();

  const { title, description, price_cents, condition, category, weight_oz, length_in, width_in, height_in } = body;

  if (!title || !description || !price_cents || !condition || !category ||
      !weight_oz || !length_in || !width_in || !height_in) {
    return c.json({ error: 'All fields are required including dimensions and weight' }, 400);
  }

  if (!['like_new', 'good', 'fair'].includes(condition)) {
    return c.json({ error: 'condition must be like_new, good, or fair' }, 400);
  }

  if (!ALL_CATEGORIES.includes(category)) {
    return c.json({ error: `Unknown category. Valid: ${ALL_CATEGORIES.join(', ')}` }, 400);
  }

  // Shippability check — determines fulfillment_type automatically
  const shippability = checkShippability(category, weight_oz, length_in, width_in, height_in);
  const fulfillment_type: FulfillmentType = shippability.shippable ? 'ship' : 'local_pickup';

  const id = newId();
  const now = nowSecs();

  await c.env.DB.prepare(
    `INSERT INTO listings
       (id, seller_id, title, description, price_cents, condition, category,
        weight_oz, length_in, width_in, height_in, fulfillment_type, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
  ).bind(id, session.sub, title, description, price_cents, condition, category,
    weight_oz, length_in, width_in, height_in, fulfillment_type, now).run();

  return c.json({
    id,
    fulfillment_type,
    shippability_note: shippability.shippable ? null : shippability.reason,
    message: 'Listing created. Upload images to publish.',
  }, 201);
});

// PUT /api/listings/:id — update listing (seller only, can't update sold/removed)
listings.put('/:id', requireAuth, requireStatus('approved'), async (c) => {
  const session = c.get('user');
  const { id } = c.req.param();

  const listing = await c.env.DB.prepare(
    'SELECT seller_id, status FROM listings WHERE id = ?'
  ).bind(id).first<{ seller_id: string; status: string }>();

  if (!listing) return c.json({ error: 'Listing not found' }, 404);
  if (listing.seller_id !== session.sub) return c.json({ error: 'Forbidden' }, 403);
  if (listing.status !== 'active') {
    return c.json({ error: `Cannot edit a ${listing.status} listing` }, 400);
  }

  const body = await c.req.json<Partial<{
    title: string;
    description: string;
    price_cents: number;
    condition: ListingCondition;
  }>>();

  const fields: string[] = [];
  const params: (string | number)[] = [];

  if (body.title) { fields.push('title = ?'); params.push(body.title); }
  if (body.description) { fields.push('description = ?'); params.push(body.description); }
  if (body.price_cents) { fields.push('price_cents = ?'); params.push(body.price_cents); }
  if (body.condition) {
    if (!['like_new', 'good', 'fair'].includes(body.condition)) {
      return c.json({ error: 'Invalid condition' }, 400);
    }
    fields.push('condition = ?'); params.push(body.condition);
  }

  if (!fields.length) return c.json({ error: 'No updatable fields provided' }, 400);

  params.push(id);
  await c.env.DB.prepare(
    `UPDATE listings SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  return c.json({ message: 'Listing updated' });
});

// DELETE /api/listings/:id — soft-remove listing
listings.delete('/:id', requireAuth, requireStatus('approved'), async (c) => {
  const session = c.get('user');
  const { id } = c.req.param();

  const listing = await c.env.DB.prepare(
    'SELECT seller_id, status FROM listings WHERE id = ?'
  ).bind(id).first<{ seller_id: string; status: string }>();

  if (!listing) return c.json({ error: 'Listing not found' }, 404);
  if (listing.seller_id !== session.sub) return c.json({ error: 'Forbidden' }, 403);
  if (listing.status === 'sold') {
    return c.json({ error: 'Cannot remove a sold listing with active orders' }, 400);
  }

  await c.env.DB.prepare(
    "UPDATE listings SET status = 'removed' WHERE id = ?"
  ).bind(id).run();

  return c.json({ message: 'Listing removed' });
});

// ── Image upload ──────────────────────────────────────────────────────────────

// POST /api/listings/:id/images — upload an image to R2
listings.post('/:id/images', requireAuth, requireStatus('approved'), async (c) => {
  const session = c.get('user');
  const { id: listingId } = c.req.param();

  const listing = await c.env.DB.prepare(
    'SELECT seller_id FROM listings WHERE id = ? AND status = \'active\''
  ).bind(listingId).first<{ seller_id: string }>();

  if (!listing) return c.json({ error: 'Listing not found or not active' }, 404);
  if (listing.seller_id !== session.sub) return c.json({ error: 'Forbidden' }, 403);

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM listing_images WHERE listing_id = ?'
  ).bind(listingId).first<{ cnt: number }>();
  if ((countRow?.cnt ?? 0) >= MAX_IMAGES_PER_LISTING) {
    return c.json({ error: `Maximum ${MAX_IMAGES_PER_LISTING} images per listing` }, 400);
  }

  const contentType = c.req.header('Content-Type') ?? '';
  if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
    return c.json({ error: 'Image must be JPEG, PNG, or WebP' }, 415);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength > IMAGE_MAX_BYTES) {
    return c.json({ error: 'Image exceeds 10 MB limit' }, 413);
  }

  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const imageId = newId();
  const r2Key = `listings/${listingId}/${imageId}.${ext}`;

  // Get current max sort_order
  const sortRow = await c.env.DB.prepare(
    'SELECT MAX(sort_order) AS max_sort FROM listing_images WHERE listing_id = ?'
  ).bind(listingId).first<{ max_sort: number | null }>();
  const sortOrder = (sortRow?.max_sort ?? -1) + 1;

  await c.env.IMAGES.put(r2Key, body, {
    httpMetadata: { contentType },
  });

  await c.env.DB.prepare(
    `INSERT INTO listing_images (id, listing_id, r2_key, sort_order, moderation_status, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`
  ).bind(imageId, listingId, r2Key, sortOrder, nowSecs()).run();

  return c.json({ id: imageId, r2_key: r2Key, sort_order: sortOrder }, 201);
});

// DELETE /api/listings/:id/images/:imageId
listings.delete('/:id/images/:imageId', requireAuth, requireStatus('approved'), async (c) => {
  const session = c.get('user');
  const { id: listingId, imageId } = c.req.param();

  const listing = await c.env.DB.prepare(
    'SELECT seller_id FROM listings WHERE id = ?'
  ).bind(listingId).first<{ seller_id: string }>();

  if (!listing) return c.json({ error: 'Listing not found' }, 404);
  if (listing.seller_id !== session.sub) return c.json({ error: 'Forbidden' }, 403);

  const image = await c.env.DB.prepare(
    'SELECT r2_key FROM listing_images WHERE id = ? AND listing_id = ?'
  ).bind(imageId, listingId).first<{ r2_key: string }>();

  if (!image) return c.json({ error: 'Image not found' }, 404);

  await c.env.IMAGES.delete(image.r2_key);
  await c.env.DB.prepare('DELETE FROM listing_images WHERE id = ?').bind(imageId).run();

  return c.json({ message: 'Image deleted' });
});

// GET /api/listings/seller/mine — seller's own listings
listings.get('/seller/mine', requireAuth, requireStatus('approved'), async (c) => {
  const session = c.get('user');
  const result = await c.env.DB.prepare(
    `SELECT l.*,
       (SELECT COUNT(*) FROM listing_images WHERE listing_id = l.id AND moderation_status = 'approved') AS image_count
     FROM listings l
     WHERE l.seller_id = ?
     ORDER BY l.created_at DESC`
  ).bind(session.sub).all();
  return c.json({ listings: result.results });
});

export default listings;
