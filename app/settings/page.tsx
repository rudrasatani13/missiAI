"use client"

/**
 * Dedicated /settings full-page.
 *
 * Replaces the old "Settings" sliding sub-panel that used to live inside
 * ChatSidebar. All existing functionality (personality, voice engine toggle,
 * manage subscription, profile name edit) is preserved,
 * plus four new sections surfaced here for the first time:
 *   • AI Behavior Dials   — sliders (response length, warmth, humor, formality, creativity)
 *   • Notifications       — quiet hours + granular event toggles
 *   • Appearance & A11y   — theme, accent, font size, reduce motion, high contrast
 *   • Privacy & Data      — incognito (memory pause), analytics opt-out, export, delete account
 *
 * State is shared with the sidebar + chat page via useChatSettings
 * (localStorage-backed), so toggling anything here is instantly reflected
 * in every other surface.
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useUser, useClerk } from "@clerk/nextjs"
import {
  ArrowLeft,
  Bell,
  BellOff,
  BrainCircuit,
  Briefcase,
  Check,
  ChevronRight,
  Clock,
  Crown,
  Download,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Mic,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plug,
  RotateCcw,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Sun,
  Trash2,
  User as UserIcon,
  Volume2,
  Wand2,
  X as XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { ChatShell } from "@/components/shell/ChatShell"
import { useBilling } from "@/hooks/billing/useBilling"
import {
  DEFAULT_AI_DIALS,
  useChatSettings,
  type AccentColor,
  type FontScale,
  type ThemeMode,
} from "@/hooks/chat/useChatSettings"
import { PERSONALITY_OPTIONS, type PersonalityKey } from "@/types/chat"

// ──────────────────────────────────────────────────────────────────────────────
// Shared style tokens — pulled straight out of the existing sub-panel so the
// new page feels visually identical to the rest of the app (glass cards on
// near-black, thin borders, dim eyebrow labels).
// ──────────────────────────────────────────────────────────────────────────────

const eyebrow: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--missi-text-muted)",
  margin: 0,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--missi-text-primary)",
  margin: 0,
}

const sectionDesc: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 400,
  color: "var(--missi-text-secondary)",
  margin: "2px 0 0",
  lineHeight: 1.5,
}

// ──────────────────────────────────────────────────────────────────────────────
// Personality icon lookup — duplicates the sidebar's icon map. Kept local to
// avoid exporting it from ChatSidebar (which would widen that module's API).
// ──────────────────────────────────────────────────────────────────────────────

const PERSONALITY_ICON_MAP: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles className="w-4 h-4" />,
  Briefcase: <Briefcase className="w-4 h-4" />,
  BrainCircuit: <BrainCircuit className="w-4 h-4" />,
  Wand2: <Wand2 className="w-4 h-4" />,
}

// ──────────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push("/sign-in")
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded || !isSignedIn) return null

  return (
    <ChatShell>
      <SettingsPageInner />
    </ChatShell>
  )
}

function SettingsPageInner() {
  const router = useRouter()
  const { user } = useUser()
  const { signOut } = useClerk()
  const { plan } = useBilling()
  const settings = useChatSettings()

  const planId = plan?.id

  const userName = user?.firstName ?? user?.fullName ?? ""
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? ""
  const userImage = user?.imageUrl ?? null

  const handleLogout = useCallback(() => {
    signOut().catch(() => {})
    setTimeout(() => {
      window.location.href = "/"
    }, 400)
  }, [signOut])

  return (
    <div className="min-h-full text-[var(--missi-text-primary)]">
      <div className="max-w-3xl mx-auto px-4 md:px-6 pt-6 md:pt-10 pb-16">
        {/* Breadcrumb / back */}
        <button
          type="button"
          onClick={() => router.back()}
          className="group inline-flex items-center gap-1.5 text-xs text-[var(--missi-text-secondary)] hover:text-[var(--missi-text-secondary)] transition-colors mb-4"
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-1">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{
              width: 36,
              height: 36,
              background: "var(--missi-surface)",
              border: "1px solid var(--missi-border)",
            }}
          >
            <SettingsIcon className="w-4 h-4 text-[var(--missi-text-secondary)]" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="text-xs text-[var(--missi-text-muted)]">
              Manage your account, assistant behavior, voice, notifications and privacy.
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-5">
          <ProfileSection
            userName={userName}
            userEmail={userEmail}
            userImage={userImage}
            plan={planId}
            onNameSaved={settings.setUserName}
          />

          <PersonalitySection personality={settings.personality} />

          <AIBehaviorSection
            aiDials={settings.aiDials}
            updateAIDials={settings.updateAIDials}
            resetAIDials={settings.resetAIDials}
          />

          <VoiceSection voiceEnabled={settings.voiceEnabled} onToggle={settings.toggleVoice} />

          <NotificationsSection
            notifications={settings.notifications}
            updateNotifications={settings.updateNotifications}
          />

          <AppearanceSection
            appearance={settings.appearance}
            updateAppearance={settings.updateAppearance}
          />

          <PrivacySection
            privacy={settings.privacy}
            updatePrivacy={settings.updatePrivacy}
          />

          <IntegrationsSection />

          <SubscriptionSection planId={planId} />

          <DangerZoneSection onLogout={handleLogout} />
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Reusable primitives
// ──────────────────────────────────────────────────────────────────────────────

