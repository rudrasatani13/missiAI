"use client";

import { memo, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Heart,
  Briefcase,
  Zap,
  BrainCircuit,
  Pencil,
  Check,
  X as XIcon,
  Calendar,
  BookOpen,
  RefreshCw,
  CheckCircle2,
  Mail,
  CheckSquare,
  MessageSquare,
  Github,
  LayoutGrid,
  Inbox,
  Crown,
  User,
  Sparkles,
  Wand2,
  Lock,
  Mic2,
} from "lucide-react";
import type { PersonalityKey } from "@/types/chat";
import { PERSONALITY_OPTIONS } from "@/types/chat";
import type { PluginConfig, PluginId } from "@/types/plugins";
import { toast } from "sonner";

type SafePlugin = Omit<PluginConfig, "credentials">;

interface PluginConnectionStatus {
  google: { connected: boolean; expiresAt?: number } | null;
  notion: { connected: boolean; workspaceName?: string } | null;
  kvAvailable: boolean;
}

interface SettingsPanelProps {
  personality: PersonalityKey;
  onPersonalityChange: (p: PersonalityKey) => void;
  voiceEnabled: boolean;
  onVoiceToggle: () => void;
  isOpen: boolean;
  activePanel: "settings" | "plugins" | "personas" | null;
  onClose: () => void;
  userName: string;
  userEmail: string;
  userImageUrl: string | null;
  onLogout: () => void;
  onNameChange?: (newName: string) => void;
  onPanelMouseEnter?: () => void;
  onPanelMouseLeave?: () => void;
  plugins?: SafePlugin[];
  onConnectPlugin?: (
    id: PluginId,
    credentials: Record<string, string>,
    settings?: Record<string, string>,
  ) => Promise<boolean>;
  onDisconnectPlugin?: (id: PluginId) => Promise<void>;
  plan?: string;
  customPrompt?: string;
  onCustomPromptChange?: (prompt: string) => void;
  /** Whether real-time voice mode is currently active */
  isLiveMode?: boolean;
  /** Called when user picks an AI persona */
  onPersonaChange?: (persona: {
    personaId: string;
    displayName: string;
    accentColor: string;
    geminiVoiceName: string;
  }) => void;
  /** Called when user switches back to default voice */
  onSwitchToLive?: () => void;
  /** Currently active persona info */
  activePersona?: { displayName: string; accentColor: string } | null;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles className="w-4 h-4" />,
  Heart: <Heart className="w-4 h-4" />,
  Briefcase: <Briefcase className="w-4 h-4" />,
  Zap: <Zap className="w-4 h-4" />,
  BrainCircuit: <BrainCircuit className="w-4 h-4" />,
  Wand2: <Wand2 className="w-4 h-4" />,
};

// ─── OAuth Plugin Panel ────────────────────────────────────────────────────────
const LS_KEY = "missi_plugin_connections";

function saveConnectionsToLS(
  connections: Partial<Record<"google" | "notion", boolean>>,
) {
  try {
    const existing = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ ...existing, ...connections }),
    );
  } catch {}
}

function loadConnectionsFromLS(): Partial<
  Record<"google" | "notion", boolean>
> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function clearConnectionFromLS(plugin: "google" | "notion") {
  try {
    const existing = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
    delete existing[plugin];
    localStorage.setItem(LS_KEY, JSON.stringify(existing));
  } catch {}
}

