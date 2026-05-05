'use client'

import { useState, useEffect } from 'react'
import { ChatShell } from '@/components/shell/ChatShell'

// ─── Types ────────────────────────────────────────────────────────────────────

type WAStep = 'idle' | 'generating' | 'show_code' | 'linked'
type TGStep = 'idle' | 'loading' | 'show_link' | 'linked'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  return (
    <ChatShell>
      <div className="min-h-full text-[var(--missi-text-primary)]">
        <div className="max-w-xl mx-auto px-4 pb-12 pt-6 md:pt-12">
          <h1 className="text-2xl font-semibold mb-1">Messaging Integrations</h1>
          <p className="text-[var(--missi-text-secondary)] text-sm mb-8">
            Chat with Missi on WhatsApp and Telegram. Pro plan required.
          </p>

          <div className="space-y-6">
            <WhatsAppCard />
            <TelegramCard />
          </div>
        </div>
      </div>
    </ChatShell>
  )
}

// ─── WhatsApp Card ────────────────────────────────────────────────────────────

function WhatsAppCard() {
  const [step, setStep] = useState<WAStep>('idle')
  const [linkCode, setLinkCode] = useState('')
  const [botPhone, setBotPhone] = useState('')
  const [error, setError] = useState('')
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null)
  const [statusLoaded, setStatusLoaded] = useState(false)

  // Initial status check
  useEffect(() => {
    fetch('/api/v1/bot/link/whatsapp')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.phone) {
          setLinkedPhone(d.data.phone)
          setStep('linked')
        }
      })
      .catch(() => {})
      .finally(() => setStatusLoaded(true))
  }, [])

  // Poll for link completion while showing code
  useEffect(() => {
    if (step !== 'show_code') return
    const id = setInterval(() => {
      fetch('/api/v1/bot/link/whatsapp')
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.data?.linked) {
            setLinkedPhone(d.data.phone ?? '')
            setStep('linked')
          }
        })
        .catch(() => {})
    }, 3000)
    return () => clearInterval(id)
  }, [step])

  async function generate() {
    setError('')
    setStep('generating')
    try {
      const res = await fetch('/api/v1/bot/link/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initiate' }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Failed to generate code')
        setStep('idle')
        return
      }
      setLinkCode(data.data.code)
      setBotPhone(data.data.botPhone ?? '')
      setStep('show_code')
    } catch {
      setError('Network error. Please try again.')
      setStep('idle')
    }
  }

  async function unlink() {
    setError('')
    try {
      const res = await fetch('/api/v1/bot/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'whatsapp' }),
      })
      const data = await res.json()
      if (data.success) {
        setLinkedPhone(null)
        setLinkCode('')
        setStep('idle')
      } else {
        setError(data.error ?? 'Failed to unlink')
      }
    } catch {
      setError('Network error. Please try again.')
    }
  }

  return (
    <Card
      icon={<WAIcon />}
      title="WhatsApp"
      description="Chat with Missi from your WhatsApp number."
    >
      {!statusLoaded && <p className="text-sm text-[var(--missi-text-secondary)]">Loading...</p>}

      {statusLoaded && step === 'linked' && (
        <LinkedState
          label={linkedPhone ? `Linked: ${linkedPhone}` : 'WhatsApp linked'}
          onUnlink={unlink}
        />
      )}

      {statusLoaded && step === 'idle' && (
        <div className="space-y-2">
          <button
            onClick={generate}
            className="px-4 py-2 rounded-lg bg-[var(--missi-nav-text-active)] text-[var(--missi-bg)] text-sm font-medium hover:opacity-90 transition-colors"
          >
            Link WhatsApp
          </button>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
      )}

      {statusLoaded && step === 'generating' && (
        <p className="text-sm text-[var(--missi-text-secondary)]">Generating code…</p>
      )}

      {statusLoaded && step === 'show_code' && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--missi-text-secondary)]">
            Open WhatsApp and send this code to{' '}
            <span className="text-[var(--missi-text-primary)] font-medium">{botPhone || 'the Missi bot number'}</span>:
          </p>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-mono font-bold tracking-widest text-[var(--missi-text-primary)] bg-[var(--missi-surface)] px-4 py-2 rounded-lg">
              {linkCode}
            </span>
          </div>
          <p className="text-xs text-[var(--missi-text-muted)]">
            Waiting for your WhatsApp message… This page will update automatically.
          </p>
          <div className="flex gap-2">
            <button onClick={generate} className="px-4 py-2 rounded-lg border border-[var(--missi-border)] text-sm text-[var(--missi-text-secondary)] hover:text-[var(--missi-text-primary)] hover:border-[var(--missi-border-strong)] transition-colors">
              New code
            </button>
            <button onClick={() => setStep('idle')} className="px-4 py-2 rounded-lg border border-[var(--missi-border)] text-sm text-[var(--missi-text-secondary)] hover:text-[var(--missi-text-primary)] hover:border-[var(--missi-border-strong)] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Telegram Card ────────────────────────────────────────────────────────────