function Card({
  children,
  title,
  description,
  icon,
  trailing,
}: {
  children?: React.ReactNode
  title: string
  description?: string
  icon?: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <section
      className="rounded-2xl"
      style={{
        background: "var(--missi-surface)",
        border: "1px solid var(--missi-border)",
        padding: 18,
      }}
    >
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <div
              className="flex items-center justify-center rounded-lg flex-shrink-0"
              style={{
                width: 32,
                height: 32,
                background: "var(--missi-surface)",
                border: "1px solid var(--missi-border)",
                color: "var(--missi-text-secondary)",
              }}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h2 style={sectionTitle}>{title}</h2>
            {description && <p style={sectionDesc}>{description}</p>}
          </div>
        </div>
        {trailing}
      </header>
      {children}
    </section>
  )
}

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  onChange: () => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className="relative rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--missi-border)]"
      style={{
        width: 40,
        height: 22,
        background: checked ? "var(--missi-nav-text-active)" : "var(--missi-border)",
        border: checked ? "1px solid var(--missi-nav-text-active)" : "1px solid var(--missi-border)",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "var(--missi-bg)",
          left: checked ? 20 : 4,
          transition: "left 0.2s ease, background 0.2s ease",
          boxShadow: "0 1px 2px var(--missi-shadow)",
        }}
      />
    </button>
  )
}

function Row({
  label,
  description,
  icon,
  children,
}: {
  label: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {icon && <div className="text-[var(--missi-text-secondary)] mt-0.5 flex-shrink-0">{icon}</div>}
        <div className="min-w-0">
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--missi-text-primary)", margin: 0 }}>
            {label}
          </p>
          {description && (
            <p style={{ fontSize: 11, color: "var(--missi-text-secondary)", margin: "2px 0 0", lineHeight: 1.5 }}>
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function Divider() {
  return <hr style={{ height: 1, background: "var(--missi-surface)", border: "none", margin: "10px 0" }} />
}

function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  ariaLabel,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  ariaLabel?: string
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={ariaLabel}
      className="missi-slider"
      style={{ width: "100%" }}
    />
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Sections
// ──────────────────────────────────────────────────────────────────────────────

function ProfileSection({
  userName,
  userEmail,
  userImage,
  plan,
  onNameSaved,
}: {
  userName: string
  userEmail: string
  userImage: string | null
  plan: string | undefined
  onNameSaved: (name: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(userName)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(userName)
  }, [userName])

  const save = useCallback(async () => {
    const trimmed = draft.trim()
    if (trimmed.length < 1 || trimmed === userName) {
      setIsEditing(false)
      setDraft(userName)
      return
    }
    setSaving(true)
    try {
      await fetch("/api/v1/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      onNameSaved(trimmed)
      toast.success("Name updated")
    } catch {
      toast.error("Failed to update name")
    } finally {
      setSaving(false)
      setIsEditing(false)
    }
  }, [draft, userName, onNameSaved])

  const isPro = plan === "plus" || plan === "pro"

  return (
    <Card
      title="Profile"
      description="Your public identity on Missi."
      icon={<UserIcon className="w-4 h-4" />}
    >
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          {userImage ? (
            <img
              src={userImage}
              alt=""
              className="rounded-full"
              style={{ width: 56, height: 56, border: "1px solid var(--missi-border)" }}
            />
          ) : (
            <div
              className="rounded-full flex items-center justify-center"
              style={{
                width: 56,
                height: 56,
                background: "var(--missi-border)",
                border: "1px solid var(--missi-border)",
              }}
            >
              <UserIcon className="w-5 h-5 text-[var(--missi-text-secondary)]" />
            </div>
          )}
          {isPro && (
            <div
              className="absolute -bottom-0.5 -right-0.5 p-[3px] rounded-full border-2 border-[var(--missi-bg)] flex items-center justify-center"
              style={{ background: "var(--missi-accent)" }}
              title="PRO Member"
            >
              <Crown className="w-2.5 h-2.5 text-[var(--missi-text-primary)]" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save()
                  if (e.key === "Escape") {
                    setIsEditing(false)
                    setDraft(userName)
                  }
                }}
                autoFocus
                disabled={saving}
                className="outline-none"
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--missi-text-primary)",
                  background: "var(--missi-border)",
                  border: "1px solid var(--missi-border)",
                  borderRadius: 8,
                  padding: "6px 10px",
                  width: 180,
                }}
              />
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex items-center justify-center"
                style={{
                  width: 28,
                  height: 28,
                  background: "var(--missi-border)",
                  border: "1px solid var(--missi-border)",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "var(--missi-text-primary)",
                }}
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false)
                  setDraft(userName)
                }}
                className="flex items-center justify-center"
                style={{
                  width: 28,
                  height: 28,
                  background: "transparent",
                  border: "1px solid var(--missi-border)",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "var(--missi-text-secondary)",
                }}
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--missi-text-primary)", margin: 0 }}>{userName || "Guest"}</p>
              <button
                type="button"
                onClick={() => {
                  setDraft(userName)
                  setIsEditing(true)
                }}
                className="flex items-center justify-center hover:bg-[var(--missi-surface)]"
                style={{
                  width: 24,
                  height: 24,
                  background: "transparent",
                  border: "1px solid var(--missi-border)",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: "var(--missi-text-secondary)",
                }}
                aria-label="Edit name"
                data-testid="settings-edit-name-btn"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
          <p style={{ fontSize: 12, color: "var(--missi-text-secondary)", margin: "4px 0 0" }}>{userEmail}</p>
        </div>

        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: 999,
            background: isPro ? "var(--missi-accent-soft)" : "var(--missi-border)",
            color: isPro ? "var(--missi-accent)" : "var(--missi-text-secondary)",
            border: isPro ? "1px solid var(--missi-accent-border)" : "1px solid var(--missi-border)",
            flexShrink: 0,
          }}
        >
          {isPro ? "Pro" : "Free"}
        </span>
      </div>
    </Card>
  )
}

