import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

type Listing = {
  id: string;
  title: string;
  price_cents: number;
  condition: string;
  category: string;
  fulfillment_type: string;
  cover_image_key: string | null;
};

const CONDITION_LABELS: Record<string, string> = {
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function Home() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [condition, setCondition] = useState('');
  const [fulfillment, setFulfillment] = useState('');

  const search = async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (q) params.q = q;
    if (condition) params.condition = condition;
    if (fulfillment) params.fulfillment_type = fulfillment;
    const data = await api.getListings(params).catch(() => ({ listings: [] }));
    setListings(data.listings as Listing[]);
    setLoading(false);
  };

  useEffect(() => { search(); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Browse Listings</h1>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          className="border rounded px-3 py-2 text-sm flex-1 min-w-48"
          placeholder="Search…"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <select className="border rounded px-3 py-2 text-sm" value={condition} onChange={e => setCondition(e.target.value)}>
          <option value="">Any condition</option>
          <option value="like_new">Like New</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
        </select>
        <select className="border rounded px-3 py-2 text-sm" value={fulfillment} onChange={e => setFulfillment(e.target.value)}>
          <option value="">Ship + pickup</option>
          <option value="ship">Ships</option>
          <option value="local_pickup">Local pickup</option>
        </select>
        <button
          onClick={search}
          className="bg-brand-600 text-white px-4 py-2 rounded text-sm hover:bg-brand-700"
        >
          Search
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : listings.length === 0 ? (
        <p className="text-gray-500">No listings found.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {listings.map(l => (
            <Link key={l.id} to={`/listings/${l.id}`} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
              <div className="bg-gray-100 h-40 flex items-center justify-center">
                {l.cover_image_key ? (
                  <img
                    src={`/api/listings/images/${l.cover_image_key}`}
                    alt={l.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-gray-400 text-sm">No photo</span>
                )}
              </div>
              <div className="p-3">
                <p className="font-medium text-sm line-clamp-2">{l.title}</p>
                <p className="text-brand-700 font-bold mt-1">{dollars(l.price_cents)}</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                    {CONDITION_LABELS[l.condition] ?? l.condition}
                  </span>
                  {l.fulfillment_type === 'local_pickup' && (
                    <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">Local pickup</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
