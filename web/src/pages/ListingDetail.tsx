import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { api } from '../lib/api';
import { useAuth } from '../App';

const _stripeKey = (import.meta as unknown as { env: Record<string, string> }).env['VITE_STRIPE_PUBLISHABLE_KEY'];
const stripePromise = _stripeKey ? loadStripe(_stripeKey) : null;

type Rate = {
  rate_id: string;
  provider: string;
  service: string;
  amount_cents: number;
  estimated_days: number | null;
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function CheckoutForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError('');

    const result = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (result.error) {
      setError(result.error.message ?? 'Payment failed');
      setProcessing(false);
    } else if (result.paymentIntent?.status === 'succeeded') {
      onSuccess();
    }
  };

  return (
    <form onSubmit={pay} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" disabled={processing || !stripe}
        className="w-full bg-brand-600 text-white py-2.5 rounded hover:bg-brand-700 disabled:opacity-50 font-medium">
        {processing ? 'Processing…' : 'Pay now'}
      </button>
    </form>
  );
}

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [listing, setListing] = useState<Record<string, unknown> | null>(null);
  const [images, setImages] = useState<Array<{ id: string; r2_key: string }>>([]);
  const [imgIndex, setImgIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Checkout flow state
  const [step, setStep] = useState<'details' | 'address' | 'rates' | 'payment' | 'done'>('details');
  const [address, setAddress] = useState({ name: '', line1: '', line2: '', city: '', state: '', zip: '', phone: '' });
  const [addressId, setAddressId] = useState('');
  const [rates, setRates] = useState<Rate[]>([]);
  const [selectedRate, setSelectedRate] = useState<Rate | null>(null);
  const [insured, setInsured] = useState(false);
  const [orderData, setOrderData] = useState<{ order_id: string; client_secret: string; amount_cents: number } | null>(null);
  const [flowError, setFlowError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.getListing(id).then(d => {
      setListing(d.listing);
      setImages(d.images as Array<{ id: string; r2_key: string }>);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  const validateAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setFlowError('');
    try {
      const data = await api.validateAddress(address);
      if (!data.valid) {
        setFlowError('Address could not be validated. Check the details and try again.');
        return;
      }
      setAddressId(data.address_id);
      setStep('rates');
      const rateData = await api.getRates(id!, data.address_id, insured);
      setRates(rateData.rates);
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : 'Failed to get rates');
    }
  };

  const startPayment = async () => {
    if (!selectedRate) return;
    setFlowError('');
    try {
      const data = await api.createOrder({
        listing_id: id,
        address_id: addressId,
        shippo_rate_id: selectedRate.rate_id,
        shipping_cost_cents: selectedRate.amount_cents,
        carrier: selectedRate.provider,
        insured,
        insurance_cost_cents: 0,
      });
      setOrderData(data);
      setStep('payment');
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : 'Could not start checkout');
    }
  };

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (!listing) return <p className="text-gray-500">Listing not found.</p>;

  const price = listing.price_cents as number;
  const condition = listing.condition as string;
  const fulfillmentType = listing.fulfillment_type as string;
  const status = listing.status as string;

  const approvedImages = images.filter((img: Record<string, unknown>) =>
    (img as { moderation_status: string }).moderation_status === 'approved'
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid md:grid-cols-2 gap-8">
        {/* Images */}
        <div>
          <div className="bg-gray-100 rounded-lg overflow-hidden h-80">
            {approvedImages.length > 0 ? (
              <img
                src={`/api/listings/images/${approvedImages[imgIndex].r2_key}`}
                alt={listing.title as string}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">No photos</div>
            )}
          </div>
          {approvedImages.length > 1 && (
            <div className="flex gap-2 mt-2">
              {approvedImages.map((img, i) => (
                <button key={img.id} onClick={() => setImgIndex(i)}
                  className={`border-2 rounded overflow-hidden w-14 h-14 ${i === imgIndex ? 'border-brand-500' : 'border-transparent'}`}>
                  <img src={`/api/listings/images/${img.r2_key}`} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info + checkout */}
        <div>
          <h1 className="text-2xl font-bold">{listing.title as string}</h1>
          <p className="text-3xl font-bold text-brand-700 mt-2">{dollars(price)}</p>
          <div className="flex gap-2 mt-2">
            <span className="text-xs bg-gray-100 px-2 py-1 rounded capitalize">{condition.replace('_', ' ')}</span>
            <span className={`text-xs px-2 py-1 rounded ${fulfillmentType === 'ship' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
              {fulfillmentType === 'ship' ? 'Ships' : 'Local pickup only'}
            </span>
          </div>
          <p className="text-gray-600 mt-4 text-sm leading-relaxed">{listing.description as string}</p>

          {status !== 'active' && (
            <p className="mt-4 text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 text-sm">
              This listing is no longer available.
            </p>
          )}

          {step === 'done' && (
            <div className="mt-4 bg-brand-50 border border-brand-200 rounded p-4">
              <p className="font-medium text-brand-800">Payment complete!</p>
              <p className="text-sm text-brand-700 mt-1">Your shipping label is being prepared. Check your orders for tracking.</p>
              <button onClick={() => navigate('/orders')} className="mt-3 text-sm text-brand-700 underline">
                View my orders →
              </button>
            </div>
          )}

          {user && status === 'active' && step === 'details' && fulfillmentType === 'ship' && user.id !== listing.seller_id && (
            <button onClick={() => setStep('address')}
              className="mt-6 w-full bg-brand-600 text-white py-3 rounded font-medium hover:bg-brand-700">
              Buy — enter shipping address
            </button>
          )}

          {/* Address step */}
          {step === 'address' && (
            <form onSubmit={validateAddress} className="mt-4 space-y-3">
              <h3 className="font-medium">Shipping address</h3>
              {(['name', 'line1', 'line2', 'city', 'state', 'zip', 'phone'] as const).map(f => (
                <input key={f} value={address[f]}
                  onChange={e => setAddress(a => ({ ...a, [f]: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder={{ name: 'Full name', line1: 'Street address', line2: 'Apt/unit (optional)', city: 'City', state: 'State', zip: 'ZIP', phone: 'Phone (optional)' }[f]}
                  required={f !== 'line2' && f !== 'phone'}
                />
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={insured} onChange={e => setInsured(e.target.checked)} />
                Add shipping insurance (opt-in)
              </label>
              {flowError && <p className="text-red-600 text-sm">{flowError}</p>}
              <button type="submit" className="w-full bg-brand-600 text-white py-2 rounded hover:bg-brand-700">
                Get shipping rates
              </button>
            </form>
          )}

          {/* Rate selection */}
          {step === 'rates' && (
            <div className="mt-4 space-y-3">
              <h3 className="font-medium">Choose a shipping option</h3>
              {rates.map(r => (
                <label key={r.rate_id} className={`flex items-center gap-3 border rounded p-3 cursor-pointer ${selectedRate?.rate_id === r.rate_id ? 'border-brand-500 bg-brand-50' : ''}`}>
                  <input type="radio" name="rate" checked={selectedRate?.rate_id === r.rate_id}
                    onChange={() => setSelectedRate(r)} />
                  <div className="flex-1">
                    <span className="font-medium text-sm">{r.provider} — {r.service}</span>
                    {r.estimated_days && <span className="text-xs text-gray-500 ml-2">{r.estimated_days} day{r.estimated_days !== 1 ? 's' : ''}</span>}
                  </div>
                  <span className="font-bold">{dollars(r.amount_cents)}</span>
                </label>
              ))}
              {flowError && <p className="text-red-600 text-sm">{flowError}</p>}
              <button onClick={startPayment} disabled={!selectedRate}
                className="w-full bg-brand-600 text-white py-2.5 rounded hover:bg-brand-700 disabled:opacity-50 font-medium">
                Continue to payment — {selectedRate ? dollars(price + selectedRate.amount_cents) : '…'}
              </button>
              <p className="text-xs text-gray-400">
                You're charged the actual carrier rate. Dimensional discrepancies may result in a separate surcharge.
              </p>
            </div>
          )}

          {/* Payment */}
          {step === 'payment' && orderData && (
            <div className="mt-4">
              <h3 className="font-medium mb-3">Payment</h3>
              <Elements stripe={stripePromise} options={{ clientSecret: orderData.client_secret }}>
                <CheckoutForm onSuccess={() => setStep('done')} />
              </Elements>
            </div>
          )}

          {!user && status === 'active' && (
            <p className="mt-6 text-sm text-gray-500">
              <a href="/login" className="text-brand-700 underline">Log in</a> to purchase this item.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