function PersonalitySection({
  personality,
}: {
  personality: PersonalityKey
}) {
  return (
    <Card
      title="Assistant"
      description="Missi uses one safe default assistant style."
      icon={<Sparkles className="w-4 h-4" />}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PERSONALITY_OPTIONS.map((p) => {
          const Icon = PERSONALITY_ICON_MAP[p.iconName] ?? <Sparkles className="w-4 h-4" />
          const isActive = personality === p.key

          return (
            <button
              key={p.key}
              type="button"
              disabled
              data-testid={`settings-personality-${p.key}-btn`}
              className="relative flex items-center gap-3 text-left transition-colors hover:bg-[var(--missi-nav-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--missi-border)]"
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: isActive ? "var(--missi-nav-active-bg)" : "var(--missi-surface)",
                  border: isActive ? "1px solid var(--missi-border-strong)" : "1px solid var(--missi-border)",
                  cursor: "default",
              }}
            >
              <div
                className="flex items-center justify-center rounded-lg flex-shrink-0"
                style={{
                  width: 32,
                  height: 32,
                  background: "var(--missi-surface)",
                  color: isActive ? "var(--missi-nav-text-active)" : "var(--missi-text-secondary)",
                  border: "1px solid var(--missi-border)",
                }}
              >
                {Icon}
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--missi-text-primary)", margin: 0 }}>{p.label}</p>
                <p style={{ fontSize: 11, color: "var(--missi-text-secondary)", margin: "2px 0 0", lineHeight: 1.4 }}>
                  {p.desc}
                </p>
              </div>
              {isActive ? (
                <Check className="w-3.5 h-3.5 text-[var(--missi-text-secondary)] flex-shrink-0" />
              ) : null}
            </button>
          )
        })}
      </div>

    </Card>
  )
}

