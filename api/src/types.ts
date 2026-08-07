export type Env = {
  // D1 database
  DB: D1Database;
  // R2 bucket for listing images
  IMAGES: R2Bucket;

  // Auth
  JWT_SECRET: string;

  // Twilio (SMS PIN auth)
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;

  // Shippo
  SHIPPO_API_KEY: string;
  SHIPPO_WEBHOOK_SECRET: string;

  // Stripe Connect
  STRIPE_SECRET_KEY: string;
  STRIPE_CONNECT_CLIENT_ID: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PLATFORM_FEE_PERCENT: string;

  // Runtime config
  ENVIRONMENT: string;
  FRONTEND_URL: string;
  DISPUTE_WINDOW_HOURS: string;

  // Platform return address (used on Shippo labels)
  PLATFORM_RETURN_ADDRESS_NAME: string;
  PLATFORM_RETURN_ADDRESS_STREET1: string;
  PLATFORM_RETURN_ADDRESS_CITY: string;
  PLATFORM_RETURN_ADDRESS_STATE: string;
  PLATFORM_RETURN_ADDRESS_ZIP: string;
  PLATFORM_RETURN_ADDRESS_COUNTRY: string;
  PLATFORM_RETURN_ADDRESS_PHONE: string;
  PLATFORM_RETURN_ADDRESS_EMAIL: string;
};

export type UserRole = 'buyer' | 'seller' | 'both';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type ListingCondition = 'like_new' | 'good' | 'fair';
export type FulfillmentType = 'ship' | 'local_pickup';
export type ListingStatus = 'active' | 'sold' | 'removed';
export type ModerationStatus = 'pending' | 'approved' | 'flagged';
export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'label_purchased'
  | 'in_transit'
  | 'delivered'
  | 'disputed'
  | 'cancelled'
  | 'refunded';

export type User = {
  id: string;
  email: string;
  phone: string;
  phone_verified: number;
  role: UserRole;
  status: UserStatus;
  invited_by: string | null;
  stripe_account_id: string | null;
  created_at: number;
};

export type Listing = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price_cents: number;
  condition: ListingCondition;
  category: string;
  weight_oz: number;
  length_in: number;
  width_in: number;
  height_in: number;
  fulfillment_type: FulfillmentType;
  status: ListingStatus;
  created_at: number;
};

export type ListingImage = {
  id: string;
  listing_id: string;
  r2_key: string;
  sort_order: number;
  moderation_status: ModerationStatus;
  created_at: number;
};

export type Order = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  buyer_address_id: string;
  status: OrderStatus;
  amount_cents: number;
  shipping_cost_cents: number;
  shipping_surcharge_cents: number;
  carrier: string | null;
  tracking_number: string | null;
  label_url: string | null;
  insured: number;
  insurance_cost_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  shippo_transaction_id: string | null;
  shippo_rate_id: string | null;
  payout_released_at: number | null;
  delivered_at: number | null;
  cancelled_at: number | null;
  created_at: number;
};

export type Address = {
  id: string;
  user_id: string;
  type: 'shipping' | 'return';
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string | null;
  validated: number;
  shippo_address_id: string | null;
  created_at: number;
};

// JWT session payload
export type SessionPayload = {
  sub: string;     // user id
  email: string;
  role: UserRole;
  status: UserStatus;
};
