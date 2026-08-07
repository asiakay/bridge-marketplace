import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../App';

export default function Verify() {
  const { setUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { user_id: string; email: string; status?: string; message?: string } | null;

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  if (!state?.user_id) {
    navigate('/login');
    return null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.verify(state.user_id, pin);
      setUser(data.user as { id: string; email: string; role: string; status: string });
      if (data.user.status === 'pending') {
        navigate('/orders', { state: { notice: 'Your account is pending approval. You can browse listings while you wait.' } });
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      await api.resendPin(state.user_id);
      setResent(true);
    } catch {
      setError('Could not resend code');
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-12">
      <h1 className="text-2xl font-bold mb-2">Enter your code</h1>
      <p className="text-sm text-gray-500 mb-2">
        We sent a 6-digit code to the phone on your account.
      </p>
      {state.message && (
        <p className="text-sm bg-brand-50 border border-brand-100 text-brand-800 rounded p-3 mb-4">
          {state.message}
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          required
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          className="w-full border rounded px-3 py-3 text-2xl tracking-widest text-center font-mono"
          placeholder="000000"
          autoFocus
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" disabled={loading || pin.length !== 6}
          className="w-full bg-brand-600 text-white py-2 rounded hover:bg-brand-700 disabled:opacity-50">
          {loading ? 'Verifying…' : 'Verify'}
        </button>
      </form>
      <button onClick={resend} className="text-sm text-gray-500 underline mt-4 block">
        {resent ? 'Code resent!' : 'Resend code'}
      </button>
    </div>
  );
}
