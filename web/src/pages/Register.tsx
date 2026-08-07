import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function Register() {
  const [form, setForm] = useState({
    email: '',
    phone: '',
    role: 'buyer',
    invite_code: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.register({
        email: form.email,
        phone: form.phone,
        role: form.role,
        invite_code: form.invite_code || undefined,
      });
      navigate('/verify', { state: { user_id: data.user_id, email: form.email, status: data.status, message: data.message } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-12">
      <h1 className="text-2xl font-bold mb-2">Create account</h1>
      <p className="text-sm text-gray-500 mb-6">
        Have an invite code? Enter it below to skip the approval queue.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input type="email" required value={form.email} onChange={set('email')}
            className="w-full border rounded px-3 py-2" placeholder="you@example.com" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Phone (for verification)</label>
          <input type="tel" required value={form.phone} onChange={set('phone')}
            className="w-full border rounded px-3 py-2" placeholder="+1 555 000 0000" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">I want to…</label>
          <select value={form.role} onChange={set('role')} className="w-full border rounded px-3 py-2">
            <option value="buyer">Buy only</option>
            <option value="seller">Sell only</option>
            <option value="both">Buy and sell</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Invite code <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input type="text" value={form.invite_code} onChange={set('invite_code')}
            className="w-full border rounded px-3 py-2 font-mono uppercase" placeholder="XXXXXXXXXXXXXX" />
          <p className="text-xs text-gray-400 mt-1">
            Without an invite code, your account will be reviewed before approval.
          </p>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full bg-brand-600 text-white py-2 rounded hover:bg-brand-700 disabled:opacity-50">
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="text-sm text-gray-500 mt-4">
        Already have an account? <Link to="/login" className="text-brand-700 underline">Log in</Link>
      </p>
    </div>
  );
}