function AIBehaviorSection({
  aiDials,
  updateAIDials,
  resetAIDials,
}: {
  aiDials: ReturnType<typeof useChatSettings>["aiDials"]
  updateAIDials: ReturnType<typeof useChatSettings>["updateAIDials"]
  resetAIDials: ReturnType<typeof useChatSettings>["resetAIDials"]
}) {
  const dials: Array<{ key: keyof typeof aiDials; label: string; desc: string }> = [
    { key: "warmth", label: "Warmth", desc: "Caring vs neutral tone" },
    { key: "humor", label: "Humor", desc: "Witty vs serious" },
    { key: "formality", label: "Formality", desc: "Casual vs professional" },
    { key: "creativity", label: "Creativity", desc: "Safe vs imaginative" },
  ]

  const isDefault = useMemo(() => {
    return (
      aiDials.responseLength === DEFAULT_AI_DIALS.responseLength &&
      aiDials.warmth === DEFAULT_AI_DIALS.warmth &&
      aiDials.humor === DEFAULT_AI_DIALS.humor &&
      aiDials.formality === DEFAULT_AI_DIALS.formality &&
      aiDials.creativity === DEFAULT_AI_DIALS.creativity
    )
  }, [aiDials])

  return (
    <Card
      title="AI Behavior"
      description="Fine-tune Missi's response style."
      icon={<BrainCircuit className="w-4 h-4" />}
      trailing={
        <button
          type="button"
          onClick={() => {
            resetAIDials()
            toast.success("Reset to defaults")
          }}
          disabled={isDefault}
          className="inline-flex items-center gap-1 text-xs transition-colors hover:text-[var(--missi-text-primary)]"
          style={{
            background: "transparent",
            border: "1px solid var(--missi-border)",
            borderRadius: 8,
            padding: "6px 10px",
            cursor: isDefault ? "default" : "pointer",
            color: isDefault ? "var(--missi-text-muted)" : "var(--missi-text-secondary)",
          }}
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      }
    >
      {/* Response length — segmented */}
      <div className="mb-5">
        <p style={{ ...eyebrow, marginBottom: 8 }}>Response Length</p>
        <div
          className="inline-flex rounded-lg"
          style={{ background: "var(--missi-surface)", border: "1px solid var(--missi-border)", padding: 3 }}
        >
          {(["short", "medium", "long"] as const).map((len) => {
            const active = aiDials.responseLength === len
            return (
              <button
                key={len}
                type="button"
                onClick={() => updateAIDials({ responseLength: len })}
                className="capitalize transition-colors"
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  padding: "6px 14px",
                  borderRadius: 7,
                  background: active ? "var(--missi-nav-text-active)" : "transparent",
                  color: active ? "var(--missi-bg)" : "var(--missi-text-secondary)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {len}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-5">
        {dials.map((d) => (
          <div key={d.key}>
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--missi-text-primary)", margin: 0 }}>{d.label}</p>
                <p style={{ fontSize: 11, color: "var(--missi-text-muted)", margin: "1px 0 0" }}>{d.desc}</p>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--missi-text-secondary)",
                  fontWeight: 500,
                }}
              >
                {aiDials[d.key]}
              </span>
            </div>
            <Slider
              value={aiDials[d.key] as number}
              onChange={(n) => updateAIDials({ [d.key]: n } as Partial<typeof aiDials>)}
              ariaLabel={d.label}
            />
          </div>
        ))}
      </div>
    </Card>
  )
}

function VoiceSection({ voiceEnabled, onToggle }: { voiceEnabled: boolean; onToggle: () => void }) {
  return (
    <Card
      title="Voice Engine"
      description="Enable voice replies and live-mode audio."
      icon={<Mic className="w-4 h-4" />}
    >
      <Row
        label="Voice replies"
        description="Let Missi speak responses when voice is supported."
        icon={<Volume2 className="w-4 h-4" />}
      >
        <Toggle checked={voiceEnabled} onChange={onToggle} ariaLabel="Toggle voice replies" />
      </Row>
    </Card>
  )
}

