import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../App';

const CONDITIONS = [
  { value: 'like_new', label: 'Like New — barely used, no visible wear' },
  { value: 'good', label: 'Good — minor wear, fully functional' },
  { value: 'fair', label: 'Fair — visible wear but works well' },
];

const CATEGORIES = [
  'clothing', 'shoes', 'accessories', 'electronics_small', 'books',
  'toys', 'kitchenware', 'tools_small', 'art', 'collectibles',
  'sporting_goods_small', 'baby_items', 'health_beauty', 'home_decor_small',
  'music_instruments_small', 'furniture_oversized', 'hazmat', 'batteries_standalone',
  'aerosols', 'perishables', 'other',
];

export default function CreateListing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    price_cents: '',
    condition: 'good',
    category: 'clothing',
    weight_oz: '',
    length_in: '',
    width_in: '',
    height_in: '',
  });
  const [images, setImages] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shippabilityNote, setShippabilityNote] = useState<string | null>(null);

  if (!user || (user.role !== 'seller' && user.role !== 'both') || user.status !== 'approved') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Only approved sellers can create listings.</p>
      </div>
    );
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.createListing({
        ...form,
        price_cents: Math.round(parseFloat(form.price_cents) * 100),
        weight_oz: parseInt(form.weight_oz),
        length_in: parseInt(form.length_in),
        width_in: parseInt(form.width_in),
        height_in: parseInt(form.height_in),
      });

      setShippabilityNote(data.shippability_note);

      // Upload images sequentially
      for (const file of images) {
        await api.uploadImage(data.id, file);
      }

      navigate(`/listings/${data.id}`, {
        state: {
          created: true,
          fulfillment_type: data.fulfillment_type,
          shippability_note: data.shippability_note,
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create listing');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">List an item</h1>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input required value={form.title} onChange={set('title')}
            className="w-full border rounded px-3 py-2" placeholder="What are you selling?" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea required value={form.description} onChange={set('description')}
            rows={4} className="w-full border rounded px-3 py-2"
            placeholder="Describe the item, any defects, why you're selling…" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Price</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400">$</span>
              <input required type="number" min="0.01" step="0.01"
                value={form.price_cents} onChange={set('price_cents')}
                className="w-full border rounded pl-7 pr-3 py-2" placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Condition</label>
            <select value={form.condition} onChange={set('condition')} className="w-full border rounded px-3 py-2">
              {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <select value={form.category} onChange={set('category')} className="w-full border rounded px-3 py-2">
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <fieldset className="border rounded p-4">
          <legend className="text-sm font-medium px-1">Dimensions &amp; weight (required for shipping)</legend>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <label className="text-xs text-gray-500">Weight (oz)</label>
              <input required type="number" min="1" value={form.weight_oz} onChange={set('weight_oz')}
                className="w-full border rounded px-3 py-2 mt-1" placeholder="e.g. 24" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Length (in)</label>
              <input required type="number" min="1" value={form.length_in} onChange={set('length_in')}
                className="w-full border rounded px-3 py-2 mt-1" placeholder="e.g. 12" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Width (in)</label>
              <input required type="number" min="1" value={form.width_in} onChange={set('width_in')}
                className="w-full border rounded px-3 py-2 mt-1" placeholder="e.g. 8" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Height (in)</label>
              <input required type="number" min="1" value={form.height_in} onChange={set('height_in')}
                className="w-full border rounded px-3 py-2 mt-1" placeholder="e.g. 4" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Items exceeding carrier limits or restricted categories will be listed as local pickup only.
          </p>
        </fieldset>

        <div>
          <label className="block text-sm font-medium mb-1">
            Photos <span className="text-gray-400 font-normal">(up to 8, JPEG/PNG/WebP, max 10 MB each)</span>
          </label>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
            multiple className="hidden" onChange={e => setImages(Array.from(e.target.files ?? []))} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded w-full py-6 text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors">
            {images.length > 0 ? `${images.length} photo(s) selected` : 'Click to add photos'}
          </button>
          {images.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {images.map((f, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(f)} alt="" className="h-16 w-16 object-cover rounded" />
                </div>
              ))}
            </div>
          )}
        </div>

        {shippabilityNote && (
          <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 text-sm">
            ⚠ {shippabilityNote}
          </p>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full bg-brand-600 text-white py-2.5 rounded hover:bg-brand-700 disabled:opacity-50 font-medium">
          {loading ? 'Publishing…' : 'Publish listing'}
        </button>
      </form>
    </div>
  );
}