function TelegramCard() {
  const [step, setStep] = useState<TGStep>('idle')
  const [deepLink, setDeepLink] = useState('')
  const [error, setError] = useState('')
  const [statusLoaded, setStatusLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/v1/bot/link/telegram')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.linked) {
          setStep('linked')
        }
      })
      .catch(() => {})
      .finally(() => setStatusLoaded(true))
  }, [])

  async function generateLink() {
    setError('')
    setStep('loading')
    try {
      const res = await fetch('/api/v1/bot/link/telegram', {
        method: 'POST',
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Failed to generate link')
        setStep('idle')
        return
      }
      setDeepLink(data.data.deepLink)
      setStep('show_link')
    } catch {
      setError('Network error. Please try again.')
      setStep('idle')
    }
  }

  async function unlink() {
    setError('')
    try {
      const res = await fetch('/api/v1/bot/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'telegram' }),
      })
      const data = await res.json()
      if (data.success) {
        setDeepLink('')
        setStep('idle')
      } else {
        setError(data.error ?? 'Failed to unlink')
      }
    } catch {
      setError('Network error. Please try again.')
    }
  }

  return (
    <Card
      icon={<TGIcon />}
      title="Telegram"
      description="Chat with Missi from your Telegram account."
    >
      {!statusLoaded && <p className="text-sm text-[var(--missi-text-secondary)]">Loading...</p>}

      {statusLoaded && step === 'linked' && (
        <LinkedState label="Telegram account linked" onUnlink={unlink} />
      )}

      {statusLoaded && step === 'idle' && (
        <button onClick={generateLink} className="px-4 py-2 rounded-lg bg-[var(--missi-nav-text-active)] text-[var(--missi-bg)] text-sm font-medium hover:opacity-90 transition-colors">
          Link Telegram
        </button>
      )}

      {statusLoaded && step === 'loading' && (
        <p className="text-sm text-[var(--missi-text-secondary)]">Generating link…</p>
      )}

      {statusLoaded && step === 'show_link' && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--missi-text-secondary)]">
            Open this link in Telegram within <span className="text-[var(--missi-text-primary)] font-medium">15 minutes</span>:
          </p>
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[var(--missi-accent)] text-sm underline break-all hover:opacity-85 transition-opacity"
          >
            {deepLink}
          </a>
          <div className="flex gap-2">
            <button onClick={generateLink} className="px-4 py-2 rounded-lg border border-[var(--missi-border)] text-sm text-[var(--missi-text-secondary)] hover:text-[var(--missi-text-primary)] hover:border-[var(--missi-border-strong)] transition-colors">Regenerate</button>
            <button onClick={() => setStep('idle')} className="px-4 py-2 rounded-lg border border-[var(--missi-border)] text-sm text-[var(--missi-text-secondary)] hover:text-[var(--missi-text-primary)] hover:border-[var(--missi-border-strong)] transition-colors">Cancel</button>
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
      )}

      {error && step !== 'show_link' && step !== 'idle' && (
        <p className="text-destructive text-xs mt-2">{error}</p>
      )}
    </Card>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Card({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[var(--missi-border)] bg-[var(--missi-surface)] p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[var(--missi-surface)] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="font-medium text-sm">{title}</h2>
          <p className="text-xs text-[var(--missi-text-secondary)]">{description}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function LinkedState({ label, onUnlink }: { label: string; onUnlink: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        <span className="text-sm text-[var(--missi-text-primary)]">{label}</span>
      </div>
      <button
        onClick={onUnlink}
        className="text-xs text-destructive hover:text-destructive/80 transition-colors"
      >
        Unlink
      </button>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function WAIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#25D366]" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function TGIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#2CA5E0]" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
}