function NotificationsSection({
  notifications,
  updateNotifications,
}: {
  notifications: ReturnType<typeof useChatSettings>["notifications"]
  updateNotifications: ReturnType<typeof useChatSettings>["updateNotifications"]
}) {
  const [pushEnabling, setPushEnabling] = useState(false)

  // ── Server-side prefs sync ───────────────────────────────────────────────
  // The push dispatcher (`lib/push/push-sender.ts`) respects these prefs via
  // KV, so we must persist them server-side — localStorage alone isn't
  // reachable from the edge worker that sends pushes.
  const hydratedFromServerRef = useRef(false)
  useEffect(() => {
    let cancelled = false
    fetch("/api/v1/notification-prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (cancelled || !res?.success || !res.data) return
        updateNotifications({
          quietHoursEnabled: !!res.data.quietHoursEnabled,
          quietHoursStart: res.data.quietHoursStart ?? "22:00",
          quietHoursEnd: res.data.quietHoursEnd ?? "08:00",
          notifyCheckIn: !!res.data.notifyCheckIn,
        })
      })
      .catch(() => {})
      .finally(() => {
        hydratedFromServerRef.current = true
      })
    return () => {
      cancelled = true
    }
  }, [updateNotifications])

  // Debounce writes: avoids hammering the endpoint while the user drags the
  // quiet-hours time picker. 350ms is comfortably below human perception of
  // lag and well above typical input-event cadence.
  useEffect(() => {
    if (!hydratedFromServerRef.current) return
    const timezone = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      } catch {
        return "UTC"
      }
    })()
    const handle = setTimeout(() => {
      fetch("/api/v1/notification-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...notifications, timezone }),
      }).catch(() => {
        toast.error("Couldn't save notification settings — check your connection.")
      })
    }, 350)
    return () => clearTimeout(handle)
  }, [notifications])

  const enablePush = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Push notifications are not supported in your browser")
      return
    }
    setPushEnabling(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        toast.error("Permission denied")
        return
      }
      toast.loading("Enabling notifications...", { id: "push" })
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      })
      if (!res.ok) throw new Error("Failed to save subscription")
      toast.success("Notifications enabled!", { id: "push" })
    } catch (err) {
      console.error(err)
      toast.error("Failed to enable notifications", { id: "push" })
    } finally {
      setPushEnabling(false)
    }
  }, [])

  return (
    <Card
      title="Notifications"
      description="Quiet hours and notification preferences."
      icon={<Bell className="w-4 h-4" />}
    >
      <Row
        label="Push notifications"
        description="Enable push notifications for updates."
        icon={<Bell className="w-4 h-4" />}
      >
        <button
          type="button"
          onClick={enablePush}
          disabled={pushEnabling}
          className="transition-colors hover:bg-[var(--missi-nav-hover)]"
          style={{
            padding: "6px 14px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            background: "transparent",
            border: "1px solid var(--missi-border-strong)",
            color: "var(--missi-text-primary)",
            cursor: pushEnabling ? "default" : "pointer",
          }}
        >
          {pushEnabling ? "Enabling…" : "Enable"}
        </button>
      </Row>

      <Divider />

      <Row
        label="Check-in notifications"
        description="Push notifications from Missi."
        icon={<Bell className="w-4 h-4" />}
      >
        <Toggle
          checked={notifications.notifyCheckIn}
          onChange={() => updateNotifications({ notifyCheckIn: !notifications.notifyCheckIn })}
          ariaLabel="Toggle check-in notifications"
        />
      </Row>

      <Divider />

      <Row
        label="Quiet hours"
        description="Auto-mute all notifications during this window."
        icon={notifications.quietHoursEnabled ? <BellOff className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
      >
        <Toggle
          checked={notifications.quietHoursEnabled}
          onChange={() => updateNotifications({ quietHoursEnabled: !notifications.quietHoursEnabled })}
          ariaLabel="Toggle quiet hours"
        />
      </Row>

      {notifications.quietHoursEnabled && (
        <div className="flex items-center gap-3 pt-1 pl-7">
          <TimeField
            label="From"
            value={notifications.quietHoursStart}
            onChange={(v) => updateNotifications({ quietHoursStart: v })}
          />
          <TimeField
            label="To"
            value={notifications.quietHoursEnd}
            onChange={(v) => updateNotifications({ quietHoursEnd: v })}
          />
        </div>
      )}
    </Card>
  )
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <span style={{ fontSize: 11, color: "var(--missi-text-secondary)" }}>{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="outline-none"
        style={{
          fontSize: 12,
          padding: "4px 8px",
          background: "var(--missi-surface)",
          border: "1px solid var(--missi-border)",
          borderRadius: 6,
          color: "var(--missi-text-primary)",
        }}
      />
    </label>
  )
}

