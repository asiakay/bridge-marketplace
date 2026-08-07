const SHIPPO_BASE = 'https://api.goshippo.com';

async function request<T>(
  path: string,
  method: string,
  body: object | null,
  apiKey: string
): Promise<T> {
  const res = await fetch(`${SHIPPO_BASE}${path}`, {
    method,
    headers: {
      Authorization: `ShippoToken ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json() as T;
  if (!res.ok) {
    throw new Error(`Shippo ${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export type ShippoAddress = {
  object_id: string;
  validation_results?: {
    is_valid: boolean;
    messages?: Array<{ code: string; text: string }>;
  };
  is_complete: boolean;
};

export type ShippoRate = {
  object_id: string;
  provider: string;
  servicelevel: { name: string; token: string };
  amount: string;
  currency: string;
  estimated_days: number | null;
};

export type ShippoShipment = {
  object_id: string;
  rates: ShippoRate[];
};

export type ShippoTransaction = {
  object_id: string;
  status: string;
  label_url: string;
  tracking_number: string;
  tracking_url_provider: string;
  rate: string;
  messages: Array<{ source: string; code: string; text: string }>;
};

export async function validateAddress(
  params: {
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone?: string;
    email?: string;
  },
  apiKey: string
): Promise<ShippoAddress> {
  return request<ShippoAddress>('/addresses/', 'POST', { ...params, validate: true }, apiKey);
}

export async function getRates(params: {
  addressFrom: {
    name: string;
    street1: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone?: string;
    email?: string;
  };
  addressTo: {
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone?: string;
  };
  parcel: {
    weight: number;       // in oz
    length: number;       // in inches
    width: number;
    height: number;
  };
  insurance?: boolean;
  insuredValue?: string;
}, apiKey: string): Promise<ShippoShipment> {
  const body = {
    address_from: {
      name: params.addressFrom.name,
      street1: params.addressFrom.street1,
      city: params.addressFrom.city,
      state: params.addressFrom.state,
      zip: params.addressFrom.zip,
      country: params.addressFrom.country,
      phone: params.addressFrom.phone,
      email: params.addressFrom.email,
    },
    address_to: {
      name: params.addressTo.name,
      street1: params.addressTo.street1,
      street2: params.addressTo.street2,
      city: params.addressTo.city,
      state: params.addressTo.state,
      zip: params.addressTo.zip,
      country: params.addressTo.country,
      phone: params.addressTo.phone,
    },
    parcels: [{
      weight: (params.parcel.weight / 16).toFixed(4), // Shippo expects lbs
      weight_unit: 'lb',
      length: params.parcel.length.toString(),
      width: params.parcel.width.toString(),
      height: params.parcel.height.toString(),
      distance_unit: 'in',
    }],
    async: false,
    ...(params.insurance && params.insuredValue
      ? { extra: { insurance: { amount: params.insuredValue, currency: 'USD', content: 'Secondhand goods' } } }
      : {}),
  };

  return request<ShippoShipment>('/shipments/', 'POST', body, apiKey);
}

export async function purchaseLabel(
  rateObjectId: string,
  asyncMode: boolean = false,
  apiKey: string
): Promise<ShippoTransaction> {
  return request<ShippoTransaction>('/transactions/', 'POST', {
    rate: rateObjectId,
    label_file_type: 'PDF',
    async: asyncMode,
  }, apiKey);
}

export async function refundLabel(transactionId: string, apiKey: string): Promise<void> {
  await request<unknown>('/refunds/', 'POST', { transaction: transactionId }, apiKey);
}

// Verify Shippo webhook signature (HMAC-SHA256)
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return expected === signatureHeader;
}
