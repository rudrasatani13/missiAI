'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { useBilling } from '@/hooks/useBilling'
import { Check, X, Sparkles, ChevronDown, AlertTriangle, Crown, ArrowRight } from 'lucide-react'
import { CelebrationOverlay } from '@/components/ui/CelebrationOverlay'
import type { PlanId } from '@/types/billing'

function PaymentBadges() {
  const badges = ['UPI', 'Debit/Credit Card', 'Net Banking', 'Wallets']
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

function CancelModal({
  planName,
  isOpen,
  onConfirm,
  onCancel,
  isLoading,
}: {
  planName: string
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  isLoading: boolean
}) {
  if (!isOpen) return null

  return (
    <div
      data-testid="cancel-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onCancel}
    >
      <div
        data-testid="cancel-modal-content"
        style={{
          background: '#111',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: '32px 28px',
          maxWidth: 400,
          width: '90%',
          textAlign: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <AlertTriangle style={{ width: 32, height: 32, color: '#f59e0b' }} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
          Cancel {planName} Subscription?
        </h3>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 24, lineHeight: 1.6 }}>
          Your subscription will remain active until the end of the current billing period. After that, you&apos;ll be downgraded to the Free plan.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            data-testid="cancel-modal-keep-btn"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Keep Plan
          </button>
          <button
            data-testid="cancel-modal-confirm-btn"
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              background: 'rgba(239,68,68,0.8)',
              color: '#fff',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? 'Cancelling...' : 'Yes, Cancel'}
          </button>
        </div>
      </div>
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
  isCurrentPlan,
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
  isCurrentPlan?: boolean
}) {
  return (
    <div
      data-testid={`plan-card-${planId}`}
      style={{
        position: 'relative',
        background: isCurrentPlan
          ? 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(245,158,11,0.05))'
          : 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(20px)',
        border: isCurrentPlan
          ? '1px solid rgba(124,58,237,0.3)'
          : isMostPopular
            ? '1px solid rgba(255,255,255,0.2)'
            : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
        boxShadow: isCurrentPlan
          ? '0 0 40px rgba(124,58,237,0.08)'
          : isMostPopular
            ? '0 0 40px rgba(255,255,255,0.03)'
            : 'none',
      }}
    >
      {/* Current Plan Badge */}
      {isCurrentPlan && (
        <div
          data-testid="current-plan-badge"
          style={{
            position: 'absolute',
            top: -12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, #7C3AED, #F59E0B)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '4px 14px',
            borderRadius: 20,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Crown style={{ width: 10, height: 10 }} />
          Current Plan
        </div>
      )}

      {/* Most Popular Badge — only show if not the current plan */}
      {isMostPopular && !isCurrentPlan && (
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
            <Check style={{ width: 14, height: 14, color: isCurrentPlan ? 'rgba(124,58,237,0.7)' : 'rgba(255,255,255,0.5)', flexShrink: 0, marginTop: 2 }} />
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
        disabled={isLoading || (isCurrentPlan && planId === 'free')}
        style={{
          width: '100%',
          padding: '12px 0',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          cursor: isLoading || (isCurrentPlan && planId === 'free') ? 'default' : 'pointer',
          border: 'none',
          transition: 'all 0.2s ease',
          background: isCurrentPlan
            ? planId === 'free'
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(239,68,68,0.15)'
            : isMostPopular
              ? 'rgba(255,255,255,0.9)'
              : 'rgba(255,255,255,0.1)',
          color: isCurrentPlan
            ? planId === 'free'
              ? 'rgba(255,255,255,0.4)'
              : 'rgba(239,68,68,0.9)'
            : isMostPopular
              ? '#000'
              : '#fff',
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
  const { isSignedIn } = useUser()
  const {
    plan, billing, isLoading, isUpgrading, isCancelling,
    error: billingError, initiateRazorpayCheckout, cancelSubscription, refreshBilling,
  } = useBilling()

  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const prevPlanRef = useRef<string | null>(null)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelPlanName, setCancelPlanName] = useState('')
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebrationPlanName, setCelebrationPlanName] = useState('')

  // Detect plan upgrade and trigger celebration
  useEffect(() => {
    if (plan) {
      if (prevPlanRef.current === 'free' && (plan.id === 'pro' || plan.id === 'business')) {
        setCelebrationPlanName(plan.name)
        setShowCelebration(true)
      }
      prevPlanRef.current = plan.id
    }
  }, [plan])

  const handleCelebrationComplete = useCallback(() => {
    setShowCelebration(false)
  }, [])

  const currentPlanId = plan?.id ?? 'free'
  const cancelAtPeriodEnd = billing?.cancelAtPeriodEnd ?? false

  const handleFreePlan = () => {
    if (isSignedIn) {
      router.push('/chat')
    } else {
      router.push('/sign-up')
    }
  }

  const handleProPlan = () => {
    if (currentPlanId === 'pro') {
      setCancelPlanName('Pro')
      setCancelModalOpen(true)
    } else {
      initiateRazorpayCheckout('pro')
    }
  }

  const handleBusinessPlan = () => {
    if (currentPlanId === 'business') {
      setCancelPlanName('Business')
      setCancelModalOpen(true)
    } else {
      window.location.href = 'mailto:rudrasatani@missi.space'
    }
  }

  const handleConfirmCancel = () => {
    setCancelModalOpen(false)
    cancelSubscription()
  }

  // Button labels
  const freeButtonLabel =
    currentPlanId === 'free' ? 'Current Plan' : 'Get Started'

  const proButtonLabel =
    currentPlanId === 'pro'
      ? (isCancelling ? 'Cancelling...' : cancelAtPeriodEnd ? 'Cancellation Pending' : 'Cancel Subscription')
      : 'Upgrade to Pro'

  const businessButtonLabel =
    currentPlanId === 'business'
      ? (isCancelling ? 'Cancelling...' : cancelAtPeriodEnd ? 'Cancellation Pending' : 'Cancel Subscription')
      : 'Contact Us'

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
      {/* Celebration Animation */}
      {showCelebration && (
        <CelebrationOverlay
          planName={celebrationPlanName}
          onComplete={handleCelebrationComplete}
        />
      )}

      {/* Cancel Modal */}
      <CancelModal
        planName={cancelPlanName}
        isOpen={cancelModalOpen}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelModalOpen(false)}
        isLoading={isCancelling}
      />

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
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          Back to Chat
          <ArrowRight style={{ width: 10, height: 10 }} />
        </Link>
      </nav>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px 80px' }}>
        {/* Cancellation pending banner */}
        {cancelAtPeriodEnd && currentPlanId !== 'free' && (
          <div
            data-testid="cancel-pending-banner"
            style={{
              textAlign: 'center',
              marginBottom: 32,
              padding: '12px 20px',
              borderRadius: 10,
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.2)',
              fontSize: 13,
              color: 'rgba(245,158,11,0.9)',
            }}
          >
            Your {plan?.name} subscription will cancel at the end of the current billing period.
          </div>
        )}

        {/* Success message */}
        {successMessage && (
          <div
            data-testid="pricing-success-message"
            style={{
              textAlign: 'center',
              marginBottom: 32,
              padding: '12px 20px',
              borderRadius: 10,
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.2)',
              fontSize: 13,
              color: 'rgba(34,197,94,0.9)',
            }}
          >
            {successMessage}
          </div>
        )}

        {/* Billing error */}
        {billingError && (
          <div
            data-testid="billing-error-message"
            style={{
              textAlign: 'center',
              marginBottom: 32,
              padding: '12px 20px',
              borderRadius: 10,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
              fontSize: 13,
              color: 'rgba(239,68,68,0.9)',
            }}
          >
            {billingError}
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
              {currentPlanId === 'free' ? 'Pricing' : 'Manage Plan'}
            </span>
          </div>
          <h1
            data-testid="pricing-heading"
            style={{ fontSize: 28, fontWeight: 600, marginBottom: 10, letterSpacing: '-0.02em' }}
          >
            {currentPlanId === 'free' ? 'Simple, honest pricing' : `You're on ${plan?.name ?? 'Pro'}`}
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', maxWidth: 400, margin: '0 auto' }}>
            {currentPlanId === 'free'
              ? 'Start free. Upgrade when missiAI becomes part of your life.'
              : 'Manage your subscription or explore other plans.'}
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
            isCurrentPlan={currentPlanId === 'free'}
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
            isCurrentPlan={currentPlanId === 'pro'}
            isMostPopular={currentPlanId === 'free'}
            showPaymentBadges={currentPlanId !== 'pro'}
            features={[
              'Unlimited voice interactions',
              'All 4 personalities',
              'Full memory graph (unlimited facts)',
              'Proactive intelligence',
              'Plugin integrations',
              'Priority response speed',
            ]}
            onSelect={handleProPlan}
            isLoading={isLoading || isUpgrading || isCancelling}
            buttonLabel={isUpgrading ? 'Processing...' : proButtonLabel}
          />

          <PlanCard
            name="Business"
            price={49}
            planId="business"
            currentPlanId={currentPlanId}
            isCurrentPlan={currentPlanId === 'business'}
            showPaymentBadges={currentPlanId !== 'business'}
            features={[
              'Everything in Pro',
              'API access',
              'Team features (coming soon)',
              'Priority support',
              'Custom integrations',
            ]}
            onSelect={handleBusinessPlan}
            isLoading={isLoading || isCancelling}
            buttonLabel={businessButtonLabel}
          />
        </div>

        {/* Powered by */}
        <div
          data-testid="powered-by-razorpay"
          style={{
            textAlign: 'center',
            marginBottom: 48,
            fontSize: 11,
            color: 'rgba(255,255,255,0.2)',
          }}
        >
          Powered by Razorpay
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
            answer="Yes, cancel from your subscription settings anytime. Your plan stays active until the end of the billing period."
          />
          <FAQItem
            question="What happens to my memories if I downgrade?"
            answer="Your memories are preserved. You'll still have access to your basic memory (20 most recent facts) on the free plan."
          />
          <FAQItem
            question="Is there a free trial?"
            answer="The free tier is permanent — no credit card needed. Use it as long as you want, and upgrade whenever you're ready."
          />
          <FAQItem
            question="What payment methods are supported?"
            answer="We accept UPI, debit/credit cards, net banking, and popular wallets through Razorpay's secure payment gateway."
          />
        </div>
      </div>
    </div>
  )
}