function OAuthPluginPanel() {
  const [status, setStatus] = useState<PluginConnectionStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  function loadStatus() {
    // Start with localStorage state immediately (no flicker)
    const local = loadConnectionsFromLS();
    setStatus((prev) => ({
      kvAvailable: prev?.kvAvailable ?? false,
      google: local.google ? { connected: true } : (prev?.google ?? null),
      notion: local.notion ? { connected: true } : (prev?.notion ?? null),
    }));

    // Then merge with server response
    fetch("/api/v1/plugins/refresh")
      .then((r) => r.json())
      .then((d: PluginConnectionStatus) => {
        const merged = {
          ...d,
          google: d.google ?? (local.google ? { connected: true } : null),
          notion:
            d.notion ??
            (local.notion
              ? { connected: true, workspaceName: "Notion" }
              : null),
        };
        setStatus(merged);
        // Keep localStorage in sync with server truth
        if (d.google) saveConnectionsToLS({ google: true });
        if (d.notion) saveConnectionsToLS({ notion: true });
      })
      .catch(() => {});
  }

  useEffect(() => {
    // Check URL params FIRST (right after OAuth redirect)
    const params = new URLSearchParams(window.location.search);
    const oauthSuccess = params.get("oauth_success");
    const oauthError = params.get("oauth_error");

    if (oauthSuccess === "google") {
      saveConnectionsToLS({ google: true });
      toast.success("Google Calendar connected! 🗓️");
      params.delete("oauth_success");
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`,
      );
    } else if (oauthSuccess === "notion") {
      saveConnectionsToLS({ notion: true });
      toast.success("Notion connected! 📝");
      params.delete("oauth_success");
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`,
      );
    } else if (oauthError) {
      toast.error(`Connection failed: ${oauthError.replace(/_/g, " ")}`);
      params.delete("oauth_error");
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`,
      );
    }

    loadStatus();
  }, []);

  async function handleDisconnect(plugin: "google" | "notion") {
    try {
      await fetch(`/api/v1/plugins/refresh?plugin=${plugin}`, {
        method: "DELETE",
      });
      clearConnectionFromLS(plugin);
      setStatus((s) => (s ? { ...s, [plugin]: null } : s));
      toast.success(
        `${plugin === "google" ? "Google Calendar" : "Notion"} disconnected`,
      );
    } catch {
      toast.error("Failed to disconnect");
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/v1/plugins/refresh", { method: "POST" });
      toast.success("Context refreshed!");
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    marginBottom: 6,
  };

  const dotStyle: React.CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
  };

  const nameStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: "#fff",
    margin: 0,
    lineHeight: 1.3,
  };

  const metaStyle: React.CSSProperties = {
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
    margin: "2px 0 0",
    lineHeight: 1.3,
  };

  const connectBtnStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: "#0c0c10",
    background: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "5px 12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    textDecoration: "none",
  };

  const disconnectBtnStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    color: "rgba(255,255,255,0.7)",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    padding: "4px 10px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  };

  const eyebrowStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.35)",
    margin: "0 0 10px",
  };

  const dividerStyle: React.CSSProperties = {
    height: 1,
    background: "rgba(255,255,255,0.05)",
    border: "none",
    margin: "14px 0",
  };

  const PLUGINS_CONFIG = [
    {
      id: "google" as const,
      name: "Google Calendar",
      icon: (
        <Calendar
          className="w-4 h-4"
          style={{ flexShrink: 0, color: "rgba(255,255,255,0.65)" }}
        />
      ),
      connectedText: "Events synced",
    },
    {
      id: "notion" as const,
      name: "Notion",
      icon: (
        <BookOpen
          className="w-4 h-4"
          style={{ flexShrink: 0, color: "rgba(255,255,255,0.65)" }}
        />
      ),
      connectedText: status?.notion?.workspaceName ?? "Connected",
    },
  ];

  const connected = PLUGINS_CONFIG.filter((p) => status?.[p.id]?.connected);
  const available = PLUGINS_CONFIG.filter((p) => !status?.[p.id]?.connected);

  return (
    <div>
      {/* ── Connected ── */}
      {connected.length > 0 && (
        <>
          <p style={eyebrowStyle}>Connected</p>
          {connected.map(({ id, name, icon, connectedText }) => (
            <div key={id} style={rowStyle}>
              <span
                style={{ ...dotStyle, background: "#4ade80" }}
                aria-hidden
              />
              {icon}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={nameStyle}>{name}</p>
                <p style={metaStyle}>{connectedText}</p>
              </div>
              <button
                style={disconnectBtnStyle}
                onClick={() => handleDisconnect(id)}
              >
                Disconnect
              </button>
            </div>
          ))}
          <hr style={dividerStyle} />
        </>
      )}

      {/* ── Available ── */}
      {available.length > 0 && (
        <>
          <p style={eyebrowStyle}>Available</p>
          {available.map(({ id, name, icon }) => (
            <div key={id} style={rowStyle}>
              <span
                style={{
                  ...dotStyle,
                  background: "rgba(255,255,255,0.25)",
                }}
                aria-hidden
              />
              {icon}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={nameStyle}>{name}</p>
                <p style={metaStyle}>Not connected</p>
              </div>
              <a href={`/api/auth/connect/${id}`} style={connectBtnStyle}>
                Connect
              </a>
            </div>
          ))}
        </>
      )}

      {/* ── Coming soon ── */}
      <hr style={dividerStyle} />
      <p style={eyebrowStyle}>Coming soon</p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {[
          { icon: <Mail className="w-3 h-3" />, label: "Gmail" },
          { icon: <Inbox className="w-3 h-3" />, label: "Outlook" },
          { icon: <CheckSquare className="w-3 h-3" />, label: "Todoist" },
          { icon: <LayoutGrid className="w-3 h-3" />, label: "Linear" },
          { icon: <MessageSquare className="w-3 h-3" />, label: "Slack" },
          { icon: <Github className="w-3 h-3" />, label: "GitHub" },
        ].map(({ icon, label }) => (
          <div
            key={label}
            title={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 8px",
              borderRadius: 6,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            {icon}
            <span
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.5)",
                fontWeight: 500,
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Refresh button — only when at least one connection is active */}
      {(status?.google?.connected || status?.notion?.connected) && (
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="active:scale-[0.97] transition-transform"
          style={{
            marginTop: 14,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 500,
            color: refreshing
              ? "rgba(255,255,255,0.35)"
              : "rgba(255,255,255,0.65)",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: 8,
            cursor: refreshing ? "default" : "pointer",
          }}
        >
          <RefreshCw
            className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing ? "Refreshing…" : "Refresh context"}
        </button>
      )}
    </div>
  );
}

const panelBox: React.CSSProperties = {
  background: "rgba(14, 14, 18, 0.88)",
  backdropFilter: "blur(32px) saturate(160%)",
  WebkitBackdropFilter: "blur(32px) saturate(160%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "20px",
  padding: "20px",
  boxShadow:
    "0 20px 50px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
  isolation: "isolate" as const,
};

const sectionDivider: React.CSSProperties = {
  height: 1,
  background: "rgba(255,255,255,0.05)",
  margin: "16px 0",
  border: "none",
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.35)",
};

const glassSection: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "14px",
  padding: "14px",
  position: "relative",
  overflow: "hidden",
};

// ─── User Profile Card ───────────────────────────────────────────────────────
function UserProfileCard({
  userImageUrl,
  userName,
  userEmail,
  plan,
  onNameChange,
}: {
  userImageUrl: string | null;
  userName: string;
  userEmail: string;
  plan?: string;
  onNameChange?: (newName: string) => void;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(userName);
  const [savingName, setSavingName] = useState(false);

  const handleSaveName = useCallback(async () => {
    const trimmed = editName.trim();
    if (trimmed.length < 1 || trimmed === userName) {
      setIsEditingName(false);
      setEditName(userName);
      return;
    }
    setSavingName(true);
    try {
      // Save to server
      await fetch("/api/v1/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      // Update local state
      onNameChange?.(trimmed);
      toast.success("Name updated!");
    } catch {
      toast.error("Failed to update name");
    } finally {
      setSavingName(false);
      setIsEditingName(false);
    }
  }, [editName, userName, onNameChange]);

  return (
    <div style={glassSection} className="mb-3">
      <div className="flex items-center gap-3">
        <div className="relative">
          {userImageUrl ? (
            <img
              src={userImageUrl}
              alt=""
              className="w-11 h-11 rounded-full"
              style={{
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
          ) : (
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <User className="w-5 h-5 text-white/50" />
            </div>
          )}
          {(plan === "plus" || plan === "pro") && (
            <div
              className="absolute -bottom-1 -right-1 p-[3px] rounded-full border-[1.5px] border-[#0c0c10] flex items-center justify-center"
              style={{
                background: "rgba(245,158,11,0.85)",
              }}
              title="PRO Member"
            >
              <Crown className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {isEditingName ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") {
                    setIsEditingName(false);
                    setEditName(userName);
                  }
                }}
                className="text-xs font-semibold text-white tracking-wide outline-none focus:border-white/30"
                style={{
                  width: "120px",
                  fontSize: "12px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "8px",
                  padding: "4px 8px",
                }}
                autoFocus
                disabled={savingName}
              />
              <button
                onClick={handleSaveName}
                disabled={savingName}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.7)",
                  padding: "2px",
                }}
                title="Save"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setIsEditingName(false);
                  setEditName(userName);
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.4)",
                  padding: "2px",
                }}
                title="Cancel"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-white tracking-wide">
                {userName}
              </p>
              {onNameChange && (
                <button
                  onClick={() => {
                    setEditName(userName);
                    setIsEditingName(true);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "rgba(255,255,255,0.3)",
                    padding: "2px",
                  }}
                  title="Edit name"
                  data-testid="edit-name-btn"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          <p className="text-[10px] font-light text-white/40">{userEmail}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Persona Data ────────────────────────────────────────────────────────────

const ALL_PERSONAS = [
  {
    id: "calm",
    displayName: "Calm Therapist",
    tagline: "Warm & validating",
    accentColor: "#7DD3FC",
    geminiVoiceName: "Kore",
  },
  {
    id: "coach",
    displayName: "Energetic Coach",
    tagline: "Direct & motivating",
    accentColor: "#F97316",
    geminiVoiceName: "Fenrir",
  },
  {
    id: "friend",
    displayName: "Sassy Friend",
    tagline: "Witty, Hinglish vibes",
    accentColor: "#A78BFA",
    geminiVoiceName: "Aoede",
  },
  {
    id: "bollywood",
    displayName: "Bollywood Narrator",
    tagline: "Dramatic & theatrical",
    accentColor: "#FBBF24",
    geminiVoiceName: "Charon",
  },
  {
    id: "desi-mom",
    displayName: "Desi Mom",
    tagline: "Caring, lovingly bossy",
    accentColor: "#FB7185",
    geminiVoiceName: "Leda",
  },
];

// ─── Inline Persona Picker ───────────────────────────────────────────────────

function InlinePersonaPicker({
  isLiveMode,
  onPersonaChange,
  onSwitchToLive,
  activePersona,
  glassSection: gs,
  plan,
}: {
  isLiveMode?: boolean;
  onPersonaChange?: (p: {
    personaId: string;
    displayName: string;
    accentColor: string;
    geminiVoiceName: string;
  }) => void;
  onSwitchToLive?: () => void;
  activePersona?: { displayName: string; accentColor: string } | null;
  glassSection: React.CSSProperties;
  plan?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const isFreePlan = !plan || plan === "free";

  const handleSelect = useCallback(
    async (persona: (typeof ALL_PERSONAS)[0]) => {
      if (saving) return;
      if (isFreePlan) {
        toast.error("Upgrade to Plus or Pro to use AI Personas!");
        router.push("/pricing");
        return;
      }
      setSaving(true);
      try {
        const res = await fetch("/api/v1/persona", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personaId: persona.id }),
        });
        if (res.ok) {
          onPersonaChange?.({
            personaId: persona.id,
            displayName: persona.displayName,
            accentColor: persona.accentColor,
            geminiVoiceName: persona.geminiVoiceName,
          });
          toast.success(`Switched to ${persona.displayName}`);
        } else if (res.status === 429) {
          toast.error("Too many switches. Try again later.");
        }
      } catch {
        toast.error("Failed to change persona.");
      } finally {
        setSaving(false);
      }
    },
    [saving, isFreePlan, onPersonaChange, router],
  );

  const handleSwitchToDefault = useCallback(() => {
    onSwitchToLive?.();
    toast.success("Switched to Missi Voice");
  }, [onSwitchToLive]);

  const isDefault = isLiveMode || !activePersona;

  return (
    <div>
      {/* Eyebrow */}
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.35)",
          margin: "0 0 10px",
        }}
      >
        Voice &amp; Persona
      </p>

      {/* Default Voice row */}
      <button
        onClick={handleSwitchToDefault}
        data-testid="switch-to-default-voice-btn"
        className="w-full flex items-center gap-3 text-left transition-colors active:scale-[0.97]"
        style={{
          padding: "9px 10px 9px 12px",
          borderRadius: 10,
          background: isDefault ? "rgba(255,255,255,0.04)" : "transparent",
          border: isDefault
            ? "1px solid rgba(255,255,255,0.07)"
            : "1px solid transparent",
          borderLeft: isDefault
            ? "2px solid rgba(94,234,212,0.5)"
            : "2px solid transparent",
          cursor: "pointer",
          color: "white",
          marginBottom: 2,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: isDefault ? "rgba(94,234,212,0.8)" : "rgba(255,255,255,0.25)",
            flexShrink: 0,
          }}
        />
        <div className="flex-1 min-w-0">
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: isDefault ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.5)",
              margin: 0,
              lineHeight: 1.3,
              letterSpacing: "-0.01em",
            }}
          >
            Missi Voice
          </p>
          <p
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.35)",
              margin: "2px 0 0",
              lineHeight: 1.3,
            }}
          >
            Real-time conversation
          </p>
        </div>
        {isDefault && (
          <Check
            className="w-3 h-3 flex-shrink-0"
            style={{ color: "rgba(255,255,255,0.6)" }}
            strokeWidth={2.5}
          />
        )}
      </button>

      {/* Hairline divider */}
      <div
        style={{
          height: 1,
          background: "rgba(255,255,255,0.05)",
          margin: "8px 0",
        }}
      />

      {/* Persona rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {ALL_PERSONAS.map((p) => {
          const isActive =
            !isDefault && activePersona?.displayName === p.displayName;
          return (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              disabled={saving}
              data-testid={`persona-inline-${p.id}-btn`}
              className="w-full flex items-center gap-3 text-left transition-colors active:scale-[0.97]"
              style={{
                padding: "9px 10px 9px 12px",
                borderRadius: 10,
                background: isActive ? "rgba(255,255,255,0.04)" : "transparent",
                border: isActive
                  ? "1px solid rgba(255,255,255,0.07)"
                  : "1px solid transparent",
                borderLeft: isActive
                  ? `2px solid ${p.accentColor}70`
                  : "2px solid transparent",
                cursor: saving ? "default" : "pointer",
                opacity: isFreePlan ? 0.5 : saving ? 0.5 : 1,
                color: "white",
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: p.accentColor,
                  opacity: isActive ? 1 : 0.5,
                  flexShrink: 0,
                }}
              />
              <div className="flex-1 min-w-0">
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)",
                    margin: 0,
                    lineHeight: 1.3,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {p.displayName}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.35)",
                    margin: "2px 0 0",
                    lineHeight: 1.3,
                  }}
                >
                  {p.tagline}
                </p>
              </div>
              {isFreePlan ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Lock
                    className="w-3 h-3"
                    style={{ color: "rgba(255,255,255,0.25)" }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      color: "rgba(255,255,255,0.3)",
                    }}
                  >
                    PLUS
                  </span>
                </div>
              ) : isActive ? (
                <Check
                  className="w-3 h-3 flex-shrink-0"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                  strokeWidth={2.5}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
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
  onNameChange,
  onPanelMouseEnter,
  onPanelMouseLeave,
  plan,
  customPrompt = "",
  onCustomPromptChange,
  isLiveMode,
  onPersonaChange,
  onSwitchToLive,
  activePersona,
}: SettingsPanelProps) {
  const router = useRouter();

  const [renderedPanel, setRenderedPanel] = useState<
    "settings" | "plugins" | "personas" | null
  >(activePanel);

  useEffect(() => {
    if (activePanel) {
      setRenderedPanel(activePanel);
    }
  }, [activePanel]);

  async function handleEnablePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Push notifications are not supported in your browser");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permission denied");
        return;
      }
      toast.loading("Enabling check-ins...", { id: "push" });
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error("Failed to save subscription");
      toast.success("Proactive Check-ins enabled!", { id: "push" });
    } catch (err) {
      toast.error("Failed to enable notifications", { id: "push" });
      console.error(err);
    }
  }

  const isSidebarPanel =
    renderedPanel === "plugins" || renderedPanel === "personas";

  return (
    <div
      className={
        isSidebarPanel
          ? "fixed bottom-44 md:bottom-36 left-16 md:left-20 z-40"
          : "absolute top-full right-0 md:right-4 mt-2 z-40"
      }
      onMouseEnter={onPanelMouseEnter}
      onMouseLeave={onPanelMouseLeave}
      style={{
        width: "300px",
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      <div
        style={{
          transform: isOpen
            ? "translateY(0) scale(1)"
            : isSidebarPanel
              ? "translateX(-10px) scale(0.96)"
              : "translateY(-10px) scale(0.96)",
          transformOrigin: isSidebarPanel ? "bottom left" : "top right",
          opacity: isOpen ? 1 : 0,
          transition:
            "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease",
          willChange: "transform, opacity",
        }}
      >
        {/* ── SETTINGS BOX — opens when gear icon is clicked ── */}
        {renderedPanel === "settings" && (
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="settings-panel"
            style={{
              ...panelBox,
              maxHeight: "calc(100vh - 120px)",
              overflowY: "auto",
            }}
          >
            {/* ── User Profile Card ── */}
            <UserProfileCard
              userImageUrl={userImageUrl}
              userName={userName}
              userEmail={userEmail}
              plan={plan}
              onNameChange={onNameChange}
            />

            <hr style={sectionDivider} />

            {/* ── Personality Section ── */}
            <div>
              <p style={{ ...eyebrowStyle, margin: "0 0 12px" }}>
                Personality
              </p>
              <div className="flex flex-col gap-0.5">
                {PERSONALITY_OPTIONS.map((p) => {
                  const IconComp = ICON_MAP[p.iconName as string];
                  const isPremium =
                    p.requiredPlan === "plus" || p.requiredPlan === "pro";
                  const isLocked = isPremium && (!plan || plan === "free");
                  const isActive = personality === p.key;

                  return (
                    <button
                      key={p.key}
                      onClick={() => {
                        if (isLocked) {
                          toast.error(
                            `Upgrade to Plus/Pro to unlock ${p.label}!`,
                          );
                          router.push("/pricing");
                        } else {
                          onPersonalityChange(p.key);
                        }
                      }}
                      data-testid={`personality-${p.key}-btn`}
                      className="relative w-full flex items-center justify-between text-left transition-colors hover:bg-white/[0.03]"
                      style={{
                        paddingLeft: 14,
                        paddingRight: 10,
                        paddingTop: 9,
                        paddingBottom: 9,
                        borderRadius: 10,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        opacity: isLocked ? 0.45 : 1,
                      }}
                    >
                      {isActive && (
                        <span
                          aria-hidden
                          style={{
                            position: "absolute",
                            left: 4,
                            top: 10,
                            bottom: 10,
                            width: 2,
                            borderRadius: 1,
                            background: "rgba(255,255,255,0.6)",
                          }}
                        />
                      )}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          style={{
                            color: isActive
                              ? "#fff"
                              : "rgba(255,255,255,0.5)",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          {IconComp}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              color: isActive
                                ? "#fff"
                                : "rgba(255,255,255,0.75)",
                              margin: 0,
                              lineHeight: 1.3,
                            }}
                          >
                            {p.label}
                          </p>
                          <p
                            style={{
                              fontSize: 10,
                              fontWeight: 400,
                              color: "rgba(255,255,255,0.4)",
                              margin: "2px 0 0",
                              lineHeight: 1.4,
                            }}
                          >
                            {p.desc}
                          </p>
                        </div>
                      </div>
                      {isLocked ? (
                        <Lock
                          className="w-3 h-3"
                          style={{ color: "rgba(255,255,255,0.45)" }}
                        />
                      ) : isActive ? (
                        <Check
                          className="w-3 h-3"
                          style={{ color: "rgba(255,255,255,0.55)" }}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {personality === "custom" && onCustomPromptChange && (
                <div className="mt-4">
                  <p style={{ ...eyebrowStyle, margin: "0 0 8px" }}>
                    System Instructions
                  </p>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => onCustomPromptChange(e.target.value)}
                    placeholder="E.g. You are a sarcastic AI that answers in riddles..."
                    className="w-full h-24 resize-none outline-none"
                    style={{
                      fontSize: 12,
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
            </div>

            <hr style={sectionDivider} />

            {/* ── Voice Engine ── */}
            <div className="flex items-center justify-between">
              <span style={eyebrowStyle}>Voice Engine</span>
              <button
                onClick={onVoiceToggle}
                data-testid="voice-toggle-btn"
                className="relative w-10 h-[22px] rounded-full transition-colors"
                style={{
                  background: voiceEnabled
                    ? "rgba(255,255,255,0.9)"
                    : "rgba(255,255,255,0.1)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <span
                  className="absolute top-[3px] w-4 h-4 rounded-full shadow-sm"
                  style={{
                    background: voiceEnabled
                      ? "#0c0c10"
                      : "rgba(255,255,255,0.7)",
                    left: voiceEnabled ? "20px" : "4px",
                    transition: "left 0.2s ease, background 0.2s ease",
                  }}
                />
              </button>
            </div>

            {/* ── Proactive Check-Ins ── */}
            <div className="flex items-center justify-between mt-4">
              <span style={eyebrowStyle}>Proactive Check-Ins</span>
              <button
                onClick={handleEnablePush}
                className="px-3 py-1 rounded-full transition-colors hover:bg-white/[0.04]"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.75)",
                  cursor: "pointer",
                }}
              >
                Enable
              </button>
            </div>

            <hr style={sectionDivider} />

            {/* ── Plan Row ── */}
            <Link
              href="/pricing"
              className="flex items-center justify-between w-full transition-opacity hover:opacity-90"
              style={{
                textDecoration: "none",
                padding: "4px 0",
              }}
            >
              <div className="flex items-center gap-2.5">
                <Crown
                  className="w-3.5 h-3.5"
                  style={{ color: "#F59E0B" }}
                />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.85)",
                  }}
                >
                  {!plan || plan === "free"
                    ? "Upgrade to PRO"
                    : "Manage Subscription"}
                </span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color:
                    !plan || plan === "free"
                      ? "#F59E0B"
                      : "rgba(255,255,255,0.45)",
                }}
              >
                {!plan || plan === "free" ? "View Plans" : plan}
              </span>
            </Link>

            <hr style={sectionDivider} />

            {/* ── Sign Out ── */}
            <button
              onClick={onLogout}
              data-testid="logout-btn"
              className="w-full flex items-center justify-center gap-2 py-2 transition-colors hover:text-white"
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "rgba(255,255,255,0.5)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        )}

        {/* ── PLUGINS BOX — opens when plugin badge is clicked ── */}
        {renderedPanel === "plugins" && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...panelBox,
              maxHeight: "calc(100vh - 120px)",
              overflowY: "auto",
            }}
          >
            <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
              <Zap
                className="w-3.5 h-3.5"
                style={{ color: "rgba(255,255,255,0.55)" }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                Connections
              </span>
            </div>
            <hr
              style={{
                height: 1,
                background: "rgba(255,255,255,0.05)",
                border: "none",
                margin: "0 0 14px",
              }}
            />
            <OAuthPluginPanel />
          </div>
        )}

        {/* ── PERSONAS BOX — opens when mic/persona icon is clicked ── */}
        {renderedPanel === "personas" && (
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="personas-side-panel"
            style={{
              ...panelBox,
              maxHeight: "calc(100vh - 120px)",
              overflowY: "auto",
            }}
          >
            <InlinePersonaPicker
              isLiveMode={isLiveMode}
              onPersonaChange={onPersonaChange}
              onSwitchToLive={onSwitchToLive}
              activePersona={activePersona}
              glassSection={glassSection}
              plan={plan}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export const SettingsPanel = memo(SettingsPanelInner);
