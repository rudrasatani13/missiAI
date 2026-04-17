'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { useBilling } from '@/hooks/useBilling'
import { useReferral } from '@/hooks/useReferral'
import { Check, X, Sparkles, ChevronDown, AlertTriangle, Crown, ArrowRight, Gift, Copy, Users, Award } from 'lucide-react'
import { CelebrationOverlay } from '@/components/ui/CelebrationOverlay'
import type { PlanId } from '@/types/billing'

function PaymentBadges() {
  const badges = ['UPI', 'Card', 'Net Banking', 'Wallets']
  return (
    <div
      data-testid="payment-badges"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 12,
      }}
    >
      {badges.map((badge) => (
        <span
          key={badge}
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.4)',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
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
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
      onClick={onCancel}
    >
      <div
        data-testid="cancel-modal-content"
        style={{
          background: 'rgba(20,20,26,0.85)',
          backdropFilter: 'blur(24px) saturate(140%)',
          WebkitBackdropFilter: 'blur(24px) saturate(140%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: '32px 28px',
          maxWidth: 400,
          width: '90%',
          textAlign: 'center',
          boxShadow:
            '0 20px 50px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <AlertTriangle style={{ width: 28, height: 28, color: 'rgba(245,158,11,0.85)' }} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 500, color: '#fff', marginBottom: 8, letterSpacing: '-0.02em' }}>
          Cancel {planName} Subscription?
        </h3>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginBottom: 24, lineHeight: 1.6 }}>
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
              fontWeight: 500,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.85)',
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
              background: 'rgba(239,68,68,0.72)',
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
  // Only the recommended card gets full glass; others get plain fill.
  // Hierarchy through contrast, not stickers.
  const isGlass = Boolean(isMostPopular) && !isCurrentPlan

  return (
    <div
      data-testid={`plan-card-${planId}`}
      style={{
        position: 'relative',
        background: isGlass
          ? 'rgba(20,20,26,0.55)'
          : 'rgba(255,255,255,0.02)',
        backdropFilter: isGlass ? 'blur(24px) saturate(140%)' : undefined,
        WebkitBackdropFilter: isGlass ? 'blur(24px) saturate(140%)' : undefined,
        border: isCurrentPlan
          ? '1px solid rgba(255,255,255,0.18)'
          : isGlass
            ? '1px solid rgba(255,255,255,0.08)'
            : '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14,
        padding: '28px 22px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: isGlass
          ? '0 20px 50px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)'
          : 'none',
      }}
    >
      {/* Current Plan — minimal eyebrow marker, no sticker */}
      {isCurrentPlan && (
        <div
          data-testid="current-plan-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            alignSelf: 'flex-start',
            marginBottom: 14,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          <Crown style={{ width: 10, height: 10 }} />
          Current
        </div>
      )}

      {/* Most Popular — minimal eyebrow marker */}
      {isMostPopular && !isCurrentPlan && (
        <div
          data-testid="most-popular-badge"
          style={{
            alignSelf: 'flex-start',
            marginBottom: 14,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.75)',
          }}
        >
          Recommended
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <h3
          style={{
            fontSize: 15,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.75)',
            letterSpacing: '0.02em',
            marginBottom: 10,
          }}
        >
          {name}
        </h3>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span
            style={{
              fontSize: 36,
              fontWeight: 500,
              color: '#fff',
              letterSpacing: '-0.03em',
              lineHeight: 1,
            }}
          >
            ${price}
          </span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
            /month
          </span>
        </div>
        {showPaymentBadges && <PaymentBadges />}
      </div>

      <div style={{ flex: 1, marginBottom: 24 }}>
        {features.map((f, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              marginBottom: 10,
            }}
          >
            <Check
              style={{
                width: 14,
                height: 14,
                color: 'rgba(255,255,255,0.55)',
                flexShrink: 0,
                marginTop: 3,
              }}
            />
            <span
              style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.55,
              }}
            >
              {f}
            </span>
          </div>
        ))}
        {disabledFeatures?.map((f, i) => (
          <div
            key={`d-${i}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              marginBottom: 10,
              opacity: 0.4,
            }}
          >
            <X
              style={{
                width: 14,
                height: 14,
                color: 'rgba(255,255,255,0.55)',
                flexShrink: 0,
                marginTop: 3,
              }}
            />
            <span
              style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.55,
              }}
            >
              {f}
            </span>
          </div>
        ))}
      </div>

      <button
        data-testid={`plan-btn-${planId}`}
        onClick={onSelect}
        disabled={isLoading || (isCurrentPlan && planId === 'free')}
        className="active:scale-[0.97] transition-transform"
        style={{
          width: '100%',
          padding: '11px 0',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.01em',
          cursor:
            isLoading || (isCurrentPlan && planId === 'free')
              ? 'default'
              : 'pointer',
          border: 'none',
          background: isCurrentPlan
            ? planId === 'free'
              ? 'rgba(255,255,255,0.03)'
              : 'rgba(255,255,255,0.06)'
            : isGlass
              ? '#fff'
              : 'rgba(255,255,255,0.06)',
          color: isCurrentPlan
            ? planId === 'free'
              ? 'rgba(255,255,255,0.35)'
              : 'rgba(255,255,255,0.75)'
            : isGlass
              ? '#0c0c10'
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
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '16px 0',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.85)',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          padding: 0,
          fontSize: 14,
          fontWeight: 400,
          textAlign: 'left',
          letterSpacing: '-0.01em',
        }}
      >
        {question}
        <ChevronDown
          style={{
            width: 16,
            height: 16,
            color: 'rgba(255,255,255,0.4)',
            transition: 'transform 0.2s ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        />
      </button>
      {open && (
        <p
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.5)',
            marginTop: 10,
            lineHeight: 1.65,
          }}
        >
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
    error: billingError, initiateCheckout, cancelSubscription, refreshBilling,
  } = useBilling()

  const {
    referral, isReferred, copied, getReferralLink, copyReferralLink, hasReferralDiscount,
  } = useReferral()

  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const prevPlanRef = useRef<string | null>(null)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelPlanName, setCancelPlanName] = useState('')
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebrationPlanName, setCelebrationPlanName] = useState('')
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null)

  useEffect(() => {
    if (!isUpgrading) {
      setUpgradingPlan(null)
    }
  }, [isUpgrading])

  // Detect plan upgrade and trigger celebration
  useEffect(() => {
    if (plan) {
      if (prevPlanRef.current === 'free' && (plan.id === 'plus' || plan.id === 'pro')) {
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

  const handlePlusPlan = () => {
    if (currentPlanId === 'plus') {
      setCancelPlanName('Plus')
      setCancelModalOpen(true)
    } else {
      setUpgradingPlan('plus')
      initiateCheckout('plus')
    }
  }

  const handleProPlan = () => {
    if (currentPlanId === 'pro') {
      setCancelPlanName('Pro')
      setCancelModalOpen(true)
    } else {
      setUpgradingPlan('pro')
      initiateCheckout('pro')
    }
  }

  const handleConfirmCancel = () => {
    setCancelModalOpen(false)
    cancelSubscription()
  }

  // Button labels
  const freeButtonLabel =
    currentPlanId === 'free' ? 'Current Plan' : 'Get Started'

  const plusButtonLabel =
    currentPlanId === 'plus'
      ? (isCancelling ? 'Cancelling...' : cancelAtPeriodEnd ? 'Cancellation Pending' : 'Cancel Subscription')
      : 'Upgrade to Plus'

  const proButtonLabel =
    currentPlanId === 'pro'
      ? (isCancelling ? 'Cancelling...' : cancelAtPeriodEnd ? 'Cancellation Pending' : 'Cancel Subscription')
      : 'Upgrade to Pro'

  return (
    <div
      data-testid="pricing-page"
      style={{
        minHeight: '100vh',
        background: '#060608',
        color: '#fff',
        fontFamily: 'var(--font-body)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient field — fixed, very soft cool white-blue orbs */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '-15%',
            left: '-10%',
            width: 520,
            height: 520,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(190,210,240,0.08) 0%, transparent 70%)',
            filter: 'blur(120px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-20%',
            right: '-10%',
            width: 480,
            height: 480,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(170,190,220,0.06) 0%, transparent 70%)',
            filter: 'blur(120px)',
          }}
        />
      </div>

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
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 24px',
        }}
      >
        <Link
          href="/"
          data-testid="pricing-home-link"
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.45)',
            textDecoration: 'none',
            letterSpacing: '0.02em',
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
            color: 'rgba(255,255,255,0.45)',
            textDecoration: 'none',
            letterSpacing: '0.02em',
            transition: 'color 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          Back to Chat
          <ArrowRight style={{ width: 10, height: 10 }} />
        </Link>
      </nav>

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 880,
          margin: '0 auto',
          padding: '32px 24px 80px',
        }}
      >
        {/* Cancellation pending banner */}
        {cancelAtPeriodEnd && currentPlanId !== 'free' && (
          <div
            data-testid="cancel-pending-banner"
            style={{
              textAlign: 'center',
              marginBottom: 24,
              padding: '12px 20px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              fontSize: 13,
              color: 'rgba(255,255,255,0.75)',
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
              marginBottom: 24,
              padding: '12px 20px',
              borderRadius: 10,
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.18)',
              fontSize: 13,
              color: 'rgba(134,239,172,0.9)',
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
              marginBottom: 24,
              padding: '12px 20px',
              borderRadius: 10,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.18)',
              fontSize: 13,
              color: 'rgba(252,165,165,0.9)',
            }}
          >
            {billingError}
          </div>
        )}

        {/* Header */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: 48,
            maxWidth: 480,
            margin: '0 auto 48px',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 20,
              padding: '4px 11px',
              borderRadius: 20,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Sparkles
              style={{ width: 11, height: 11, color: 'rgba(255,255,255,0.5)' }}
            />
            <span
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.45)',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              {currentPlanId === 'free' ? 'Plans & Pricing' : 'Manage Plan'}
            </span>
          </div>
          <h1
            data-testid="pricing-heading"
            style={{
              fontSize: 32,
              fontWeight: 500,
              marginBottom: 12,
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              color: '#fff',
            }}
          >
            {currentPlanId === 'free'
              ? 'One AI. Your entire life.'
              : `You're on ${plan?.name ?? 'Pro'}`}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.5)',
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            {currentPlanId === 'free'
              ? 'Start free — no credit card needed. Upgrade when Missi becomes indispensable.'
              : 'Manage your subscription or explore other plans below.'}
          </p>
        </div>

        {/* Plan cards */}
        <div
          data-testid="plan-cards-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
            marginBottom: 48,
          }}
        >
          <PlanCard
            name="Free"
            price={0}
            planId="free"
            currentPlanId={currentPlanId}
            isCurrentPlan={currentPlanId === 'free'}
            features={[
              '10 minutes of voice per day',
              'Real-time Gemini Live voice',
              '1 personality mode',
              'Basic memory — up to 20 facts',
              'Visual Memory — 10 images/day',
              'Daily mission (1 per day)',
              'Mood & streak tracking',
            ]}
            disabledFeatures={[
              'AI voice personas (Calm, Coach, etc.)',
              'Extended voice (2hr/day)',
              'Full memory graph',
              'Plugin integrations',
            ]}
            onSelect={handleFreePlan}
            isLoading={isLoading}
            buttonLabel={freeButtonLabel}
          />

          <PlanCard
            name="Plus"
            price={9}
            planId="plus"
            currentPlanId={currentPlanId}
            isCurrentPlan={currentPlanId === 'plus'}
            isMostPopular={currentPlanId === 'free'}
            showPaymentBadges={currentPlanId !== 'plus'}
            features={[
              '2 hours of voice per day',
              '5 AI voice personas (Calm, Coach, Friend & more)',
              'All 4 personality profiles',
              'Full memory graph — unlimited facts',
              'Visual Memory — 50 images/day',
              'Daily missions (3 per day)',
              'Proactive nudges & smart reminders',
              'Plugin integrations (Notion, Calendar)',
              'Mood insights & streak rewards',
            ]}
            onSelect={handlePlusPlan}
            isLoading={isLoading || (isUpgrading && upgradingPlan === 'plus') || isCancelling}
            buttonLabel={(isUpgrading && upgradingPlan === 'plus') ? 'Processing...' : plusButtonLabel}
          />

          <PlanCard
            name="Pro"
            price={19}
            planId="pro"
            currentPlanId={currentPlanId}
            isCurrentPlan={currentPlanId === 'pro'}
            showPaymentBadges={currentPlanId !== 'pro'}
            features={[
              'Unlimited voice interactions',
              'Everything in Plus',
              '5 AI voice personas — unlimited usage',
              'Unlimited daily missions (10/day)',
              'Priority response speed',
              'Visual Memory — 50 images/day',
              'API access for custom integrations',
              'Dedicated priority support',
            ]}
            onSelect={handleProPlan}
            isLoading={isLoading || (isUpgrading && upgradingPlan === 'pro') || isCancelling}
            buttonLabel={(isUpgrading && upgradingPlan === 'pro') ? 'Processing...' : proButtonLabel}
          />
        </div>

        {/* Powered by */}
        <div
          data-testid="powered-by-dodo"
          style={{
            textAlign: 'center',
            marginBottom: 32,
            fontSize: 11,
            color: 'rgba(255,255,255,0.35)',
            letterSpacing: '0.02em',
          }}
        >
          Powered by Dodo Payments
        </div>

        {/* Referral Discount Banner — shown if user came via referral link and is on free plan */}
        {hasReferralDiscount() && currentPlanId === 'free' && (
          <div
            data-testid="referral-discount-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              marginBottom: 32,
              padding: '12px 20px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Gift style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.65)', flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: 0, textAlign: 'center' }}>
              <span style={{ fontWeight: 500, color: '#fff' }}>20% referral discount</span>
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>
                {' '}· 6 extra free days on your first month
              </span>
            </p>
          </div>
        )}

        {/* Referral Section — thin glass strip */}
        {isSignedIn && (
          <div
            data-testid="referral-section"
            style={{
              marginBottom: 48,
              padding: '14px 18px',
              borderRadius: 14,
              background: 'rgba(20,20,26,0.55)',
              backdropFilter: 'blur(24px) saturate(140%)',
              WebkitBackdropFilter: 'blur(24px) saturate(140%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow:
                '0 20px 50px -20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Gift style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.6)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#fff',
                      margin: 0,
                      lineHeight: 1.3,
                    }}
                  >
                    Invite friends, earn rewards
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.45)',
                      margin: '2px 0 0',
                      lineHeight: 1.3,
                    }}
                  >
                    You get 7 free days, they get 20% off
                  </p>
                </div>
              </div>

              {referral && (
                <div
                  data-testid="referral-stats"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.5)',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Users style={{ width: 11, height: 11, color: 'rgba(255,255,255,0.4)' }} />
                    <strong style={{ color: '#fff', fontWeight: 600 }}>
                      {referral.successfulReferred}
                    </strong>{' '}
                    joined
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Award style={{ width: 11, height: 11, color: 'rgba(255,255,255,0.4)' }} />
                    <strong style={{ color: '#fff', fontWeight: 600 }}>
                      {referral.rewardDaysEarned}
                    </strong>{' '}
                    days
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Gift style={{ width: 11, height: 11, color: 'rgba(255,255,255,0.4)' }} />
                    <strong style={{ color: '#fff', fontWeight: 600 }}>
                      {referral.remainingSlots}
                    </strong>{' '}
                    slots
                  </span>
                </div>
              )}
            </div>

            {/* Referral Link */}
            {referral && (
              <div
                data-testid="referral-link-box"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px 8px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <input
                  readOnly
                  value={getReferralLink()}
                  data-testid="referral-link-input"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                  }}
                />
                <button
                  data-testid="copy-referral-btn"
                  onClick={copyReferralLink}
                  className="active:scale-[0.97] transition-transform"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 11px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    border: '1px solid rgba(255,255,255,0.08)',
                    cursor: 'pointer',
                    background: copied
                      ? 'rgba(34,197,94,0.15)'
                      : 'rgba(255,255,255,0.06)',
                    color: copied ? 'rgba(134,239,172,0.95)' : '#fff',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <Copy style={{ width: 11, height: 11 }} />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* FAQ */}
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2
            data-testid="faq-heading"
            style={{
              fontSize: 18,
              fontWeight: 500,
              marginBottom: 20,
              textAlign: 'center',
              letterSpacing: '-0.02em',
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            Common questions
          </h2>
          <FAQItem
            question="Can I cancel anytime?"
            answer="Yes — always. Cancel from your account settings whenever you want. Your plan stays active until the end of your billing period with no surprise charges."
          />
          <FAQItem
            question="What happens to my memories if I downgrade?"
            answer="Your data is never deleted. On the free plan you'll have access to the 20 most recently stored facts. The rest are safely preserved and come back the moment you re-upgrade."
          />
          <FAQItem
            question="Is there a free trial for Pro?"
            answer="The free tier is permanent — no credit card required. Take as long as you need. Upgrade when you're ready for unlimited access."
          />
          <FAQItem
            question="What payment methods are supported?"
            answer="We support all major payment methods including cards, UPI, net banking, and wallets — all processed securely through Dodo Payments."
          />
          <FAQItem
            question="What are AI voice personas?"
            answer="AI voice personas let you talk to Missi in different characters — like a Calm Therapist, Energetic Coach, Sassy Friend, Bollywood Narrator, or Desi Mom. Each persona has a unique voice and personality. Available on Plus and Pro plans."
          />
          <FAQItem
            question="Is my data safe?"
            answer="Yes. All memory data is encrypted in transit and at rest. Your conversations and personal facts are private and never used for model training."
          />
        </div>
      </div>
    </div>
  )
}
