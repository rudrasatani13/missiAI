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
      className="hover:scale-[1.01]"
      style={{
        position: 'relative',
        background: isCurrentPlan
          ? 'rgba(255,255,255,0.06)'
          : 'rgba(255,255,255,0.02)',
        backdropFilter: 'blur(20px)',
        border: isCurrentPlan
          ? '1px solid rgba(255,255,255,0.25)'
          : '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease',
        boxShadow: isCurrentPlan
          ? '0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.05)'
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
            background: '#fff',
            color: '#000',
            fontSize: 10,
            fontWeight: 700,
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
            background: '#fff',
            color: '#000',
            fontSize: 10,
            fontWeight: 700,
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
            <Check style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.6)', flexShrink: 0, marginTop: 2 }} />
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
              ? 'rgba(255,255,255,0.04)'
              : 'rgba(255,255,255,0.08)'
            : isMostPopular
              ? '#fff'
              : 'rgba(255,255,255,0.08)',
          color: isCurrentPlan
            ? planId === 'free'
              ? 'rgba(255,255,255,0.3)'
              : 'rgba(255,255,255,0.7)'
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
      initiateCheckout('pro')
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
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              fontSize: 13,
              color: 'rgba(255,255,255,0.7)',
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
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <Sparkles style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.5)' }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
              {currentPlanId === 'free' ? 'Plans & Pricing' : 'Manage Plan'}
            </span>
          </div>
          <h1
            data-testid="pricing-heading"
            style={{ fontSize: 32, fontWeight: 700, marginBottom: 12, letterSpacing: '-0.03em', lineHeight: 1.1 }}
          >
            {currentPlanId === 'free' ? 'One AI. Your entire life.' : `You're on ${plan?.name ?? 'Pro'}`}
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
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
              '10 voice interactions per day',
              '1 personality mode',
              'Basic memory — up to 20 facts',
              'Action engine for quick tasks',
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
              'All 4 personality profiles',
              'Full memory graph — unlimited facts',
              'Proactive nudges & intelligent reminders',
              'Plugin integrations (Notion, Calendar…)',
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
              'REST API access',
              'Team workspace (coming soon)',
              'Dedicated priority support',
              'Custom model integrations',
            ]}
            onSelect={handleBusinessPlan}
            isLoading={isLoading || isCancelling}
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

        {/* Referral Discount Banner — shown if user came via referral link and is on free plan */}
        {hasReferralDiscount() && currentPlanId === 'free' && (
          <div
            data-testid="referral-discount-banner"
            style={{
              textAlign: 'center',
              marginBottom: 48,
              padding: '16px 24px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <Gift style={{ width: 20, height: 20, color: '#fff', display: 'inline', marginBottom: 4 }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
              You have a 20% referral discount!
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              Upgrade now and get 6 extra free days on your first month
            </p>
          </div>
        )}

        {/* Referral Section — Invite Friends */}
        {isSignedIn && (
          <div
            data-testid="referral-section"
            style={{
              marginBottom: 48,
              padding: '28px 24px',
              borderRadius: 16,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Gift style={{ width: 16, height: 16, color: 'rgba(255,255,255,0.6)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>
                Invite Friends, Earn Rewards
              </h3>
            </div>

            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20, lineHeight: 1.6 }}>
              Share your referral link. When a friend upgrades, you get <span style={{ color: '#fff', fontWeight: 600 }}>7 extra free days</span> and they get <span style={{ color: '#fff', fontWeight: 600 }}>20% off</span> their first month.
            </p>

            {/* Referral Link */}
            {referral && (
              <>
                <div
                  data-testid="referral-link-box"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 20,
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <input
                    readOnly
                    value={getReferralLink()}
                    data-testid="referral-link-input"
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: 12,
                      fontFamily: 'monospace',
                    }}
                  />
                  <button
                    data-testid="copy-referral-btn"
                    onClick={copyReferralLink}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: copied ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)',
                      color: copied ? '#22c55e' : '#fff',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Copy style={{ width: 12, height: 12 }} />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                {/* Referral Stats */}
                <div
                  data-testid="referral-stats"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '12px 8px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <Users style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.3)', margin: '0 auto 6px' }} />
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
                      {referral.successfulReferred}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                      Friends Joined
                    </div>
                  </div>
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '12px 8px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <Award style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.5)', margin: '0 auto 6px' }} />
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
                      {referral.rewardDaysEarned}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                      Days Earned
                    </div>
                  </div>
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '12px 8px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <Gift style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.3)', margin: '0 auto 6px' }} />
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
                      {referral.remainingSlots}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                      Slots Left
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* FAQ */}
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2
            data-testid="faq-heading"
            style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, textAlign: 'center', letterSpacing: '-0.02em' }}
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
            question="Is my data safe?"
            answer="Yes. All memory data is encrypted in transit and at rest. Your conversations and personal facts are private and never used for model training."
          />
        </div>
      </div>
    </div>
  )
}
