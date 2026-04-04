"use client"

import { memo, useState } from "react"
import { LogOut, Heart, Briefcase, Zap, BrainCircuit } from "lucide-react"
import type { PersonalityKey } from "@/types/chat"
import { PERSONALITY_OPTIONS } from "@/types/chat"
import { PLUGIN_METADATA } from "@/lib/plugins/plugin-registry"
import type { PluginConfig, PluginId } from "@/types/plugins"
import { toast } from "sonner"

type SafePlugin = Omit<PluginConfig, "credentials">

interface SettingsPanelProps {
  personality: PersonalityKey
  onPersonalityChange: (p: PersonalityKey) => void
  voiceEnabled: boolean
  onVoiceToggle: () => void
  isOpen: boolean
  activePanel: 'settings' | 'plugins' | null
  onClose: () => void
  userName: string
  userEmail: string
  userImageUrl: string | null
  onLogout: () => void
  plugins?: SafePlugin[]
  onConnectPlugin?: (
    id: PluginId,
    credentials: Record<string, string>,
    settings?: Record<string, string>,
  ) => Promise<boolean>
  onDisconnectPlugin?: (id: PluginId) => Promise<void>
}

const PLUGIN_IDS: PluginId[] = ["notion", "google_calendar", "webhook"]

const ICON_MAP: Record<string, React.ReactNode> = {
  Heart: <Heart className="w-4 h-4" />,
  Briefcase: <Briefcase className="w-4 h-4" />,
  Zap: <Zap className="w-4 h-4" />,
  BrainCircuit: <BrainCircuit className="w-4 h-4" />,
}

