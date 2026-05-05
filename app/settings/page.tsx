"use client"

/**
 * Simplified settings page for live voice-only app.
 *
 * Includes only:
 *   • Profile              — name, email, logout
 *   • Voice               — voice toggle
 *   • Appearance          — theme (dark/light/system)
 *   • Privacy & Data      — analytics opt-out, delete account
 */

import { useRouter } from "next/navigation"
import { useCallback, useEffect } from "react"
import { useUser, useClerk } from "@clerk/nextjs"
import {
  ArrowLeft,
  LogOut,
  Mic,
  Moon,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  User as UserIcon,
} from "lucide-react"

import { ChatShell } from "@/components/shell/ChatShell"
import {
  useChatSettings,
  type ThemeMode,
} from "@/hooks/chat/useChatSettings"

// ──────────────────────────────────────────────────────────────────────────────
// Shared style tokens
// ──────────────────────────────────────────────────────────────────────────────

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
  const settings = useChatSettings()

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
              Manage your voice experience and preferences.
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-5">
          <ProfileSection
            userName={userName}
            userEmail={userEmail}
            userImage={userImage}
          />

          <VoiceSection voiceEnabled={settings.voiceEnabled} onToggle={settings.toggleVoice} />

          <AppearanceSection
            appearance={settings.appearance}
            updateAppearance={settings.updateAppearance}
          />

          <PrivacySection
            privacy={settings.privacy}
            updatePrivacy={settings.updatePrivacy}
          />

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
}: {
  children?: React.ReactNode
  title: string
  description?: string
  icon?: React.ReactNode
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
      <header className="flex items-start gap-3 mb-4">
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

// ──────────────────────────────────────────────────────────────────────────────
// Sections
// ──────────────────────────────────────────────────────────────────────────────

function ProfileSection({
  userName,
  userEmail,
  userImage,
}: {
  userName: string
  userEmail: string
  userImage: string | null
}) {
  return (
    <Card
      title="Profile"
      description="Your account information."
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
        </div>

        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--missi-text-primary)", margin: 0 }}>{userName || "User"}</p>
          <p style={{ fontSize: 12, color: "var(--missi-text-secondary)", margin: "4px 0 0" }}>{userEmail}</p>
        </div>
      </div>
    </Card>
  )
}

function VoiceSection({ voiceEnabled, onToggle }: { voiceEnabled: boolean; onToggle: () => void }) {
  return (
    <Card
      title="Voice"
      description="Enable voice responses."
      icon={<Mic className="w-4 h-4" />}
    >
      <Row
        label="Voice responses"
        description="Let Missi speak responses when voice is supported."
        icon={<Mic className="w-4 h-4" />}
      >
        <Toggle checked={voiceEnabled} onChange={onToggle} ariaLabel="Toggle voice responses" />
      </Row>
    </Card>
  )
}

function AppearanceSection({
  appearance,
  updateAppearance,
}: {
  appearance: ReturnType<typeof useChatSettings>["appearance"]
  updateAppearance: ReturnType<typeof useChatSettings>["updateAppearance"]
}) {
  return (
    <Card
      title="Appearance"
      description="Theme and display preferences."
      icon={<Moon className="w-4 h-4" />}
    >
      <Row
        label="Theme"
        description="Choose your preferred color scheme."
        icon={<Sun className="w-4 h-4" />}
      >
        <div className="flex items-center gap-2">
          {(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => updateAppearance({ theme: mode })}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: appearance.theme === mode ? "var(--missi-nav-text-active)" : "var(--missi-surface)",
                color: appearance.theme === mode ? "var(--missi-bg)" : "var(--missi-text-secondary)",
                border: "1px solid var(--missi-border)",
                cursor: "pointer",
              }}
            >
              {mode === "light" ? "Light" : mode === "dark" ? "Dark" : "System"}
            </button>
          ))}
        </div>
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
  return (
    <Card
      title="Privacy"
      description="Data and analytics preferences."
      icon={<Trash2 className="w-4 h-4" />}
    >
      <Row
        label="Analytics"
        description="Help improve Missi by sending anonymous usage data."
      >
        <Toggle
          checked={!privacy.analyticsOptOut}
          onChange={() => updatePrivacy({ analyticsOptOut: !privacy.analyticsOptOut })}
          ariaLabel="Toggle analytics"
        />
      </Row>
    </Card>
  )
}

function DangerZoneSection({ onLogout }: { onLogout: () => void }) {
  return (
    <Card
      title="Account"
      description="Sign out and manage your session."
      icon={<LogOut className="w-4 h-4" />}
    >
      <button
        type="button"
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        style={{
          background: "var(--missi-surface)",
          border: "1px solid var(--missi-border)",
          color: "var(--missi-text-primary)",
          cursor: "pointer",
        }}
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </Card>
  )
}
