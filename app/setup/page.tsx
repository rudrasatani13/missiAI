'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { ArrowRight, Loader2, Sparkles } from 'lucide-react'
import { hasCompletedSetupLocally, markSetupCompleteLocally } from '@/lib/setup/setup-completion'

export default function SetupPage() {
  const router = useRouter()
  const { user, isLoaded } = useUser()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [occupation, setOccupation] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded || !user) return

    const metadata = (user.publicMetadata as { setupComplete?: boolean } | undefined)?.setupComplete
    const setupDone = Boolean(metadata) || hasCompletedSetupLocally()

    if (!setupDone) return

    markSetupCompleteLocally()
    router.replace('/chat')
  }, [isLoaded, router, user])

  const handleNext = () => {
    if (step === 1 && name.trim().length < 2) {
      setError('Please enter a valid name')
      return
    }
    setError(null)
    setStep((s) => s + 1)
  }

  const handleSubmit = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setError(null)

    try {
      // Persist name locally so it's available everywhere instantly
      try { localStorage.setItem('missi-user-name', name.trim()) } catch {}

      const res = await fetch('/api/v1/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), dob: dob.trim(), occupation: occupation.trim() }),
      })

      const data = await res.json()

      if (data.success) {
        markSetupCompleteLocally()
        router.replace('/chat?new=true')
      } else {
        setError(data.error ?? 'Failed to save setup data')
        setIsSubmitting(false)
      }
    } catch {
      setError('An unexpected error occurred')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 bg-[var(--missi-bg)] text-[var(--missi-text-primary)] relative overflow-hidden">
      
      {/* Background Decorative Gradient */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, var(--missi-border) 0%, rgba(0,0,0,0) 70%)' }}
      />

      <div
        className="w-full max-w-md relative z-10 p-8 bg-[var(--missi-surface)] border border-[var(--missi-border)]"
        style={{ borderRadius: '24px', boxShadow: 'var(--elevated-shadow-strong)' }}
      >
        
        {/* Progress indicator */}
        <div className="flex gap-2 mb-8">
          <div className="h-1 flex-1 rounded-full bg-[var(--missi-surface)] overflow-hidden">
            <div className="h-full bg-[var(--missi-nav-text-active)] transition-all duration-500 w-full" />
          </div>
          <div className="h-1 flex-1 rounded-full bg-[var(--missi-surface)] overflow-hidden">
            <div 
              className="h-full bg-[var(--missi-nav-text-active)] transition-all duration-500" 
              style={{ width: step >= 2 ? '100%' : '0%' }}
            />
          </div>
          <div className="h-1 flex-1 rounded-full bg-[var(--missi-surface)] overflow-hidden">
            <div 
              className="h-full bg-[var(--missi-nav-text-active)] transition-all duration-500" 
              style={{ width: step >= 3 ? '100%' : '0%' }}
            />
          </div>
        </div>

        {/* Step 1: Name */}
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-2xl mb-2 font-medium tracking-tight">What should Missi call you?</h1>
            <p className="text-[var(--missi-text-secondary)] text-sm mb-6">This helps Missi address you naturally.</p>
            
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNext()
              }}
              placeholder="Your name..."
              className="w-full bg-[var(--missi-surface)] border border-[var(--missi-border)] rounded-xl px-4 py-3 text-lg outline-none focus:border-[var(--missi-border-strong)] transition-colors mb-6 placeholder:text-[var(--missi-text-muted)]"
              autoFocus
            />

            {error && <p className="text-destructive text-sm mb-4">{error}</p>}

            <button
              onClick={handleNext}
              className="w-full flex items-center justify-center gap-2 bg-[var(--missi-nav-text-active)] text-[var(--missi-bg)] py-3 px-4 rounded-xl font-medium transition-transform hover:scale-[1.02] active:scale-95"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: Date of Birth */}
        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-2xl mb-2 font-medium tracking-tight">When were you born?</h1>
            <p className="text-[var(--missi-text-secondary)] text-sm mb-6">This helps Missi understand your age and astrology context. (Optional)</p>
            
            <input
              type="date"
              value={dob}
              onChange={(e) => {
                setDob(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNext()
              }}
              className="w-full bg-[var(--missi-surface)] border border-[var(--missi-border)] rounded-xl px-4 py-3 text-lg outline-none focus:border-[var(--missi-border-strong)] transition-colors mb-6 text-[var(--missi-text-primary)]"
              style={{
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                appearance: 'none',
                textAlign: 'left',
                minHeight: '48px',
                lineHeight: '1.5',
                display: 'flex',
                alignItems: 'center',
              }}
              autoFocus
            />

            {error && <p className="text-destructive text-sm mb-4">{error}</p>}

            <button
              onClick={handleNext}
              className="w-full flex items-center justify-center gap-2 bg-[var(--missi-nav-text-active)] text-[var(--missi-bg)] py-3 px-4 rounded-xl font-medium transition-transform hover:scale-[1.02] active:scale-95"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setStep(1)}
              className="w-full text-[var(--missi-text-muted)] text-sm mt-4 hover:text-[var(--missi-text-secondary)] transition-colors"
            >
              Back
            </button>
          </div>
        )}

        {/* Step 3: Occupation/Profile */}
        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-2xl mb-2 font-medium tracking-tight">What do you do?</h1>
            <p className="text-[var(--missi-text-secondary)] text-sm mb-6">e.g. Student, Software Engineer, Designer. This personalizes Missi's context.</p>
            
            <input
              type="text"
              value={occupation}
              onChange={(e) => {
                setOccupation(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
              }}
              placeholder="Your occupation (optional)..."
              className="w-full bg-[var(--missi-surface)] border border-[var(--missi-border)] rounded-xl px-4 py-3 text-lg outline-none focus:border-[var(--missi-border-strong)] transition-colors mb-6 placeholder:text-[var(--missi-text-muted)]"
              autoFocus
            />

            {error && <p className="text-destructive text-sm mb-4">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-[var(--missi-nav-text-active)] text-[var(--missi-bg)] py-3 px-4 rounded-xl font-medium transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:hover:scale-100"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Setup Complete...
                </>
              ) : (
                <>
                  Start Chatting <Sparkles className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              onClick={() => setStep(2)}
              className="w-full text-[var(--missi-text-muted)] text-sm mt-4 hover:text-[var(--missi-text-secondary)] transition-colors"
            >
              Back
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
