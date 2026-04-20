"use client"

/**
 * Dedicated /settings full-page.
 *
 * Replaces the old "Settings" sliding sub-panel that used to live inside
 * ChatSidebar. All existing functionality (personality, voice engine toggle,
 * proactive check-ins, manage subscription, profile name edit) is preserved,
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
  Heart,
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
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { ChatShell } from "@/components/shell/ChatShell"
import { useBilling } from "@/hooks/useBilling"
import {
  DEFAULT_AI_DIALS,
  useChatSettings,
  type AccentColor,
  type FontScale,
  type ThemeMode,
} from "@/hooks/useChatSettings"
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
  color: "rgba(255,255,255,0.4)",
  margin: 0,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "rgba(255,255,255,0.95)",
  margin: 0,
}

const sectionDesc: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 400,
  color: "rgba(255,255,255,0.45)",
  margin: "2px 0 0",
  lineHeight: 1.5,
}

// ──────────────────────────────────────────────────────────────────────────────
// Personality icon lookup — duplicates the sidebar's icon map. Kept local to
// avoid exporting it from ChatSidebar (which would widen that module's API).
// ──────────────────────────────────────────────────────────────────────────────

const PERSONALITY_ICON_MAP: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles className="w-4 h-4" />,
  Heart: <Heart className="w-4 h-4" />,
  Briefcase: <Briefcase className="w-4 h-4" />,
  Zap: <Zap className="w-4 h-4" />,
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
  const isFreePlan = !planId || planId === "free"

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
    <div className="min-h-full text-white">
      <div className="max-w-3xl mx-auto px-4 md:px-6 pt-6 md:pt-10 pb-16">
        {/* Breadcrumb / back */}
        <button
          type="button"
          onClick={() => router.back()}
          className="group inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors mb-4"
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
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <SettingsIcon className="w-4 h-4 text-white/70" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="text-xs text-white/45">
              Manage your account, personality, voice, notifications and privacy.
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

          <PersonalitySection
            personality={settings.personality}
            onPersonalityChange={settings.setPersonality}
            customPrompt={settings.customPrompt}
            onCustomPromptChange={settings.setCustomPrompt}
            isFreePlan={isFreePlan}
          />

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
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
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
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.7)",
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
      className="relative rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
      style={{
        width: 40,
        height: 22,
        background: checked ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.1)",
        border: "none",
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
          background: checked ? "#0c0c10" : "rgba(255,255,255,0.7)",
          left: checked ? 20 : 4,
          transition: "left 0.2s ease, background 0.2s ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
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
        {icon && <div className="text-white/55 mt-0.5 flex-shrink-0">{icon}</div>}
        <div className="min-w-0">
          <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.9)", margin: 0 }}>
            {label}
          </p>
          {description && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "2px 0 0", lineHeight: 1.5 }}>
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
  return <hr style={{ height: 1, background: "rgba(255,255,255,0.05)", border: "none", margin: "10px 0" }} />
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
              style={{ width: 56, height: 56, border: "1px solid rgba(255,255,255,0.1)" }}
            />
          ) : (
            <div
              className="rounded-full flex items-center justify-center"
              style={{
                width: 56,
                height: 56,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <UserIcon className="w-5 h-5 text-white/50" />
            </div>
          )}
          {isPro && (
            <div
              className="absolute -bottom-0.5 -right-0.5 p-[3px] rounded-full border-2 border-[#0a0a0c] flex items-center justify-center"
              style={{ background: "rgba(245,158,11,0.9)" }}
              title="PRO Member"
            >
              <Crown className="w-2.5 h-2.5 text-white" />
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
                  color: "white",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
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
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "white",
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
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p style={{ fontSize: 15, fontWeight: 600, color: "white", margin: 0 }}>{userName || "Guest"}</p>
              <button
                type="button"
                onClick={() => {
                  setDraft(userName)
                  setIsEditing(true)
                }}
                className="flex items-center justify-center hover:bg-white/5"
                style={{
                  width: 24,
                  height: 24,
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.55)",
                }}
                aria-label="Edit name"
                data-testid="settings-edit-name-btn"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: "4px 0 0" }}>{userEmail}</p>
        </div>

        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: 999,
            background: isPro ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.06)",
            color: isPro ? "#fbbf24" : "rgba(255,255,255,0.55)",
            border: isPro ? "1px solid rgba(251,191,36,0.28)" : "1px solid rgba(255,255,255,0.06)",
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
  onPersonalityChange,
  customPrompt,
  onCustomPromptChange,
  isFreePlan,
}: {
  personality: PersonalityKey
  onPersonalityChange: (p: PersonalityKey) => void
  customPrompt: string
  onCustomPromptChange: (s: string) => void
  isFreePlan: boolean
}) {
  const router = useRouter()

  return (
    <Card
      title="Personality"
      description="How Missi talks to you by default. Switch any time."
      icon={<Sparkles className="w-4 h-4" />}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PERSONALITY_OPTIONS.map((p) => {
          const Icon = PERSONALITY_ICON_MAP[p.iconName] ?? <Sparkles className="w-4 h-4" />
          const isPremium = p.requiredPlan === "plus" || p.requiredPlan === "pro"
          const isLocked = isPremium && isFreePlan
          const isActive = personality === p.key

          return (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                if (isLocked) {
                  toast.error(`Upgrade to Plus/Pro to unlock ${p.label}`)
                  router.push("/pricing")
                } else {
                  onPersonalityChange(p.key)
                }
              }}
              data-testid={`settings-personality-${p.key}-btn`}
              className="relative flex items-center gap-3 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: isActive ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.015)",
                border: isActive ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.05)",
                cursor: "pointer",
                opacity: isLocked ? 0.5 : 1,
              }}
            >
              <div
                className="flex items-center justify-center rounded-lg flex-shrink-0"
                style={{
                  width: 32,
                  height: 32,
                  background: "rgba(255,255,255,0.04)",
                  color: isActive ? "white" : "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                {Icon}
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 13, fontWeight: 500, color: "white", margin: 0 }}>{p.label}</p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "2px 0 0", lineHeight: 1.4 }}>
                  {p.desc}
                </p>
              </div>
              {isLocked ? (
                <Lock className="w-3.5 h-3.5 text-white/50 flex-shrink-0" />
              ) : isActive ? (
                <Check className="w-3.5 h-3.5 text-white/75 flex-shrink-0" />
              ) : null}
            </button>
          )
        })}
      </div>

      {personality === "custom" && (
        <div className="mt-4">
          <p style={{ ...eyebrow, marginBottom: 8 }}>System Instructions</p>
          <textarea
            value={customPrompt}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            placeholder="E.g. You are a sarcastic AI that answers in riddles..."
            className="w-full resize-none outline-none"
            rows={4}
            style={{
              fontSize: 13,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "10px 12px",
              color: "rgba(255,255,255,0.9)",
              lineHeight: 1.6,
            }}
          />
        </div>
      )}
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
      description="Fine-tune Missi's voice. Overrides personality defaults."
      icon={<BrainCircuit className="w-4 h-4" />}
      trailing={
        <button
          type="button"
          onClick={() => {
            resetAIDials()
            toast.success("Reset to defaults")
          }}
          disabled={isDefault}
          className="inline-flex items-center gap-1 text-xs transition-colors hover:text-white"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            padding: "6px 10px",
            cursor: isDefault ? "default" : "pointer",
            color: isDefault ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.65)",
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
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: 3 }}
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
                  background: active ? "rgba(255,255,255,0.1)" : "transparent",
                  color: active ? "white" : "rgba(255,255,255,0.6)",
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
                <p style={{ fontSize: 13, fontWeight: 500, color: "white", margin: 0 }}>{d.label}</p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "1px 0 0" }}>{d.desc}</p>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontVariantNumeric: "tabular-nums",
                  color: "rgba(255,255,255,0.55)",
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
          notifyMood: !!res.data.notifyMood,
          notifyStreak: !!res.data.notifyStreak,
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
      toast.loading("Enabling check-ins...", { id: "push" })
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
      toast.success("Proactive Check-ins enabled!", { id: "push" })
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
      description="Proactive check-ins, streaks and quiet hours."
      icon={<Bell className="w-4 h-4" />}
    >
      <Row
        label="Proactive check-ins"
        description="Missi nudges you at thoughtful moments."
        icon={<Bell className="w-4 h-4" />}
      >
        <button
          type="button"
          onClick={enablePush}
          disabled={pushEnabling}
          className="transition-colors hover:bg-white/[0.06]"
          style={{
            padding: "6px 14px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.8)",
            cursor: pushEnabling ? "default" : "pointer",
          }}
        >
          {pushEnabling ? "Enabling…" : "Enable"}
        </button>
      </Row>

      <Divider />

      <Row label="Mood reminders" description="Daily prompt to log how you feel." icon={<Heart className="w-4 h-4" />}>
        <Toggle
          checked={notifications.notifyMood}
          onChange={() => updateNotifications({ notifyMood: !notifications.notifyMood })}
          ariaLabel="Toggle mood reminders"
        />
      </Row>

      <Row label="Streak alerts" description="Nudge before your streak breaks." icon={<Zap className="w-4 h-4" />}>
        <Toggle
          checked={notifications.notifyStreak}
          onChange={() => updateNotifications({ notifyStreak: !notifications.notifyStreak })}
          ariaLabel="Toggle streak alerts"
        />
      </Row>

      <Row
        label="Check-in notifications"
        description="Push notifications from Missi's proactive engine."
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
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="outline-none"
        style={{
          fontSize: 12,
          padding: "4px 8px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6,
          color: "white",
          colorScheme: "dark",
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
                onClick={() => {
                  if (t.key !== "dark") {
                    toast("Light/system themes coming soon — staying on dark for now.")
                  }
                  updateAppearance({ theme: t.key })
                }}
                className="flex items-center gap-2 transition-colors hover:bg-white/[0.05]"
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  background: active ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
                  border: active ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.06)",
                  color: active ? "white" : "rgba(255,255,255,0.6)",
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
                  border: active ? "2px solid white" : "2px solid rgba(255,255,255,0.08)",
                  cursor: "pointer",
                  boxShadow: active ? "0 0 0 3px rgba(255,255,255,0.12)" : "none",
                }}
              >
                {active && <Check className="w-3.5 h-3.5 text-white absolute inset-0 m-auto" />}
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
                className="transition-colors hover:bg-white/[0.05]"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: active ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
                  border: active ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.06)",
                  color: active ? "white" : "rgba(255,255,255,0.55)",
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
          className="flex items-center justify-between rounded-lg transition-colors hover:bg-white/[0.04]"
          style={{
            padding: "10px 12px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.05)",
            textDecoration: "none",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="text-white/55">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "white", margin: 0 }}>Manage memories</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "2px 0 0" }}>
                Review and delete individual nodes in your life graph.
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/35" />
        </Link>

        <button
          type="button"
          onClick={exportData}
          className="flex items-center justify-between rounded-lg transition-colors hover:bg-white/[0.04]"
          style={{
            padding: "10px 12px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.05)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="text-white/55">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "white", margin: 0 }}>Export my data</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "2px 0 0" }}>
                Download your memory graph as JSON.
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/35" />
        </button>

        <button
          type="button"
          onClick={deleteAccount}
          disabled={deleting}
          className="flex items-center justify-between rounded-lg transition-colors hover:bg-red-500/[0.08]"
          style={{
            padding: "10px 12px",
            background: "rgba(239,68,68,0.04)",
            border: "1px solid rgba(239,68,68,0.18)",
            cursor: deleting ? "default" : "pointer",
            textAlign: "left",
          }}
        >
          <div className="flex items-center gap-3">
            <div style={{ color: "#fca5a5" }}>
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "#fca5a5", margin: 0 }}>
                {deleting ? "Deleting…" : "Delete account"}
              </p>
              <p style={{ fontSize: 11, color: "rgba(252,165,165,0.6)", margin: "2px 0 0" }}>
                Permanently erase everything. Cannot be undone.
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4" style={{ color: "rgba(252,165,165,0.5)" }} />
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
        className="flex items-center justify-between rounded-lg transition-colors hover:bg-white/[0.04]"
        style={{
          padding: "10px 12px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.05)",
          textDecoration: "none",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="text-white/55">
            <Plug className="w-4 h-4" />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "white", margin: 0 }}>Messaging integrations</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "2px 0 0" }}>
              Link WhatsApp and Telegram to continue chats anywhere.
            </p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-white/35" />
      </Link>
    </Card>
  )
}

