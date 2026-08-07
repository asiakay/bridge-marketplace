import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../App';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Awaiting payment', color: 'text-yellow-700 bg-yellow-50' },
  paid: { label: 'Paid — preparing label', color: 'text-blue-700 bg-blue-50' },
  label_purchased: { label: 'Label ready', color: 'text-blue-700 bg-blue-50' },
  in_transit: { label: 'In transit', color: 'text-purple-700 bg-purple-50' },
  delivered: { label: 'Delivered', color: 'text-brand-700 bg-brand-50' },
  disputed: { label: 'Dispute open', color: 'text-red-700 bg-red-50' },
  cancelled: { label: 'Cancelled', color: 'text-gray-600 bg-gray-50' },
  refunded: { label: 'Refunded', color: 'text-gray-600 bg-gray-50' },
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function BuyerDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [fetching, setFetching] = useState(true);
  const [disputeId, setDisputeId] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login'); return; }
    api.getOrders('buyer').then(d => {
      setOrders(d.orders);
      setFetching(false);
    }).catch(() => setFetching(false));
  }, [user, loading]);

  const cancel = async (id: string) => {
    const data = await api.cancelOrder(id).catch(e => ({ message: e.message, details: [] }));
    setActionMsg(data.message);
    const updated = await api.getOrders('buyer').catch(() => ({ orders: [] }));
    setOrders(updated.orders);
  };

  const dispute = async (id: string) => {
    if (!disputeReason) return;
    const data = await api.disputeOrder(id, disputeReason).catch(e => ({ message: e.message }));
    setActionMsg(data.message);
    setDisputeId('');
    setDisputeReason('');
    const updated = await api.getOrders('buyer').catch(() => ({ orders: [] }));
    setOrders(updated.orders);
  };

  if (fetching) return <p className="text-gray-500">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">My Orders</h1>

      {actionMsg && (
        <p className="bg-brand-50 border border-brand-200 text-brand-800 rounded p-3 text-sm mb-4">{actionMsg}</p>
      )}

      {orders.length === 0 ? (
        <p className="text-gray-500">No orders yet. <a href="/" className="text-brand-700 underline">Browse listings</a></p>
      ) : (
        <div className="space-y-4">
          {orders.map(o => {
            const id = o.id as string;
            const status = o.status as string;
            const { label, color } = STATUS_LABELS[status] ?? { label: status, color: 'bg-gray-50 text-gray-700' };
            const canCancel = ['paid', 'label_purchased'].includes(status);
            const canDispute = ['paid', 'label_purchased', 'in_transit', 'delivered'].includes(status);

            return (
              <div key={id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{o.listing_title as string}</p>
                    <p className="text-sm text-gray-500">Seller: {o.seller_email as string}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded ${color}`}>{label}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Item: </span>
                    <span className="font-medium">{dollars(o.amount_cents as number)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Shipping: </span>
                    <span className="font-medium">{dollars(o.shipping_cost_cents as number)}</span>
                  </div>
                  {(o.tracking_number as string) && (
                    <div>
                      <span className="text-gray-500">Tracking: </span>
                      <span className="font-mono text-xs">{o.tracking_number as string}</span>
                    </div>
                  )}
                </div>

                {(o.label_url as string) && (
                  <a href={o.label_url as string} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-brand-700 underline mt-2 block">
                    View shipping label
                  </a>
                )}

                <div className="flex gap-3 mt-3">
                  {canCancel && (
                    <button onClick={() => cancel(id)}
                      className="text-sm text-red-600 border border-red-200 px-3 py-1 rounded hover:bg-red-50">
                      Cancel order
                    </button>
                  )}
                  {canDispute && (
                    <button onClick={() => setDisputeId(disputeId === id ? '' : id)}
                      className="text-sm text-gray-600 border px-3 py-1 rounded hover:bg-gray-50">
                      Open dispute
                    </button>
                  )}
                </div>

                {disputeId === id && (
                  <div className="mt-3 space-y-2">
                    <textarea value={disputeReason} onChange={e => setDisputeReason(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm" rows={2}
                      placeholder="Describe the issue…" />
                    <button onClick={() => dispute(id)}
                      className="bg-red-600 text-white text-sm px-4 py-1.5 rounded hover:bg-red-700">
                      Submit dispute
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
