"use client"

import { memo, useState } from "react"
import { LogOut } from "lucide-react"
import type { PersonalityKey } from "@/types/chat"
import { PERSONALITY_OPTIONS } from "@/types/chat"
import { PLUGIN_METADATA } from "@/lib/plugins/plugin-registry"
import type { PluginConfig, PluginId } from "@/types/plugins"

type SafePlugin = Omit<PluginConfig, "credentials">

interface SettingsPanelProps {
  personality: PersonalityKey
  onPersonalityChange: (p: PersonalityKey) => void
  voiceEnabled: boolean
  onVoiceToggle: () => void
  isOpen: boolean
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

  // Credential fields
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
        padding: "8px 10px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        marginBottom: "6px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: isConnected ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.4)",
              margin: 0,
            }}
          >
            {meta.name}
          </p>
          <p
            style={{
              fontSize: "9px",
              color: isConnected ? "rgba(0,255,140,0.6)" : "rgba(255,255,255,0.2)",
              margin: "1px 0 0",
            }}
          >
            {isConnected ? "Connected" : "Disconnected"}
          </p>
        </div>
        {isConnected ? (
          <button
            onClick={() => onDisconnect(pluginId)}
            data-testid={`plugin-disconnect-${pluginId}`}
            style={{
              fontSize: "10px",
              color: "rgba(255,80,80,0.7)",
              background: "none",
              border: "1px solid rgba(255,80,80,0.2)",
              borderRadius: "6px",
              padding: "3px 8px",
              cursor: "pointer",
            }}
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={() => setShowForm((v) => !v)}
            data-testid={`plugin-connect-${pluginId}`}
            style={{
              fontSize: "10px",
              color: "rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "6px",
              padding: "3px 8px",
              cursor: "pointer",
            }}
          >
            Connect
          </button>
        )}
      </div>

      {/* Inline credential form */}
      {showForm && !isConnected && (
        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {pluginId === "notion" && (
            <input
              type="password"
              placeholder="Notion API Key (starts with secret_...)"
              value={notionKey}
              onChange={(e) => setNotionKey(e.target.value)}
              style={inputStyle}
            />
          )}
          {pluginId === "google_calendar" && (
            <input
              type="password"
              placeholder="Google OAuth Access Token"
              value={calToken}
              onChange={(e) => setCalToken(e.target.value)}
              style={inputStyle}
            />
          )}
          {pluginId === "webhook" && (
            <>
              <input
                type="text"
                placeholder="Webhook URL (https://...)"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                style={inputStyle}
              />
              <input
                type="password"
                placeholder="Secret (optional)"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                style={inputStyle}
              />
            </>
          )}
          <button
            onClick={handleConnect}
            disabled={saving}
            data-testid={`plugin-save-${pluginId}`}
            style={{
              fontSize: "10px",
              color: saving ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "6px",
              padding: "5px 10px",
              cursor: saving ? "default" : "pointer",
              alignSelf: "flex-end",
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
  padding: "5px 8px",
  fontSize: "10px",
  color: "rgba(255,255,255,0.7)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
}

function SettingsPanelInner({
  personality,
  onPersonalityChange,
  voiceEnabled,
  onVoiceToggle,
  isOpen,
  userName,
  userEmail,
  userImageUrl,
  onLogout,
  plugins = [],
  onConnectPlugin,
  onDisconnectPlugin,
}: SettingsPanelProps) {
  return (
    <div
      className="absolute top-16 right-5 z-30 w-64 rounded-2xl p-4 pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
      data-testid="settings-panel"
      style={{
        background: "rgba(0,0,0,0.7)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(30px)",
        transform: isOpen ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.97)",
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? "auto" : "none",
        transition: "transform 0.25s ease-out, opacity 0.25s ease-out",
        maxHeight: "80vh",
        overflowY: "auto",
      }}
    >
      <div
        className="flex items-center gap-3 mb-4 pb-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {userImageUrl && (
          <img src={userImageUrl} alt="" className="w-8 h-8 rounded-full opacity-80" />
        )}
        <div>
          <p className="text-xs font-medium text-white/70">{userName}</p>
          <p className="text-[10px] font-light text-white/25">{userEmail}</p>
        </div>
      </div>

      <div className="mb-4">
        <p
          className="text-[10px] font-medium tracking-wider uppercase mb-2.5"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          Missi&apos;s Personality
        </p>
        <div className="flex flex-col gap-1.5">
          {PERSONALITY_OPTIONS.map((p) => (
            <button
              key={p.key}
              onClick={() => onPersonalityChange(p.key)}
              data-testid={`personality-${p.key}-btn`}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all"
              style={{
                background:
                  personality === p.key ? "rgba(255,255,255,0.08)" : "transparent",
                border:
                  personality === p.key
                    ? "1px solid rgba(255,255,255,0.12)"
                    : "1px solid transparent",
                cursor: "pointer",
              }}
            >
              <span className="text-sm">{p.emoji}</span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[11px] font-medium"
                  style={{
                    color:
                      personality === p.key
                        ? "rgba(255,255,255,0.85)"
                        : "rgba(255,255,255,0.45)",
                  }}
                >
                  {p.label}
                </p>
                <p
                  className="text-[9px] font-light"
                  style={{
                    color:
                      personality === p.key
                        ? "rgba(255,255,255,0.35)"
                        : "rgba(255,255,255,0.18)",
                  }}
                >
                  {p.desc}
                </p>
              </div>
              {personality === p.key && (
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: "rgba(0,255,140,0.6)" }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div
        className="mb-4 flex items-center justify-between px-3 py-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span
          className="text-[11px] font-medium"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          Voice
        </span>
        <button
          onClick={onVoiceToggle}
          data-testid="voice-toggle-btn"
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{
            background: voiceEnabled ? "rgba(0,255,140,0.4)" : "rgba(255,255,255,0.1)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full"
            style={{
              background: voiceEnabled ? "rgba(0,255,140,0.9)" : "rgba(255,255,255,0.4)",
              left: voiceEnabled ? "18px" : "2px",
              transition: "left 0.2s ease, background 0.2s ease",
            }}
          />
        </button>
      </div>

      {/* ── Plugins section ── */}
      {(onConnectPlugin || onDisconnectPlugin) && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px", marginBottom: "4px" }}>
          <p
            className="text-[10px] font-medium tracking-wider uppercase mb-2.5"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            Plugins
          </p>
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

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
        <button
          onClick={onLogout}
          data-testid="logout-btn"
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-light transition-colors hover:bg-white/5"
          style={{
            color: "rgba(255,255,255,0.4)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
    </div>
  )
}

export const SettingsPanel = memo(SettingsPanelInner)
