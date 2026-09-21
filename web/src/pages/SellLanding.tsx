import { Link } from 'react-router-dom';

const steps = [
  { n: '01', title: 'Apply', desc: 'Register with your email and phone. Get in via invite code, or submit an application for the Bridge team to review.' },
  { n: '02', title: 'Get vetted', desc: 'The Bridge team reviews every seller application. This keeps buyers — and your reputation — protected.' },
  { n: '03', title: 'Connect payouts', desc: 'Link your bank account through Stripe. Takes about 5 minutes. Bridge deposits your earnings within 48 hours of delivery.' },
  { n: '04', title: 'Ship & earn', desc: 'List your items. When something sells, shipping is automatically calculated and a prepaid carrier label is generated for you.' },
];

const trust = [
  { icon: '🔒', title: 'Vetted buyers only', body: 'Every buyer on Bridge went through the same approval you did. No tire-kickers, no scammers.' },
  { icon: '💳', title: 'Stripe payouts', body: 'Earnings land in your bank account within 48 hours of confirmed delivery — no waiting, no chasing.' },
  { icon: '📦', title: 'Shipping handled', body: 'Shippo generates a prepaid carrier label the moment a sale is paid. You just print and drop it off.' },
];

const faqs = [
  { q: 'Who can sell on Bridge?', a: 'Anyone invited by an existing member or approved by the Bridge team. We review every application to maintain a trusted community.' },
  { q: 'How do I get paid?', a: 'Connect your bank account via Stripe during onboarding. Bridge releases your earnings automatically 48 hours after the buyer confirms delivery.' },
  { q: 'What can I ship?', a: 'Most secondhand goods — clothing, electronics, books, collectibles, and more. Oversized furniture, hazmat items, and live animals are local-pickup only.' },
  { q: 'What are the fees?', a: 'Bridge charges a 5% platform fee on each sale. The buyer pays the actual carrier shipping rate at checkout — you pay nothing to ship.' },
];

export default function SellLanding() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Hero */}
      <div className="text-center py-14 border-b border-gray-100">
        <h1 className="text-4xl font-bold text-gray-900 leading-tight">
          Sell on <span className="text-brand-700">Bridge</span>
        </h1>
        <p className="mt-4 text-lg text-gray-600 max-w-xl mx-auto">
          A vetted community marketplace. List your things, earn real money, and ship without the hassle.
        </p>
        <Link to="/register?role=seller"
          className="inline-block mt-6 bg-brand-600 text-white px-8 py-3 rounded-lg font-medium text-base hover:bg-brand-700 transition-colors">
          Apply to sell
        </Link>
        <p className="mt-3 text-sm text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-700 hover:underline">Log in</Link>
        </p>
      </div>

      {/* How it works */}
      <div className="py-12 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-8">How it works</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {steps.map(s => (
            <div key={s.n} className="flex gap-4">
              <span className="text-2xl font-bold text-brand-200 leading-none shrink-0">{s.n}</span>
              <div>
                <p className="font-semibold text-gray-900">{s.title}</p>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Why Bridge */}
      <div className="py-12 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-8">Why Bridge</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {trust.map(t => (
            <div key={t.title} className="bg-gray-50 rounded-lg p-5">
              <div className="text-2xl mb-2">{t.icon}</div>
              <p className="font-semibold text-gray-900 text-sm">{t.title}</p>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">{t.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="py-12 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Common questions</h2>
        <div className="space-y-5">
          {faqs.map(f => (
            <div key={f.q}>
              <p className="font-medium text-gray-900 text-sm">{f.q}</p>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="py-12 text-center">
        <p className="text-gray-600 mb-4">Ready to start selling?</p>
        <Link to="/register?role=seller"
          className="inline-block bg-brand-600 text-white px-8 py-3 rounded-lg font-medium text-base hover:bg-brand-700 transition-colors">
          Apply to sell
        </Link>
      </div>
    </div>
  );
}
