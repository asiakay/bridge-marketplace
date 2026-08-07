-- Bridge Marketplace initial schema
-- Follows SPEC.md sections 1-3 exactly, with auth support tables appended

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT NOT NULL,
  phone_verified INTEGER NOT NULL DEFAULT 0,
  role          TEXT NOT NULL CHECK (role IN ('buyer', 'seller', 'both')),
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  invited_by    TEXT REFERENCES users(id),
  stripe_account_id TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invite_codes (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  created_by  TEXT NOT NULL REFERENCES users(id),
  used_by     TEXT REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  used_at     INTEGER
);

-- Temporary PINs for email/SMS auth (matching Front Porch Economics pattern)
CREATE TABLE IF NOT EXISTS auth_pins (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  pin_hash    TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id              TEXT PRIMARY KEY,
  seller_id       TEXT NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  price_cents     INTEGER NOT NULL,
  condition       TEXT NOT NULL CHECK (condition IN ('like_new', 'good', 'fair')),
  category        TEXT NOT NULL,
  weight_oz       INTEGER NOT NULL,
  length_in       INTEGER NOT NULL,
  width_in        INTEGER NOT NULL,
  height_in       INTEGER NOT NULL,
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('ship', 'local_pickup')),
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'sold', 'removed')),
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS listing_images (
  id                TEXT PRIMARY KEY,
  listing_id        TEXT NOT NULL REFERENCES listings(id),
  r2_key            TEXT NOT NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  moderation_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (moderation_status IN ('pending', 'approved', 'flagged')),
  created_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS addresses (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users(id),
  type      TEXT NOT NULL CHECK (type IN ('shipping', 'return')),
  name      TEXT NOT NULL,
  line1     TEXT NOT NULL,
  line2     TEXT,
  city      TEXT NOT NULL,
  state     TEXT NOT NULL,
  zip       TEXT NOT NULL,
  country   TEXT NOT NULL DEFAULT 'US',
  phone     TEXT,
  validated INTEGER NOT NULL DEFAULT 0,
  shippo_address_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id                      TEXT PRIMARY KEY,
  listing_id              TEXT NOT NULL REFERENCES listings(id),
  buyer_id                TEXT NOT NULL REFERENCES users(id),
  seller_id               TEXT NOT NULL REFERENCES users(id),
  buyer_address_id        TEXT NOT NULL REFERENCES addresses(id),
  status                  TEXT NOT NULL DEFAULT 'pending_payment'
                            CHECK (status IN (
                              'pending_payment', 'paid', 'label_purchased',
                              'in_transit', 'delivered', 'disputed',
                              'cancelled', 'refunded'
                            )),
  amount_cents            INTEGER NOT NULL,
  shipping_cost_cents     INTEGER NOT NULL,
  shipping_surcharge_cents INTEGER NOT NULL DEFAULT 0,
  carrier                 TEXT,
  tracking_number         TEXT,
  label_url               TEXT,
  insured                 INTEGER NOT NULL DEFAULT 0,
  insurance_cost_cents    INTEGER NOT NULL DEFAULT 0,
  stripe_payment_intent_id TEXT,
  stripe_transfer_id      TEXT,
  shippo_transaction_id   TEXT,
  shippo_rate_id          TEXT,
  payout_released_at      INTEGER,
  delivered_at            INTEGER,
  cancelled_at            INTEGER,
  created_at              INTEGER NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_listing ON orders(listing_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_listing_images_listing ON listing_images(listing_id);
CREATE INDEX IF NOT EXISTS idx_auth_pins_user ON auth_pins(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);
