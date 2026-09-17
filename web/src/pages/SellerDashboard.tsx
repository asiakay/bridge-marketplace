import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../App';
import SellerOnboarding from '../components/SellerOnboarding';

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'text-brand-700 bg-brand-50',
  sold: 'text-blue-700 bg-blue-50',
  removed: 'text-gray-500 bg-gray-50',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Paid',
  label_purchased: 'Label ready',
  in_transit: 'In transit',
  delivered: 'Delivered',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export default function SellerDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [listings, setListings] = useState<Record<string, unknown>[]>([]);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [stripeStatus, setStripeStatus] = useState<{ connected: boolean; charges_enabled: boolean; payouts_enabled: boolean } | null>(null);
  const [tab, setTab] = useState<'listings' | 'orders'>('listings');
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login'); return; }
    if (user.role !== 'seller' && user.role !== 'both') { navigate('/'); return; }

    // Pending users can view the onboarding checklist but can't call approved-only endpoints
    if (user.status !== 'approved') { setFetching(false); return; }

    Promise.all([
      api.getMyListings(),
      api.getOrders('seller'),
      api.getStripeStatus(),
    ]).then(([l, o, s]) => {
      setListings(l.listings);
      setOrders(o.orders);
      setStripeStatus(s);
      setFetching(false);
    }).catch(() => setFetching(false));
  }, [user, loading]);

  const removeListing = async (id: string) => {
    await api.deleteListing(id).catch(() => {});
    setListings(prev => prev.map(l => l.id === id ? { ...l, status: 'removed' } : l));
  };

  if (fetching) return <p className="text-gray-500">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Seller Dashboard</h1>
        <Link to="/listings/create"
          className="bg-brand-600 text-white px-4 py-2 rounded text-sm hover:bg-brand-700">
          + New listing
        </Link>
      </div>

      <SellerOnboarding stripeStatus={stripeStatus} listingCount={listings.length} />

      <div className="flex gap-4 border-b mb-4">
        {(['listings', 'orders'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`pb-2 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t} ({t === 'listings' ? listings.length : orders.length})
          </button>
        ))}
      </div>

      {tab === 'listings' && (
        <div className="space-y-3">
          {listings.length === 0 ? (
            <p className="text-gray-500">No listings yet. <Link to="/listings/create" className="text-brand-700 underline">Create one</Link></p>
          ) : listings.map(l => (
            <div key={l.id as string} className="border rounded-lg p-4 flex items-center gap-4">
              <div className="flex-1">
                <Link to={`/listings/${l.id}`} className="font-medium hover:text-brand-700">
                  {l.title as string}
                </Link>
                <p className="text-sm text-gray-500 mt-0.5">
                  {dollars(l.price_cents as number)} · {(l.condition as string).replace('_', ' ')} · {l.fulfillment_type as string}
                </p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded ${STATUS_COLORS[l.status as string] ?? 'bg-gray-50'}`}>
                {l.status as string}
              </span>
              {l.status === 'active' && (
                <button onClick={() => removeListing(l.id as string)}
                  className="text-xs text-red-500 hover:text-red-700">Remove</button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-3">
          {orders.length === 0 ? (
            <p className="text-gray-500">No orders yet.</p>
          ) : orders.map(o => (
            <div key={o.id as string} className="border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{o.listing_title as string}</p>
                  <p className="text-sm text-gray-500">Buyer: {o.buyer_email as string}</p>
                </div>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                  {ORDER_STATUS_LABELS[o.status as string] ?? o.status as string}
                </span>
              </div>
              <div className="mt-2 flex gap-4 text-sm">
                <span><span className="text-gray-500">Item:</span> {dollars(o.amount_cents as number)}</span>
                <span><span className="text-gray-500">Shipping:</span> {dollars(o.shipping_cost_cents as number)}</span>
                {!!o.payout_released_at && (
                  <span className="text-brand-700">✓ Payout sent</span>
                )}
              </div>
              {!!o.tracking_number && (
                <p className="text-xs text-gray-500 mt-1 font-mono">Tracking: {String(o.tracking_number)}</p>
              )}
              {!!o.label_url && (
                <a href={String(o.label_url)} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-brand-700 underline mt-1 block">Print label</a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
