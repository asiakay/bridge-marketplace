import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function StripeReturn({ refresh = false }: { refresh?: boolean }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'checking' | 'done' | 'incomplete'>('checking');

  useEffect(() => {
    if (refresh) {
      // Refresh means Stripe kicked them back (account link expired) — re-initiate
      api.startStripeOnboard()
        .then(d => { window.location.href = d.onboarding_url; })
        .catch(() => setStatus('incomplete'));
      return;
    }

    api.getStripeStatus().then(s => {
      if (s.payouts_enabled) {
        setStatus('done');
        setTimeout(() => navigate('/selling'), 2000);
      } else {
        setStatus('incomplete');
      }
    }).catch(() => setStatus('incomplete'));
  }, []);

  return (
    <div className="max-w-sm mx-auto mt-16 text-center">
      {status === 'checking' && <p className="text-gray-500">Checking your payout setup…</p>}
      {status === 'done' && (
        <div>
          <p className="text-2xl mb-2">✓</p>
          <p className="font-medium text-brand-700">Payout setup complete!</p>
          <p className="text-sm text-gray-500 mt-1">Redirecting to your dashboard…</p>
        </div>
      )}
      {status === 'incomplete' && (
        <div>
          <p className="font-medium text-amber-700">Setup not yet complete</p>
          <p className="text-sm text-gray-500 mt-1">
            Stripe may need a few more details. Return to your dashboard and try again.
          </p>
          <button onClick={() => navigate('/selling')}
            className="mt-4 bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 text-sm">
            Back to dashboard
          </button>
        </div>
      )}
    </div>
  );
}