function AppearanceSection({
  appearance,
  updateAppearance,
}: {
  appearance: ReturnType<typeof useChatSettings>["appearance"]
  updateAppearance: ReturnType<typeof useChatSettings>["updateAppearance"]
}) {
  const themes: Array<{ key: ThemeMode; label: string; icon: React.ReactNode }> = [
    { key: "dark", label: "Dark", icon: <Moon className="w-3.5 h-3.5" /> },
    { key: "light", label: "Light", icon: <Sun className="w-3.5 h-3.5" /> },
    { key: "system", label: "System", icon: <Monitor className="w-3.5 h-3.5" /> },
  ]

  const accents: Array<{ key: AccentColor; color: string }> = [
    { key: "amber", color: "#F59E0B" },
    { key: "blue", color: "#3B82F6" },
    { key: "purple", color: "#A855F7" },
    { key: "pink", color: "#EC4899" },
    { key: "green", color: "#10B981" },
  ]

  const scales: Array<{ key: FontScale; label: string; size: number }> = [
    { key: "sm", label: "A", size: 12 },
    { key: "md", label: "A", size: 14 },
    { key: "lg", label: "A", size: 16 },
  ]

  return (
    <Card
      title="Appearance & Accessibility"
      description="Theme, accent color, text size and motion."
      icon={<Palette className="w-4 h-4" />}
    >
      {/* Theme */}
      <div className="mb-5">
        <p style={{ ...eyebrow, marginBottom: 8 }}>Theme</p>
        <div className="flex gap-2">
          {themes.map((t) => {
            const active = appearance.theme === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => updateAppearance({ theme: t.key })}
                className="flex items-center gap-2 transition-colors hover:bg-[var(--missi-nav-hover)]"
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  background: active ? "var(--missi-nav-text-active)" : "var(--missi-surface)",
                  border: active ? "1px solid var(--missi-border-strong)" : "1px solid var(--missi-border)",
                  color: active ? "var(--missi-bg)" : "var(--missi-text-secondary)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {t.icon}
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Accent */}
      <div className="mb-5">
        <p style={{ ...eyebrow, marginBottom: 8 }}>Accent color</p>
        <div className="flex gap-2">
          {accents.map((a) => {
            const active = appearance.accent === a.key
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => updateAppearance({ accent: a.key })}
                aria-label={`Accent ${a.key}`}
                className="relative transition-transform hover:scale-105"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: a.color,
                  border: active ? "2px solid var(--missi-text-primary)" : "2px solid var(--missi-border)",
                  cursor: "pointer",
                  boxShadow: active ? "0 0 0 3px var(--missi-text-muted)" : "none",
                }}
              >
                {active && <Check className="w-3.5 h-3.5 text-[var(--missi-text-primary)] absolute inset-0 m-auto" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Font scale */}
      <div className="mb-5">
        <p style={{ ...eyebrow, marginBottom: 8 }}>Text size</p>
        <div className="flex gap-2">
          {scales.map((s) => {
            const active = appearance.fontScale === s.key
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => updateAppearance({ fontScale: s.key })}
                className="transition-colors hover:bg-[var(--missi-nav-hover)]"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: active ? "var(--missi-nav-text-active)" : "var(--missi-surface)",
                  border: active ? "1px solid var(--missi-border-strong)" : "1px solid var(--missi-border)",
                  color: active ? "var(--missi-bg)" : "var(--missi-text-secondary)",
                  fontSize: s.size,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      <Divider />

      <Row label="Reduce motion" description="Minimize animations across the app." icon={<Eye className="w-4 h-4" />}>
        <Toggle
          checked={appearance.reduceMotion}
          onChange={() => updateAppearance({ reduceMotion: !appearance.reduceMotion })}
          ariaLabel="Toggle reduce motion"
        />
      </Row>

      <Row
        label="High contrast"
        description="Stronger text contrast for better legibility."
        icon={<EyeOff className="w-4 h-4" />}
      >
        <Toggle
          checked={appearance.highContrast}
          onChange={() => updateAppearance({ highContrast: !appearance.highContrast })}
          ariaLabel="Toggle high contrast"
        />
      </Row>
    </Card>
  )
}

function PrivacySection({
  privacy,
  updatePrivacy,
}: {
  privacy: ReturnType<typeof useChatSettings>["privacy"]
  updatePrivacy: ReturnType<typeof useChatSettings>["updatePrivacy"]
}) {
  const { user } = useUser()
  const [deleting, setDeleting] = useState(false)

  const exportData = useCallback(async () => {
    toast.loading("Preparing your data export…", { id: "export" })
    try {
      const res = await fetch("/api/v1/memory")
      if (!res.ok) throw new Error("fetch failed")
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `missi-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success("Export downloaded", { id: "export" })
    } catch {
      toast.error("Couldn't export your data. Try again shortly.", { id: "export" })
    }
  }, [])

  const deleteAccount = useCallback(async () => {
    if (!user) {
      toast.error("Not signed in")
      return
    }
    const ok = window.confirm(
      "This will permanently delete your Missi account, memory graph, chats and settings. This cannot be undone. Continue?",
    )
    if (!ok) return
    const confirmText = window.prompt('Type "DELETE" to confirm:')
    if (confirmText !== "DELETE") {
      toast.error("Confirmation text did not match")
      return
    }
    setDeleting(true)
    toast.loading("Deleting account…", { id: "delete" })
    try {
      await user.delete()
      toast.success("Account deleted", { id: "delete" })
      window.location.href = "/"
    } catch (err) {
      console.error(err)
      toast.error("Failed to delete account. Contact support.", { id: "delete" })
      setDeleting(false)
    }
  }, [user])

  return (
    <Card
      title="Privacy & Data"
      description="Control what Missi remembers and own your data."
      icon={<Shield className="w-4 h-4" />}
    >
      <Row
        label="Incognito mode"
        description="Pause memory — this chat won't be added to your life graph."
        icon={<EyeOff className="w-4 h-4" />}
      >
        <Toggle
          checked={privacy.memoryPaused}
          onChange={() => {
            updatePrivacy({ memoryPaused: !privacy.memoryPaused })
            toast(privacy.memoryPaused ? "Memory resumed" : "Memory paused")
          }}
          ariaLabel="Toggle incognito mode"
        />
      </Row>

      <Row
        label="Opt out of analytics"
        description="Stop sharing anonymous usage metrics with us."
        icon={<Lock className="w-4 h-4" />}
      >
        <Toggle
          checked={privacy.analyticsOptOut}
          onChange={() => updatePrivacy({ analyticsOptOut: !privacy.analyticsOptOut })}
          ariaLabel="Toggle analytics opt-out"
        />
      </Row>

      <Divider />

      <div className="flex flex-col gap-2">
        <Link
          href="/memory"
          className="flex items-center justify-between rounded-lg transition-colors hover:bg-[var(--missi-nav-hover)]"
          style={{
            padding: "10px 12px",
            background: "var(--missi-surface)",
            border: "1px solid var(--missi-border)",
            textDecoration: "none",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="text-[var(--missi-text-secondary)]">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--missi-text-primary)", margin: 0 }}>Manage memories</p>
              <p style={{ fontSize: 11, color: "var(--missi-text-secondary)", margin: "2px 0 0" }}>
                Review and delete individual nodes in your life graph.
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--missi-text-muted)]" />
        </Link>

        <button
          type="button"
          onClick={exportData}
          className="flex items-center justify-between rounded-lg transition-colors hover:bg-[var(--missi-nav-hover)]"
          style={{
            padding: "10px 12px",
            background: "var(--missi-surface)",
            border: "1px solid var(--missi-border)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="text-[var(--missi-text-secondary)]">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--missi-text-primary)", margin: 0 }}>Export my data</p>
              <p style={{ fontSize: 11, color: "var(--missi-text-secondary)", margin: "2px 0 0" }}>
                Download your memory graph as JSON.
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--missi-text-muted)]" />
        </button>

        <button
          type="button"
          onClick={deleteAccount}
          disabled={deleting}
          className="flex items-center justify-between rounded-lg transition-colors hover:bg-destructive/10"
          style={{
            padding: "10px 12px",
            background: "hsl(var(--destructive) / 0.08)",
            border: "1px solid hsl(var(--destructive) / 0.28)",
            cursor: deleting ? "default" : "pointer",
            textAlign: "left",
          }}
        >
          <div className="flex items-center gap-3">
            <div style={{ color: "hsl(var(--destructive) / 0.95)" }}>
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--destructive) / 0.95)", margin: 0 }}>
                {deleting ? "Deleting…" : "Delete account"}
              </p>
              <p style={{ fontSize: 11, color: "hsl(var(--destructive) / 0.74)", margin: "2px 0 0" }}>
                Permanently erase everything. Cannot be undone.
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4" style={{ color: "hsl(var(--destructive) / 0.68)" }} />
        </button>
      </div>
    </Card>
  )
}

function IntegrationsSection() {
  return (
    <Card
      title="Integrations"
      description="Chat with Missi on WhatsApp and Telegram."
      icon={<Plug className="w-4 h-4" />}
    >
      <Link
        href="/settings/integrations"
        className="flex items-center justify-between rounded-lg transition-colors hover:bg-[var(--missi-nav-hover)]"
        style={{
          padding: "10px 12px",
          background: "var(--missi-surface)",
          border: "1px solid var(--missi-border)",
          textDecoration: "none",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="text-[var(--missi-text-secondary)]">
            <Plug className="w-4 h-4" />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--missi-text-primary)", margin: 0 }}>Messaging integrations</p>
            <p style={{ fontSize: 11, color: "var(--missi-text-secondary)", margin: "2px 0 0" }}>
              Link WhatsApp and Telegram to continue chats anywhere.
            </p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-[var(--missi-text-muted)]" />
      </Link>
    </Card>
  )
}

function SubscriptionSection({ planId }: { planId: string | undefined }) {
  const isFreePlan = !planId || planId === "free"

  return (
    <Card
      title="Subscription"
      description={isFreePlan ? "Upgrade for higher limits and premium access." : "Your current Missi plan."}
      icon={<Crown className="w-4 h-4" style={{ color: "var(--missi-accent)" }} />}
    >
      <Link
        href="/pricing"
        className="flex items-center justify-between rounded-lg transition-colors hover:bg-[var(--missi-nav-hover)]"
        style={{
          padding: "12px 14px",
          background: isFreePlan
            ? "linear-gradient(90deg, var(--missi-accent-soft) 0%, hsl(var(--card) / 0.5) 100%)"
            : "var(--missi-surface)",
          border: isFreePlan ? "1px solid var(--missi-accent-border)" : "1px solid var(--missi-border)",
          textDecoration: "none",
        }}
      >
        <div className="flex items-center gap-3">
          <Crown className="w-4 h-4" style={{ color: "var(--missi-accent)" }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--missi-text-primary)", margin: 0 }}>
              {isFreePlan ? "Upgrade to Pro" : "Manage subscription"}
            </p>
            <p style={{ fontSize: 11, color: "var(--missi-text-secondary)", margin: "2px 0 0" }}>
              {isFreePlan ? "See plans, features and pricing." : `Currently on ${planId?.toUpperCase()}.`}
            </p>
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: isFreePlan ? "var(--missi-accent)" : "var(--missi-text-secondary)",
          }}
        >
          {isFreePlan ? "View plans" : planId}
        </span>
      </Link>
    </Card>
  )
}

function DangerZoneSection({ onLogout }: { onLogout: () => void }) {
  return (
    <section
      className="rounded-2xl flex items-center justify-between gap-3"
      style={{
        background: "var(--missi-surface)",
        border: "1px solid var(--missi-border)",
        padding: 14,
      }}
    >
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--missi-text-primary)", margin: 0 }}>Sign out of this device</p>
        <p style={{ fontSize: 11, color: "var(--missi-text-secondary)", margin: "2px 0 0" }}>
          You'll need to sign in again to access your account.
        </p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="inline-flex items-center gap-2 transition-colors hover:bg-[var(--missi-nav-hover)]"
        style={{
          padding: "8px 14px",
          borderRadius: 10,
          background: "var(--missi-surface)",
          border: "1px solid var(--missi-border)",
          color: "var(--missi-text-primary)",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        <LogOut className="w-3.5 h-3.5" />
        Sign out
      </button>
    </section>
  )
}

/*
 * Global slider styling — scoped here so we don't pollute globals.css.
 * Appended via a side-effect in the module so React doesn't re-render it.
 */
if (typeof document !== "undefined" && !document.getElementById("missi-settings-slider-style")) {
  const style = document.createElement("style")
  style.id = "missi-settings-slider-style"
  style.innerHTML = `
    .missi-slider { -webkit-appearance: none; appearance: none; background: transparent; height: 20px; }
    .missi-slider::-webkit-slider-runnable-track {
      height: 4px; border-radius: 999px;
      background: linear-gradient(90deg, var(--missi-border) 0%, var(--missi-border) 100%);
    }
    .missi-slider::-moz-range-track {
      height: 4px; border-radius: 999px;
      background: linear-gradient(90deg, var(--missi-border) 0%, var(--missi-border) 100%);
    }
    .missi-slider::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 16px; height: 16px; border-radius: 50%;
      background: var(--missi-surface); border: 2px solid var(--missi-nav-text-active);
      margin-top: -6px; cursor: pointer;
      box-shadow: 0 2px 6px var(--missi-shadow-lg);
    }
    .missi-slider::-moz-range-thumb {
      width: 14px; height: 14px; border-radius: 50%;
      background: var(--missi-surface); border: 2px solid var(--missi-nav-text-active);
      cursor: pointer; box-shadow: 0 2px 6px var(--missi-shadow-lg);
    }
    .missi-slider:focus { outline: none; }
    .missi-slider:focus::-webkit-slider-thumb { box-shadow: 0 0 0 4px hsl(var(--ring) / 0.35), 0 2px 6px var(--missi-shadow-lg); }
  `
  document.head.appendChild(style)
}
