const BASE = '/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Request failed');
  return data;
}

export const api = {
  // Auth
  register: (body: { email: string; phone: string; role: string; invite_code?: string }) =>
    req<{ user_id: string; status: string; message: string }>('/auth/register', {
      method: 'POST', body: JSON.stringify(body),
    }),

  login: (email: string) =>
    req<{ message: string; user_id: string }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email }),
    }),

  verify: (user_id: string, pin: string) =>
    req<{ user: { id: string; email: string; role: string; status: string } }>('/auth/verify', {
      method: 'POST', body: JSON.stringify({ user_id, pin }),
    }),

  logout: () => req<{ message: string }>('/auth/logout', { method: 'POST' }),

  me: () => req<{ user: Record<string, unknown> }>('/auth/me'),

  resendPin: (user_id: string) =>
    req<{ message: string }>('/auth/resend-pin', {
      method: 'POST', body: JSON.stringify({ user_id }),
    }),

  // Listings
  getListings: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return req<{ listings: Record<string, unknown>[] }>(`/listings${qs}`);
  },

  getListing: (id: string) =>
    req<{ listing: Record<string, unknown>; images: Record<string, unknown>[] }>(`/listings/${id}`),

  createListing: (body: Record<string, unknown>) =>
    req<{ id: string; fulfillment_type: string; shippability_note: string | null }>(
      '/listings', { method: 'POST', body: JSON.stringify(body) }
    ),

  updateListing: (id: string, body: Record<string, unknown>) =>
    req<{ message: string }>(`/listings/${id}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),

  deleteListing: (id: string) =>
    req<{ message: string }>(`/listings/${id}`, { method: 'DELETE' }),

  uploadImage: (listingId: string, file: File) => {
    return fetch(`${BASE}/listings/${listingId}/images`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': file.type },
      body: file,
    }).then(r => r.json()) as Promise<{ id: string; r2_key: string; sort_order: number }>;
  },

  deleteImage: (listingId: string, imageId: string) =>
    req<{ message: string }>(`/listings/${listingId}/images/${imageId}`, { method: 'DELETE' }),

  getMyListings: () =>
    req<{ listings: Record<string, unknown>[] }>('/listings/seller/mine'),

  // Shipping
  validateAddress: (body: Record<string, unknown>) =>
    req<{ address_id: string; valid: boolean; messages: unknown[] }>('/shipping/validate-address', {
      method: 'POST', body: JSON.stringify(body),
    }),

  getRates: (listing_id: string, address_id: string, insured = false) =>
    req<{ rates: Array<{ rate_id: string; provider: string; service: string; amount_cents: number; estimated_days: number | null }>; shipment_id: string }>(
      '/shipping/rates', {
        method: 'POST',
        body: JSON.stringify({ listing_id, address_id, insured }),
      }
    ),

  // Orders
  createOrder: (body: Record<string, unknown>) =>
    req<{ order_id: string; client_secret: string; amount_cents: number; breakdown: Record<string, unknown> }>(
      '/orders', { method: 'POST', body: JSON.stringify(body) }
    ),

  getOrders: (as: 'buyer' | 'seller') =>
    req<{ orders: Record<string, unknown>[] }>(`/orders?as=${as}`),

  getOrder: (id: string) =>
    req<{ order: Record<string, unknown> }>(`/orders/${id}`),

  cancelOrder: (id: string) =>
    req<{ message: string; details: string[] }>(`/orders/${id}/cancel`, { method: 'POST' }),

  disputeOrder: (id: string, reason: string) =>
    req<{ message: string }>(`/orders/${id}/dispute`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }),

  // Stripe Connect
  startStripeOnboard: () =>
    req<{ onboarding_url: string }>('/stripe/connect/onboard', { method: 'POST' }),

  getStripeStatus: () =>
    req<{ connected: boolean; charges_enabled: boolean; payouts_enabled: boolean }>('/stripe/connect/status'),

  // Admin
  getPendingUsers: () => req<{ users: Record<string, unknown>[] }>('/admin/users/pending'),
  approveUser: (id: string) => req<{ message: string }>(`/admin/users/${id}/approve`, { method: 'POST' }),
  rejectUser: (id: string, reason?: string) =>
    req<{ message: string }>(`/admin/users/${id}/reject`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }),
  suspendUser: (id: string, reason: string) =>
    req<{ message: string }>(`/admin/users/${id}/suspend`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }),
  getPendingImages: () => req<{ images: Record<string, unknown>[] }>('/admin/images/pending'),
  approveImage: (id: string) => req<{ message: string }>(`/admin/images/${id}/approve`, { method: 'POST' }),
  flagImage: (id: string, reason?: string) =>
    req<{ message: string }>(`/admin/images/${id}/flag`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }),
  createInviteCode: () => req<{ code: string }>('/admin/invite-codes', { method: 'POST' }),
  getInviteCodes: () => req<{ codes: Record<string, unknown>[] }>('/admin/invite-codes'),
};
