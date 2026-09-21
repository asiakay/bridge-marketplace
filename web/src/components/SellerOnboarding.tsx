import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../App';

type StripeStatus = { connected: boolean; charges_enabled: boolean; payouts_enabled: boolean };
type StepStatus = 'done' | 'current' | 'upcoming';

function Step({ n, label, status, children }: {
  n: number; label: string; status: StepStatus; children?: ReactNode;
}) {
  return (
    <div className={`flex gap-3 ${status === 'upcoming' ? 'opacity-40' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5
        ${status === 'done' ? 'bg-brand-600 text-white' : status === 'current' ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
        {status === 'done' ? '✓' : n}
      </div>
      <div className="flex-1 pb-1">
        <p className="font-medium text-sm text-gray-800">{label}</p>
        {children && <div className="mt-1.5">{children}</div>}
      </div>
    </div>
  );
}

export default function SellerOnboarding({
  stripeStatus,
  listingCount,
}: {
  stripeStatus: StripeStatus | null;
  listingCount: number;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const { status } = user;
  const approved = status === 'approved';
  const pending = status === 'pending';
  const terminal = status === 'rejected' || status === 'suspended';
  const stripeReady = !!stripeStatus?.payouts_enabled;
  const hasListings = listingCount > 0;

  if (approved && stripeReady && hasListings) return null;

  if (terminal) {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-5 mb-6">
        <p className="text-sm font-medium text-red-800">
          {status === 'rejected'
            ? 'Your seller application was not approved. Contact support if you have questions.'
            : 'Your seller account has been suspended. Contact support for assistance.'}
        </p>
      </div>
    );
  }

  const currentStep = pending ? 3 : !stripeReady ? 4 : 5;

  const stepStatus = (done: boolean, step: number): StepStatus =>
    done ? 'done' : currentStep === step ? 'current' : 'upcoming';

  const startOnboarding = async () => {
    const data = await api.startStripeOnboard();
    window.location.href = data.onboarding_url;
  };

  return (
    <div className="border border-brand-200 bg-brand-50 rounded-lg p-5 mb-6">
      <h2 className="font-semibold text-brand-800 mb-5">Getting started on Bridge</h2>
      <div className="space-y-4">
        <Step n={1} label="Create your account" status="done" />
        <Step n={2} label="Verify your phone number" status="done" />

        <Step n={3} label="Get approved to sell" status={stepStatus(approved, 3)}>
          {pending && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Your application is under review. Check back here to see when your account is approved.
            </p>
          )}
        </Step>

        <Step n={4} label="Connect Stripe for payouts" status={stepStatus(stripeReady, 4)}>
          {approved && !stripeReady && (
            <div>
              <p className="text-sm text-gray-600 mb-2">
                {stripeStatus?.connected
                  ? 'Your Stripe account needs more information before payouts can be enabled.'
                  : 'Link your bank account so Bridge can pay you when items sell.'}
              </p>
              <button onClick={startOnboarding}
                className="bg-brand-600 text-white px-4 py-1.5 rounded text-sm hover:bg-brand-700">
                {stripeStatus?.connected ? 'Complete Stripe setup' : 'Connect Stripe'}
              </button>
            </div>
          )}
        </Step>

        <Step n={5} label="List your first item" status={stepStatus(hasListings, 5)}>
          {approved && stripeReady && !hasListings && (
            <button onClick={() => navigate('/listings/create')}
              className="bg-brand-600 text-white px-4 py-1.5 rounded text-sm hover:bg-brand-700">
              Create a listing
            </button>
          )}
        </Step>
      </div>
    </div>
  );
}