function PluginRow({
  pluginId,
  connectedPlugin,
  onConnect,
  onDisconnect,
}: {
  pluginId: PluginId
  connectedPlugin: SafePlugin | undefined
  onConnect: (
    id: PluginId,
    credentials: Record<string, string>,
    settings?: Record<string, string>,
  ) => Promise<boolean>
  onDisconnect: (id: PluginId) => Promise<void>
}) {
  const meta = PLUGIN_METADATA[pluginId]
  const isConnected = connectedPlugin?.status === "connected"
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [notionKey, setNotionKey] = useState("")
  const [calToken, setCalToken] = useState("")
  const [webhookUrl, setWebhookUrl] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")

  async function handleConnect() {
    setSaving(true)
    let credentials: Record<string, string> = {}
    let settings: Record<string, string> = {}

    if (pluginId === "notion") {
      credentials = { apiKey: notionKey }
    } else if (pluginId === "google_calendar") {
      credentials = { accessToken: calToken }
    } else if (pluginId === "webhook") {
      credentials = { url: webhookUrl }
      if (webhookSecret) settings = { secret: webhookSecret }
    }

    const ok = await onConnect(pluginId, credentials, settings)
    setSaving(false)
    if (ok) {
      setShowForm(false)
      setNotionKey("")
      setCalToken("")
      setWebhookUrl("")
      setWebhookSecret("")
    }
  }

  return (
    <div
      style={{
        borderRadius: "10px",
        padding: "10px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        marginBottom: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "12px", fontWeight: 500, color: isConnected ? "#fff" : "rgba(255,255,255,0.5)", margin: 0 }}>
            {meta.name}
          </p>
          <p style={{ fontSize: "10px", color: isConnected ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)", margin: "2px 0 0" }}>
            {isConnected ? "Connected" : "Disconnected"}
          </p>
        </div>
        {isConnected ? (
          <button
            onClick={() => onDisconnect(pluginId)}
            data-testid={`plugin-disconnect-${pluginId}`}
            style={{
              fontSize: "11px", fontWeight: 500, color: "#fff",
              background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "6px", padding: "4px 10px", cursor: "pointer",
            }}
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={() => setShowForm((v) => !v)}
            data-testid={`plugin-connect-${pluginId}`}
            style={{
              fontSize: "11px", fontWeight: 500, color: "#000",
              background: "#fff", border: "none",
              borderRadius: "6px", padding: "5px 12px", cursor: "pointer",
            }}
          >
            Connect
          </button>
        )}
      </div>

      {showForm && !isConnected && (
        <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {pluginId === "notion" && (
            <input type="password" placeholder="Notion API Key" value={notionKey}
              onChange={(e) => setNotionKey(e.target.value)} style={inputStyle} />
          )}
          {pluginId === "google_calendar" && (
            <input type="password" placeholder="Google OAuth Access Token" value={calToken}
              onChange={(e) => setCalToken(e.target.value)} style={inputStyle} />
          )}
          {pluginId === "webhook" && (
            <>
              <input type="text" placeholder="Webhook URL (https://...)" value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)} style={inputStyle} />
              <input type="password" placeholder="Secret (optional)" value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)} style={inputStyle} />
            </>
          )}
          <button
            onClick={handleConnect}
            disabled={saving}
            data-testid={`plugin-save-${pluginId}`}
            style={{
              fontSize: "11px", fontWeight: 600,
              color: "#000", background: saving ? "rgba(255,255,255,0.6)" : "#fff",
              border: "none", borderRadius: "6px", padding: "6px 12px",
              cursor: saving ? "default" : "pointer", alignSelf: "flex-end",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "6px",
  padding: "6px 10px",
  fontSize: "11px",
  color: "#fff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
}

const panelBox: React.CSSProperties = {
  background: "#050505",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "16px",
  padding: "20px",
}

function SettingsPanelInner({
  personality,
  onPersonalityChange,
  voiceEnabled,
  onVoiceToggle,
  isOpen,
  activePanel,
  userName,
  userEmail,
  userImageUrl,
  onLogout,
  plugins = [],
  onConnectPlugin,
  onDisconnectPlugin,
}: SettingsPanelProps) {

  async function handleEnablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast.error('Push notifications are not supported in your browser')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('Permission denied')
        return
      }
      toast.loading('Enabling check-ins...', { id: 'push' })
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      })
      if (!res.ok) throw new Error('Failed to save subscription')
      toast.success('Proactive Check-ins enabled!', { id: 'push' })
    } catch (err) {
      toast.error('Failed to enable notifications', { id: 'push' })
      console.error(err)
    }
  }

  return (
    <div
      className="absolute top-16 right-5 z-30 pointer-events-none"
      style={{
        transform: isOpen ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.97)",
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? "auto" : "none",
        transition: "transform 0.2s ease-out, opacity 0.2s ease-out",
        width: "300px",
      }}
    >
      {/* ── SETTINGS BOX — opens when gear icon is clicked ── */}
      {activePanel === 'settings' && (
        <div onClick={(e) => e.stopPropagation()} data-testid="settings-panel" style={panelBox}>
          {/* User profile */}
          <div className="flex items-center gap-3 mb-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {userImageUrl && <img src={userImageUrl} alt="" className="w-10 h-10 rounded-full" />}
            <div>
              <p className="text-xs font-semibold text-white tracking-wide">{userName}</p>
              <p className="text-[10px] font-light text-white/40">{userEmail}</p>
            </div>
          </div>

          {/* Personality */}
          <div className="mb-5">
            <p className="text-[10px] font-medium tracking-wider uppercase mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
              Personality Profile
            </p>
            <div className="flex flex-col gap-2">
              {PERSONALITY_OPTIONS.map((p) => {
                const IconComp = ICON_MAP[p.iconName as string]
                return (
                  <button
                    key={p.key}
                    onClick={() => onPersonalityChange(p.key)}
                    data-testid={`personality-${p.key}-btn`}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all"
                    style={{
                      background: personality === p.key ? "rgba(255,255,255,0.08)" : "transparent",
                      border: personality === p.key ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ color: personality === p.key ? "#fff" : "rgba(255,255,255,0.4)" }}>
                      {IconComp}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium" style={{ color: personality === p.key ? "#fff" : "rgba(255,255,255,0.5)" }}>
                        {p.label}
                      </p>
                      <p className="text-[10px] font-light" style={{ color: personality === p.key ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)" }}>
                        {p.desc}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Voice toggle */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
              Voice Engine
            </span>
            <button
              onClick={onVoiceToggle}
              data-testid="voice-toggle-btn"
              className="relative w-10 h-6 rounded-full transition-colors"
              style={{ background: voiceEnabled ? "#fff" : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer" }}
            >
              <span
                className="absolute top-1 w-4 h-4 rounded-full shadow-sm"
                style={{
                  background: voiceEnabled ? "#000" : "#fff",
                  left: voiceEnabled ? "20px" : "4px",
                  transition: "left 0.2s ease, background 0.2s ease",
                }}
              />
            </button>
          </div>

          {/* Notifications */}
          <div className="mb-5 flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
              Proactive Check-Ins
            </span>
            <button
              onClick={handleEnablePush}
              className="text-[10px] font-bold px-3 py-1 rounded border transition-colors hover:bg-white/10"
              style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer" }}
            >
              Enable
            </button>
          </div>

          {/* Sign out */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "16px" }}>
            <button
              onClick={onLogout}
              data-testid="logout-btn"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ color: "#fff", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}
            >
              <LogOut className="w-3.5 h-3.5 opacity-80" /> Sign out
            </button>
          </div>
        </div>
      )}

      {/* ── PLUGINS BOX — opens when plugin badge is clicked ── */}
      {activePanel === 'plugins' && (onConnectPlugin || onDisconnectPlugin) && (
        <div onClick={(e) => e.stopPropagation()} style={panelBox}>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-white opacity-80" />
            <span className="text-xs font-semibold text-white tracking-wide uppercase">
              Connections
            </span>
          </div>
          {PLUGIN_IDS.map((id) => (
            <PluginRow
              key={id}
              pluginId={id}
              connectedPlugin={plugins.find((p) => p.id === id)}
              onConnect={onConnectPlugin ?? (async () => false)}
              onDisconnect={onDisconnectPlugin ?? (async () => {})}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const SettingsPanel = memo(SettingsPanelInner)
