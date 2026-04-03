'use client'

export const dynamic = 'force-static'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { useBilling } from '@/hooks/useBilling'
import { Check, X, Sparkles, ChevronDown } from 'lucide-react'
import type { PlanId } from '@/types/billing'

function PaymentBadges() {
  const badges = ['UPI', 'Cards', 'NetBanking', '150+ countries']
  return (
    <div
      data-testid="payment-badges"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 10,
      }}
    >
      {badges.map((badge) => (
        <span
          key={badge}
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.35)',
            background: 'rgba(255,255,255,0.06)',
            padding: '3px 8px',
            borderRadius: 20,
            whiteSpace: 'nowrap',
          }}
        >
          {badge}
        </span>
      ))}
    </div>
  )
}

function PlanCard({
  name,
  price,
  features,
  disabledFeatures,
  planId,
  currentPlanId,
  isMostPopular,
  onSelect,
  isLoading,
  buttonLabel,
  showPaymentBadges,
}: {
  name: string
  price: number
  features: string[]
  disabledFeatures?: string[]
  planId: PlanId
  currentPlanId: PlanId
  isMostPopular?: boolean
  onSelect: () => void
  isLoading: boolean
  buttonLabel: string
  showPaymentBadges?: boolean
}) {
  const isCurrent = planId === currentPlanId

  return (
    <div
      data-testid={`plan-card-${planId}`}
      style={{
        position: 'relative',
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(20px)',
        border: isMostPopular ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
        boxShadow: isMostPopular ? '0 0 40px rgba(255,255,255,0.03)' : 'none',
      }}
    >
      {isMostPopular && (
        <div
          data-testid="most-popular-badge"
          style={{
            position: 'absolute',
            top: -12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255,255,255,0.9)',
            color: '#000',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '4px 14px',
            borderRadius: 20,
            whiteSpace: 'nowrap',
          }}
        >
          Most Popular
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8 }}>{name}</h3>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: '#fff' }}>${price}</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>/month</span>
        </div>
        {showPaymentBadges && <PaymentBadges />}
      </div>

      <div style={{ flex: 1, marginBottom: 24 }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
            <Check style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.5)', flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>{f}</span>
          </div>
        ))}
        {disabledFeatures?.map((f, i) => (
          <div key={`d-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
            <X style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.15)', flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', lineHeight: 1.4 }}>{f}</span>
          </div>
        ))}
      </div>

      <button
        data-testid={`plan-btn-${planId}`}
        onClick={onSelect}
        disabled={isLoading || (isCurrent && planId === 'free')}
        style={{
          width: '100%',
          padding: '12px 0',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          cursor: isLoading || (isCurrent && planId === 'free') ? 'default' : 'pointer',
          border: 'none',
          transition: 'all 0.2s ease',
          background: isMostPopular
            ? 'rgba(255,255,255,0.9)'
            : isCurrent
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(255,255,255,0.1)',
          color: isMostPopular ? '#000' : '#fff',
          opacity: isLoading ? 0.6 : 1,
        }}
      >
        {isLoading ? 'Loading...' : buttonLabel}
      </button>
    </div>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      data-testid="faq-item"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 0',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none',
          border: 'none',
          color: '#fff',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          padding: 0,
          fontSize: 14,
          fontWeight: 500,
          textAlign: 'left',
        }}
      >
        {question}
        <ChevronDown
          style={{
            width: 16,
            height: 16,
            color: 'rgba(255,255,255,0.3)',
            transition: 'transform 0.2s ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        />
      </button>
      {open && (
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 10, lineHeight: 1.6 }}>
          {answer}
        </p>
      )}
    </div>
  )
}

export default function PricingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isSignedIn } = useUser()
  const { plan, isLoading, isUpgrading, createCheckoutSession, createPortalSession } = useBilling()

  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setStatusMessage('Subscription activated! Welcome to Pro.')
    } else if (searchParams.get('canceled') === 'true') {
      setStatusMessage('Checkout canceled. No changes were made.')
    }
  }, [searchParams])

  const currentPlanId = plan?.id ?? 'free'

  const handleFreePlan = () => {
    if (isSignedIn) {
      router.push('/chat')
    } else {
      router.push('/sign-up')
    }
  }

  const handleProPlan = () => {
    if (currentPlanId === 'pro') {
      createPortalSession()
    } else {
      createCheckoutSession('pro')
    }
  }

  const handleBusinessPlan = () => {
    if (currentPlanId === 'business') {
      createPortalSession()
    } else {
      window.location.href = 'mailto:rudrasatani@missi.space'
    }
  }

  const freeButtonLabel =
    currentPlanId === 'free' ? 'Current Plan' : 'Get Started'

  const proButtonLabel =
    currentPlanId === 'pro' ? 'Manage Subscription' : 'Upgrade to Pro'

  const businessButtonLabel =
    currentPlanId === 'business' ? 'Manage Subscription' : 'Contact Us'

  return (
    <div
      data-testid="pricing-page"
      style={{
        minHeight: '100vh',
        background: '#000',
        color: '#fff',
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
      }}
    >
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
        }}
      >
        <Link
          href="/"
          data-testid="pricing-home-link"
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.4)',
            textDecoration: 'none',
            transition: 'color 0.2s',
          }}
        >
          Home
        </Link>
        <Link
          href="/chat"
          data-testid="pricing-chat-link"
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.4)',
            textDecoration: 'none',
            transition: 'color 0.2s',
          }}
        >
          Back to Chat
        </Link>
      </nav>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px 80px' }}>
        {/* Status message */}
        {statusMessage && (
          <div
            data-testid="pricing-status-message"
            style={{
              textAlign: 'center',
              marginBottom: 32,
              padding: '12px 20px',
              borderRadius: 10,
              background: searchParams.get('success')
                ? 'rgba(34,197,94,0.1)'
                : 'rgba(255,255,255,0.05)',
              border: searchParams.get('success')
                ? '1px solid rgba(34,197,94,0.2)'
                : '1px solid rgba(255,255,255,0.08)',
              fontSize: 13,
              color: searchParams.get('success')
                ? 'rgba(34,197,94,0.9)'
                : 'rgba(255,255,255,0.6)',
            }}
          >
            {statusMessage}
          </div>
        )}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 16,
              padding: '4px 12px',
              borderRadius: 20,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Sparkles style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.4)' }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
              Pricing
            </span>
          </div>
          <h1
            data-testid="pricing-heading"
            style={{ fontSize: 28, fontWeight: 600, marginBottom: 10, letterSpacing: '-0.02em' }}
          >
            Simple, honest pricing
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', maxWidth: 400, margin: '0 auto' }}>
            Start free. Upgrade when missiAI becomes part of your life.
          </p>
        </div>

        {/* Plan cards */}
        <div
          data-testid="plan-cards-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 64,
          }}
        >
          <PlanCard
            name="Free"
            price={0}
            planId="free"
            currentPlanId={currentPlanId}
            features={[
              '10 voice interactions/day',
              '1 personality mode',
              'Basic memory (20 facts)',
              'Action engine',
            ]}
            disabledFeatures={[
              'Multiple personalities',
              'Unlimited voice',
              'Full memory graph',
            ]}
            onSelect={handleFreePlan}
            isLoading={isLoading}
            buttonLabel={freeButtonLabel}
          />

          <PlanCard
            name="Pro"
            price={9}
            planId="pro"
            currentPlanId={currentPlanId}
            isMostPopular
            showPaymentBadges
            features={[
              'Unlimited voice interactions',
              'All 4 personalities',
              'Full memory graph (unlimited facts)',
              'Proactive intelligence',
              'Plugin integrations',
              'Priority response speed',
            ]}
            onSelect={handleProPlan}
            isLoading={isLoading || isUpgrading}
            buttonLabel={isUpgrading ? 'Redirecting...' : proButtonLabel}
          />

          <PlanCard
            name="Business"
            price={49}
            planId="business"
            currentPlanId={currentPlanId}
            showPaymentBadges
            features={[
              'Everything in Pro',
              'API access',
              'Team features (coming soon)',
              'Priority support',
              'Custom integrations',
            ]}
            onSelect={handleBusinessPlan}
            isLoading={isLoading}
            buttonLabel={businessButtonLabel}
          />
        </div>

        {/* Powered by */}
        <div
          data-testid="powered-by-dodo"
          style={{
            textAlign: 'center',
            marginBottom: 48,
            fontSize: 11,
            color: 'rgba(255,255,255,0.2)',
          }}
        >
          Powered by Dodo Payments
        </div>

        {/* FAQ */}
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2
            data-testid="faq-heading"
            style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, textAlign: 'center' }}
          >
            Questions?
          </h2>
          <FAQItem
            question="Can I cancel anytime?"
            answer="Yes, cancel from the billing portal anytime. Your plan stays active until the end of the billing period."
          />
          <FAQItem
            question="What happens to my memories if I downgrade?"
            answer="Your memories are preserved. You'll still have access to your basic memory (20 most recent facts) on the free plan."
          />
          <FAQItem
            question="Is there a free trial?"
            answer="The free tier is permanent — no credit card needed. Use it as long as you want, and upgrade whenever you're ready."
          />
        </div>
      </div>
    </div>
  )
}