function SubscriptionSection({ planId }: { planId: string | undefined }) {
  const isFreePlan = !planId || planId === "free"

  return (
    <Card
      title="Subscription"
      description={isFreePlan ? "Upgrade to unlock premium personalities, voices and more." : "Your current Missi plan."}
      icon={<Crown className="w-4 h-4" style={{ color: "#F59E0B" }} />}
    >
      <Link
        href="/pricing"
        className="flex items-center justify-between rounded-lg transition-colors hover:bg-white/[0.04]"
        style={{
          padding: "12px 14px",
          background: isFreePlan
            ? "linear-gradient(90deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.02) 100%)"
            : "rgba(255,255,255,0.02)",
          border: isFreePlan ? "1px solid rgba(245,158,11,0.22)" : "1px solid rgba(255,255,255,0.06)",
          textDecoration: "none",
        }}
      >
        <div className="flex items-center gap-3">
          <Crown className="w-4 h-4" style={{ color: "#F59E0B" }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "white", margin: 0 }}>
              {isFreePlan ? "Upgrade to Pro" : "Manage subscription"}
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: "2px 0 0" }}>
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
            color: isFreePlan ? "#F59E0B" : "rgba(255,255,255,0.5)",
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
        background: "rgba(255,255,255,0.015)",
        border: "1px solid rgba(255,255,255,0.05)",
        padding: 14,
      }}
    >
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "white", margin: 0 }}>Sign out of this device</p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "2px 0 0" }}>
          You'll need to sign in again to access your account.
        </p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="inline-flex items-center gap-2 transition-colors hover:bg-white/[0.06]"
        style={{
          padding: "8px 14px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "white",
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
      background: linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.08) 100%);
    }
    .missi-slider::-moz-range-track {
      height: 4px; border-radius: 999px;
      background: linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.08) 100%);
    }
    .missi-slider::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 16px; height: 16px; border-radius: 50%;
      background: white; border: 2px solid rgba(0,0,0,0.8);
      margin-top: -6px; cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
    .missi-slider::-moz-range-thumb {
      width: 14px; height: 14px; border-radius: 50%;
      background: white; border: 2px solid rgba(0,0,0,0.8);
      cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
    .missi-slider:focus { outline: none; }
    .missi-slider:focus::-webkit-slider-thumb { box-shadow: 0 0 0 4px rgba(255,255,255,0.12), 0 2px 6px rgba(0,0,0,0.4); }
  `
  document.head.appendChild(style)
}
