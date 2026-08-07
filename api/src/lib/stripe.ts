const STRIPE_BASE = 'https://api.stripe.com/v1';

async function request<T>(
  path: string,
  method: string,
  body: Record<string, string> | null,
  secretKey: string
): Promise<T> {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });

  const data = await res.json() as T;
  if (!res.ok) {
    const err = data as { error?: { message: string } };
    throw new Error(`Stripe ${method} ${path} → ${res.status}: ${err.error?.message ?? JSON.stringify(data)}`);
  }
  return data;
}

// Flatten nested objects into Stripe's x-www-form-urlencoded dot-notation
function flattenParams(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenParams(v as Record<string, unknown>, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

export type StripePaymentIntent = {
  id: string;
  client_secret: string;
  status: string;
  amount: number;
  currency: string;
};

export type StripeAccount = {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
};

export type StripeAccountLink = {
  url: string;
  expires_at: number;
};

export type StripeTransfer = {
  id: string;
  amount: number;
  destination: string;
};

export async function createPaymentIntent(params: {
  amountCents: number;
  currency: string;
  connectedAccountId: string;
  platformFeePercent: number;
  metadata: Record<string, string>;
  description: string;
}, secretKey: string): Promise<StripePaymentIntent> {
  const applicationFee = Math.round(params.amountCents * (params.platformFeePercent / 100));
  return request<StripePaymentIntent>('/payment_intents', 'POST', flattenParams({
    amount: params.amountCents.toString(),
    currency: params.currency,
    application_fee_amount: applicationFee.toString(),
    transfer_data: { destination: params.connectedAccountId },
    description: params.description,
    metadata: params.metadata,
  }), secretKey);
}

export async function capturePaymentIntent(
  paymentIntentId: string,
  secretKey: string
): Promise<StripePaymentIntent> {
  return request<StripePaymentIntent>(
    `/payment_intents/${paymentIntentId}/capture`,
    'POST',
    null,
    secretKey
  );
}

export async function refundPaymentIntent(
  paymentIntentId: string,
  amountCents: number | undefined,
  secretKey: string
): Promise<void> {
  await request<unknown>('/refunds', 'POST', {
    payment_intent: paymentIntentId,
    ...(amountCents ? { amount: amountCents.toString() } : {}),
  }, secretKey);
}

export async function createExpressAccount(
  email: string,
  secretKey: string
): Promise<StripeAccount> {
  return request<StripeAccount>('/accounts', 'POST', {
    type: 'express',
    email,
    'capabilities[transfers][requested]': 'true',
    'capabilities[card_payments][requested]': 'true',
  }, secretKey);
}

export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
  secretKey: string
): Promise<StripeAccountLink> {
  return request<StripeAccountLink>('/account_links', 'POST', {
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  }, secretKey);
}

export async function transferToSeller(params: {
  amountCents: number;
  connectedAccountId: string;
  orderId: string;
}, secretKey: string): Promise<StripeTransfer> {
  return request<StripeTransfer>('/transfers', 'POST', {
    amount: params.amountCents.toString(),
    currency: 'usd',
    destination: params.connectedAccountId,
    'metadata[order_id]': params.orderId,
  }, secretKey);
}

// Verify Stripe webhook signature
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  const elements = signatureHeader.split(',');
  const timestamp = elements.find(e => e.startsWith('t='))?.substring(2);
  const v1sig = elements.find(e => e.startsWith('v1='))?.substring(3);
  if (!timestamp || !v1sig) return false;

  const signed = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const sigBytes = Uint8Array.from(v1sig.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(signed));
}

export async function retrievePaymentIntent(
  id: string,
  secretKey: string
): Promise<StripePaymentIntent> {
  return request<StripePaymentIntent>(`/payment_intents/${id}`, 'GET', null, secretKey);
}
